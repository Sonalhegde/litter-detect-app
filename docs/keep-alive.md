# Backend availability and keep-alive

Render Free web services can spin down after 15 minutes without inbound traffic and may take about a minute to wake. The application therefore exposes a lightweight `GET /health` endpoint and does not use `setInterval`, `node-cron`, or a background process inside the web container. In-process timers are not reliable on autoscaled infrastructure.

## Alternative without a cron-job.org account

This repository includes `.github/workflows/render-keepalive.yml`. GitHub Actions runs a scheduled `GET` request against:

```text
https://litter-detect-inference.onrender.com/health
```

The workflow runs every 10 minutes and can also be started manually from the GitHub Actions tab. It sends no body, credentials, or image data. GitHub Actions schedules are best-effort rather than a strict uptime guarantee: queued workflows can be delayed, and scheduled workflows may be disabled by repository inactivity or platform policy. The workflow reduces ordinary idle spin-down risk; it cannot prevent provider restarts, service suspension, or every cold start.

## cron-job.org option

An external HTTPS monitor can use the same endpoint with `GET`, no body, no credentials, and a 10-minute interval. cron-job.org supports HTTPS requests and minute-level scheduling, but it requires a separate account and its own schedule configuration.

## Stronger option

Move the Render service to a paid always-on instance. This removes the Free idle-spin-down limitation but introduces a recurring hosting cost. It is the appropriate production option if predictable latency is required.

## Operational warning

Do not call the detection endpoint as a keep-alive. Health requests must remain small and deterministic. Do not expose credentials in the monitor. Monitor failures should be treated as availability signals, not model-quality results.
