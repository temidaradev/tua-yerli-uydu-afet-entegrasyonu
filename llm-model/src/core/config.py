"""
Unified configuration for the TUA BKZS Disaster AI model.
Optimized for long, high-quality training runs on Apple Silicon.

Key design decisions:
- Higher LoRA rank (32) for richer representations of Turkish geography
- Cosine-decay learning rate schedule for stable long training
- Large context window (8192) to handle complex multi-hazard briefings
- Aggressive checkpoint saving for resume-from-checkpoint support
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
    # Qwen2.5-3B-Instruct: Best balance of accuracy and trainability on M-series.
    # Has superior Turkish language understanding compared to 1.5B variant.
    # If your Mac has <16GB RAM, fall back to "Qwen/Qwen2.5-1.5B-Instruct".
    BASE_MODEL: str = "Qwen/Qwen2.5-1.5B-Instruct"

    # --- Training Hyperparameters (MLX LoRA) ---
    # Rank 32: Higher capacity to memorize Turkish geospatial relationships.
    LORA_RANK: int = 32
    LORA_ALPHA: int = 64     # 2x rank — standard ratio for stable training
    LORA_DROPOUT: float = 0.05
    LORA_LAYERS: int = 24    # Fine-tune more layers for deeper knowledge

    LEARNING_RATE: float = 1e-5     # Lower LR = more stable for long runs
    BATCH_SIZE: int = 2             # Smaller batch = more gradient updates per epoch
    GRAD_ACCUMULATION: int = 4      # Effective batch = 2 * 4 = 8
    ITERATIONS: int = 3000          # Default long training
    WARMUP_STEPS: int = 100         # Linear warmup for first 100 steps
    SAVE_EVERY: int = 200           # Frequent checkpoints for resume support
    VAL_EVERY: int = 100            # Validate more often to catch overfitting early

    # --- Inference Settings ---
    MODEL_FILENAME: str = "disaster-model-v2.gguf"
    INFERENCE_N_CTX: int = 8192     # Large context for complex multi-event analysis
    INFERENCE_N_THREADS: int = 8
    INFERENCE_MAX_TOKENS: int = 1024

    # --- API Settings ---
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # --- Data Settings ---
    AFAD_API_URL: str = "https://deprem.afad.gov.tr/apiv2/event/filter"
    AFAD_HOURS_BACK: int = 2160     # 90 days of seismic history for training
    AFAD_MIN_MAG: float = 2.5       # Lower threshold = more data points
    SYNTHETIC_SAMPLES: int = 3000   # Much larger synthetic dataset
    TRAIN_SPLIT: float = 0.92       # More training data, less validation

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
