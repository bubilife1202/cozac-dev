import { MetadataRoute } from "next";
import { getOptionalServerClient } from "@/utils/supabase/server";

function getBaseEntries(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    return [];
  }

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
    },
    {
      url: `${siteUrl}/notes`,
      lastModified: new Date(),
    },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseEntries = getBaseEntries();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const supabase = await getOptionalServerClient();

    if (!supabase || !siteUrl) {
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
            })) || [];

        return [...baseEntries, ...notesUrls];
    } catch {
        return baseEntries;
    }
}
