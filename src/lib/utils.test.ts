import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("merges conflicting Tailwind utilities via twMerge", () => {
    expect(cn("p-4", "p-6")).toBe("p-6")
  })

  it("drops falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar")
  })
})
