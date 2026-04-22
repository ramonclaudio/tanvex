import { useEffect } from "react"

import { reportWebVitals } from "@/lib/report-web-vitals"

export function WebVitals() {
  useEffect(() => {
    void import("web-vitals").then((v) => {
      v.onCLS(reportWebVitals)
      v.onFCP(reportWebVitals)
      v.onINP(reportWebVitals)
      v.onLCP(reportWebVitals)
      v.onTTFB(reportWebVitals)
      return null
    })
  }, [])

  return null
}
