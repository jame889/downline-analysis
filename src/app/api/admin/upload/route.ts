import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)
const DATA_DIR = path.join(process.cwd(), 'data')
const SCRIPT = path.join(process.cwd(), 'scripts', 'import_data.py')
const UPLOAD_DIR = path.join(os.tmpdir(), 'sps-uploads')

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Ensure upload dir exists
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

    // Parse multipart form
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
    }

    // Validate all files are .xlsx
    for (const file of files) {
      if (!file.name.endsWith('.xlsx')) {
        return NextResponse.json({ error: `${file.name} ต้องเป็นไฟล์ .xlsx เท่านั้น` }, { status: 400 })
      }
    }

    // Save files to temp dir
    const savedPaths: string[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const tmpPath = path.join(UPLOAD_DIR, safeName)
      fs.writeFileSync(tmpPath, buffer)
      savedPaths.push(tmpPath)
    }

    // Run Python import script on the upload directory
    const cmd = `python3 "${SCRIPT}" --dir "${UPLOAD_DIR}"`
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      timeout: 120_000 // 2 min timeout
    })

    // Clean up temp files after import
    for (const p of savedPaths) {
      try { fs.unlinkSync(p) } catch {}
    }

    // Get updated months to report back
    const monthsFile = path.join(DATA_DIR, 'months.json')
    const months: string[] = fs.existsSync(monthsFile)
      ? JSON.parse(fs.readFileSync(monthsFile, 'utf-8'))
      : []

    return NextResponse.json({
      ok: true,
      filesProcessed: files.length,
      fileNames: files.map(f => f.name),
      months: months.sort().reverse(),
      output: stdout.slice(0, 2000), // Limit output length
      warnings: stderr ? stderr.slice(0, 500) : null,
    })

  } catch (err: any) {
    return NextResponse.json({
      error: err.message ?? 'เกิดข้อผิดพลาด',
      detail: err.stderr ?? null
    }, { status: 500 })
  }
}
