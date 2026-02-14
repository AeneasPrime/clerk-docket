import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsGenerated, getMeetingCycles } from "@/lib/db";
import { syncVideosFromCablecast } from "@/lib/video-sync";
import { checkPendingMinutesGeneration } from "@/lib/minutes-generator";

export async function GET(request: NextRequest) {
  try {
    ensureMeetingsGenerated();

    // Auto-sync videos from Cablecast
    await syncVideosFromCablecast();

    // Check for any past meetings that need minutes generated
    checkPendingMinutesGeneration();

    const url = request.nextUrl;
    const filter = (url.searchParams.get("filter") ?? "all") as "upcoming" | "past" | "all";
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = getMeetingCycles({ filter, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
