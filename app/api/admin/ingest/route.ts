import { type NextRequest, NextResponse } from "next/server"
import { IngestionPipeline } from "@/lib/ingestion-pipeline"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { useSampleData = true } = body

    const pipeline = new IngestionPipeline()
    const stats = await pipeline.ingestDocumentation(useSampleData)

    return NextResponse.json({
      success: true,
      stats,
      message: "Documentation ingestion completed successfully",
    })
  } catch (error) {
    console.error("Ingestion API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
