import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function getSafeNextPath(value: string | null): string {
  if (!value) return "/lobby";
  if (!value.startsWith("/")) return "/lobby";

  if (value.startsWith("//")) return "/lobby";

  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
      }

      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${nextPath}`);
      }

      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/lobby?auth=oauth_error", requestUrl.origin));
}
