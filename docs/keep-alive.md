# Backend availability and keep-alive

Render Free web services can spin down after 15 minutes without inbound traffic and may take about a minute to wake. The application therefore exposes a lightweight `GET /health` endpoint and does not use `setInterval`, `node-cron`, or a background process inside the web container. In-process timers are not reliable on autoscaled infrastructure.

## Alternative without a cron-job.org account

This repository includes `.github/workflows/render-keepalive.yml`. GitHub Actions runs a scheduled `GET` request against:

```text
https://litter-detect-inference.onrender.com/health
```

The workflow runs every 10 minutes and can also be started manually from the GitHub Actions tab. It sends no body, credentials, or image data. GitHub Actions schedules are best-effort rather than a strict uptime guarantee: queued workflows can be delayed, and scheduled workflows may be disabled by repository inactivity or platform policy. The workflow reduces ordinary idle spin-down risk; it cannot prevent provider restarts, service suspension, or every cold start.

## Mitigations for GitHub Actions schedule reliability

Two known failure modes are addressed directly in `.github/workflows/render-keepalive.yml`:

1. **Predictable ping timing.** Each 10-minute run starts with a random jitter step
   (`sleep $((RANDOM % 240))`), so the actual `/health` request lands somewhere within
   the window instead of on the dot every time.
2. **Silent schedule disabling.** GitHub disables scheduled workflows after roughly
   60 days without repository activity. A second, weekly job (`17 3 * * 1`, Mondays)
   refreshes the `.github/keepalive-heartbeat` timestamp file and pushes the commit,
   keeping the repository active so the schedule is never silently disabled.

Ping failures are logged with a `::error::` annotation so they surface in the Actions
tab instead of going unnoticed.

## cron-job.org option

An external HTTPS monitor can use the same endpoint with `GET`, no body, no credentials, and a 10-minute interval. cron-job.org supports HTTPS requests and minute-level scheduling, but it requires a separate account and its own schedule configuration.

## Stronger option

Move the Render service to a paid always-on instance. This removes the Free idle-spin-down limitation but introduces a recurring hosting cost. It is the appropriate production option if predictable latency is required.

## Operational warning

Do not call the detection endpoint as a keep-alive. Health requests must remain small and deterministic. Do not expose credentials in the monitor. Monitor failures should be treated as availability signals, not model-quality results.
