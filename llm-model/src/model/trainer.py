import subprocess
import sys
from pathlib import Path
from typing import Optional

from ..core.config import settings


class ModelTrainer:
    """
    Wrapper for MLX LoRA fine-tuning on Apple Silicon (M-series).
    Provides a clean interface for training, fusing, and preparing models for deployment.
    Uses the modern mlx_lm config-based approach.
    """

    def __init__(self):
        self.model_name = settings.BASE_MODEL
        self.data_dir = settings.DATA_DIR
        self.adapter_path = settings.CHECKPOINTS_DIR
        self.fused_path = settings.PROJECT_ROOT / "fused_model"
        self.config_path = settings.PROJECT_ROOT / "lora_config.yaml"

    def _generate_config(self, iters: int):
        """
        Generates the lora_config.yaml file required by modern mlx_lm versions.
        """
        config_content = f"""
# --- MLX LoRA Configuration ---
model: "{self.model_name}"
train: true
data: "{self.data_dir}"
iters: {iters}
batch_size: {settings.BATCH_SIZE}
learning_rate: {settings.LEARNING_RATE}
adapter_path: "{self.adapter_path}"
save_every: 100

# Number of layers to fine-tune
lora_layers: 16

# LoRA specific parameters
lora_parameters:
  rank: {settings.LORA_RANK}
  alpha: 32
  dropout: 0.05
  scale: 10.0
"""
        with open(self.config_path, "w", encoding="utf-8") as f:
            f.write(config_content.strip())

    def run_training(self, iterations: Optional[int] = None):
        """
        Starts the MLX LoRA fine-tuning process.
        Requires 'train.jsonl' and 'valid.jsonl' to be present in the data directory.
        """
        iters = iterations or settings.ITERATIONS

        # MLX LoRA defaults to looking for valid.jsonl
        valid_path = self.data_dir / "valid.jsonl"
        eval_path = self.data_dir / "eval.jsonl"
        if not valid_path.exists() and eval_path.exists():
            print(
                f"Renaming {eval_path.name} to {valid_path.name} for MLX compatibility..."
            )
            eval_path.rename(valid_path)

        # Generate the YAML configuration file
        self._generate_config(iters)

        print(f"\n🚀 Starting MLX LoRA Fine-Tuning...")
        print(f"📍 Base Model: {self.model_name}")
        print(f"📍 Data Dir:   {self.data_dir}")
        print(f"📍 Iterations: {iters}")
        print(f"📍 Config:     {self.config_path}")
        print("-" * 40)

        # Modern MLX invocation: python -m mlx_lm lora -c config.yaml
        cmd = [
            sys.executable,
            "-m",
            "mlx_lm",
            "lora",
            "-c",
            str(self.config_path),
        ]

        try:
            subprocess.run(cmd, check=True)
            print("\n✅ Training completed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"\n❌ Training failed: {e}")
            sys.exit(1)

    def fuse_model(self):
        """
        Fuses the LoRA adapters into the base model to create a standalone model.
        """
        print(f"\n🧩 Fusing adapters into base model...")

        cmd = [
            sys.executable,
            "-m",
            "mlx_lm",
            "fuse",
            "--model",
            self.model_name,
            "--adapter-path",
            str(self.adapter_path),
            "--save-path",
            str(self.fused_path),
        ]

        try:
            subprocess.run(cmd, check=True)
            print(f"✅ Model fused successfully at: {self.fused_path}")
        except subprocess.CalledProcessError as e:
            print(f"❌ Fusing failed: {e}")
            sys.exit(1)

    def get_conversion_command(self) -> str:
        """
        Returns the command to convert the fused model to GGUF format.
        """
        return (
            f"python convert_hf_to_gguf.py {self.fused_path} "
            f"--outfile {settings.model_path} --outtype q4_k_m"
        )


if __name__ == "__main__":
    trainer = ModelTrainer()

    # Simple check for training data
    if not (settings.DATA_DIR / "train.jsonl").exists():
        print("❌ Error: 'train.jsonl' not found. Please run the data processor first.")
        sys.exit(1)

    # 1. Train
    trainer.run_training()

    # 2. Fuse
    trainer.fuse_model()

    # 3. Next Steps
    print("\n📦 To prepare for deployment, run the GGUF conversion:")
    print(trainer.get_conversion_command())
