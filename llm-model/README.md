# TUA Satellite & Disaster AI Model Pipeline

This directory contains the refactored, modular pipeline for the TUA Disaster AI model. The system is designed to analyze simulated satellite data and real-time emergency events to provide intelligent, disaster-aware navigation and risk assessment.

## 🚀 Overview

- **Base Model**: Qwen2.5-1.5B-Instruct (High performance, ~3GB FP16, <1GB Quantized).
- **Training**: Optimized for Apple Silicon (M-series) using **MLX LoRA**.
- **Inference Engines**: 
  - **Native MLX**: Automatically utilized on Macs for blazingly fast GPU inference.
  - **GGUF / llama.cpp**: Fallback used for CPU deployments (e.g., Hetzner VPS).
- **Domain**: Real-time disaster response, multi-hazard safe routing (Wildfires, Floods, Earthquakes), and strategic satellite analysis.

---

## 📂 Project Structure

```text
llm-model/
├── src/
│   ├── api/            # FastAPI application (Engine-Agnostic)
│   ├── core/           # Centralized configuration (Pydantic Settings)
│   ├── data/           # AFAD live data & Turkey map synthetic generation
│   └── model/          # MLX LoRA training and model fusion wrappers
├── models/             # GGUF models for deployment (e.g., disaster-model-v1.gguf)
├── fused_model/        # HF format models generated post-training (used by MLX)
├── data/               # Generated training and valid JSONL files
├── run.py              # Unified CLI entry point
└── requirements.txt    # Project dependencies
```

---

## 🛠️ Setup (Apple Silicon / Mac)

Since you are running on a Mac, you do **not** need `llama-cpp-python` (which often causes build errors in Xcode 16). The API will automatically detect your Mac and use the `mlx-lm` engine instead.

### 1. Install Native Dependencies
Install the required packages, deliberately skipping the heavy `llama-cpp-python` build:
```bash
pip install mlx mlx-lm numpy requests geopy fastapi uvicorn pydantic pydantic-settings datasets
```

### 2. Configuration
Settings can be modified in `src/core/config.py` or via environment variables prefixed with `TUA_`:
```bash
export TUA_BATCH_SIZE=8
export TUA_ITERATIONS=2000
```

---

## 📖 Usage (CLI)

The `run.py` script provides a unified interface for the entire pipeline.

### 1. Data Preparation
Fetch recent seismic data from the AFAD API and generate 800+ synthetic training examples teaching the AI the topology of Türkiye (Cities, Highways, Terrain):
```bash
python run.py prepare-data
```

### 2. Training (Apple Silicon)
Fine-tune the model using LoRA and automatically fuse the adapters into the base model. This creates the `fused_model/` directory which the API uses for Mac inference:
```bash
python run.py train --iters 1000
```

### 3. Start the API Server
Run the FastAPI server. It will detect your Mac and load the `fused_model/` natively onto your M-series GPU for maximum speed:
```bash
python run.py serve
```

---

## 🌐 API Endpoints

Once running, visit **http://127.0.0.1:8000/docs** to test the API interactively.

### `POST /predict/navigation`
Analyzes hazard data to chart the safest route for rescue teams.
- **Input**: Hazard type/location/severity, origin coordinates, destination coordinates.
- **Output**: Satellite analysis, routing strategy, and an exact list of `<waypoint>` coordinates to plot on the frontend.

### `POST /predict/risk`
Analyzes multiple recent hazard events to provide a strategic assessment.
- **Input**: List of recent emergency events (e.g., earthquakes, wildfires).
- **Output**: Consolidated risk analysis and safety priorities based on Turkish infrastructure (e.g., fault lines, highways).

---

## 📦 Deployment to Server (Linux CPU)

When you are ready to deploy to a non-Mac server (like a Hetzner CPU), you must convert the `fused_model` into a GGUF file.

1. **Convert to GGUF (Run on Mac):**
   ```bash
   python convert_hf_to_gguf.py fused_model --outfile models/disaster-model-v2.gguf --outtype q4_k_m
   ```
2. **Upload & Serve (Run on Server):**
   Install the full `requirements.txt` (which includes `llama-cpp-python`) on your server.
   The API will automatically detect it is on a Linux CPU and load the `.gguf` file using the `llama.cpp` engine.

## ⚖️ Quantization Note
The current `disaster-model-v1.gguf` uses **Q4_K_M** quantization. This provides the best balance between speed and reasoning quality, keeping the model size around **3GB** (well within cellular-download limits for emergency deployments).