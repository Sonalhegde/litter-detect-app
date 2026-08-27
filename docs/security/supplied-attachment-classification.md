# Supplied attachment classification

| Attachment | Observed content | Use in release validation |
| --- | --- | --- |
| `pasted_file_cUOzjI_image.png` | Browser screenshot showing an unrelated `invalid_request` authorization message. | Excluded from model inference; retained only as historic deployment-debug context. |
| `pasted_file_koDEG7_image.png` | Screenshot of an earlier UI with a rendered shoreline image and a `plasticcoco__000734.png` filename visible inside the screenshot. The original image file was not attached. | Excluded as a scene sample because it is an interface screenshot, not the original image bytes. It confirms the prior UI flow but cannot support an independent detection observation. |
| `pasted_file_mm9Lnh_image.png` | Wide screenshot of the documentation menu layout. | Excluded from inference; used only to preserve the requested in-application documentation-menu visual intent. |

No user-supplied standalone shoreline image file was available for a new raw-image request in this revision. Controlled synthetic inputs and one externally sourced NOAA Marine Debris Program search image were used instead, with their scope documented separately.
