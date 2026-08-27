# Project TODO

- [x] Inspect the supplied prototype archive and inventory its model assets, inference code, and user workflow.
- [x] Preserve the supplied YOLO26s checkpoint and the compatible inference workflow in the deployable backend; retain a clearly documented YOLO26n slot because its distinct source weight was not in the archive.
- [x] Build an image-upload interface with model selection, status feedback, annotated results, confidence scores, and actionable errors.
- [x] Add deployable inference API contracts, validation, CORS controls, and production runtime configuration.
- [x] Add Vercel frontend and Render backend configuration, environment-variable documentation, Docker/runtime files, and a safe .gitignore.
- [x] Write and run unit tests, type checks, production build validation, and supplied-checkpoint compatibility validation.
- [x] Verify malformed image files return a client-safe validation error rather than an unhandled service error.
- [ ] Obtain and register the missing genuine YOLO26n litter-detection checkpoint so the Nano selection can execute inference.
- [ ] Create a private GitHub repository and push the completed project.
- [ ] Provide Vercel and Render deployment handoff instructions.
- [x] Resolve the frontend-to-inference API connectivity failure shown after image upload and verify a successful browser analysis flow.
- [x] Rename the supplied `best.pt` checkpoint to an explicit YOLO26s backend asset name and update every backend, deployment, and documentation reference.
- [ ] Diagnose and recover from the Vercel connector authorization callback failure (`invalid_request`) before creating the Git-linked frontend deployment.
- [ ] Remove the environment-specific analytics loader from the standalone Vercel frontend build.
- [ ] Configure the Render Blueprint for a free web service so deployment does not require payment-card entry.
- [ ] Recover the failed Vercel Git link with a direct production deployment and connect it to the public Render inference URL.
- [ ] Present keep-alive scheduling alternatives and, after user confirmation, configure the selected recurring health check for the deployed Render inference service.
- [ ] Fix the Render container’s missing OpenCV runtime libraries and verify the public health endpoint after redeployment.

- [ ] Rebrand the visible application as BlueSentinel AI — Marine Debris Detection Platform.
- [ ] Add YOLO26n, YOLO26s, YOLO26m, YOLO26l, and YOLO26x selector options with honest unavailable states for missing checkpoints.
- [ ] Add transparent research documentation for YOLO26, the dataset, training/validation metrics, API, deployment, limitations, future work, and acknowledgements.
- [ ] Add a safe keep-alive configuration/runbook without using an in-process timer or inference requests.
- [ ] Re-run backend/frontend tests and production health checks after the requirements changes.
- [ ] Create a new BlueSentinel-AI GitHub repository or rename the existing repository only after confirming the desired migration path.
- [ ] Update Vercel and Render deployments after the requirements changes.
