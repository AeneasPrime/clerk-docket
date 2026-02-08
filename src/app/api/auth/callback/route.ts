import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    await handleAuthCallback(code);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return NextResponse.redirect(new URL("/dashboard", `${proto}://${host}`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "OAuth callback failed", details: message },
      { status: 500 }
    );
  }
}
