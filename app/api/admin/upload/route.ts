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
const OCR_PROVIDER = (process.env.OCR_PROVIDER || "local").toLowerCase()
const AZURE_VISION_ENDPOINT = (process.env.AZURE_VISION_ENDPOINT || "").replace(/\/$/, "")
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY || ""
const AZURE_READ_POLL_MS = Number(process.env.AZURE_READ_POLL_MS || 1000)
const AZURE_READ_MAX_POLLS = Number(process.env.AZURE_READ_MAX_POLLS || 60)
const PDF_MAX_TEXT_PAGES = Number(process.env.PDF_MAX_TEXT_PAGES || 50)
const PDF_FORCE_AZURE_OCR = process.env.PDF_FORCE_AZURE_OCR === "true"
const AZURE_OCR_MAX_PAGES = Number(process.env.AZURE_OCR_MAX_PAGES || process.env.OCR_MAX_PAGES || 10)
// Azure Speech (short audio) for audio transcription
const AZURE_SPEECH_REGION = (process.env.AZURE_SPEECH_REGION || "").trim()
const AZURE_SPEECH_KEY = (process.env.AZURE_SPEECH_KEY || "").trim()

function getExt(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ""
}

// Azure Speech to Text (short audio REST). Suitable for short clips; for long audio, prefer batch services.
async function azureSpeechRecognizeShortAudio(
  buffer: Buffer,
  contentType: string,
  language = "en-US",
): Promise<string> {
  if (!AZURE_SPEECH_REGION || !AZURE_SPEECH_KEY) return ""
  try {
    const base = `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com`
    const url = `${base}/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": contentType || "audio/wav",
      },
      body: buffer,
    })
    if (!res.ok) {
      try {
        console.warn("Azure Speech short-audio failed:", res.status, await res.text())
      } catch {}
      return ""
    }
    const data: any = await res.json()
    const text: string = data?.DisplayText || data?.Text || ""
    return normalizeExtractedText(String(text || ""))
  } catch (e) {
    console.warn("Azure Speech short-audio error:", e)
    return ""
  }
}

function getAudioContentTypeByExt(ext: string): string | null {
  switch (ext) {
    case "wav":
      return "audio/wav"
    case "mp3":
      return "audio/mpeg"
    case "ogg":
      return "audio/ogg"
    case "webm":
      return "audio/webm"
    case "m4a":
      return "audio/mp4" // some clients encode M4A as audio/mp4
    default:
      return null
  }
}

async function azureOcrPdfPages(buffer: Buffer): Promise<string> {
  if (OCR_PROVIDER !== "azure" || !AZURE_VISION_ENDPOINT || !AZURE_VISION_KEY) return ""
  try {
    const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.js")
    const { createCanvas }: any = await import("canvas")
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const pages = Math.min(pdf.numPages, AZURE_OCR_MAX_PAGES)
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
        const text = await azureReadAnalyze(pngBuffer, "image/png")
        if (text && text.trim().length > 0) pieces.push(text)
      } catch (e) {
        console.warn("Azure per-page OCR failed for PDF page", i, e)
      }
    }
    return pieces.join("\n\n").trim()
  } catch (e) {
    console.warn("Failed Azure per-page OCR for PDF:", e)
    return ""
  }
}

async function extractPdfTextWithPdfjs(buffer: Buffer): Promise<string> {
  try {
    const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.js")
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const pages = Math.min(pdf.numPages, PDF_MAX_TEXT_PAGES)
    const out: string[] = []
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      let lastY: number | undefined
      let line = ""
      for (const item of textContent.items || []) {
        const text = typeof item.str === "string" ? item.str : ""
        if (!text) continue
        const y = Array.isArray(item.transform) ? item.transform[5] : undefined
        if (lastY === undefined) {
          line = text
        } else if (typeof y === "number" && typeof lastY === "number" && Math.abs(y - lastY) < 0.5) {
          line = `${line} ${text}`.trim()
        } else {
          out.push(line)
          line = text
        }
        lastY = y
      }
      if (line) out.push(line)
      out.push("")
    }
    return normalizeExtractedText(out.join("\n"))
  } catch (e) {
    console.warn("PDF.js text extraction failed:", e)
    return ""
  }
}

async function azureReadAnalyze(buffer: Buffer, contentType: string): Promise<string> {
  if (OCR_PROVIDER !== "azure" || !AZURE_VISION_ENDPOINT || !AZURE_VISION_KEY) return ""
  try {
    const url = `${AZURE_VISION_ENDPOINT}/vision/v3.2/read/analyze`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_VISION_KEY,
        // Use caller-provided type (e.g., application/pdf or image/png)
        "Content-Type": contentType || "application/octet-stream",
      },
      body: buffer,
    })
    // Azure may return 202 Accepted
    if (!(res.ok || res.status === 202)) {
      try {
        console.warn("Azure Read analyze POST failed:", res.status, await res.text())
      } catch {}
      return ""
    }
    const opLoc = res.headers.get("operation-location")
    if (!opLoc) return ""
    // Poll for result
    for (let i = 0; i < AZURE_READ_MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, AZURE_READ_POLL_MS))
      const r2 = await fetch(opLoc, {
        headers: { "Ocp-Apim-Subscription-Key": AZURE_VISION_KEY },
      })
      if (!r2.ok) continue
      const data: any = await r2.json()
      const status = String(data?.status || "").toLowerCase()
      if (status === "succeeded") {
        const ar = data?.analyzeResult
        const parts: string[] = []
        if (ar) {
          if (Array.isArray(ar.readResults)) {
            for (const page of ar.readResults) {
              for (const line of page.lines || []) {
                if (line.text) parts.push(String(line.text))
              }
              parts.push("\n")
            }
          } else if (Array.isArray(ar.pages)) {
            for (const page of ar.pages) {
              for (const line of page.lines || []) {
                const txt = line.content || line.text
                if (txt) parts.push(String(txt))
              }
              parts.push("\n")
            }
          } else if (typeof ar.content === "string") {
            parts.push(ar.content)
          }
        }
        return normalizeExtractedText(parts.join("\n"))
      }
      if (status === "failed") {
        try {
          console.warn("Azure Read analyze failed:", JSON.stringify(data))
        } catch {}
        return ""
      }
    }
    console.warn("Azure Read analyze timed out.")
    return ""
  } catch (e) {
    console.warn("Azure Read analyze error:", e)
    return ""
  }
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  // Prefer Azure OCR if configured
  if (OCR_PROVIDER === "azure" && AZURE_VISION_ENDPOINT && AZURE_VISION_KEY) {
    const t = await azureReadAnalyze(buffer, "application/pdf")
    if (t && t.trim().length > 0) return t
    // Per-page Azure fallback: render to images and OCR each page
    const perPage = await azureOcrPdfPages(buffer)
    if (perPage && perPage.trim().length > 0) return perPage
  }
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
  // Prefer Azure OCR per image if configured
  if (OCR_PROVIDER === "azure" && AZURE_VISION_ENDPOINT && AZURE_VISION_KEY) {
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
          const t = await azureReadAnalyze(imgBuf, "image/png")
          if (t && t.trim().length > 0) pieces.push(t)
        } catch (e) {
          console.warn("Azure OCR failed for DOCX image:", p, e)
        }
      }
      if (pieces.length > 0) return pieces.join("\n\n").trim()
    } catch (e) {
      console.warn("Failed to Azure-OCR DOCX images:", e)
    }
  }
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

async function parseFileToText(file: File): Promise<{ text: string; debug?: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = getExt(file.name)

  if (ext === "pdf") {
    const dbg: string[] = []
    // Optional: force Azure first
    if (OCR_PROVIDER === "azure" && AZURE_VISION_ENDPOINT && AZURE_VISION_KEY && PDF_FORCE_AZURE_OCR) {
      const forced = await azureReadAnalyze(buffer, "application/pdf")
      dbg.push(`azure_forced_len=${forced?.length || 0}`)
      if (forced && forced.trim().length >= 20) return { text: forced, debug: dbg.join("; ") }
      console.warn("PDF_FORCE_AZURE_OCR was set but Azure returned empty; continuing with parser fallbacks.")
    }

    let textDefault = ""
    let textCustom = ""
    try {
      const pdfParse = (await import("pdf-parse")).default as any
      // Candidate 1: default extraction
      const dataDefault = await pdfParse(buffer)
      textDefault = normalizeExtractedText(String(dataDefault.text || ""))
      dbg.push(`pdfparse_default_len=${textDefault.length}`)

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
      textCustom = normalizeExtractedText(String(dataCustom.text || ""))
      dbg.push(`pdfparse_custom_len=${textCustom.length}`)
    } catch (e) {
      console.error("pdf-parse failed, continuing with PDF.js/Azure/local OCR:", e)
      dbg.push(`pdfparse_exception=${(e as Error)?.message || String(e)}`)
    }

    const best = scoreTextQuality(textCustom) > scoreTextQuality(textDefault) ? textCustom : textDefault
    if (best.trim().length >= MIN_TEXT_CHARS) return { text: best, debug: dbg.join("; ") }

    // Try direct PDF.js text extraction before OCR
    const pdfjsText = await extractPdfTextWithPdfjs(buffer)
    dbg.push(`pdfjs_len=${pdfjsText?.length || 0}`)
    if (pdfjsText && pdfjsText.trim().length >= MIN_TEXT_CHARS) return { text: pdfjsText, debug: dbg.join("; ") }

    // Try Azure OCR (if configured) as a robust fallback
    if (OCR_PROVIDER === "azure" && AZURE_VISION_ENDPOINT && AZURE_VISION_KEY) {
      const t = await azureReadAnalyze(buffer, "application/pdf")
      dbg.push(`azure_fallback_len=${t?.length || 0}`)
      if (t && t.trim().length >= 20) return { text: t, debug: dbg.join("; ") }
      const perPage = await azureOcrPdfPages(buffer)
      dbg.push(`azure_perpage_len=${perPage?.length || 0}`)
      if (perPage && perPage.trim().length >= 20) return { text: perPage, debug: dbg.join("; ") }
    }

    // Finally local OCR (if enabled)
    const ocrText = await ocrPdf(buffer)
    dbg.push(`local_ocr_len=${ocrText?.length || 0}`)
    if (ocrText && ocrText.length > 0) return { text: ocrText, debug: dbg.join("; ") }

    // Nothing worked
    dbg.push(`best_len=${best.length}`)
    return { text: best, debug: dbg.join("; ") }
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default as any
    // First try raw text
    const raw = await mammoth.extractRawText({ buffer })
    const rawText = normalizeExtractedText(String(raw.value || ""))
    const dbg: string[] = []
    dbg.push(`docx_raw_len=${rawText.length}`)
    if (rawText.length >= MIN_TEXT_CHARS) return { text: rawText, debug: dbg.join("; ") }

    // Fallback: HTML -> text
    try {
      const htmlRes = await mammoth.convertToHtml({ buffer })
      const html = String(htmlRes.value || "")
      const textFromHtml = normalizeExtractedText(htmlToText(html))
      dbg.push(`docx_html_len=${textFromHtml.length}`)
      if (textFromHtml.length >= MIN_TEXT_CHARS) return { text: textFromHtml, debug: dbg.join("; ") }
    } catch (e) {
      console.warn("DOCX HTML fallback failed:", e)
      // continue to OCR fallback below
    }

    // Final fallback: OCR embedded images (English only for now)
    const ocrText = await ocrDocxImages(buffer)
    dbg.push(`docx_ocr_len=${ocrText?.length || 0}`)
    if (ocrText && ocrText.length > 0) return { text: ocrText, debug: dbg.join("; ") }
    return { text: rawText, debug: dbg.join("; ") } // whatever we had
  }

  if (ext === "md" || ext === "txt") {
    const txt = normalizeExtractedText(buffer.toString("utf8"))
    return { text: txt, debug: `plain_len=${txt.length}` }
  }

  // Audio transcription via Azure Speech (short audio)
  if (["wav", "mp3", "ogg", "webm", "m4a"].includes(ext)) {
    const ct = getAudioContentTypeByExt(ext) || "audio/wav"
    const transcript = await azureSpeechRecognizeShortAudio(buffer, ct)
    if (transcript && transcript.trim().length > 0) {
      return { text: transcript, debug: `audio_len=${transcript.length}; type=${ct}` }
    }
    throw new Error(
      `Audio transcription failed or not configured. Ensure AZURE_SPEECH_REGION and AZURE_SPEECH_KEY are set and that audio is under the short-audio limits.`,
    )
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
        const { text, debug } = await parseFileToText(file)
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
            `No extractable text found in ${file.name}. If this is a scanned/secured PDF, try converting to .docx or .txt and re-upload. Debug: ${debug || "n/a"}`,
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
