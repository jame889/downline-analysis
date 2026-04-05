import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ── Storage: Supabase Storage in production, local filesystem in dev ──────────
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\n/g, '') ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\n/g, '') ?? ''
const BUCKET = 'knowledge'
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge')

interface KnowledgeDoc {
  id: string
  filename: string
  title: string
  content: string
  size: number
  uploadedAt: string
}

// ── Supabase Storage helpers ───────────────────────────────────────────────────
function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function sbList(): Promise<KnowledgeDoc[]> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ prefix: '', limit: 200 }),
  })
  if (!res.ok) return []
  const files: { name: string }[] = await res.json()
  const docs: KnowledgeDoc[] = []
  for (const f of files.filter(f => f.name.endsWith('.json'))) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.name}`, {
      headers: sbHeaders(),
    })
    if (r.ok) {
      try { docs.push(await r.json()) } catch { /* skip */ }
    }
  }
  return docs
}

async function sbSave(doc: KnowledgeDoc): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${doc.id}.json`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'x-upsert': 'true' },
    body: JSON.stringify(doc),
  })
}

async function sbDelete(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}.json`, {
    method: 'DELETE',
    headers: sbHeaders(),
  })
}

// ── Local filesystem helpers ───────────────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
}

function fsLoadAll(): KnowledgeDoc[] {
  ensureDir()
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8')) as KnowledgeDoc }
      catch { return null }
    })
    .filter(Boolean) as KnowledgeDoc[]
}

// ── OCR helpers ───────────────────────────────────────────────────────────────
function isMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim()
  return cleaned.length >= 50
}

async function extractWithOCR(buffer: Buffer): Promise<string> {
  const mupdf = await import('mupdf')
  const Tesseract = (await import('tesseract.js')).default
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf')
  const texts: string[] = []
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true)
    const pngBuf = Buffer.from(pixmap.asPNG())
    const result = await Tesseract.recognize(pngBuf, 'tha+eng', { logger: () => {} })
    texts.push(result.data.text.trim())
  }
  return texts.join('\n\n').trim()
}

// ── GET: list docs ─────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const all = USE_SUPABASE ? await sbList() : fsLoadAll()
  const docs = all.map(({ id, filename, title, size, uploadedAt }) => ({
    id, filename, title, size, uploadedAt,
  }))
  return Response.json({ docs })
}

// ── POST: add text or upload PDF ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const contentType = req.headers.get('content-type') ?? ''

    // Text mode
    if (contentType.includes('application/json')) {
      const { title, content } = await req.json()
      if (!content?.trim()) return Response.json({ error: 'ไม่มีเนื้อหา' }, { status: 400 })
      const id = randomUUID()
      const doc: KnowledgeDoc = {
        id,
        filename: 'text',
        title: title?.trim() || 'ข้อความ ' + new Date().toLocaleDateString('th-TH'),
        content: content.trim(),
        size: Buffer.byteLength(content, 'utf-8'),
        uploadedAt: new Date().toISOString(),
      }
      if (USE_SUPABASE) {
        await sbSave(doc)
      } else {
        ensureDir()
        fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${id}.json`), JSON.stringify(doc, null, 2), 'utf-8')
      }
      return Response.json({ ok: true, id, title: doc.title, chars: content.length })
    }

    // PDF mode
    const form = await req.formData()
    const file = form.get('file') as File | null
    const title = (form.get('title') as string | null)?.trim() || ''
    if (!file) return Response.json({ error: 'No file' }, { status: 400 })
    if (!file.name.endsWith('.pdf')) return Response.json({ error: 'PDF only' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'Max 10MB' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse')
    const parsed = await new PDFParse({ data: buffer }).getText()
    let content: string = parsed.text ?? ''
    if (!isMeaningfulText(content)) {
      try { content = await extractWithOCR(buffer) }
      catch (e) { return Response.json({ error: `OCR ล้มเหลว: ${String(e)}` }, { status: 500 }) }
    }
    if (!content.trim()) {
      return Response.json({ error: 'ไม่สามารถแกะข้อความจาก PDF ได้' }, { status: 400 })
    }

    const id = randomUUID()
    const doc: KnowledgeDoc = {
      id,
      filename: file.name,
      title: title || file.name.replace(/\.pdf$/i, ''),
      content: content.trim(),
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }
    if (USE_SUPABASE) {
      await sbSave(doc)
    } else {
      ensureDir()
      fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${id}.json`), JSON.stringify(doc, null, 2), 'utf-8')
    }
    return Response.json({ ok: true, id, title: doc.title, chars: content.length })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE: remove doc ─────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'No id' }, { status: 400 })

  if (USE_SUPABASE) {
    await sbDelete(id)
  } else {
    const fp = path.join(KNOWLEDGE_DIR, `${id}.json`)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  }
  return Response.json({ ok: true })
}
