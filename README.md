<div align="center">

<img src="client/public/favicon.svg" alt="Sentinal Logo" width="80" height="80" />

# Sentinal

### Visual Intelligence for Cleaner Coastlines & Marine Ecosystems

[![Live Demo](https://img.shields.io/badge/Demo-sentinal--theta.vercel.app-10b981?style=for-the-badge&logo=vercel&logoColor=white)](https://sentinal-theta.vercel.app)
[![Cloud Run](https://img.shields.io/badge/API-Google%20Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://sentinal-backend-163815383571.us-central1.run.app/health)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![React 19](https://img.shields.io/badge/Frontend-React%2019%20%2F%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

</div>

---

## Overview

**Sentinal** is an AI-powered visual intelligence platform designed for detecting, localizing, and classifying coastal litter and marine debris in shoreline and benthic imagery. 

By operating at high resolution (up to **1280×1280px**) with hardware-accelerated **ONNX Runtime** on **Google Cloud Run**, Sentinal identifies both macro-debris (derelict fishing gear, bottles, cans) and small fragments (bottle caps, lids, thin rope lines) that typically collapse into undetectable pixel noise at conventional 320px/640px resolutions.

Developed as part of marine ecology research supervised by **Dr. Sachinandan Dutta** at **Sultan Qaboos University**, Sentinal serves as a rapid screening and analysis tool to support coastal cleanups, marine conservation initiatives, and environmental monitoring.

---

## 🎯 10 Canonical Marine Debris Classes

Sentinal unifies fragmented debris classifications into **10 standardized canonical categories**:

| # | Class Name | Description | Key Indicators |
|---|---|---|---|
| 1 | `plastic_bottle` | Single-use water, beverage, and detergent bottles | Cylindrical, clear/colored PET |
| 2 | `bottle_cap_lid` | Small plastic and metal twist caps, closures, jar lids | Circular, ribbed edges (2–6 cm) |
| 3 | `plastic_bag` | Grocery bags, poly bags, transparent film | Sheet-like, crinkled, floating/buried |
| 4 | `food_wrapper` | Snack bags, confectionery wrappers, crisp packets | Metallic film, printed plastic packaging |
| 5 | `plastic_container` | Takeout tubs, food trays, oil jugs, tubs | Rigid molded polypropylene/HDPE |
| 6 | `can_metal` | Aluminum beverage cans, tin food cans | Cylindrical metal, pull-tabs, crimped rims |
| 7 | `fishing_net` | Commercial & artisanal fishing nets, ghost nets | Grid netting, woven twine, ALDFG |
| 8 | `rope_line` | Polypropylene lines, mooring ropes, cordage | Twisted/braided strands, elongated fibers |
| 9 | `styrofoam` | Expanded polystyrene (EPS) coolers, buoys, fragments | Porous, white beaded foam, fractured edges |
| 10 | `glass_bottle` | Glass drink bottles, jars, glass vessels | Rigid, reflective, transparent/green/amber |

---

## 📚 8-Dataset Consolidated Benchmark

Sentinal's multi-class model is trained on a merged, de-duplicated benchmark uniting **8 major marine and coastal debris datasets** representing over 10,000+ labeled annotations:

1. **TACO (Trash Annotations in Context)**: High-resolution coastal, shoreline, and terrestrial debris annotations with fine-grained segmentations for bottle caps, lids, cans, bottles, and food wrappers.
2. **TrashCan 1.0 (University of Minnesota)**: Undersea ROV imagery capturing benthic marine debris, submerged trash, ghost nets, and lines on the ocean floor.
3. **ICT Mentoring Marine Debris**: Coastal shoreline survey dataset with dense annotations for bottles, cans, fishing nets, rope, and styrofoam.
4. **MV02 Marine Litter**: Real-world coastal and aquatic debris imagery capturing floating plastics, containers, and packaging.
5. **Global Solution Marine Debris**: Multi-condition coastal dataset covering plastic bags, bottles, and general marine waste.
6. **Marine Debris & Nets**: Specialized collection focused on abandoned, lost, or discarded fishing gear (ALDFG), derelict nets, and ropes.
7. **Debris KHPOO**: Extensive coastal survey dataset for rubber, plastics, and shoreline litter.
8. **Deep-Sea Debris**: Submerged benthic and seafloor debris captured by autonomous underwater vehicles (AUVs).

*All datasets are normalized with polygon-to-bounding-box projection and name-based schema alignment to prevent index drift.*

---

## 🏗️ System Architecture

```
┌────────────────────────────────┐
│   Sentinal Client (Vercel)     │
│  React 19 + TypeScript + Vite  │
│    Client-side Auto-Scale      │
└───────────────┬────────────────┘
                │ Multipart POST /v1/detections (up to 25 MB)
                ▼
┌────────────────────────────────┐
│ Google Cloud Run (us-central1) │
│   FastAPI + Uvicorn Async      │
│   2 vCPUs · 2 GB RAM Serverless│
├────────────────────────────────┤
│  1. In-memory validation (PIL) │
│  2. High-res Letterbox (1280px)│
│  3. ONNX Runtime C++ Engine    │
│  4. Class-aware NMS (IoU 0.45) │
└───────────────┬────────────────┘
                │ JSON Detections + Scaled Bounding Boxes
                ▼
┌────────────────────────────────┐
│ Interactive SVG Overlay Render │
│ Multi-class Color Swatches     │
│  Zero-refetch Local Preview    │
└────────────────────────────────┘
```

### Key Technical Specs

| Component | Specification |
|---|---|
| **Inference Engine** | ONNX Runtime (CPU multi-threaded, ORT_SEQUENTIAL) |
| **Input Resolution** | Dynamic up to **1280×1280px** (letterboxed, grey pad 114) |
| **Hosting (Frontend)** | [Vercel](https://sentinal-theta.vercel.app) |
| **Hosting (Inference API)** | [Google Cloud Run](https://sentinal-backend-163815383571.us-central1.run.app) (`us-central1`) |
| **Hardware Allocation** | 2 vCPUs, 2 GB RAM, 25 MB max upload |
| **Inference Latency** | ~280ms average per 1280px frame |

---

## 🚀 Running Locally

### Prerequisites
- **Node.js** (v18+) & **pnpm** (or npm)
- **Python** 3.11+

### 1. Clone the repository
```bash
git clone https://github.com/Sonalhegde/litter-detect-app.git
cd litter-detect-app
```

### 2. Start the FastAPI Backend
```bash
cd backend
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Start the Frontend
In another terminal at the repository root:
```bash
pnpm install
pnpm dev
```
Open **`http://localhost:3000`** in your browser. The Vite development server automatically proxies `/inference-api` to `http://127.0.0.1:8000`.

---

## 📡 API Reference

### Health & Model Status
```http
GET /health
```
```bash
curl -s https://sentinal-backend-163815383571.us-central1.run.app/health
```
**Example Response:**
```json
{
  "status": "healthy",
  "models": [
    {
      "id": "yolo26s",
      "label": "YOLO26s",
      "available": true,
      "classes": [
        "plastic_bottle",
        "bottle_cap_lid",
        "plastic_bag",
        "food_wrapper",
        "plastic_container",
        "can_metal",
        "fishing_net",
        "rope_line",
        "styrofoam",
        "glass_bottle"
      ],
      "detail": "Production ONNX artifact loaded; multi-class marine debris detector active."
    }
  ]
}
```

### Run Detection
```http
POST /v1/detections
Content-Type: multipart/form-data
```
```bash
curl -X POST https://sentinal-backend-163815383571.us-central1.run.app/v1/detections \
  -F "file=@beach_sample.jpg" \
  -F "model=yolo26s"
```
**Example Response:**
```json
{
  "success": true,
  "model": "yolo26s",
  "count": 2,
  "detections": [
    {
      "id": 1,
      "class_name": "plastic_bottle",
      "confidence": 0.884,
      "bbox": { "x1": 142.3, "y1": 88.1, "x2": 298.7, "y2": 201.5 }
    },
    {
      "id": 2,
      "class_name": "fishing_net",
      "confidence": 0.812,
      "bbox": { "x1": 310.0, "y1": 150.2, "x2": 450.6, "y2": 290.0 }
    }
  ],
  "image_size": { "width": 1920, "height": 1080 },
  "inference_time_sec": 0.28,
  "runtime": {
    "input_size": 1280,
    "device": "cpu",
    "engine": "onnxruntime",
    "confidence_threshold": 0.25,
    "iou_threshold": 0.45
  }
}
```

---

## 🧪 Testing

```bash
# Frontend tests (Vitest)
pnpm test

# Frontend production build
pnpm build

# Backend unit & contract tests (pytest)
cd backend
pytest
```

---

## 👥 Credits & Attribution

- **Developer**: [Sonal Hegde](https://github.com/Sonalhegde) · [LinkedIn](https://www.linkedin.com/in/sonal-hegde-/) · [Email](mailto:sonalhhegde@gmail.com)
- **Academic Mentorship**: **Dr. Sachinandan Dutta**, Associate Professor, Department of Marine Science and Fisheries, Sultan Qaboos University, Muscat, Oman. Specializing in fisheries management, marine ecology, and ecosystem modelling.

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
Datasets cited are subject to their respective open research and academic licenses (TACO, TrashCan, CC BY-NC-SA 4.0, etc.).
