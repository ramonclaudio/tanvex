// @hugeicons/core-free-icons maps subpath types to per-icon .d.ts files it does not
// ship (dist/types/ has 4 files for ~10k icons), so deep imports like
// "@hugeicons/core-free-icons/Home01Icon" resolve JS but not types. Declare the
// wildcard here instead of patching node_modules. Drop this file once upstream ships
// per-icon declarations (still missing as of 4.2.2).
declare module "@hugeicons/core-free-icons/*" {
  import type { IconSvgElement } from "@hugeicons/react"
  const icon: IconSvgElement
  export default icon
}
