import { NextRequest, NextResponse } from "next/server"
export const runtime = "nodejs"
import { DocumentProcessor } from "@/lib/document-processor"
import { vectorStore, type DocumentChunk } from "@/lib/vector-store"
import { getOpenAIClient } from "@/lib/openai-client"

const BYTES_PER_MB = 1024 * 1024
const DEFAULT_MAX_FILE_MB = Number(process.env.UPLOAD_MAX_FILE_MB || 50)
const DEFAULT_MAX_BATCH_MB = Number(process.env.UPLOAD_MAX_BATCH_MB || 100)

function getExt(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ""
}

function getBase(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(0, idx) : filename
}

async function parseFileToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = getExt(file.name)

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default as any
    const data = await pdfParse(buffer)
    return String(data.text || "")
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return String(result.value || "")
  }

  if (ext === "md" || ext === "txt") {
    return buffer.toString("utf8")
  }

  throw new Error(`Unsupported file type: .${ext}`)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const namespace = (formData.get("namespace") as string | null)?.trim() || ""
    const clearNamespace = (formData.get("clearNamespace") as string | null) === "true"
    const files = formData.getAll("files") as unknown as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 })
    }

    // Validate sizes
    const maxFileBytes = DEFAULT_MAX_FILE_MB * BYTES_PER_MB
    const maxBatchBytes = DEFAULT_MAX_BATCH_MB * BYTES_PER_MB

    let batchBytes = 0
    for (const f of files) {
      if (f.size > maxFileBytes) {
        return NextResponse.json(
          { success: false, error: `File ${f.name} exceeds ${DEFAULT_MAX_FILE_MB}MB limit` },
          { status: 400 },
        )
      }
      batchBytes += f.size
    }
    if (batchBytes > maxBatchBytes) {
      return NextResponse.json(
        { success: false, error: `Batch exceeds ${DEFAULT_MAX_BATCH_MB}MB total limit` },
        { status: 400 },
      )
    }

    if (clearNamespace && namespace) {
      await vectorStore.clearNamespace(namespace)
    }

    const openaiClient = getOpenAIClient()

    let filesProcessed = 0
    let totalChunks = 0
    let successfulChunks = 0
    let failedChunks = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        const text = await parseFileToText(file)
        const title = getBase(file.name)
        const url = `local://upload/${encodeURIComponent(file.name)}`

        const processedDoc = {
          title,
          content: text,
          url,
          sections: DocumentProcessor.extractSections(text),
        }

        const chunks = await DocumentProcessor.processDocument(processedDoc, 800, "uploaded", namespace || undefined)
        totalChunks += chunks.length

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          try {
            const embedding = await openaiClient.createEmbedding(chunk.content)
            const documentChunk: DocumentChunk = {
              id: `${url}-chunk-${i}`,
              content: chunk.content,
              embedding,
              metadata: chunk.metadata,
            }
            await vectorStore.addDocument(documentChunk)
            successfulChunks++
          } catch (err) {
            failedChunks++
            errors.push(`Failed to embed chunk ${i} of ${file.name}: ${err}`)
          }
        }

        filesProcessed++
      } catch (error) {
        errors.push(`Failed to process ${file.name}: ${error}`)
      }
    }

    return NextResponse.json({
      success: true,
      filesProcessed,
      totalChunks,
      successfulChunks,
      failedChunks,
      errors,
      limits: { perFileMB: DEFAULT_MAX_FILE_MB, perBatchMB: DEFAULT_MAX_BATCH_MB },
    })
  } catch (error) {
    console.error("Upload API error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 },
    )
  }
}
