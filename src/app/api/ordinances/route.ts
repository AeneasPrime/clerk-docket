import { NextResponse } from "next/server";
import { getAllOrdinancesWithTracking } from "@/lib/db";

export async function GET() {
  const ordinances = getAllOrdinancesWithTracking();
  return NextResponse.json({ ordinances });
}
