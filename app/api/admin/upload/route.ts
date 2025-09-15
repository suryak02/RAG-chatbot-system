import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import os from "os"
import path from "path"
export const runtime = "nodejs"
import { DocumentProcessor } from "@/lib/document-processor"
import { vectorStore, type DocumentChunk } from "@/lib/vector-store"
import { getOpenAIClient } from "@/lib/openai-client"

const BYTES_PER_MB = 1024 * 1024
const DEFAULT_MAX_FILE_MB = Number(process.env.UPLOAD_MAX_FILE_MB || 50)
const DEFAULT_MAX_BATCH_MB = Number(process.env.UPLOAD_MAX_BATCH_MB || 100)
const MIN_TEXT_CHARS = Number(process.env.OCR_TEXT_MIN_CHARS || 200)
const USE_LOCAL_OCR = process.env.USE_LOCAL_OCR_FALLBACK === "true"

function getExt(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ""
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  if (!USE_LOCAL_OCR) return ""
  try {
    const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.js")
    const { createCanvas }: any = await import("canvas")
    const maxPages = Number(process.env.OCR_MAX_PAGES || 10)
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const pages = Math.min(pdf.numPages, maxPages)
    const pieces: string[] = []
    for (let i = 1; i <= pages; i++) {
      try {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = createCanvas(viewport.width, viewport.height)
        const ctx = canvas.getContext("2d")
        const renderTask = page.render({ canvasContext: ctx, viewport })
        await renderTask.promise
        const pngBuffer: Buffer = canvas.toBuffer("image/png")
        const text = await ocrImageBuffer(pngBuffer, "eng")
        if (text && text.trim().length > 0) pieces.push(text)
      } catch (e) {
        console.warn("OCR failed for PDF page", i, e)
      }
    }
    return pieces.join("\n\n").trim()
  } catch (e) {
    console.warn("Failed to OCR PDF:", e)
    return ""
  }
}

async function writeTempFile(buffer: Buffer, ext: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rag-ocr-"))
  const file = path.join(dir, `img-${Date.now()}${ext.startsWith(".") ? ext : "." + ext}`)
  await fs.writeFile(file, buffer)
  return file
}

async function ocrImageBuffer(buf: Buffer, lang = "eng"): Promise<string> {
  if (!USE_LOCAL_OCR) return ""
  try {
    const Tesseract: any = (await import("tesseract.js")) as any
    const tmp = await writeTempFile(buf, ".png")
    const result = await Tesseract.recognize(tmp, lang)
    // Best-effort cleanup
    try {
      await fs.unlink(tmp)
    } catch {}
    const text: string = (result?.data?.text as string) || ""
    return normalizeExtractedText(text)
  } catch (e) {
    console.warn("Local OCR failed (tesseract.js):", e)
    return ""
  }
}

async function ocrDocxImages(buffer: Buffer): Promise<string> {
  if (!USE_LOCAL_OCR) return ""
  try {
    const JSZip: any = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buffer)
    const imagePaths = Object.keys(zip.files).filter((p) =>
      /^word\/media\//.test(p) && /\.(png|jpe?g|gif|bmp|webp)$/i.test(p),
    )
    const pieces: string[] = []
    for (const p of imagePaths) {
      try {
        const imgBuf: Buffer = await zip.file(p).async("nodebuffer")
        const t = await ocrImageBuffer(imgBuf, "eng")
        if (t && t.trim().length > 0) pieces.push(t)
      } catch (e) {
        console.warn("OCR failed for DOCX image:", p, e)
      }
    }
    return pieces.join("\n\n").trim()
  } catch (e) {
    console.warn("Failed to OCR DOCX images:", e)
    return ""
  }
}

function getBase(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(0, idx) : filename
}

// Normalize extracted text to improve readability and retrieval quality
function normalizeExtractedText(text: string): string {
  if (!text) return ""
  let t = text
  // Normalize line endings
  t = t.replace(/\r\n?/g, "\n")
  // Replace NBSP with normal space
  t = t.replace(/\u00A0/g, " ")
  // Remove soft hyphen
  t = t.replace(/\u00AD/g, "")
  // Fix common ligatures
  const ligatures: Record<string, string> = {
    "\uFB00": "ff",
    "\uFB01": "fi",
    "\uFB02": "fl",
    "\uFB03": "ffi",
    "\uFB04": "ffl",
  }
  for (const [k, v] of Object.entries(ligatures)) {
    t = t.replace(new RegExp(k, "g"), v)
  }
  // De-hyphenate where a hyphen is used to wrap to the next line: "exa-\nmple" -> "example"
  t = t.replace(/([A-Za-z])-(?:\s*\n)\s*([A-Za-z])/g, "$1$2")
  // Collapse multiple spaces and excessive blank lines
  t = t.replace(/[ \t]+/g, " ")
  t = t.replace(/\n{3,}/g, "\n\n")
  return t.trim()
}

function scoreTextQuality(s: string): number {
  // Simple heuristic: prioritize more alphabetic content
  const letters = (s.match(/[A-Za-z]/g) || []).length
  return letters
}

// Minimal HTML -> text converter that preserves code blocks and headings/lists
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function htmlToText(html: string): string {
  if (!html) return ""
  let work = html

  // Extract code blocks first
  const codeBlocks: string[] = []
  work = work.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    // Remove wrapping <code> if present
    const cleaned = inner.replace(/^\s*<code[^>]*>/i, "").replace(/<\/code>\s*$/i, "")
    const code = decodeHtmlEntities(cleaned)
    codeBlocks.push(code)
    return `@@CODE_BLOCK_${codeBlocks.length - 1}@@`
  })

  // Headings -> markdown style
  for (let i = 6; i >= 1; i--) {
    const re = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, "gi")
    work = work.replace(re, (_, text) => `\n${"#".repeat(i)} ${decodeHtmlEntities(text).trim()}\n\n`)
  }
  // Lists
  work = work.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${decodeHtmlEntities(t).trim()}\n`)
  // Paragraphs and breaks
  work = work.replace(/<br\s*\/?>/gi, "\n")
  work = work.replace(/<p[^>]*>/gi, "\n")
  work = work.replace(/<\/p>/gi, "\n")
  // Tables -> rows and cells separated by pipes (basic)
  work = work.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_m: string, row: string) => {
    const cells = row
      .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_m2: string, c: string) => decodeHtmlEntities(c).trim())
      .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_m3: string, c: string) => decodeHtmlEntities(c).trim())
      .replace(/<[^>]+>/g, "|")
    return `\n${cells}\n`
  })
  // Strip remaining tags
  work = work.replace(/<[^>]+>/g, " ")
  work = decodeHtmlEntities(work)

  // Restore code blocks
  work = work.replace(/@@CODE_BLOCK_(\d+)@@/g, (_, idx) => {
    const n = Number(idx)
    const code = codeBlocks[n] || ""
    return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`
  })

  // Normalize whitespace
  work = work.replace(/[ \t]+/g, " ")
  work = work.replace(/\n{3,}/g, "\n\n")
  return work.trim()
}

async function parseFileToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = getExt(file.name)

  if (ext === "pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default as any
      // Candidate 1: default extraction
      const dataDefault = await pdfParse(buffer)
      const textDefault = normalizeExtractedText(String(dataDefault.text || ""))

      // Candidate 2: custom pagerender that concatenates items into lines
      const options = {
        pagerender: (pageData: any) =>
          pageData.getTextContent().then((textContent: any) => {
            const lines: string[] = []
            let lastY: number | undefined
            for (const item of textContent.items || []) {
              const y = Array.isArray(item.transform) ? item.transform[5] : undefined
              const text = typeof item.str === "string" ? item.str : ""
              if (text.length === 0) continue
              if (lastY === undefined) {
                lines.push(text)
              } else if (typeof y === "number" && typeof lastY === "number" && Math.abs(y - lastY) < 0.5) {
                lines[lines.length - 1] = `${lines[lines.length - 1]} ${text}`.trim()
              } else {
                lines.push(text)
              }
              lastY = y
            }
            return lines.join("\n") + "\n"
          }),
      }
      const dataCustom = await pdfParse(buffer, options)
      const textCustom = normalizeExtractedText(String(dataCustom.text || ""))

      const best = scoreTextQuality(textCustom) > scoreTextQuality(textDefault) ? textCustom : textDefault
      if (best.trim().length < MIN_TEXT_CHARS) {
        console.warn(
          `PDF parsed but text length is small (${best.length}). Attempting local OCR fallback (if enabled).`,
        )
        const ocrText = await ocrPdf(buffer)
        if (ocrText && ocrText.length > 0) return ocrText
      }
      return best
    } catch (e) {
      console.error("Failed to parse PDF with pdf-parse:", e)
      return ""
    }
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default as any
    // First try raw text
    const raw = await mammoth.extractRawText({ buffer })
    const rawText = normalizeExtractedText(String(raw.value || ""))
    if (rawText.length >= MIN_TEXT_CHARS) return rawText

    // Fallback: HTML -> text
    try {
      const htmlRes = await mammoth.convertToHtml({ buffer })
      const html = String(htmlRes.value || "")
      const textFromHtml = normalizeExtractedText(htmlToText(html))
      if (textFromHtml.length >= MIN_TEXT_CHARS) return textFromHtml
    } catch (e) {
      console.warn("DOCX HTML fallback failed:", e)
      // continue to OCR fallback below
    }

    // Final fallback: OCR embedded images (English only for now)
    const ocrText = await ocrDocxImages(buffer)
    if (ocrText && ocrText.length > 0) return ocrText
    return rawText // whatever we had
  }

  if (ext === "md" || ext === "txt") {
    return normalizeExtractedText(buffer.toString("utf8"))
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

    if (clearNamespace) {
      if (namespace) {
        await vectorStore.clearNamespace(namespace)
      } else {
        await vectorStore.clear()
      }
    }

    const openaiClient = getOpenAIClient()

    let filesProcessed = 0
    let totalChunks = 0
    let successfulChunks = 0
    let failedChunks = 0
    const errors: string[] = []
    const extractionPreviews: Array<{ file: string; preview: string }> = []

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

        // If no meaningful text was extracted, report and skip embedding
        if (!text || text.trim().length < 20) {
          errors.push(
            `No extractable text found in ${file.name}. If this is a scanned/secured PDF, try converting to .docx or .txt and re-upload.`,
          )
          filesProcessed++
          continue
        }

        // Record extraction preview (first 300 chars)
        extractionPreviews.push({ file: file.name, preview: (text || "").slice(0, 300) })

        const chunks = await DocumentProcessor.processDocument(
          processedDoc,
          800,
          "uploaded",
          namespace || undefined,
        )
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
      extractionPreviews,
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
