# Validation notes

The live browser preview reported **Inference service online** after the frontend default endpoint was changed to `/inference-api` and routed through the local development proxy. The supplied shoreline image (`pasted_file_koDEG7_image.png`) was selected through the actual browser upload control and the interface transitioned to the “Image is ready” state.

The browser-level YOLO26s submission completed successfully. The UI rendered 12 labelled litter bounding boxes, an item total of 12, a mean confidence of 53%, coordinate-level detection ledger entries, and no connectivity error. This confirms the end-to-end browser workflow from upload through API proxy, inference, and result rendering.
