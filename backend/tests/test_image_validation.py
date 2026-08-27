import asyncio
import io

import pytest
from fastapi import UploadFile

from app.config import load_settings
from app.services.errors import ApiProblem
from app.services.image_processing import read_and_validate_image


def test_malformed_image_is_reported_as_client_error() -> None:
    upload = UploadFile(filename="broken.png", file=io.BytesIO(b"not an image"), headers={"content-type": "image/png"})

    with pytest.raises(ApiProblem) as error:
        asyncio.run(read_and_validate_image(upload, load_settings()))

    assert error.value.status_code == 415
    assert error.value.code == "invalid_image"
