import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bankverse.vercel.app";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/profile", "/my-banks", "/transaction-history", "/payment-transfer"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
