import sys
import json
import asyncio
from pathlib import Path
from PIL import Image

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import load_settings
from app.services.inference import ModelRegistry, InferenceService
from app.services.image_processing import DecodedImage

def run_inference_on_file(image_path_str: str, model_id: str = "yolo26s") -> str:
    path = Path(image_path_str)
    if not path.is_file():
        return json.dumps({"error": f"File not found: {image_path_str}"})

    settings = load_settings()
    registry = ModelRegistry(settings)
    service = InferenceService(settings, registry)

    raw = path.read_bytes()
    pil_img = Image.open(path)
    width, height = pil_img.size
    fmt = pil_img.format or "JPEG"
    normalized = pil_img.convert("RGB")

    decoded = DecodedImage(image=normalized, width=width, height=height, image_format=fmt)
    response = service._detect_sync(decoded, model_id)

    # Convert dataclass to dictionary
    result = {
        "model": response.model,
        "model_label": response.model_label,
        "detections": [
            {
                "id": d.id,
                "class_name": d.class_name,
                "confidence": d.confidence,
                "bbox": {"x1": d.bbox.x1, "y1": d.bbox.y1, "x2": d.bbox.x2, "y2": d.bbox.y2}
            }
            for d in response.detections
        ],
        "count": response.count,
        "inference_time_sec": response.inference_time_sec,
        "image_size": {"width": response.image_size.width, "height": response.image_size.height},
        "summary": [{"class_name": s.class_name, "count": s.count} for s.summary in response.summary for s in [s]],
        "runtime": {
            "confidence_threshold": response.runtime.confidence_threshold,
            "per_class_thresholds": response.runtime.per_class_thresholds,
            "iou_threshold": response.runtime.iou_threshold,
            "input_size": response.runtime.input_size,
            "device": response.runtime.device,
            "engine": response.runtime.engine
        },
        "scene_relevance": {
            "score": 1.0,
            "verdict": "pass",
            "checker_available": False
        }
    }
    return json.dumps(result)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
    
    img_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "yolo26s"
    print(run_inference_on_file(img_path, model))
