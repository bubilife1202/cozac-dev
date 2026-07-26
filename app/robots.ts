import { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || siteConfig.url;
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing under these paths is a page a crawler should index: they are
      // JSON endpoints, the OAuth exchange, and the on-demand revalidate hook.
      disallow: ["/api/", "/auth/", "/notes/api/", "/notes/revalidate"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
