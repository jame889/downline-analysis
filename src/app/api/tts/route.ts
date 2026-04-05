import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function cleanText(text: string): string {
  return text
    .replace(/\[CHART:[^\]]+\]/g, '')
    .replace(/[*_`#>~]/g, '')
    .trim()
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  const clean = cleanText(text ?? '')
  if (!clean) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const tts = new MsEdgeTTS()
  await tts.setMetadata('th-TH-NiwatNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(clean)

  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    audioStream.on('end', resolve)
    audioStream.on('error', reject)
  })
  tts.close()

  const buffer = Buffer.concat(chunks)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    },
  })
}
