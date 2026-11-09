import type { MetadataRoute } from "next";

/** The admin website is private: ask search engines not to index any of it. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
