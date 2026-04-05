import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge')

function ensureDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
}

interface KnowledgeDoc {
  id: string
  filename: string
  title: string
  content: string
  size: number
  uploadedAt: string
}

function loadAll(): KnowledgeDoc[] {
  ensureDir()
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8')) as KnowledgeDoc
      } catch {
        return null
      }
    })
    .filter(Boolean) as KnowledgeDoc[]
}

// GET: list docs
export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const docs = loadAll().map(({ id, filename, title, size, uploadedAt }) => ({
    id, filename, title, size, uploadedAt,
  }))
  return Response.json({ docs })
}

// POST: upload PDF
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const title = (form.get('title') as string | null)?.trim() || ''

    if (!file) return Response.json({ error: 'No file' }, { status: 400 })
    if (!file.name.endsWith('.pdf')) return Response.json({ error: 'PDF only' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'Max 10MB' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const parsed = await pdfParse(buffer)
    const content: string = parsed.text ?? ''

    if (!content.trim()) {
      return Response.json({ error: 'ไม่สามารถแกะข้อความจาก PDF ได้ (PDF อาจเป็นรูปภาพ)' }, { status: 400 })
    }

    ensureDir()
    const id = randomUUID()
    const doc: KnowledgeDoc = {
      id,
      filename: file.name,
      title: title || file.name.replace(/\.pdf$/i, ''),
      content: content.trim(),
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }

    fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${id}.json`), JSON.stringify(doc, null, 2), 'utf-8')

    return Response.json({ ok: true, id, title: doc.title, chars: content.length })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE: remove doc by id
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'No id' }, { status: 400 })

  const filePath = path.join(KNOWLEDGE_DIR, `${id}.json`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

  return Response.json({ ok: true })
}
