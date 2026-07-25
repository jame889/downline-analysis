import fs from 'fs'
import path from 'path'
import type { MbtiType } from './mbti'
import { hasSupabase, sbDelete, sbSelect, sbUpsert } from './supabase'

const LOCAL_PATH = path.join(process.cwd(), 'data', 'member-mbti.json')

type MbtiOverrides = Record<string, MbtiType>

function readLocal(): MbtiOverrides {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as MbtiOverrides
  } catch {
    return {}
  }
}

export async function loadMemberMbtiOverrides(): Promise<MbtiOverrides> {
  if (!hasSupabase()) return readLocal()
  const rows = await sbSelect<{ member_id: string; mbti: MbtiType }>('member_mbti', 'select=member_id,mbti')
  return Object.fromEntries(rows.map((row) => [row.member_id, row.mbti]))
}

export async function saveMemberMbti(memberId: string, mbti: MbtiType | null): Promise<void> {
  if (!hasSupabase()) {
    const values = readLocal()
    if (mbti) values[memberId] = mbti
    else delete values[memberId]
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(values, null, 2), 'utf-8')
    return
  }

  if (mbti) {
    await sbUpsert('member_mbti', {
      member_id: memberId,
      mbti,
      updated_at: new Date().toISOString(),
    })
  } else {
    await sbDelete('member_mbti', `member_id=eq.${encodeURIComponent(memberId)}`)
  }
}
