import { type NextRequest, NextResponse } from "next/server"

// Deprecated endpoint — the project now relies solely on file uploads via /api/admin/upload.
// Returning 410 Gone keeps the codebase lean and avoids bundling ingestion logic.
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, error: "/api/admin/ingest is deprecated. Use /api/admin/upload instead." },
    { status: 410 },
  )
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: "/api/admin/ingest is deprecated. Use /api/admin/upload instead." },
    { status: 410 },
  )
}
