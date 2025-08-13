import { NextResponse } from "next/server"
import { vectorStore } from "@/lib/vector-store"

export async function GET() {
  try {
    const count = vectorStore.getDocumentCount()
    const documents = await vectorStore.getAllDocuments()

    return NextResponse.json({
      count,
      documents: documents.slice(0, 5).map((doc) => ({
        id: doc.id,
        title: doc.metadata.title,
        source: doc.metadata.source,
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
