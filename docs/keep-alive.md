# Backend availability and keep-alive

Render Free web services can spin down after 15 minutes without inbound traffic and may take about a minute to wake. The application therefore exposes a lightweight `GET /health` endpoint and does not use `setInterval`, `node-cron`, or a background process inside the web container. In-process timers are not reliable on autoscaled infrastructure.

## Recommended low-cost option

Create one external HTTPS monitor against:

```text
https://litter-detect-inference.onrender.com/health
```

Use `GET`, no request body, no credentials, and an interval of 10 minutes. cron-job.org supports HTTPS requests and minute-level scheduling, but the service can delay or disable repeatedly failing jobs. A 10-minute interval reduces normal idle spin-down risk but cannot guarantee 24/7 availability, prevent provider restarts, or eliminate all cold starts.

## Stronger option

Move the Render service to a paid always-on instance. This removes the Free idle-spin-down limitation but introduces a recurring hosting cost. It is the appropriate production option if predictable latency is required.

## Operational warning

Do not call the detection endpoint as a keep-alive. Health requests must remain small and deterministic. Do not expose credentials in the monitor. Monitor failures should be treated as availability signals, not model-quality results.
