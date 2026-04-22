import type { Metric } from "web-vitals"

export function reportWebVitals(metric: Metric) {
  if (import.meta.env.DEV) {
    console.log("[web-vital]", metric.name, Math.round(metric.value), metric)
    return
  }

  // Swap this for your analytics endpoint.
  // navigator.sendBeacon?.("/api/metrics", JSON.stringify(metric))
}
