import { type NextRequest, NextResponse } from "next/server"
import { IngestionPipeline, type IngestionOptions, type IngestionSource } from "@/lib/ingestion-pipeline"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { useSampleData, source, namespace, clear } = body as {
      useSampleData?: boolean
      source?: IngestionSource
      namespace?: string
      clear?: boolean
    }

    // Back-compat mapping: if useSampleData is provided, map to source
    let resolvedSource: IngestionSource = "openai-sample"
    if (typeof source === "string") {
      resolvedSource = source
    } else if (typeof useSampleData === "boolean") {
      resolvedSource = useSampleData ? "openai-sample" : "openai-live"
    }

    const pipeline = new IngestionPipeline()
    const options: IngestionOptions = {
      source: resolvedSource,
      namespace,
      clear,
    }
    const stats = await pipeline.ingestDocumentation(options)

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
