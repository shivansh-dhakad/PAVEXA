"""
ml_service/main.py
FastAPI + Ultralytics ensemble backend for RoadGuard AI.

Optimal Configuration from Benchmark:
  • Main Model: yolo26s(1024).pt run at imgsz=1088, NMS iou=0.45
  • Secondary Model: yolo26s(640).pt run at imgsz=640, NMS iou=0.45
  • Ensemble: Weighted Box Fusion (WBF) with weights [1, 1], iou_thr=0.55
  • Optimal validation confidence threshold: 0.1821
  • Max detection cap: 100 boxes per image
  • Validation Accuracy Score: 48.54% (mAP50: 57.88%, Precision: 63.41%, Recall: 54.02%)
"""

from __future__ import annotations

import io
import os
import sys
import time
import logging
from pathlib import Path
from typing import List

# Setup config dir
_HERE = Path(__file__).parent
_CFG_DIR = _HERE / ".ultralytics"
_CFG_DIR.mkdir(exist_ok=True)
os.environ["YOLO_CONFIG_DIR"] = str(_CFG_DIR)

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from .database import (
    init_db,
    record_inspection,
    fetch_dashboard_stats,
    delete_inspection,
    fetch_all_inspections,
    reset_database_to_demo,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("pavexa")

# Default Class mapping (RDD2020)
DEFAULT_CLASSES = {0: "D00", 1: "D10", 2: "D20", 3: "D40"}

MODEL_A_PATH = _HERE / "models" / "yolo26s(1024).pt"
MODEL_B_PATH = _HERE / "models" / "yolo26s(640).pt"

_model_a = None
_model_b = None
_device = "cpu"

def get_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
    except Exception:
        pass
    return "cpu"

def _load_models():
    global _model_a, _model_b, _device
    _device = get_device()
    log.info("Inference hardware device: %s", _device)

    try:
        from ultralytics import YOLO
        if MODEL_A_PATH.exists():
            log.info("Loading primary model (1024/1088px): %s", MODEL_A_PATH)
            _model_a = YOLO(str(MODEL_A_PATH))
        else:
            log.warning("Primary model not found at %s", MODEL_A_PATH)

        if MODEL_B_PATH.exists():
            log.info("Loading secondary model (640px): %s", MODEL_B_PATH)
            _model_b = YOLO(str(MODEL_B_PATH))
        else:
            log.warning("Secondary model not found at %s", MODEL_B_PATH)
        log.info("Model loading complete.")
    except Exception as e:
        log.error("Error loading YOLO models: %s", e)

# ── Weighted Box Fusion (WBF) ────────────────────────────────────────────────
def _iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    ix1 = np.maximum(boxes_a[:, None, 0], boxes_b[None, :, 0])
    iy1 = np.maximum(boxes_a[:, None, 1], boxes_b[None, :, 1])
    ix2 = np.minimum(boxes_a[:, None, 2], boxes_b[None, :, 2])
    iy2 = np.minimum(boxes_a[:, None, 3], boxes_b[None, :, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area_a = (boxes_a[:, 2] - boxes_a[:, 0]) * (boxes_a[:, 3] - boxes_a[:, 1])
    area_b = (boxes_b[:, 2] - boxes_b[:, 0]) * (boxes_b[:, 3] - boxes_b[:, 1])
    union = area_a[:, None] + area_b[None, :] - inter
    return inter / np.maximum(union, 1e-9)

def wbf(
    prediction_lists: list[list[tuple]],
    weights: list[float],
    iou_thr: float = 0.55,
    conf_thr: float = 0.001,
    max_det: int = 100,
) -> list[tuple]:
    if not prediction_lists or all(len(p) == 0 for p in prediction_lists):
        return []

    total_w = sum(weights)
    clusters: list[dict] = []

    for preds, w in zip(prediction_lists, weights):
        for (cls, conf, x1, y1, x2, y2) in sorted(preds, key=lambda x: -x[1]):
            if conf < conf_thr:
                continue
            box = np.array([x1, y1, x2, y2], dtype=np.float32)
            matched = False
            for cluster in clusters:
                if cluster["cls"] != cls:
                    continue
                c_boxes = np.array([d["box"] for d in cluster["members"]])
                ious = _iou_matrix(box[None], c_boxes)[0]
                if ious.max() >= iou_thr:
                    cluster["members"].append({"box": box, "score": conf, "weight": w})
                    matched = True
                    break
            if not matched:
                clusters.append({
                    "cls": cls,
                    "members": [{"box": box, "score": conf, "weight": w}],
                })

    result = []
    for cluster in clusters:
        members = cluster["members"]
        boxes   = np.array([m["box"]   for m in members])
        scores  = np.array([m["score"] for m in members])
        ws      = np.array([m["weight"] for m in members])
        weighted_scores = scores * ws
        norm_ws = weighted_scores / weighted_scores.sum()
        fused_box   = (norm_ws[:, None] * boxes).sum(axis=0)
        fused_score = weighted_scores.sum() / total_w
        result.append((cluster["cls"], float(fused_score), *fused_box.tolist()))

    result.sort(key=lambda x: -x[1])
    return result[:max_det]

def _run_single_model(model, img_array: np.ndarray, imgsz: int, iou: float, conf: float) -> list[tuple]:
    results = model.predict(
        source=img_array,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        max_det=100,
        verbose=False,
        device=_device,
    )
    out = []
    for r in results:
        b = r.boxes
        for cls, score, xyxy in zip(b.cls.tolist(), b.conf.tolist(), b.xyxy.tolist()):
            out.append((int(cls), float(score), *[float(v) for v in xyxy]))
    return out

# ── Schemas ──────────────────────────────────────────────────────────────────
class Detection(BaseModel):
    code: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

class PredictResponse(BaseModel):
    detections: List[Detection]
    latency_ms: float
    width: int
    height: int
    model_mode: str
    device: str
    models_used: List[str]

class ModelBenchmark(BaseModel):
    architecture: str
    main_imgsz: int
    secondary_imgsz: int
    ensemble_weights: List[int]
    wbf_iou_thr: float
    nms_iou: float
    opt_conf_thr: float
    val_accuracy_score: float
    map50: float
    map50_95: float
    precision: float
    recall: float
    main_wall_ms: float
    ensemble_ms: float
    test_images_count: int
    test_detections_count: int
    test_none_count: int

app = FastAPI(
    title="PAVEXA — Intelligent Road Infrastructure API",
    description="YOLO26s Dual-Scale Ensemble (1088px + 640px with WBF) for RDD2020 road damage detection. See the damage. Understand the road. Improve the journey.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()
    _load_models()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": _device,
        "primary_loaded": _model_a is not None,
        "secondary_loaded": _model_b is not None,
        "ensemble_available": (_model_a is not None and _model_b is not None),
    }

@app.get("/ping")
def ping():
    return {"status": "alive"}

@app.get("/model-info", response_model=ModelBenchmark)
def model_info():
    return ModelBenchmark(
        architecture="YOLO26s Dual-Scale Ensemble (WBF)",
        main_imgsz=1088,
        secondary_imgsz=640,
        ensemble_weights=[1, 1],
        wbf_iou_thr=0.55,
        nms_iou=0.45,
        opt_conf_thr=0.1821,
        val_accuracy_score=48.54,
        map50=57.88,
        map50_95=25.11,
        precision=63.41,
        recall=54.02,
        main_wall_ms=41.4,
        ensemble_ms=60.3,
        test_images_count=4200,
        test_detections_count=87975,
        test_none_count=206,
    )

@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    mode: str = Query("ensemble", regex="^(ensemble|main_only|640_only)$"),
    conf: float = Query(0.001, ge=0.0001, le=1.0),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported MIME type: {file.content_type}. Accepted: image/jpeg, image/png, image/webp.",
        )

    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")

    try:
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Corrupted image: {e}")

    W, H = pil.size
    img_np = np.array(pil)

    if _model_a is None and _model_b is None:
        raise HTTPException(status_code=503, detail="Models not loaded yet.")

    names_map = (_model_a.names if _model_a else None) or (_model_b.names if _model_b else None) or DEFAULT_CLASSES

    t0 = time.perf_counter()
    models_used = []

    if mode == "640_only" and _model_b is not None:
        fused = _run_single_model(_model_b, img_np, imgsz=640, iou=0.45, conf=conf)
        model_mode = "640px_only"
        models_used.append("yolo26s(640)")
    elif mode == "main_only" or _model_b is None:
        fused = _run_single_model(_model_a, img_np, imgsz=1088, iou=0.45, conf=conf)
        model_mode = "main_1088px"
        models_used.append("yolo26s(1024@1088px)")
    else:
        # Dual-scale ensemble
        preds_a = _run_single_model(_model_a, img_np, imgsz=1088, iou=0.45, conf=conf)
        preds_b = _run_single_model(_model_b, img_np, imgsz=640, iou=0.45, conf=conf)
        fused = wbf([preds_a, preds_b], weights=[1, 1], iou_thr=0.55, conf_thr=conf, max_det=100)
        model_mode = "ensemble_wbf"
        models_used.extend(["yolo26s(1024@1088px)", "yolo26s(640)"])

    latency_ms = (time.perf_counter() - t0) * 1000

    detections = []
    for (cls_idx, score, x1, y1, x2, y2) in fused:
        cname = names_map.get(int(cls_idx), f"D{cls_idx}")
        detections.append(Detection(
            code=cname,
            confidence=round(score, 6),
            x1=round(max(0.0, min(1.0, x1 / W)), 6),
            y1=round(max(0.0, min(1.0, y1 / H)), 6),
            x2=round(max(0.0, min(1.0, x2 / W)), 6),
            y2=round(max(0.0, min(1.0, y2 / H)), 6),
        ))

    # Calculate RHI
    penalty = 0.0
    for d in detections:
        area = (d.x2 - d.x1) * (d.y2 - d.y1)
        sev = 4 if d.code == "D40" else (3 if d.code == "D20" else 2)
        penalty += sev * area * d.confidence * 100
    rhi = max(0, min(100, int(round(100 - penalty))))

    # Persist live inspection into database
    try:
        record_inspection(
            image_id=file.filename or f"img_{int(time.time())}.jpg",
            latency_ms=latency_ms,
            detections=[{"code": d.code, "confidence": d.confidence} for d in detections],
            rhi=rhi,
            thumbnail_url="/samples/img_000012.jpg",
            location_name="Live Camera / Upload Feed",
            source_mode="api_predict",
            is_demo=0,
        )
    except Exception as e:
        log.warning("Database live record error: %s", e)

    return PredictResponse(
        detections=detections,
        latency_ms=round(latency_ms, 2),
        width=W,
        height=H,
        model_mode=model_mode,
        device=_device,
        models_used=models_used,
    )

@app.get("/stats")
def get_dashboard_stats(include_demo: bool = Query(True)):
    """Fetch dashboard statistics computed directly from database records."""
    return fetch_dashboard_stats(include_demo=include_demo)

@app.post("/stats/record")
def record_custom_stat(payload: dict):
    """Record an inspection run from client pipeline."""
    try:
        record_inspection(
            image_id=payload.get("image_id", "survey_frame.jpg"),
            latency_ms=float(payload.get("latency_ms", 48.0)),
            detections=payload.get("detections", []),
            rhi=int(payload.get("rhi", 80)),
            thumbnail_url=payload.get("thumbnail_url", "/samples/img_000012.jpg"),
            location_name=payload.get("location_name", "Municipal Highway Survey"),
            source_mode=payload.get("source_mode", "client"),
            is_demo=int(payload.get("is_demo", 0)),
        )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/inspections")
def get_inspections(limit: int = Query(100, ge=1, le=500)):
    """Fetch all inspection history records."""
    return fetch_all_inspections(limit=limit)

@app.delete("/inspections/{inspection_id}")
def delete_single_inspection(inspection_id: int):
    """Delete an inspection record by ID."""
    ok = delete_inspection(inspection_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Inspection record not found")
    return {"status": "ok", "deleted_id": inspection_id}

@app.post("/stats/reset")
def reset_stats():
    """Reset the database to demonstration seed baseline."""
    reset_database_to_demo()
    return {"status": "ok", "message": "Database reset to demonstration seed records"}

