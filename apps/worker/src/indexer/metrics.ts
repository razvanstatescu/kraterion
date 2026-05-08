import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Single Prometheus registry for the worker. Exposed at `/metrics`
 * by `main.ts`. The indexer publishes:
 *
 *   - `indexer_lag_seconds{source}`             — `now() - latest_processed_event_timestamp`
 *   - `indexer_cursor_checkpoint{source}`       — last advanced checkpoint
 *   - `indexer_events_processed_total{source,type}`
 *   - `indexer_handler_failures_total{source,type}`
 *   - `indexer_rpc_errors_total{kind}`          — labelled by gRPC status code
 *   - `indexer_dlq_size{source,status}`
 *
 * Default Node process metrics (event-loop lag, GC, heap) are also
 * registered — useful for spotting indexer back-pressure that doesn't
 * surface on our own counters.
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const indexerLagSeconds = new Gauge({
  name: "indexer_lag_seconds",
  help: "Wall-clock seconds between now and the most recent event the indexer has processed.",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
});

export const indexerCursorCheckpoint = new Gauge({
  name: "indexer_cursor_checkpoint",
  help: "Last checkpoint sequence number successfully committed by this indexer source.",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
});

export const indexerEventsProcessed = new Counter({
  name: "indexer_events_processed_total",
  help: "Total events processed (handler completed without throwing).",
  labelNames: ["source", "type"] as const,
  registers: [metricsRegistry],
});

export const indexerHandlerFailures = new Counter({
  name: "indexer_handler_failures_total",
  help: "Total events that hit the handler-throw → DLQ path.",
  labelNames: ["source", "type"] as const,
  registers: [metricsRegistry],
});

export const indexerRpcErrors = new Counter({
  name: "indexer_rpc_errors_total",
  help: "gRPC stream / unary errors, labelled by status code.",
  labelNames: ["kind"] as const,
  registers: [metricsRegistry],
});

export const indexerDlqSize = new Gauge({
  name: "indexer_dlq_size",
  help: "Current count of dead-letter rows by status.",
  labelNames: ["source", "status"] as const,
  registers: [metricsRegistry],
});
