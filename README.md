# PAVEXA — Intelligent Road Infrastructure

> **See the damage. Understand the road. Improve the journey.**

[![Model](https://img.shields.io/badge/Model-YOLO26s_Dual--Scale_Ensemble-blue.svg)](https://github.com/ultralytics/ultralytics)
[![Accuracy](https://img.shields.io/badge/Validation_Acc-48.54%25_(mAP50_57.88%25)-green.svg)](https://www.kaggle.com/competitions/road-damage-detection-and-classification)
[![Latency](https://img.shields.io/badge/Ensemble_Latency-60.3_ms-orange.svg)]()
[![Dataset](https://img.shields.io/badge/Dataset-RDD2020_(Global)-purple.svg)](https://github.com/sekilab/RoadDamageDetector)
[![License](https://img.shields.io/badge/License-MIT-slate.svg)]()

PAVEXA is a production-grade automated pavement inspection and road telemetry web application powered by a dual-scale computer vision ensemble trained on the global **RDD2020** (Road Damage Detection) dataset. It detects, localizes, and classifies road distress in under 60 milliseconds per frame, bridging the gap between machine learning research notebooks and real-world municipal infrastructure management.

---

## Table of Contents

- [Key Features](#key-features)
- [Model Architecture & Ensemble Methodology](#model-architecture--ensemble-methodology)
- [Monitored Damage Classes (RDD2020)](#monitored-damage-classes-rdd2020)
- [System Architecture](#system-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Backend Setup (FastAPI & ML Service)](#1-backend-setup-fastapi--ml-service)
  - [2. Frontend Setup (React & Vite)](#2-frontend-setup-react--vite)
- [Application Pages & Workspaces](#application-pages--workspaces)
  - [1. Landing Page (`/`)](#1-landing-page-)
  - [2. Operational Dashboard (`/dashboard`)](#2-operational-dashboard-dashboard)
  - [3. Unified Prediction Engine (`/predictions`)](#3-unified-prediction-engine-predictions)
  - [4. Municipal GIS Coverage Map (`/map`)](#4-municipal-gis-coverage-map-map)
- [API Reference](#api-reference)
- [Kaggle Benchmark & CSV Format](#kaggle-benchmark--csv-format)
- [Database & Demonstration Mode](#database--demonstration-mode)
- [Directory Structure](#directory-structure)
- [License & Acknowledgments](#license--acknowledgments)

---

## Key Features

- **Dual-Scale YOLO26s Ensemble:** Fuses predictions from a fine-scale 1088px model and a rapid 640px model using **Weighted Box Fusion (WBF)** to achieve a validated accuracy score of **48.54%** (+2.64% over single-model baseline).
- **Single Image Inspection:** Drag-and-drop file upload, **live mobile/webcam shutter capture** with camera flipping, 1-click RDD2020 mock presets, live confidence slider ($\tau = 0.182$ optimal preset), and adverse weather stress-test simulator (monsoon rain glare, low light, motion blur).
- **Batch ZIP Archive Processing:** Client-side decompression of entire `.zip` image archives via **JSZip**, sequential processing queue with real-time ETA, individual inspection modals, and downloadable Kaggle-compliant `submission.csv`.
- **Frame-by-Frame Video Inspection:** Upload dashcam footage (`.mp4`, `.webm`) or load the built-in sample driving video. Inspects frames at 1, 2, or 5 FPS, overlays bounding boxes synchronously atop the video player, tracks a pavement condition timeline, and provides a clickable damage incident log to seek directly to problem spots.
- **Operational Database Telemetry:** Powered by persistent **SQLite database records** tracking total inspected images, total detected objects, pothole counts, crack counts, average latency, class distributions, and municipal damage hotspots with a toggle for Demonstration Mode.
- **Municipal GIS Coverage Map:** Interactive **Leaflet.js** map plotting inspection pins across **Mysuru (India)**, **Tokyo (Japan)**, and **Prague (Czech Republic)** with severity tier filtering and Road Health Index (RHI) markers.

---

## Model Architecture & Ensemble Methodology

PAVEXA employs a dual-scale ensemble strategy tailored to the extreme aspect ratios and varying scales of road cracks and potholes.

```
                  ┌───────────────────────────────┐
                  │        Input Image /          │
                  │         Video Frame           │
                  └──────────────┬────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │   Primary YOLO    │           │  Secondary YOLO   │
       │  yolo26s(1024).pt │           │  yolo26s(640).pt  │
       │   Resolution:     │           │   Resolution:     │
       │     1088 px       │           │      640 px       │
       │   NMS IoU: 0.45   │           │   NMS IoU: 0.45   │
       └─────────┬─────────┘           └─────────┬─────────┘
                 │                               │
                 │   Boxes, Scores, Classes      │
                 └───────────────┬───────────────┘
                                 ▼
                 ┌───────────────────────────────┐
                 │   Weighted Box Fusion (WBF)   │
                 │   • Cluster IoU Thr: 0.55     │
                 │   • Weights: [1, 1]           │
                 │   • Soft Coordinate Averaging │
                 │   • Max Detections: 100       │
                 └───────────────┬───────────────┘
                                 ▼
                 ┌───────────────────────────────┐
                 │     Optimal Threshold τ       │
                 │      (conf_thr = 0.1821)      │
                 │  • Road Health Index (0-100)  │
                 │  • SQLite Record Persistence  │
                 └───────────────────────────────┘
```

### Kaggle Validation Benchmark Ablation Sweep

Evaluated across 68 validation batches with Kaggle benchmark scoring formula:  
$\text{Score} = 0.85 \times \text{Accuracy} + 10 \times \text{Speed Score}$

| Configuration | Resolution | Local Acc (%) | Wall Latency (ms) | Speed Score | Est. Final Score | Outcome |
|---|---|---|---|---|---|---|
| Single Model (Base) | 640 px | 42.17% | — | — | — | Baseline |
| Primary Model | 1088 px | 45.90% | 41.4 ms | 0.781 | 46.83 | High Res |
| Primary + TTA | 1088 px | 47.95% | 93.7 ms | 0.426 | 45.02 | High Latency |
| **Ensemble (WBF [1,1])** | **1088 + 640 px** | **48.54%** | **60.3 ms** | **0.617** | **47.43** | **Selected Winner** |

- **Optimal F1 Confidence Threshold:** $\tau = 0.1821$
- **Validation Metrics at $\tau = 0.1821$:** mAP50 = `57.88%`, Precision = `63.41%`, Recall = `54.02%`
- **Official Test Set Verification:** 87,975 detections across 3,994 of 4,200 test images (206 pristine frames correctly predicted as `none`).

---

## Monitored Damage Classes (RDD2020)

| Class Code | Damage Name | Primary Cause | Severity | Recommended Remedy | Color Code |
|---|---|---|---|---|---|
| **`D00`** | Longitudinal Crack | Pavement fatigue along traffic flow; weak joint seams | Moderate | Crack routing & hot-pour elastomeric sealant | `#0891b2` (Cyan) |
| **`D10`** | Transverse Crack | Thermal shrinkage & freeze-thaw contraction cycles | Moderate | Rout-and-seal, transverse joint stabilization | `#d97706` (Amber) |
| **`D20`** | Alligator Crack | Severe subgrade failure and structural load fatigue | Severe | Full-depth reclamation or high-modulus overlay | `#7c3aed` (Purple) |
| **`D40`** | Pothole | Water infiltration displacement under vehicle impacts | Critical | Emergency cold-patch; permanent infrared patch | `#dc2626` (Red) |

### Road Health Index (RHI) Formula

The Road Health Index maps detected distress area and class severity into a municipal rating from **0 (Critical Failure)** to **100 (Pristine)**:

$$\text{RHI} = \max\left(0, \; 100 - \sum_{i \in \text{Visible}} \text{Severity}(c_i) \times \text{Area}_i \times \text{Confidence}_i \times 100\right)$$

- **Severity Weights:** $\text{D00} = 2$, $\text{D10} = 2$, $\text{D20} = 3$, $\text{D40} = 4$
- **RHI Status Tiers:** $\ge 80$: Good (Green), $60-79$: Fair (Amber), $40-59$: Poor (Orange), $< 40$: Critical (Red)

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite / React 19)                      │
│                                                                        │
│  Landing Page (/)           Operational Dashboard (/dashboard)         │
│  • Hero with Animated Roads  • 5 KPI Database Metrics Cards            │
│  • Sequential AI Pipeline    • Class-wise Distribution Bar Chart       │
│  • RDD2020 Class Grid        • Municipal Damage Hotspots               │
│  • Benchmark Ablation Table  • Recent Inspections Audit Table          │
│                                                                        │
│  Unified Predictions (/predictions)      GIS Coverage Map (/map)       │
│  • Single Image / Live Webcam Capture    • Leaflet.js Interactive Tiles│
│  • Batch ZIP Extraction (JSZip)          • Severity Tier Filtering     │
│  • Frame-by-Frame Video Stream Engine    • Geo-tagged RHI Pins         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (/predict, /stats)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        BACKEND (FastAPI / Uvicorn)                     │
│                                                                        │
│  API Endpoints (/predict, /stats, /stats/record, /stats/reset)         │
│  Ultralytics YOLO26s Runtime (1088px Primary + 640px Secondary)        │
│  Weighted Box Fusion (WBF) NumPy Consolidation Engine                  │
│  SQLite3 Persistent Database (ml_service/pavexa.db)                    │
│    ├── inspections table (timestamps, detections, RHI, demo tag)       │
│    └── hotspots table (corridors, coordinates, severity, status)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Python 3.10+** (with PyTorch and Ultralytics)
- **Node.js 18+** & **npm**

### 1. Backend Setup (FastAPI & ML Service)

```bash
# Navigate to project root
cd roadguard-ai

# Install Python dependencies
pip install fastapi uvicorn ultralytics opencv-python numpy pillow pydantic

# Start FastAPI backend server
python -m uvicorn ml_service.main:app --host 0.0.0.0 --port 8000 --reload
```

The ML service will start on `http://localhost:8000` and automatically:
- Load the primary YOLO model `ml_service/models/yolo26s(1024).pt`
- Load the secondary YOLO model `ml_service/models/yolo26s(640).pt`
- Initialize and seed the SQLite database `ml_service/pavexa.db`

### 2. Frontend Setup (React & Vite)

```bash
# In another terminal window
cd roadguard-ai

# Install dependencies (React, Vite, Tailwind CSS v4, Lucide, JSZip, Leaflet)
npm install

# Start Vite development server
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## Application Pages & Workspaces

### 1. Landing Page (`/`)
- High-craft editorial presentation with animated road photography and scanlines.
- Explains the municipal maintenance backlog problem and details the 6-stage AI inference flow.
- Features technical ablation metrics, RDD2020 damage categories, full technology stack, and one-click direct launchers.

### 2. Operational Dashboard (`/dashboard`)
- **5 Core KPI Cards:** Images Inspected, Damages Detected, Potholes (`D40`), Cracks (`D00`/`D10`/`D20`), and Average Inference Latency.
- **Damage Distribution:** Segmented class-wise visual bar chart and telemetry cards.
- **Damage Hotspots:** Ranked municipal registries across Mysuru, Tokyo, and Prague with severity tiers and status.
- **Recent Inspections Table:** Audit log with image thumbnails, timestamps, class detection chips, RHI ratings, and click-to-inspect modals.
- **Demonstration Mode Controller:** Allows toggling between the 1,482 pre-seeded demonstration baseline records and live production records.

### 3. Unified Prediction Engine (`/predictions`)
- **Option 1: Single Image:**
  - File drag-and-drop or **live webcam snapshot** with front/back camera toggle.
  - 4 quick-load mock road test presets (Dry Highway, Monsoon Asphalt, Alligator Surface, Deep Potholes).
  - Adaptive 100% full-fit HTML5 canvas with color-coded bounding boxes.
  - Real-time confidence threshold slider ($\tau = 0.001$ to $0.95$) with calibrated $\tau = 0.1821$ button.
  - Adverse weather stress simulator (Monsoon Rain Glare, Low-Light Night, Motion Blur).
- **Option 2: Batch ZIP Processing:**
  - Upload entire `.zip` archives containing dozens or hundreds of images.
  - Client-side extraction via JSZip with zero server upload bottleneck.
  - Sequential queue with animated progress bar, ETA, and per-frame inspection modals.
  - Generates downloadable official Kaggle `submission.csv` (`image_id,PredictionString`).
- **Option 3: Video Stream Inspection:**
  - Upload dashcam MP4/WebM video or load the built-in road survey video.
  - Frame-by-frame inference at configurable rates (1 FPS, 2 FPS, 5 FPS).
  - Synchronized bounding box canvas overlay atop the video player.
  - Pavement condition health timeline and timestamped damage incident log with 1-click video seeking.
  - Downloadable video telemetry CSV report.

### 4. Municipal GIS Coverage Map (`/map`)
- Geo-spatial visualization rendered via Leaflet tiles.
- Pins across Mysuru, Tokyo, and Prague color-coded by Road Health Index.
- Interactive severity filter (Critical, Poor, Fair, Good).

---

## API Reference

The FastAPI service exposes the following endpoints on port `8000`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Hardware device status (`cpu`/`cuda`) and model loaded states |
| `GET` | `/model-info` | Complete benchmark metrics, hyperparameters, and Kaggle scores |
| `POST` | `/predict` | Runs YOLO26s dual-scale ensemble inference on an uploaded image file |
| `GET` | `/stats` | Aggregated database stats for the dashboard (`include_demo=true/false`) |
| `POST` | `/stats/record` | Ingests a completed inspection record into the SQLite database |
| `POST` | `/stats/reset` | Resets the SQLite database to the demonstration seed baseline |

### Example Inference Request

```bash
curl -X POST "http://localhost:8000/predict?mode=ensemble&conf=0.001" \
  -H "accept: application/json" \
  -F "file=@public/samples/img_000012.jpg"
```

### Example Inference Response

```json
{
  "detections": [
    {
      "code": "D40",
      "confidence": 0.841923,
      "x1": 0.384215,
      "y1": 0.621402,
      "x2": 0.548912,
      "y2": 0.791834
    }
  ],
  "latency_ms": 52.4,
  "width": 1280,
  "height": 720,
  "model_mode": "ensemble_wbf",
  "device": "cpu",
  "models_used": ["yolo26s(1024@1088px)", "yolo26s(640)"]
}
```

---

## Kaggle Benchmark & CSV Format

The Batch Export module generates `submission.csv` strictly adhering to the official RDD2020 Kaggle benchmark specification:

```csv
image_id,PredictionString
img_000012.jpg,D40 0.841923 491.8 447.4 702.6 570.1 D10 0.612044 120.4 340.2 310.8 410.5
img_000044.jpg,D20 0.912401 240.1 380.0 890.4 720.0
img_000088.jpg,none
```

- Undamaged frames are labeled as `none`.
- Multiple detections on a frame are space-separated in the format `class confidence xmin ymin xmax ymax`.
- Coordinates are denormalized pixel values matching original image resolution.

---

## Database & Demonstration Mode

PAVEXA includes a local SQLite store (`ml_service/pavexa.db`) for tracking inspections and hot spots:
- **Demonstration Mode (`is_demo = 1`):** Pre-seeded with 1,482 analyzed frames representing historical RDD2020 road survey runs.
- **Production Mode (`is_demo = 0`):** Automatically captures every user inspection executed through the Single Image, Batch, or Video workspaces.
- **Frontend Fallback:** If the backend is temporarily offline, a mirrored `localStorage` store seamlessly activates with zero broken UI states.

---

## Directory Structure

```
roadguard-ai/
├── ml_service/                       # Backend ML service & SQLite database
│   ├── models/
│   │   ├── yolo26s(1024).pt          # Primary high-res detector (1088px)
│   │   └── yolo26s(640).pt           # Secondary rapid-context detector (640px)
│   ├── database.py                   # SQLite schema, seed data, stats aggregator
│   ├── main.py                       # FastAPI application & WBF fusion engine
│   ├── pavexa.db                     # SQLite database instance
│   └── create_samples.py             # Script to generate sample ZIP & MP4
├── public/
│   ├── samples/
│   │   ├── img_000012.jpg            # RDD2020 sample images
│   │   ├── rdd2020_sample_batch.zip  # Instant 1-click sample batch archive
│   │   └── road_survey_sample.mp4    # Instant 1-click sample driving video
│   ├── hero-road.jpg                 # Hero road image with D20 detection box
│   ├── favicon.svg                   # Radar road geometric favicon
│   ├── logitudinal.svg               # D00 pathology vector diagram
│   ├── transverse.svg                # D10 pathology vector diagram
│   ├── alligator-crack.svg           # D20 pathology vector diagram
│   └── pothole.svg                   # D40 pathology vector diagram
├── src/
│   ├── components/
│   │   ├── ApiStatusPill.tsx         # Backend live/mock health indicator
│   │   ├── ErrorBoundary.tsx         # Component error boundary
│   │   ├── Layout.tsx                # Master page layout (full-bleed responsive)
│   │   ├── PageHeader.tsx            # Standard page titles & action slots
│   │   └── TopNav.tsx                # Header navigation bar
│   ├── lib/
│   │   ├── api.ts                    # Backend API client with mock fallback
│   │   ├── damage.ts                 # Classes, colors, severities, RHI calculation
│   │   ├── database.ts               # Database stats client & localStorage store
│   │   ├── gisData.ts                # Geotagged survey pins (Mysuru, Tokyo, Prague)
│   │   └── samples.ts                # Sample photo registry
│   ├── pages/
│   │   ├── Landing.tsx               # Full-bleed animated landing page
│   │   ├── Dashboard.tsx             # Operational database telemetry dashboard
│   │   ├── Predictions.tsx           # 3-in-1 Prediction engine (Image, ZIP, Video)
│   │   ├── CoverageMap.tsx           # Leaflet municipal GIS map
│   │   ├── NotFound.tsx              # Custom 404 page
│   │   └── ServerError.tsx           # Custom 500 page
│   ├── App.tsx                       # React Router configuration
│   ├── index.css                     # Tailwind tokens, fonts, scanline animations
│   └── main.tsx                      # Application root entry
├── index.html                        # HTML template with Google Fonts & metadata
├── package.json                      # Node dependencies & build scripts
├── vite.config.ts                    # Vite build configuration
└── README.md                         # Documentation
```

---

## License & Acknowledgments

- **Dataset:** [RDD2020](https://github.com/sekilab/RoadDamageDetector) collected by Sekilab and contributors (Japan, India, Czech Republic).
- **Computer Vision Framework:** [Ultralytics YOLO](https://github.com/ultralytics/ultralytics).
- **Bounding Box Fusion:** Weighted Box Fusion technique for object detection consensus.
- **License:** Released under the [MIT License](LICENSE).
