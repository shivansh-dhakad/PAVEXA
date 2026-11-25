# PAVEXA

PAVEXA is a focused web workspace for understanding and testing the DataSprint 2.0 road-damage detector. It has two pages:

- **Project dashboard** — dataset, training configuration, architecture, ensemble rationale, validation results and limitations.
- **Predictions** — real single-image or batch inference, interactive detection overlays, per-box details, CSV export and printable reports.

Runs are kept in the current browser session only. The app does not require Supabase and does not save prediction history.

## Model

The source project uses two Ultralytics YOLO26s detectors fine-tuned from COCO weights:

- Main detector: trained at 1024 px, run at 1088 px with test-time augmentation.
- Second detector: trained and run at 640 px.
- Classic NMS at IoU 0.45 is used for each model, followed by class-wise Weighted Box Fusion at IoU 0.55 with weights 1:1.
- The final inference preset uses a 0.001 candidate score floor and returns up to 100 boxes per image. The UI starts its display filter at the validation-tuned threshold, 0.1821.

The final repository run reports a 49.39% local validation accuracy score, 59.10% mAP@50, 26.08% mAP@50:95, 64.60% precision and 53.62% recall on 2,150 labeled validation images. Inference settings were tuned on that split, so these numbers may be optimistic. See the [model repository](https://github.com/shivansh-dhakad/DataSprint-2.0-Road-Damage-Detection) for the training and evaluation code.

## Run locally

Requirements: Python 3.10+, Node.js and the model weights in `ml_service/models/`.

1. Install the backend requirements and start FastAPI:

   ```powershell
   pip install -r requirements.txt
   python start_backend.py
   ```

2. In another terminal, install frontend dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

The frontend connects to `http://localhost:8000` by default. Set `VITE_API_URL` in `.env` to use another backend address. If the API or model weights are unavailable, prediction runs show an error instead of returning simulated detections.

## Prediction results

The API returns class, confidence and normalized box coordinates. The page shows the original image, an interactive annotated view, class counts, box dimensions and coordinates, inference time, model/device metadata, and the project-defined Road Health Index. The RHI is a heuristic derived from visible boxes; it is not a model output or an engineering inspection.

Batch CSV output uses `image_id,PredictionString` with class IDs and coordinates in original-image pixels. It includes the model's candidate detections (score floor 0.001), not only the boxes currently visible under the UI threshold.

## Damage classes

| Class ID | Code | Class |
|---:|---|---|
| 0 | D00 | Longitudinal crack |
| 1 | D10 | Transverse crack |
| 2 | D20 | Alligator crack |
| 3 | D40 | Pothole |
