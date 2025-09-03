import { NextRequest, NextResponse } from "next/server"
import { vectorStore } from "@/lib/vector-store"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const namespace = searchParams.get("namespace") || undefined

    const allDocuments = await vectorStore.getAllDocuments()
    const documents = namespace
      ? allDocuments.filter((d) => d.metadata.namespace === namespace)
      : allDocuments
    const count = documents.length

    return NextResponse.json({
      count,
      documents: documents.slice(0, 5).map((doc) => ({
        id: doc.id,
        title: doc.metadata.title,
        source: doc.metadata.source,
        namespace: doc.metadata.namespace,
        contentPreview: doc.content.substring(0, 100) + "...",
      })),
    })
  } catch (error) {
    console.error("Vector store API error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
