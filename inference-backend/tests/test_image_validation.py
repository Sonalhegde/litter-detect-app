import asyncio
import io
import unittest

from fastapi import HTTPException, UploadFile

from app.main import read_image


class ImageValidationTests(unittest.TestCase):
    def test_malformed_image_is_reported_as_client_error(self) -> None:
        upload = UploadFile(filename="broken.png", file=io.BytesIO(b"not an image"), headers={"content-type": "image/png"})

        with self.assertRaises(HTTPException) as error:
            asyncio.run(read_image(upload))

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.detail["code"], "invalid_image")
