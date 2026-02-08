import { NextRequest, NextResponse } from "next/server";
import { getDocketEntries, getDocketStats } from "@/lib/db";
import type { DocketStatus } from "@/types";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const status = params.get("status") as DocketStatus | null;
  const relevantParam = params.get("relevant");
  const itemType = params.get("item_type") ?? undefined;
  const limit = parseInt(params.get("limit") ?? "50", 10);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  const includeStats = params.get("stats") === "true";

  const relevant =
    relevantParam === "true" ? true : relevantParam === "false" ? false : undefined;

  const { entries, total } = getDocketEntries({
    status: status ?? undefined,
    relevant,
    itemType,
    limit,
    offset,
  });

  const response: Record<string, unknown> = { entries, total };

  if (includeStats) {
    response.stats = getDocketStats();
  }

  return NextResponse.json(response);
}
