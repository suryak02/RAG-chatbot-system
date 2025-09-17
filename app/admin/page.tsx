"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Database, Download, RefreshCw, Clock } from "lucide-react"
import Link from "next/link"


export default function AdminPage() {
  const [vectorStoreInfo, setVectorStoreInfo] = useState<{ count: number } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [justRefreshed, setJustRefreshed] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [clearNamespaceOnUpload, setClearNamespaceOnUpload] = useState(false)
  const [manualTitle, setManualTitle] = useState("")
  const [manualText, setManualText] = useState("")
  const [isEmbeddingText, setIsEmbeddingText] = useState(false)
  const [clearOnTextUpload, setClearOnTextUpload] = useState(false)
  const [uploadResult, setUploadResult] = useState<
    | null
    | {
        filesProcessed: number
        totalChunks: number
        successfulChunks: number
        failedChunks: number
        errors: string[]
        extractionPreviews?: Array<{ file: string; preview: string }>
      }
  >(null)
  const [uploadError, setUploadError] = useState<string | null>(null)


  const loadVectorStoreInfo = async () => {
    try {
      const response = await fetch("/api/admin/vector-store")
      if (response.ok) {
        const info = await response.json()
        setVectorStoreInfo(info)
      }
    } catch (error) {
      console.error("Failed to load vector store info:", error)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setJustRefreshed(true)
    await loadVectorStoreInfo()
    setTimeout(() => setJustRefreshed(false), 600)
    setIsRefreshing(false)
  }

  const handleUpload = async () => {
    try {
      setUploadError(null)
      setUploadResult(null)
      if (!uploadFiles || uploadFiles.length === 0) {
        setUploadError("Please choose one or more files to upload.")
        return
      }

      // Client-side limits (confirmed): 50MB per file, 100MB per batch
      const BYTES_PER_MB = 1024 * 1024
      const MAX_FILE = 50 * BYTES_PER_MB
      const MAX_BATCH = 100 * BYTES_PER_MB
      let batchBytes = 0
      for (const f of Array.from(uploadFiles)) {
        if (f.size > MAX_FILE) {
          setUploadError(`File ${f.name} exceeds 50MB limit.`)
          return
        }
        batchBytes += f.size
      }
      if (batchBytes > MAX_BATCH) {
        setUploadError("Total selected files exceed 100MB batch limit.")
        return
      }

      const formData = new FormData()
      formData.append("clearNamespace", String(!!clearNamespaceOnUpload))
      for (const f of Array.from(uploadFiles)) {
        formData.append("files", f)
      }

      setIsUploading(true)
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Upload failed: ${response.statusText}`)
      }

      setUploadResult({
        filesProcessed: result.filesProcessed,
        totalChunks: result.totalChunks,
        successfulChunks: result.successfulChunks,
        failedChunks: result.failedChunks,
        errors: result.errors || [],
        extractionPreviews: result.extractionPreviews || [],
      })
      await loadVectorStoreInfo()
    } catch (err) {
      setUploadError(String(err))
    } finally {
      setIsUploading(false)
    }
  }

  const handleEmbedText = async () => {
    try {
      setUploadError(null)
      setUploadResult(null)
      const text = manualText.trim()
      if (text.length < 5) {
        setUploadError("Please enter some text to embed (at least a few characters).")
        return
      }

      const filename = `${(manualTitle || "manual").replace(/[^a-z0-9-_]/gi, "-")}-${Date.now()}.txt`
      const blob = new Blob([text], { type: "text/plain" })

      const formData = new FormData()
      formData.append("clearNamespace", String(!!clearOnTextUpload))
      formData.append("files", blob, filename)

      setIsEmbeddingText(true)
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Embed text failed: ${response.statusText}`)
      }

      setUploadResult({
        filesProcessed: result.filesProcessed,
        totalChunks: result.totalChunks,
        successfulChunks: result.successfulChunks,
        failedChunks: result.failedChunks,
        errors: result.errors || [],
        extractionPreviews: result.extractionPreviews || [],
      })
      await loadVectorStoreInfo()
    } catch (err) {
      setUploadError(String(err))
    } finally {
      setIsEmbeddingText(false)
    }
  }

  // Load vector store info on component mount
  useEffect(() => {
    loadVectorStoreInfo()
  }, [])

  // Documentation Ingestion UI removed; keeping upload + quick add text flows only

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8" />
            <div>
              <h1 className="text-3xl font-bold">RAG System Administration</h1>
              <p className="text-muted-foreground">Manage uploads and the vector store</p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to Chat</Link>
          </Button>
        </div>

        <Separator />

        {/* Vector Store Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Vector Store Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Documents in vector store</p>
                <p className="text-2xl font-bold">{vectorStoreInfo?.count ?? "Loading..."}</p>
              </div>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={justRefreshed ? "bg-blue-500 text-white" : undefined}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Add Text (bypasses PDF/DOCX parsing) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Quick Add Text (Paste content and embed)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste or type content directly. This bypasses PDF/DOCX parsing and helps verify end-to-end embedding.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Optional Title</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="E.g. AI Agent Guide"
                  className="w-full border rounded-md px-3 py-2 bg-background"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={clearOnTextUpload}
                    onChange={(e) => setClearOnTextUpload(e.target.checked)}
                  />
                  Clear existing knowledge base before embedding
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Text</label>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={8}
                placeholder="Paste your content here..."
                className="w-full border rounded-md px-3 py-2 bg-background font-mono text-sm"
              />
            </div>

            <Button onClick={handleEmbedText} disabled={isEmbeddingText || manualText.trim().length === 0} className="w-full">
              {isEmbeddingText ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Embedding Text...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Embed Text
                </>
              )}
            </Button>

            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{uploadError}</AlertDescription>
              </Alert>
            )}

            {uploadResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{uploadResult.filesProcessed}</p>
                  <p className="text-sm text-muted-foreground">Files Processed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{uploadResult.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Total Chunks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{uploadResult.successfulChunks}</p>
                  <p className="text-sm text-muted-foreground">Successful</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{uploadResult.failedChunks}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
            )}

            {uploadResult?.extractionPreviews && uploadResult.extractionPreviews.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Extraction preview</h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {uploadResult.extractionPreviews.map((p, idx) => (
                    <div key={idx} className="border rounded-md p-2 bg-muted/50">
                      <div className="text-xs font-medium mb-1">{p.file}</div>
                      <pre className="text-xs whitespace-pre-wrap font-mono">{p.preview}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult?.errors && uploadResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Warnings/Errors ({uploadResult.errors.length})</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {uploadResult.errors.map((err, idx) => (
                    <Alert key={idx} variant="destructive">
                      <AlertDescription className="text-xs">{err}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Knowledge Base */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Upload Knowledge Base (PDF / DOCX / MD / TXT)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload your private documentation to build a tenant-specific knowledge base.
              Accepted types: .pdf, .docx, .md, .txt. Limits: 50MB per file, 100MB per upload.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Files</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.md,.txt"
                  onChange={(e) => setUploadFiles(e.target.files)}
                  className="w-full border rounded-md px-3 py-2 bg-background"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={clearNamespaceOnUpload}
                    onChange={(e) => setClearNamespaceOnUpload(e.target.checked)}
                  />
                  Clear existing knowledge base before upload
                </label>
              </div>
            </div>

            <Button onClick={handleUpload} disabled={isUploading || !uploadFiles} className="w-full">
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Uploading & Processing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Start Upload
                </>
              )}
            </Button>

            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{uploadError}</AlertDescription>
              </Alert>
            )}

            {isUploading && (
              <Alert>
                <Clock className="w-4 h-4" />
                <AlertDescription>Uploading and embedding documents. This may take a moment.</AlertDescription>
              </Alert>
            )}

            {uploadResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{uploadResult.filesProcessed}</p>
                  <p className="text-sm text-muted-foreground">Files Processed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{uploadResult.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Total Chunks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{uploadResult.successfulChunks}</p>
                  <p className="text-sm text-muted-foreground">Successful</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{uploadResult.failedChunks}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
            )}

            {uploadResult?.errors && uploadResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Upload Warnings/Errors ({uploadResult.errors.length})</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {uploadResult.errors.map((err, idx) => (
                    <Alert key={idx} variant="destructive">
                      <AlertDescription className="text-xs">{err}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentation Ingestion removed as requested */}
      </div>
    </div>
  )
}
