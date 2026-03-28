import logging
import math
import platform
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..core.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TUA Satellite Disaster AI API",
    description="Multi-hazard disaster response AI utilizing simulated satellite imagery analysis and mathematical safe routing.",
    version="4.0.0",
)

# --- Generalized Schemas ---


class Coordinate(BaseModel):
    latitude: float
    longitude: float


class HazardEvent(BaseModel):
    """Generalized hazard event model for any disaster type."""

    type: str = Field(
        ..., description="Type of hazard (seismic, flood, wildfire, etc.)"
    )
    location: str
    severity: float = Field(..., description="Intensity or magnitude")
    latitude: float
    longitude: float
    metadata: Optional[Dict[str, Any]] = None


class PathRequest(BaseModel):
    route_type: Literal["evacuation", "rescue"] = Field(
        default="rescue",
        description="Whether this is an evacuation (escaping) or rescue (savers entering) mission.",
    )
    hazard: HazardEvent
    origin: Coordinate
    destination: Coordinate


class PathResponse(BaseModel):
    text_response: str
    suggested_waypoints: Optional[List[Coordinate]] = None


class RiskRequest(BaseModel):
    events: List[HazardEvent]


class RiskResponse(BaseModel):
    analysis: str


# --- Model Engine ---


class ModelEngine:
    """
    Manages model loading and inference, automatically choosing between
    MLX (Native Apple Silicon) and llama-cpp (GGUF).
    """

    def __init__(self):
        self.engine_type: Optional[str] = None
        self.model: Any = None
        self.tokenizer: Any = None

    def load(self):
        # 1. Try MLX first (Native Apple Silicon)
        fused_path = settings.PROJECT_ROOT / "fused_model"
        if fused_path.exists() and platform.system() == "Darwin":
            try:
                import mlx_lm

                logger.info(f"Loading native MLX model from {fused_path}...")
                self.model, self.tokenizer = mlx_lm.load(str(fused_path))
                self.engine_type = "mlx"
                logger.info("MLX engine loaded successfully.")
                return
            except Exception as e:
                logger.error(f"Failed to load MLX model: {e}")

        # 2. Fallback to GGUF (llama-cpp)
        model_path = settings.model_path
        if model_path.exists():
            try:
                from llama_cpp import Llama

                logger.info(f"Loading GGUF model from {model_path}...")
                self.model = Llama(
                    model_path=str(model_path),
                    n_ctx=settings.INFERENCE_N_CTX,
                    n_threads=settings.INFERENCE_N_THREADS,
                    verbose=False,
                )
                self.engine_type = "gguf"
                logger.info("GGUF engine loaded successfully.")
                return
            except Exception as e:
                logger.error(f"Failed to load GGUF model: {e}")

        logger.warning("No models found. Server will start but predictions will fail.")

    def generate(
        self, prompt: str, max_tokens: int = 512, temperature: float = 0.1
    ) -> str:
        if not self.model:
            raise HTTPException(status_code=503, detail="Model not loaded")

        if self.engine_type == "mlx":
            import mlx_lm

            try:
                return mlx_lm.generate(
                    self.model,
                    self.tokenizer,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temp=temperature,
                )
            except TypeError:
                return mlx_lm.generate(
                    self.model,
                    self.tokenizer,
                    prompt=prompt,
                    max_tokens=max_tokens,
                )
        else:  # GGUF
            output = self.model(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=["<|im_end|>", "</s>", "<|endoftext|>"],
            )
            return output["choices"][0]["text"].strip()


engine = ModelEngine()


@app.on_event("startup")
async def startup_event():
    engine.load()


# --- Mathematical Routing Logic ---


def calculate_safe_route(
    origin: Coordinate, dest: Coordinate, hazard: HazardEvent
) -> List[Coordinate]:
    """
    Calculates a mathematical detour if the straight line from origin to destination
    passes too close to the hazard epicenter.
    """
    # Base radius on severity (e.g., severity 8.0 * 3.0 = 24km radius)
    # Convert km to rough degrees (1 degree lat/lon is ~111 km)
    radius_km = hazard.severity * 3.0
    radius_deg = radius_km / 111.0

    # Vector OD (Origin to Destination)
    dx = dest.longitude - origin.longitude
    dy = dest.latitude - origin.latitude
    length_sq = dx * dx + dy * dy

    if length_sq == 0:
        return [origin, dest]

    # Vector OH (Origin to Hazard)
    hx = hazard.longitude - origin.longitude
    hy = hazard.latitude - origin.latitude

    # Project OH onto OD to find closest point P on the path to the hazard
    t = (hx * dx + hy * dy) / length_sq
    t = max(0.0, min(1.0, t))  # Clamp to line segment

    px = origin.longitude + t * dx
    py = origin.latitude + t * dy

    # Distance from Hazard to closest point on the path
    dist_to_hazard = math.hypot(px - hazard.longitude, py - hazard.latitude)

    waypoints = [origin]

    if dist_to_hazard < radius_deg:
        # The path intersects the danger zone! Calculate a detour.
        vx = px - hazard.longitude
        vy = py - hazard.latitude
        v_len = math.hypot(vx, vy)

        if v_len == 0:
            # Hazard is exactly on the line, pick an arbitrary perpendicular detour
            vx, vy = -dy, dx
            v_len = math.hypot(vx, vy)

        # Push the waypoint out safely beyond the hazard radius (add 20% buffer)
        safe_x = hazard.longitude + (vx / v_len) * (radius_deg * 1.2)
        safe_y = hazard.latitude + (vy / v_len) * (radius_deg * 1.2)

        # Append the detour waypoint
        waypoints.append(
            Coordinate(latitude=round(safe_y, 5), longitude=round(safe_x, 5))
        )

    waypoints.append(dest)
    return waypoints


# --- Helpers ---


def format_chatml(system: str, user: str) -> str:
    """Formats the prompt using the ChatML template."""
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


def extract_waypoints(text: str) -> List[Coordinate]:
    """
    Extracts structured coordinates from the LLM text output.
    Looks for tags like <waypoint>36.123, 30.456</waypoint>.
    """
    waypoints = []
    pattern = r"<waypoint>\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*</waypoint>"
    matches = re.findall(pattern, text)

    for lat_str, lon_str in matches:
        lat, lon = float(lat_str), float(lon_str)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            waypoints.append(Coordinate(latitude=lat, longitude=lon))

    return waypoints


# --- Endpoints ---


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health_check():
    return {
        "status": "ready" if engine.model else "missing_model",
        "engine": engine.engine_type,
        "device": platform.processor(),
        "platform": platform.system(),
    }


@app.post("/predict/navigation", response_model=PathResponse)
async def predict_navigation(req: PathRequest):
    """
    Calculates a mathematical detour around a hazard and generates a satellite
    analysis narrative based on whether it is an evacuation or rescue mission.
    """
    # 1. Math: Calculate the real physical detour coordinates
    safe_route = calculate_safe_route(req.origin, req.destination, req.hazard)
    route_str = "\n".join(
        [f"<waypoint>{w.latitude}, {w.longitude}</waypoint>" for w in safe_route]
    )

    # 2. Context: Define mission mode
    mode = (
        "Civilian Evacuation (escaping hazard)"
        if req.route_type == "evacuation"
        else "Emergency Responder Rescue (approaching perimeter)"
    )

    # 3. LLM Prompt: Ask LLM to explain the mathematical route
    system_prompt = (
        "You are the TUA Satellite Analysis & Disaster Routing AI. Your task is to process simulated "
        "satellite imagery and provide an emergency briefing for a mathematically pre-calculated safe route.\n"
        "1. Explain what the satellite imagery reveals about the hazard zone.\n"
        "2. Note the mission type and explain why the provided waypoints ensure safety.\n"
        "3. You MUST output the provided safe route waypoints exactly as given, wrapped in <waypoint>LAT, LON</waypoint> tags."
    )
    user_prompt = (
        f"Mission Type: {mode}\n"
        f"Hazard Detected: {req.hazard.type} at {req.hazard.location} (Severity {req.hazard.severity}).\n"
        f"Epicenter: ({req.hazard.latitude}, {req.hazard.longitude}).\n"
        f"Origin: ({req.origin.latitude}, {req.origin.longitude}).\n"
        f"Destination: ({req.destination.latitude}, {req.destination.longitude}).\n\n"
        f"Mathematically Verified Safe Route:\n{route_str}\n\n"
        f"Write the satellite analysis briefing and embed these exact waypoints at the end."
    )

    prompt = format_chatml(system_prompt, user_prompt)

    try:
        response_text = engine.generate(prompt, temperature=0.2, max_tokens=768)

        # Extract the structured waypoints from the response
        waypoints = extract_waypoints(response_text)

        # Fallback to math waypoints if LLM failed to format them correctly
        if not waypoints:
            waypoints = safe_route

        return PathResponse(
            text_response=response_text,
            suggested_waypoints=waypoints,
        )
    except Exception as e:
        logger.error(f"Inference failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/risk", response_model=RiskResponse)
async def predict_risk(req: RiskRequest):
    """Consolidated risk assessment for multiple concurrent hazard events."""
    system_prompt = (
        "You are a TUA Strategic Satellite Analyst. Analyze the list of recent emergency "
        "events and simulated satellite telemetry to provide a concise risk assessment and rescue team safety recommendations."
    )

    events_desc = "\n".join(
        [
            f"- {e.type.capitalize()}: {e.location} (Severity: {e.severity}, Coords: {e.latitude}, {e.longitude})"
            for e in req.events
        ]
    )
    user_prompt = f"Analyze the following concurrent hazard events from the latest satellite pass:\n{events_desc}"

    prompt = format_chatml(system_prompt, user_prompt)

    try:
        analysis_text = engine.generate(prompt, max_tokens=768, temperature=0.3)
        return RiskResponse(analysis=analysis_text)
    except Exception as e:
        logger.error(f"Inference failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)
