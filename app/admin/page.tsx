"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Database, Download, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react"
import Link from "next/link"

interface IngestionStats {
  totalPages: number
  totalChunks: number
  successfulChunks: number
  failedChunks: number
  startTime: string
  endTime?: string
  errors: string[]
}

export default function AdminPage() {
  const [isIngesting, setIsIngesting] = useState(false)
  const [stats, setStats] = useState<IngestionStats | null>(null)
  const [vectorStoreInfo, setVectorStoreInfo] = useState<{ count: number } | null>(null)
  const [source, setSource] = useState<"openai-sample" | "openai-live" | "universal">("openai-sample")
  const [clearOnIngest, setClearOnIngest] = useState(true)
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

  const handleIngestDocumentation = async () => {
    setIsIngesting(true)
    setStats(null)

    try {
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source,
          clear: clearOnIngest,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ingestion failed: ${response.statusText}`)
      }

      const result = await response.json()
      setStats(result.stats)
      await loadVectorStoreInfo()
    } catch (error) {
      console.error("Ingestion error:", error)
      alert(`Ingestion failed: ${error}`)
    } finally {
      setIsIngesting(false)
    }
  }

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

  const successRate = stats ? (stats.successfulChunks / stats.totalChunks) * 100 : 0

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8" />
            <div>
              <h1 className="text-3xl font-bold">RAG System Administration</h1>
              <p className="text-muted-foreground">Manage documentation ingestion and the vector store</p>
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

        {/* Ingestion Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Documentation Ingestion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Ingest sample/live docs into the vector store (optional).</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Dataset</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as typeof source)}
                  className="w-full border rounded-md px-3 py-2 bg-background"
                >
                  <option value="openai-sample">OpenAI Sample</option>
                  <option value="openai-live">OpenAI Live</option>
                  <option value="universal">Universal Placeholder</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={clearOnIngest}
                    onChange={(e) => setClearOnIngest(e.target.checked)}
                  />
                  Clear existing knowledge base
                </label>
              </div>
            </div>

            <Button onClick={handleIngestDocumentation} disabled={isIngesting} className="w-full">
              {isIngesting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Ingesting Documentation...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Start Ingestion
                </>
              )}
            </Button>

            {isIngesting && (
              <Alert>
                <Clock className="w-4 h-4" />
                <AlertDescription>
                  Ingestion in progress... This may take several minutes depending on the amount of documentation.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Ingestion Results */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {stats.errors.length === 0 ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                Ingestion Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.totalPages}</p>
                  <p className="text-sm text-muted-foreground">Pages Processed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Total Chunks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{stats.successfulChunks}</p>
                  <p className="text-sm text-muted-foreground">Successful</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{stats.failedChunks}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Success Rate</span>
                  <span>{successRate.toFixed(1)}%</span>
                </div>
                <Progress value={successRate} className="h-2" />
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Started: {new Date(stats.startTime).toLocaleString()}</span>
                {stats.endTime && <span>Completed: {new Date(stats.endTime).toLocaleString()}</span>}
              </div>

              {stats.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-red-600">Errors ({stats.errors.length})</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {stats.errors.map((error, index) => (
                      <Alert key={index} variant="destructive">
                        <AlertDescription className="text-xs">{error}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
