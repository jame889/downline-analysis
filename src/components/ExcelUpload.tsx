'use client'
import { useState, useRef, useCallback } from 'react'

interface UploadResult {
  ok: boolean
  filesProcessed?: number
  fileNames?: string[]
  months?: string[]
  output?: string
  warnings?: string
  error?: string
}

export default function ExcelUpload({ onSuccess }: { onSuccess?: (r: UploadResult) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const xlsx = Array.from(newFiles).filter(f => f.name.endsWith('.xlsx'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...xlsx.filter(f => !existing.has(f.name))]
    })
    setResult(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name))

  const upload = async () => {
    if (!files.length) return
    setUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      files.forEach(f => form.append('files', f))
      const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
      const data: UploadResult = await res.json()
      setResult(data)
      if (data.ok) {
        setFiles([])
        onSuccess?.(data)
      }
    } catch (err: any) {
      setResult({ ok: false, error: err.message })
    } finally {
      setUploading(false)
    }
  }

  const fmtSize = (b: number) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
          ${dragging ? 'border-brand-400 bg-brand-900/20' : 'border-slate-600 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50'}`}
      >
        <div className="text-4xl mb-3">📊</div>
        <p className="text-slate-300 font-medium">ลากไฟล์ Excel มาวางที่นี่</p>
        <p className="text-slate-500 text-sm mt-1">หรือ คลิกเพื่อเลือกไฟล์ (.xlsx)</p>
        <p className="text-slate-600 text-xs mt-2">รองรับหลายไฟล์พร้อมกัน</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.name} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-green-400">📄</span>
                <div>
                  <p className="text-sm text-white font-medium">{f.name}</p>
                  <p className="text-xs text-slate-500">{fmtSize(f.size)}</p>
                </div>
              </div>
              <button onClick={() => removeFile(f.name)} className="text-slate-500 hover:text-red-400 text-lg transition-colors">×</button>
            </div>
          ))}
          <button
            onClick={upload}
            disabled={uploading}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors
              ${uploading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-500 text-white'}`}
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⟳</span> กำลังประมวลผล...
              </span>
            ) : `อัพโหลด ${files.length} ไฟล์`}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-4 border ${result.ok ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
          {result.ok ? (
            <>
              <p className="font-semibold text-green-400 flex items-center gap-2">
                <span>✓</span> นำเข้าสำเร็จ! {result.filesProcessed} ไฟล์
              </p>
              <p className="text-xs text-slate-400 mt-1">ไฟล์: {result.fileNames?.join(', ')}</p>
              {result.months && (
                <p className="text-xs text-slate-400 mt-0.5">ข้อมูลเดือน: {result.months.join(', ')}</p>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold text-red-400 flex items-center gap-2"><span>✗</span> เกิดข้อผิดพลาด</p>
              <p className="text-xs text-slate-400 mt-1">{result.error}</p>
            </>
          )}
          {(result.output || result.warnings) && (
            <details className="mt-2">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">ดูรายละเอียด</summary>
              <pre className="text-xs text-slate-500 mt-2 bg-slate-900 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">{result.output}{result.warnings}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
