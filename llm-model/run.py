import argparse
import sys
from pathlib import Path

# Ensure the src directory is in the path
sys.path.append(str(Path(__file__).resolve().parent))

from src.core.config import settings
from src.data.processor import DataProcessor
from src.model.trainer import ModelTrainer


def main():
    parser = argparse.ArgumentParser(
        description="TUA Disaster AI: Unified Model Management CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Data Processing Command
    data_parser = subparsers.add_parser(
        "prepare-data", help="Fetch and process generalized crisis training data"
    )
    # Keeping these args for backwards compatibility, even though they currently
    # only apply to the seismic data portion.
    data_parser.add_argument(
        "--hours",
        type=int,
        default=720,
        help="Hours of historical data to fetch (seismic)",
    )
    data_parser.add_argument(
        "--min-mag",
        type=float,
        default=3.0,
        help="Minimum magnitude for filtering (seismic)",
    )

    # Training Command
    train_parser = subparsers.add_parser("train", help="Train the model using MLX LoRA")
    train_parser.add_argument(
        "--iters",
        type=int,
        default=settings.ITERATIONS,
        help="Number of training iterations",
    )
    train_parser.add_argument(
        "--no-fuse",
        action="store_true",
        help="Skip the model fusion step after training",
    )

    # Inference/API Command
    api_parser = subparsers.add_parser(
        "serve", help="Start the FastAPI inference server"
    )
    api_parser.add_argument(
        "--host", default=settings.API_HOST, help="Host to bind the server to"
    )
    api_parser.add_argument(
        "--port", type=int, default=settings.API_PORT, help="Port to bind the server to"
    )

    args = parser.parse_args()

    if args.command == "prepare-data":
        print(f"🛠️  Preparing multi-hazard crisis dataset...")
        processor = DataProcessor()
        # You could pass hours and min-mag into a specific setup method in the future
        processor.process_and_save()
        print("✅ Data preparation complete.")

    elif args.command == "train":
        print(f"🔥 Starting training pipeline for {settings.BASE_MODEL}...")
        trainer = ModelTrainer()

        # Check if data exists
        if not (settings.DATA_DIR / "train.jsonl").exists():
            print(
                "❌ Error: Training data not found. Run 'python run.py prepare-data' first."
            )
            return

        trainer.run_training(iterations=args.iters)

        if not args.no_fuse:
            trainer.fuse_model()
            print("\n📦 Next step: Convert the fused model to GGUF for deployment:")
            print(f"   {trainer.get_conversion_command()}")
        else:
            print("⚠️  Fusion skipped. Model checkpoints are in 'checkpoints/'")

    elif args.command == "serve":
        # Lazy import to avoid loading heavy dependencies when not needed
        import uvicorn
        from src.api.main import app

        print(f"🌐 Starting TUA Disaster AI API on {args.host}:{args.port}...")

        # Check if we have *any* model to serve
        has_mlx = (settings.PROJECT_ROOT / "fused_model").exists()
        has_gguf = settings.model_path.exists()

        if not (has_mlx or has_gguf):
            print(
                f"⚠️  Warning: No compiled model found (neither MLX fused_model/ nor {settings.model_path})."
            )
            print(
                "   The server will start, but prediction endpoints will return 503 errors until a model is provided."
            )

        uvicorn.run(app, host=args.host, port=args.port)

    else:
        parser.print_help()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Operation cancelled by user.")
        sys.exit(0)
