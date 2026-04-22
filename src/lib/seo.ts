import { AUTHOR_TWITTER, SITE_LOCALE, SITE_NAME, SITE_OG_IMAGE_ALT, SITE_URL } from "./site"

type SeoInput = {
  title: string
  description?: string
  image?: string
  imageAlt?: string
  url?: string
}

type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }

function absolute(path: string): string {
  if (path.startsWith("http")) return path
  return `${SITE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
}

export function seo({ title, description, image, imageAlt, url }: SeoInput): Array<MetaTag> {
  const fullUrl = url ? absolute(url) : SITE_URL
  const fullImage = image ? absolute(image) : undefined
  const alt = imageAlt ?? SITE_OG_IMAGE_ALT

  const tags: Array<MetaTag> = [
    { title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:url", content: fullUrl },
    { property: "og:locale", content: SITE_LOCALE },
    { name: "twitter:card", content: fullImage ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:site", content: AUTHOR_TWITTER },
    { name: "twitter:creator", content: AUTHOR_TWITTER },
  ]

  if (description) {
    tags.push(
      { name: "description", content: description },
      { property: "og:description", content: description },
      { name: "twitter:description", content: description },
    )
  }

  if (fullImage) {
    tags.push(
      { property: "og:image", content: fullImage },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "2400" },
      { property: "og:image:height", content: "1260" },
      { property: "og:image:alt", content: alt },
      { name: "twitter:image", content: fullImage },
      { name: "twitter:image:alt", content: alt },
    )
  }

  return tags
}
