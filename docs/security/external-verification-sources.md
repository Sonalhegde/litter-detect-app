# External verification sources

This release used the following public sources only to ground defensive design choices and select a controlled real-image smoke-test input. The NOAA image was not copied into the application and the result was not treated as a benchmark.

| Source | Use in this release | Preserved observation |
| --- | --- | --- |
| [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Upload-threat and control rationale. | Recommends defence in depth, warns against trusting client `Content-Type`, and identifies size limits, filename safety, content validation, and storage design as relevant controls. |
| [FastAPI response model documentation](https://fastapi.tiangolo.com/tutorial/response-model/) | Typed API response rationale. | Documents response-model validation and filtering as a way to constrain response shape. |
| [Pillow Image module documentation](https://pillow.readthedocs.io/en/stable/reference/Image.html) | Image-parser safety rationale. | Documents lazy image loading and decompression-bomb warnings/errors; the service validates verified content and bounds decoded dimensions/pixels before model execution. |
| [NOAA Marine Debris Program: Multimedia](https://marinedebris.noaa.gov/multimedia) | Real-image source policy check. | States that resources credited to NOAA are public domain and asks users to seek permission for assets credited to other organizations. No downloaded source image is included in the product. |
| [NOAA Marine Debris Program: Surveying Debris on Our Shores](https://blog.marinedebris.noaa.gov/surveying-debris-our-shores) | Context for one controlled external smoke-test image. | Describes shoreline monitoring and credits individual images to NOAA and/or partner organizations. A downloaded search image was used only for an ephemeral API smoke test, with no assertion of image-specific reusable rights or model performance. |

## Smoke-test result boundary

The locally run checksum-pinned YOLO26s service processed a **specifically NOAA-credited** marine-debris photograph from the official photo gallery. The gallery describes the image as NOAA staff volunteering to clean up marine debris on Kingman Island, Washington, D.C., and credits it to NOAA; its stated policy makes NOAA-credited resources public domain. At 960-pixel input size on CPU, the service returned a successful typed response with 8 predicted `litter` boxes, maximum reported confidence 0.5097, and 5.793 seconds backend inference time. The downloaded file was used only ephemerally and is not included in the product. This is an observed integration result, **not** an accuracy claim, false-positive calculation, test metric, or endorsement by NOAA.

For a distinct non-marine check, the same service processed a 600×446 USGS desert-landscape search image. The response completed successfully on CPU, returned zero predicted boxes, and reported 5.705 seconds backend inference time. USGS states that USGS-authored or produced material is generally public domain but notes that some third-party material can appear on its site. This file was used ephemerally, is not included in the product, and the zero-box observation is **not** an estimated false-positive rate.

## Direct ONNX runtime follow-up

After exporting the preserved YOLO26s checkpoint into a checksum-pinned, fixed-320 ONNX artifact, the clean local service used direct ONNX Runtime inference on an ephemeral 1500×1000 NOAA-gallery search asset. It returned 3 predicted `litter` boxes, maximum reported confidence 0.7355, and 0.017 seconds measured backend inference time. This observation confirms only that the constrained local integration completed for that request. It is **not** a test-set metric, latency guarantee, comparison with the earlier PyTorch/Ultralytics smoke run, accuracy claim, false-positive calculation, or NOAA endorsement. The file was not added to the repository, container, or web application.
