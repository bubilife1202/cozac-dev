import { cache } from "react";
import { getOptionalServerClient } from "@/utils/supabase/server";
import { getOptionalClient } from "@/utils/supabase/client";
import { isSupabaseConfigured } from "@/utils/supabase/config";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { Note as NoteType } from "@/lib/notes/types";
import { NotesDesktopPage } from "./notes-desktop-page";

// Enable ISR with a reasonable revalidation period for public notes
export const revalidate = 86400; // 24 hours

// Cached function to fetch a note by slug - eliminates duplicate fetches
const getNote = cache(async (slug: string) => {
  const supabase = await getOptionalServerClient();
  if (!supabase) {
    return null;
  }

  try {
    const { data: note } = (await supabase
      .rpc("select_note", {
        note_slug_arg: slug,
      })
      .single()) as { data: NoteType | null };

    return note;
  } catch {
    return null;
  }
});

// Dynamically determine if this is a user note
export async function generateStaticParams() {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const supabase = getOptionalClient();
    if (!supabase) {
      return [];
    }

    const { data: posts } = await supabase
      .from("notes")
      .select("slug")
      .eq("public", true);

    return (posts ?? []).map(({ slug }) => ({
      slug,
    }));
  } catch {
    return [];
  }
}

// Use dynamic rendering for non-public notes
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cleanSlug = slug.replace(/^notes\//, "");
  const note = await getNote(cleanSlug);

  if (!note) {
    return { title: "Note not found" };
  }

  const title = note.title || "new note";
  const emoji = note.emoji || "👋🏼";

  return {
    title: "cozac",
    openGraph: {
      images: [
        `/notes/api/og/?title=${encodeURIComponent(title)}&emoji=${encodeURIComponent(emoji)}`,
      ],
    },
  };
}

export default async function NotePage({ params }: PageProps) {
  const { slug } = await params;
  const cleanSlug = slug.replace(/^notes\//, "");

  if (!isSupabaseConfigured()) {
    return <NotesDesktopPage slug={cleanSlug} />;
  }

  const note = await getNote(cleanSlug);

  // Invalid slug - redirect to error page
  if (!note) {
    return redirect("/notes/error");
  }

  // Render Desktop with notes app focused on this specific note
  return <NotesDesktopPage slug={cleanSlug} />;
}
