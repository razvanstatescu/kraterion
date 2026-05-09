import { Counter, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Single Prometheus registry for the control plane. Exposed at `/metrics`
 * by `main.ts`. Stub counters for Phase 0/1; latency histograms and
 * per-route timing are deferred until we have a dashboard to view them in.
 *
 * Default Node process metrics (event-loop lag, GC, heap) are registered
 * too so we can spot back-pressure that doesn't surface on app counters.
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const cpRequestsTotal = new Counter({
  name: "cp_requests_total",
  help: "Total HTTP requests, labelled by route, method, and response status.",
  labelNames: ["route", "method", "status"] as const,
  registers: [metricsRegistry],
});

export const cpAuthFailuresTotal = new Counter({
  name: "cp_auth_failures_total",
  help: "Auth failures by reason (missing-token, invalid-token, expired, etc).",
  labelNames: ["reason"] as const,
  registers: [metricsRegistry],
});
