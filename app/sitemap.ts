import { MetadataRoute } from "next";
import { getOptionalServerClient } from "@/utils/supabase/server";
import { siteConfig } from "@/config/site";
import { APPS } from "@/lib/app-config";

// Every app route renders the same shell with a different window focused, so
// they are all real linkable destinations - but the landing page and the notes
// are the pages worth ranking.
function getBaseEntries(siteUrl: string): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/notes`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...APPS.filter((app) => !app.externalUrl && app.id !== "notes").map((app) => ({
      url: `${siteUrl}/${app.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fall back to the canonical URL instead of emitting an empty sitemap when
  // NEXT_PUBLIC_SITE_URL is missing from the deploy environment.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || siteConfig.url;
  const baseEntries = getBaseEntries(siteUrl);
  const supabase = await getOptionalServerClient();

  if (!supabase) {
    return baseEntries;
  }

  try {
    const { data: notes } = await supabase
      .from("notes")
      .select("slug, created_at")
      .eq("public", true)
      .order("created_at", { ascending: false });

    const notesUrls =
      notes?.map((note) => ({
        url: `${siteUrl}/notes/${note.slug}`,
        lastModified: new Date(note.created_at),
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })) ?? [];

    return [...baseEntries, ...notesUrls];
  } catch {
    return baseEntries;
  }
}
