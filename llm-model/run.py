"""
TUA BKZS — Unified CLI Entry Point

Commands:
    python run.py prepare-data          Generate training dataset
    python run.py train --iters 5000    Train model (long run)
    python run.py train --resume        Resume interrupted training
    python run.py serve                 Start API server
"""

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))

from src.core.config import settings
from src.data.processor import DataProcessor
from src.model.trainer import ModelTrainer


def main():
    parser = argparse.ArgumentParser(
        description="TUA BKZS Afet Yapay Zekası — Model Yönetim CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Kullanım Örnekleri:
  python run.py prepare-data                  # Eğitim verisi üret
  python run.py train --iters 5000            # 5000 adım eğit
  python run.py train --resume --iters 3000   # Kaldığı yerden devam et
  python run.py serve                         # API sunucusu başlat
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Çalıştırılacak komut")

    # --- Data Processing ---
    data_parser = subparsers.add_parser(
        "prepare-data", help="AFAD verisi çek ve eğitim dataseti oluştur"
    )
    data_parser.add_argument(
        "--samples", type=int, default=settings.SYNTHETIC_SAMPLES,
        help=f"Sentetik örnek sayısı (varsayılan: {settings.SYNTHETIC_SAMPLES})",
    )

    # --- Training ---
    train_parser = subparsers.add_parser("train", help="MLX LoRA ile model eğit")
    train_parser.add_argument(
        "--iters", type=int, default=settings.ITERATIONS,
        help=f"Eğitim iterasyon sayısı (varsayılan: {settings.ITERATIONS})",
    )
    train_parser.add_argument(
        "--resume", action="store_true",
        help="Son checkpoint'ten devam et",
    )
    train_parser.add_argument(
        "--no-fuse", action="store_true",
        help="Eğitim sonrası model birleştirme adımını atla",
    )

    # --- API Server ---
    api_parser = subparsers.add_parser("serve", help="FastAPI sunucusu başlat")
    api_parser.add_argument(
        "--host", default=settings.API_HOST, help="Sunucu adresi"
    )
    api_parser.add_argument(
        "--port", type=int, default=settings.API_PORT, help="Sunucu portu"
    )

    args = parser.parse_args()

    if args.command == "prepare-data":
        print("🛠️  Eğitim veri seti hazırlanıyor...")
        
        # Allow overriding sample count
        if hasattr(args, 'samples'):
            settings.SYNTHETIC_SAMPLES = args.samples
        
        processor = DataProcessor()
        processor.process_and_save()
        
        # Print next steps
        print(f"\n📋 Sonraki adım:")
        print(f"   python run.py train --iters {settings.ITERATIONS}")

    elif args.command == "train":
        print(f"🔥 TUA BKZS Model Eğitimi — {settings.BASE_MODEL}")

        if not (settings.DATA_DIR / "train.jsonl").exists():
            print("❌ Eğitim verisi bulunamadı!")
            print("   Önce şunu çalıştırın: python run.py prepare-data")
            return

        # Print data stats
        train_lines = sum(1 for _ in open(settings.DATA_DIR / "train.jsonl"))
        valid_lines = sum(1 for _ in open(settings.DATA_DIR / "valid.jsonl"))
        print(f"📊 Veri seti: {train_lines:,} eğitim + {valid_lines:,} doğrulama")

        trainer = ModelTrainer()
        trainer.run_training(iterations=args.iters, resume=args.resume)

        if not args.no_fuse:
            trainer.fuse_model()
            print(f"\n📦 GGUF dönüşümü için:")
            print(f"   {trainer.get_conversion_command()}")
        else:
            print("⚠️  Model birleştirme atlandı. Checkpoint'ler: checkpoints/")

    elif args.command == "serve":
        import uvicorn
        from src.api.main import app

        print(f"🌐 TUA BKZS API sunucusu başlatılıyor: {args.host}:{args.port}")

        has_mlx = (settings.PROJECT_ROOT / "fused_model").exists()
        has_gguf = settings.model_path.exists()

        if has_mlx:
            print(f"   🟢 MLX model bulundu: fused_model/")
        elif has_gguf:
            print(f"   🟢 GGUF model bulundu: {settings.model_path}")
        else:
            print(f"   🟡 Model bulunamadı — tahmin endpoint'leri 503 dönecek.")
            print(f"      Model eğitmek için: python run.py prepare-data && python run.py train")

        uvicorn.run(app, host=args.host, port=args.port)

    else:
        parser.print_help()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 İşlem kullanıcı tarafından iptal edildi.")
        sys.exit(0)
