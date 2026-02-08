import { NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";

async function handleScan() {
  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Scan failed", details: message },
      { status: 500 }
    );
  }
}

export async function POST() {
  return handleScan();
}

export async function GET() {
  return handleScan();
}
