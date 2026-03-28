# TUA Satellite Disaster Response Dashboard

This project is a multi-hazard disaster response prototype developed for the **TUA (Turkish Space Agency) Astro Hackathon**. It combines real-time seismic data, a high-performance Rust backend, and a custom LLM (Large Language Model) for strategic risk assessment.

## 🚀 System Architecture

1.  **AI Engine (`llm-model/`)**: A FastAPI server running a custom-trained LLM (using MLX on Apple Silicon or GGUF on other platforms). It analyzes earthquake data and generates mission briefings.
2.  **Mission Control Backend (`backend/tah/`)**: A Rust/Axum web server that fetches real-time data from AFAD (Disaster and Emergency Management Authority) and coordinates with the AI Engine.
3.  **Command Center Frontend (`frontend/`)**: An Astro-based dashboard with Tailwind CSS that visualizes seismic events and displays AI-driven strategic analysis.

---

## 🛠 Setup & Running

To get the full prototype running, you need to start three services in separate terminals.

### 1. Start the AI Engine
Ensure you have the required Python environment set up.
```bash
cd llm-model
# Activate your venv if necessary
python -m src.api.main
```
*Default port: 8000*

### 2. Start the Rust Backend
This service fetches data from AFAD and serves as the API for the frontend.
```bash
cd backend/tah
cargo run
```
*Default port: 3001*

### 3. Start the Frontend
The dashboard provides the visual interface.
```bash
cd frontend
npm run dev
```
*Default port: 4321*

---

## 🛰 Features

-   **Real-time AFAD Integration**: Fetches the latest seismic activities directly from official Turkish sources.
-   **AI Risk Assessment**: Automatically sends significant events to the LLM to generate actionable rescue recommendations.
-   **Mathematical Routing**: (In AI API) Calculates safe detours around hazard zones based on disaster severity.
-   **Modern Dashboard**: High-contrast, low-latency UI designed for emergency operations centers.

## ⚖️ License
This project was created for hackathon purposes. All satellite data simulations and AI models are prototypes.