"""
Unified configuration for the TUA Disaster AI model.
Supports training on Apple Silicon (MLX) and inference via GGUF.
"""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Project Structure ---
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = PROJECT_ROOT / "data"
    MODELS_DIR: Path = PROJECT_ROOT / "models"
    CHECKPOINTS_DIR: Path = PROJECT_ROOT / "checkpoints"

    # --- Base Model Selection ---
    # Qwen2.5-1.5B provides excellent reasoning performance with a small footprint.
    BASE_MODEL: str = "Qwen/Qwen2.5-1.5B-Instruct"

    # --- Training Hyperparameters (MLX LoRA) ---
    LORA_RANK: int = 16
    LEARNING_RATE: float = 2e-5
    BATCH_SIZE: int = 4
    ITERATIONS: int = 1000

    # --- Inference Settings (llama-cpp-python / GGUF) ---
    MODEL_FILENAME: str = "disaster-model-v1.gguf"
    INFERENCE_N_CTX: int = 4096
    INFERENCE_N_THREADS: int = 8

    # --- API Settings ---
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # --- Data Sources ---
    AFAD_API_URL: str = "https://deprem.afad.gov.tr/apiv2/event/filter"

    @property
    def model_path(self) -> Path:
        return self.MODELS_DIR / self.MODEL_FILENAME

    class Config:
        env_prefix = "TUA_"
        case_sensitive = True


settings = Settings()

# Ensure directories exist
for path in [settings.DATA_DIR, settings.MODELS_DIR, settings.CHECKPOINTS_DIR]:
    path.mkdir(parents=True, exist_ok=True)
