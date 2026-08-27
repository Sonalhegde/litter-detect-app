# Deployment status

The private GitHub repository is available at `https://github.com/Sonalhegde/litter-detect-app`. The Render dashboard was opened in an authenticated workspace and the Blueprints section is being used to import the committed `render.yaml` inference-service definition. The **New Blueprint Instance** flow is open and is loading repositories connected to the Render workspace.

The Vercel connector authorization was retried successfully after the earlier callback error. Its Git-link creation endpoint created a Vercel project record but failed to verify the Git connection with a Vercel-side `404`; no public Vercel deployment URL has been produced yet.

Render’s GitHub authorization was completed, and its Blueprint selector was reopened to load the now-authorized private repository.

The first return to the Render selector encountered a transient browser reset; the authenticated selector was reopened. The private `Sonalhegde/litter-detect-app` repository then appeared in the authorized list and was selected for a new Blueprint Instance. Render initially displayed a stale payment-information prompt from the pre-update Blueprint configuration; it was closed without entering payment details. The free-plan configuration was re-imported from the updated GitHub branch.

The Blueprint is now named `litter-detect-app`, specifies a free `litter-detect-inference` web service, and has an initial restricted CORS value of `https://litter-detect-app.vercel.app`. The configuration was submitted to Render as Blueprint `exs-da841pjbc2fs73cnl3bg`; its first sync is running against Git commit `db36c69` and is creating web service `srv-da844boae00c73am262g`.

The authenticated Vercel dashboard shows a linked `litter-detect-app` project for `Sonalhegde/litter-detect-app`, deployed from the recent Git commit and reachable at `https://litter-detect-app.vercel.app`. This confirms the Git-linked frontend deployment recovered despite the earlier connector-side 404.

The public Vercel URL serves the frontend. Its health indicator remains pending until `VITE_INFERENCE_API_URL` is set to the Render service after that service becomes reachable. Render’s initial service deployment is still being monitored; early public health requests did not respond while the Docker build and service startup were in progress.

Three direct health checks during the initial Render provisioning period timed out without a response. The Render service dashboard reports an active deployment for commit `db36c69`; its deployment-event page is being used to inspect the build without sending further public health probes until the state is known.

The first deployment failed because the Python OpenCV import could not locate `libGL.so.1`. The Docker image was updated to install `libgl1` and `libglib2.0-0`, and Render reports the subsequent deployment for commit `f3e68dc` as **Deploy succeeded | Live**. However, the public `/health` endpoint still returned `502` with `x-render-routing: no-deploy`; this is being investigated before frontend traffic or a recurring health request is configured.
