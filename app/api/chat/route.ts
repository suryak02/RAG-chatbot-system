import { type NextRequest, NextResponse } from "next/server"
import { ragService } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, namespace } = body as { message?: string; namespace?: string }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required and must be a string" }, { status: 400 })
    }

    // Check if vector store has documents
    const stats = await ragService.getVectorStoreStats()
    if (stats.totalDocuments === 0) {
      return NextResponse.json({
        response:
          "The knowledge base is empty. Please run the documentation ingestion process first by visiting the admin panel at /admin.",
        sources: [],
        metadata: {
          retrievedChunks: 0,
          processingTime: 0,
          vectorStoreDocuments: 0,
        },
      })
    }

    // Process RAG query
    const result = await ragService.query({
      question: message.trim(),
      maxResults: 5,
      similarityThreshold: 0.7,
      namespace: namespace?.trim() || undefined,
    })

    return NextResponse.json({
      response: result.answer,
      sources: result.sources,
      metadata: {
        retrievedChunks: result.retrievedChunks,
        processingTime: result.processingTime,
        vectorStoreDocuments: stats.totalDocuments,
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)

    // Handle specific error types
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        {
          error: "OpenAI API key is not configured. Please add your OPENAI_API_KEY environment variable.",
        },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 },
    )
  }
}
