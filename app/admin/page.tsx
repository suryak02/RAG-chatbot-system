"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Database, Download, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react"

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

  const handleIngestDocumentation = async () => {
    setIsIngesting(true)
    setStats(null)

    try {
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ useSampleData: true }),
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

  // Load vector store info on component mount
  useState(() => {
    loadVectorStoreInfo()
  })

  const successRate = stats ? (stats.successfulChunks / stats.totalChunks) * 100 : 0

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8" />
          <div>
            <h1 className="text-3xl font-bold">RAG System Administration</h1>
            <p className="text-muted-foreground">Manage OpenAI documentation ingestion and vector store</p>
          </div>
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
              <Button variant="outline" onClick={loadVectorStoreInfo}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
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
            <p className="text-sm text-muted-foreground">
              Ingest OpenAI documentation into the vector store for RAG queries. This will clear existing data and
              rebuild the knowledge base.
            </p>

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
