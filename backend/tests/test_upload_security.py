from __future__ import annotations

from conftest import image_bytes


def upload(client, filename: str, body: bytes, content_type: str, model: str = "yolo26s"):  # type: ignore[no-untyped-def]
    return client.post("/v1/detections", files={"file": (filename, body, content_type)}, data={"model": model})


def test_content_signature_not_declared_mime_controls_image_acceptance(client) -> None:  # type: ignore[no-untyped-def]
    response = upload(client, "misleading.txt", image_bytes("JPEG"), "text/plain")
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_unsupported_and_corrupted_inputs_are_rejected_without_tracebacks(client) -> None:  # type: ignore[no-untyped-def]
    gif = upload(client, "photo.png", image_bytes("GIF"), "image/png")
    corrupt = upload(client, "broken.png", b"not an image", "image/png")
    for response in (gif, corrupt):
        assert response.status_code == 415
        rendered = response.text.lower()
        assert "traceback" not in rendered
        assert "/home/" not in rendered


def test_path_traversal_unicode_and_long_names_do_not_control_filesystem_paths(client) -> None:  # type: ignore[no-untyped-def]
    for filename in ("../../.env", "..\\..\\secret.png", "海岸-🧴.png", f"{'a' * 220}.png"):
        response = upload(client, filename, image_bytes(), "image/png")
        assert response.status_code == 200
        assert response.json()["success"] is True


def test_empty_size_and_decoded_dimension_limits_are_enforced(client) -> None:  # type: ignore[no-untyped-def]
    empty = upload(client, "empty.png", b"", "image/png")
    oversized = upload(client, "large.bin", b"x" * (1024 * 1024 + 1), "application/octet-stream")
    huge_dimensions = upload(client, "large.png", image_bytes("PNG", (300, 100)), "image/png")
    assert (empty.status_code, empty.json()["error"]["code"]) == (400, "empty_file")
    assert oversized.status_code == 413
    assert (huge_dimensions.status_code, huge_dimensions.json()["error"]["code"]) == (413, "image_dimensions_exceeded")


def test_compressed_high_pixel_png_is_rejected_before_model_inference(client) -> None:  # type: ignore[no-untyped-def]
    from io import BytesIO

    from PIL import Image

    compressed = BytesIO()
    Image.new("1", (5000, 5000), 0).save(compressed, format="PNG", optimize=True)
    response = upload(client, "high-pixel.png", compressed.getvalue(), "image/png")
    assert response.status_code == 413
    assert response.json()["error"]["code"] in {"image_dimensions_exceeded", "image_pixel_limit_exceeded"}
