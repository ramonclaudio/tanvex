import { describe, expect, it } from "vitest"

import { seo } from "./seo"
import { AUTHOR_TWITTER, SITE_LOCALE, SITE_NAME, SITE_OG_IMAGE_ALT, SITE_URL } from "./site"

describe("seo", () => {
  it("emits baseline og, twitter, and locale tags", () => {
    const tags = seo({ title: "Test" })
    expect(tags).toContainEqual({ title: "Test" })
    expect(tags).toContainEqual({ property: "og:type", content: "website" })
    expect(tags).toContainEqual({ property: "og:site_name", content: SITE_NAME })
    expect(tags).toContainEqual({ property: "og:title", content: "Test" })
    expect(tags).toContainEqual({ property: "og:url", content: SITE_URL })
    expect(tags).toContainEqual({ property: "og:locale", content: SITE_LOCALE })
    expect(tags).toContainEqual({ name: "twitter:card", content: "summary" })
    expect(tags).toContainEqual({ name: "twitter:title", content: "Test" })
    expect(tags).toContainEqual({ name: "twitter:site", content: AUTHOR_TWITTER })
    expect(tags).toContainEqual({ name: "twitter:creator", content: AUTHOR_TWITTER })
  })

  it("includes description on name and property when provided", () => {
    const tags = seo({ title: "T", description: "D" })
    expect(tags).toContainEqual({ name: "description", content: "D" })
    expect(tags).toContainEqual({ property: "og:description", content: "D" })
    expect(tags).toContainEqual({ name: "twitter:description", content: "D" })
  })

  it("omits description tags when not provided", () => {
    const tags = seo({ title: "T" })
    expect(tags.some((t) => "name" in t && t.name === "description")).toBe(false)
    expect(tags.some((t) => "property" in t && t.property === "og:description")).toBe(false)
  })

  it("promotes twitter:card and emits full image meta when image provided", () => {
    const tags = seo({ title: "T", image: "/og.png" })
    expect(tags).toContainEqual({ property: "og:image", content: `${SITE_URL}/og.png` })
    expect(tags).toContainEqual({ property: "og:image:type", content: "image/png" })
    expect(tags).toContainEqual({ property: "og:image:width", content: "2400" })
    expect(tags).toContainEqual({ property: "og:image:height", content: "1260" })
    expect(tags).toContainEqual({ property: "og:image:alt", content: SITE_OG_IMAGE_ALT })
    expect(tags).toContainEqual({ name: "twitter:image", content: `${SITE_URL}/og.png` })
    expect(tags).toContainEqual({ name: "twitter:image:alt", content: SITE_OG_IMAGE_ALT })
    expect(tags).toContainEqual({ name: "twitter:card", content: "summary_large_image" })
  })

  it("uses custom imageAlt when provided", () => {
    const tags = seo({ title: "T", image: "/og.png", imageAlt: "Custom alt" })
    expect(tags).toContainEqual({ property: "og:image:alt", content: "Custom alt" })
    expect(tags).toContainEqual({ name: "twitter:image:alt", content: "Custom alt" })
  })

  it("leaves already-absolute image URLs unchanged", () => {
    const tags = seo({ title: "T", image: "https://cdn.example.com/og.png" })
    expect(tags).toContainEqual({
      property: "og:image",
      content: "https://cdn.example.com/og.png",
    })
  })

  it("absolutizes og:url when a relative path is provided", () => {
    const tags = seo({ title: "T", url: "/about" })
    expect(tags).toContainEqual({ property: "og:url", content: `${SITE_URL}/about` })
  })
})
