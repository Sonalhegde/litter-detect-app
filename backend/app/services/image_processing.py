from __future__ import annotations

import io
import warnings
from dataclasses import dataclass

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.config import Settings
from app.services.errors import ApiProblem


ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


@dataclass(frozen=True)
class DecodedImage:
    image: Image.Image
    width: int
    height: int
    image_format: str


async def read_and_validate_image(upload: UploadFile, settings: Settings) -> DecodedImage:
    """Validate content bytes, not only user-controlled filename or MIME metadata."""
    raw_image = await upload.read(settings.max_upload_bytes + 1)
    await upload.close()
    if not raw_image:
        raise ApiProblem(400, "empty_file", "The selected image is empty.")
    if len(raw_image) > settings.max_upload_bytes:
        raise ApiProblem(413, "file_too_large", f"Images must be {settings.max_upload_mb} MB or smaller.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            inspection = Image.open(io.BytesIO(raw_image))
            image_format = inspection.format or ""
            if image_format not in ALLOWED_IMAGE_FORMATS:
                raise ApiProblem(415, "unsupported_image_format", "Upload a JPEG, PNG, or WebP image.")
            inspection.verify()
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            decoded = Image.open(io.BytesIO(raw_image))
            width, height = decoded.size
            if width > settings.max_image_width or height > settings.max_image_height:
                raise ApiProblem(413, "image_dimensions_exceeded", f"Images may be at most {settings.max_image_width} × {settings.max_image_height} pixels.")
            if width * height > settings.max_image_pixels:
                raise ApiProblem(413, "image_pixel_limit_exceeded", f"Images may contain at most {settings.max_image_pixels:,} pixels.")
            decoded.load()
            normalized = decoded.convert("RGB")
    except ApiProblem:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiProblem(413, "image_pixel_limit_exceeded", "The selected image exceeds the safe decoded-image limit.") from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ApiProblem(415, "invalid_image", "The selected file could not be read as a supported image.") from None
    return DecodedImage(image=normalized, width=width, height=height, image_format=image_format)
