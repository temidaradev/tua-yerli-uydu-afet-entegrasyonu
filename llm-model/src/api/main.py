import logging
import math
import platform
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..core.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TUA BKZS Afet Yapay Zekası API",
    description="Uydu görüntülerini AI ile analiz edip kurtarma ekiplerine güvenli rota çizen sistem.",
    version="5.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        description="Whether this is an evacuation (escaping) or rescue mission.",
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


# --- Model Engine (TUA-1K Optimized) ---


class ModelEngine:
    """
    Manages local model loading and inference, automatically choosing between
    MLX (Native Apple Silicon) and llama-cpp (GGUF).
    """

    def __init__(self):
        self.engine_type: Optional[str] = None
        self.model: Any = None
        self.tokenizer: Any = None

    def load(self):
        # 1. Try MLX first (Native Apple Silicon) - Perfect for TUA-1K Fused Model
        fused_path = settings.PROJECT_ROOT / "fused_model"
        if fused_path.exists() and platform.system() == "Darwin":
            try:
                import mlx_lm

                logger.info(f"Loading TUA-1K MLX model from {fused_path}...")
                self.model, self.tokenizer = mlx_lm.load(str(fused_path))
                self.engine_type = "mlx"
                logger.info("TUA-1K MLX engine loaded successfully.")
                return
            except Exception as e:
                logger.error(f"Failed to load MLX model: {e}")

        # 2. Fallback to GGUF (llama-cpp)
        model_path = settings.model_path
        if model_path.exists():
            try:
                from llama_cpp import Llama

                logger.info(f"Loading TUA-1K GGUF model from {model_path}...")
                self.model = Llama(
                    model_path=str(model_path),
                    n_ctx=settings.INFERENCE_N_CTX,
                    n_threads=settings.INFERENCE_N_THREADS,
                    verbose=False,
                )
                self.engine_type = "gguf"
                logger.info("TUA-1K GGUF engine loaded successfully.")
                return
            except Exception as e:
                logger.error(f"Failed to load GGUF model: {e}")

        logger.warning(
            "No TUA-1K models found. Server will start but predictions will fail."
        )

    def generate(
        self, prompt: str, max_tokens: int = None, temperature: float = 0.15
    ) -> str:
        max_tokens = max_tokens or settings.INFERENCE_MAX_TOKENS
        if not self.model:
            raise HTTPException(status_code=503, detail="TUA-1K Model not loaded")

        if self.engine_type == "mlx":
            import mlx_lm

            try:
                return mlx_lm.generate(
                    self.model,
                    self.tokenizer,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except TypeError:
                # Fallback for older mlx_lm versions that use 'temp'
                return mlx_lm.generate(
                    self.model,
                    self.tokenizer,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temp=temperature,
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
    Calculates a mathematical detour around a hazard zone.
    The logic ensures the path stays outside a safety radius based on event severity.
    """
    radius_km = hazard.severity * 3.5
    radius_deg = radius_km / 111.0

    dx = dest.longitude - origin.longitude
    dy = dest.latitude - origin.latitude
    length_sq = dx * dx + dy * dy

    if length_sq == 0:
        return [origin, dest]

    hx = hazard.longitude - origin.longitude
    hy = hazard.latitude - origin.latitude

    t = (hx * dx + hy * dy) / length_sq
    t = max(0.0, min(1.0, t))

    px = origin.longitude + t * dx
    py = origin.latitude + t * dy

    dist_to_hazard = math.hypot(px - hazard.longitude, py - hazard.latitude)
    waypoints = [origin]

    if dist_to_hazard < radius_deg:
        # Path intersects danger zone - Calculate safe detour waypoint
        vx = px - hazard.longitude
        vy = py - hazard.latitude
        v_len = math.hypot(vx, vy)

        if v_len == 0:
            vx, vy = -dy, dx
            v_len = math.hypot(vx, vy)

        # Buffer the detour to 130% of danger radius for maximum safety
        safe_x = hazard.longitude + (vx / v_len) * (radius_deg * 1.3)
        safe_y = hazard.latitude + (vy / v_len) * (radius_deg * 1.3)

        waypoints.append(
            Coordinate(latitude=round(safe_y, 5), longitude=round(safe_x, 5))
        )

    waypoints.append(dest)
    return waypoints


# --- Helpers ---


def format_chatml(system: str, user: str) -> str:
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


def extract_waypoints(text: str) -> List[Coordinate]:
    waypoints = []
    pattern = r"<waypoint>\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*</waypoint>"
    matches = re.findall(pattern, text)

    for lat_str, lon_str in matches:
        try:
            lat, lon = float(lat_str), float(lon_str)
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                waypoints.append(Coordinate(latitude=lat, longitude=lon))
        except ValueError:
            continue
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
        "model_version": "TUA-1K-V4",
        "device": platform.processor(),
    }


@app.post("/predict/navigation", response_model=PathResponse)
async def predict_navigation(req: PathRequest):
    """
    Uses the TUA-1K fine-tuned model to explain the safe route across Turkish topography.
    """
    safe_route = calculate_safe_route(req.origin, req.destination, req.hazard)
    route_str = "\n".join(
        [f"<waypoint>{w.latitude}, {w.longitude}</waypoint>" for w in safe_route]
    )

    mode = (
        "Sivil Tahliye"
        if req.route_type == "evacuation"
        else "Acil Kurtarma Müdahalesi"
    )

    system_prompt = (
        "Sen TUA BKZS Uydu Analiz ve Afet Rotalama Yapay Zekasısın.\n"
        "Görevin: Uydu görüntülerini (SAR, InSAR, optik) analiz ederek afet bölgelerinde "
        "kurtarma ekipleri için EN GÜVENLİ rotayı belirlemek.\n\n"
        "Kurallar:\n"
        "1. Tehlike bölgesinin yarıçapını büyüklük × 4 km olarak hesapla.\n"
        "2. Türkiye'nin gerçek otoyol ve devlet yolu ağını kullanarak rota öner.\n"
        "3. Fay hatlarına yakınlığı ve zemin durumunu değerlendir.\n"
        "4. Her waypoint'i <waypoint>LAT, LON</waypoint> etiketleriyle çıktıla.\n"
        "5. Yanıtını Türkçe ver."
    )
    user_prompt = (
        f"Görev: {mode}\n"
        f"Tehlike Tespiti: {req.hazard.type} — {req.hazard.location} (Büyüklük {req.hazard.severity})\n"
        f"Merkez Üstü: ({req.hazard.latitude}, {req.hazard.longitude})\n"
        f"Başlangıç: ({req.origin.latitude}, {req.origin.longitude}) → Hedef: ({req.destination.latitude}, {req.destination.longitude})\n\n"
        f"Güvenli Waypoint'ler:\n{route_str}\n\n"
        f"Uydu analiz brifingini oluştur."
    )

    prompt = format_chatml(system_prompt, user_prompt)

    try:
        response_text = engine.generate(prompt)
        waypoints = extract_waypoints(response_text)

        # Reliable fallback: if LLM misses a tag, we inject the math route
        if not waypoints:
            waypoints = safe_route

        return PathResponse(text_response=response_text, suggested_waypoints=waypoints)
    except Exception as e:
        logger.error(f"TUA-1K Inference failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/predict/risk", response_model=RiskResponse)
async def predict_risk(req: RiskRequest):
    """Birden fazla afet olayını TUA-1K'nın öğrenilmiş bilgisiyle analiz eder."""
    system_prompt = (
        "Sen TUA BKZS Stratejik Uydu Analistsin.\n"
        "Birden fazla eşzamanlı afet olayını analiz ederek:\n"
        "1. Olaylar arası tektonik/coğrafi korelasyon tespit et.\n"
        "2. Fay hattı aktivasyon zincirini değerlendir.\n"
        "3. Bölgesel risk önceliklendirmesi yap.\n"
        "4. Kaynak dağıtım stratejisi öner.\n"
        "Yanıtını Türkçe ver."
    )
    events_desc = "\n".join(
        [
            f"- {e.type}: {e.location} (Şiddet: {e.severity}, Konum: {e.latitude}, {e.longitude})"
            for e in req.events
        ]
    )
    user_prompt = f"Güncel Uydu Telemetri Verileri:\n{events_desc}\n\nRisk korelasyon analizi gerçekleştirin."

    prompt = format_chatml(system_prompt, user_prompt)

    try:
        analysis_text = engine.generate(prompt)
        return RiskResponse(analysis=analysis_text)
    except Exception as e:
        logger.error(f"TUA-1K Inference failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Satellite Image Analysis ---


class SatelliteAnalysisRequest(BaseModel):
    latitude: float
    longitude: float
    magnitude: float
    depth: float
    location: str


class SatelliteAnalysisResponse(BaseModel):
    briefing: str
    damage_assessment: str
    recommended_routes: Optional[List[str]] = None


@app.post("/predict/satellite-analysis", response_model=SatelliteAnalysisResponse)
async def predict_satellite_analysis(req: SatelliteAnalysisRequest):
    """
    Simulates satellite image analysis for a disaster zone.
    Uses TUA-1K to generate damage assessment from SAR/optical telemetry simulation.
    """
    system_prompt = (
        "Sen TUA BKZS Uydu Görüntü Analiz Yapay Zekasısın (TUA-1K). "
        "Sentetik Açıklıklı Radar (SAR) ve optik uydu görüntülerini analiz ederek "
        "afet bölgesinde yapısal hasar tespiti, altyapı durumu ve güvenli tahliye koridorları belirliyorsun.\n"
        "1. Uydu görüntüsünden tespit edilen hasarı açıkla.\n"
        "2. Etkilenen bina ve altyapı sayısını tahmin et.\n"
        "3. Kurtarma ekipleri için güvenli erişim güzergahları öner.\n"
        "Yanıtını Türkçe ver."
    )
    
    user_prompt = (
        f"Uydu Telemetri Verisi:\n"
        f"  Konum: {req.location}\n"
        f"  Koordinatlar: ({req.latitude}, {req.longitude})\n"
        f"  Büyüklük: {req.magnitude}\n"
        f"  Derinlik: {req.depth} km\n\n"
        f"SAR görüntüsünde yüzey değişimleri ve yapısal hasar tespit edildi. "
        f"Optik görüntülerde {req.magnitude * 3:.0f} km yarıçapında toz bulutu ve enkaz izleri mevcut.\n\n"
        f"Detaylı hasar tespiti ve kurtarma rotası önerisi oluştur."
    )

    prompt = format_chatml(system_prompt, user_prompt)

    try:
        briefing = engine.generate(prompt)
        
        # Generate damage assessment summary
        damage_level = "Ağır" if req.magnitude >= 7.0 else "Orta" if req.magnitude >= 5.5 else "Hafif"
        damage_assessment = (
            f"Hasar Seviyesi: {damage_level}\n"
            f"Tahmini Etkilenen Yapı: ~{int(req.magnitude ** 3 * 10)} bina\n"
            f"Yıkılan Yapı Tahmini: ~{int(req.magnitude ** 2 * 2)} bina\n"
            f"Etkilenen Nüfus Tahmini: ~{int(req.magnitude ** 3 * 150)} kişi"
        )
        
        return SatelliteAnalysisResponse(
            briefing=briefing,
            damage_assessment=damage_assessment,
            recommended_routes=[
                f"Kuzey koridoru ({req.latitude + 0.1:.4f}, {req.longitude:.4f}) üzerinden erişim",
                f"Batı koridoru ({req.latitude:.4f}, {req.longitude - 0.15:.4f}) üzerinden erişim",
            ]
        )
    except Exception as e:
        logger.error(f"Satellite analysis failed: {e}")
        # Fallback without model
        return SatelliteAnalysisResponse(
            briefing=f"{req.location} bölgesinde büyüklüğü {req.magnitude} olan deprem sonrası uydu analizi tamamlandı.",
            damage_assessment=f"Tahmini etkilenen yarıçap: {req.magnitude * 3.5:.1f} km",
            recommended_routes=[
                f"Kuzey güvenli koridor",
                f"Batı alternatif güzergah",
            ]
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)

