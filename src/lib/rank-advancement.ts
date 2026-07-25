import { RANKS, type RankInfo } from './compensation'

export interface RankAdvancementRule {
  rank: string
  label: string
  bvEachSide: number
  activeFaEachSide: number
  placementRank: string | null
  placementLabel: string
  oneTimeReward: string
}

const CR_AMBASSADOR: RankAdvancementRule = {
  rank: 'CR_AMBASSADOR',
  label: 'Cr. Ambassador',
  bvEachSide: 2_000_000,
  activeFaEachSide: 4_000,
  placementRank: 'RED_DIAMOND',
  placementLabel: 'Red Diamond',
  oneTimeReward: 'Bentley',
}

function fromRank(rank: RankInfo): RankAdvancementRule {
  const placement = rank.placementRank
    ? RANKS.find((item) => item.rank === rank.placementRank)
    : null
  return {
    rank: rank.rank,
    label: rank.rankTH,
    bvEachSide: rank.minorBVRequired,
    activeFaEachSide: rank.activeFARequired,
    placementRank: rank.placementRank ?? null,
    placementLabel: placement?.rankTH ?? 'Active FA',
    oneTimeReward: `${rank.oneTimeBonus.toLocaleString('en-US')} บาท`,
  }
}

export const RANK_ADVANCEMENT_RULES: RankAdvancementRule[] = [
  ...RANKS.filter((rank) => rank.rank !== 'FA').map(fromRank),
  CR_AMBASSADOR,
]

const RANK_ALIASES: Array<[string, string[]]> = [
  ['CR_AMBASSADOR', ['cr. ambassador', 'cr ambassador', 'ซีอาร์ แอมบาสเดอร์', 'แอมบาสเดอร์']],
  ['CROWN_ROYAL', ['crown royal', 'คราวน์ รอยัล', 'คราวน์รอยัล']],
  ['BLUE_DIAMOND', ['blue diamond', 'บลู ไดมอนด์', 'บลูไดมอนด์']],
  ['RED_DIAMOND', ['red diamond', 'เรด ไดมอนด์', 'เรดไดมอนด์']],
  ['PLATINUM', ['platinum', 'แพลทินัม', 'แพลตินัม']],
  ['DIAMOND', ['diamond', 'ไดมอนด์']],
  ['SILVER', ['silver', 'ซิลเวอร์']],
  ['BRONZE', ['bronze', 'บรอนซ์']],
  ['CROWN', ['crown', 'คราวน์']],
  ['GOLD', ['gold', 'โกลด์']],
  ['RUBY', ['ruby', 'รูบี้', 'ทับทิม']],
  ['STAR', ['star', 'สตาร์']],
]

function formatRule(rule: RankAdvancementRule): string {
  const placement = rule.placementRank
    ? `มีผู้นำระดับ ${rule.placementLabel} อย่างน้อย 1 คนฝั่งซ้าย และ 1 คนฝั่งขวา โดยเป็นสายเลือด Sponsor ได้ทุกชั้น G1, G2, G3... และใช้ Placement/Upline ระบุฝั่ง`
    : `มี Active FA ${rule.activeFaEachSide.toLocaleString('en-US')} คนต่อฝั่ง`
  const activeCount = rule.placementRank
    ? ` · Active FA ${rule.activeFaEachSide.toLocaleString('en-US')} คนต่อฝั่ง`
    : ''
  return `${rule.label}: ${rule.bvEachSide.toLocaleString('en-US')} BV ซ้าย / ${rule.bvEachSide.toLocaleString('en-US')} BV ขวา · ${placement}${activeCount} · รางวัลครั้งเดียว ${rule.oneTimeReward}`
}

export function buildRankAdvancementKnowledge(): string {
  return [
    '=== เกณฑ์ Rank Advancement Bonus อย่างเป็นทางการ ===',
    ...RANK_ADVANCEMENT_RULES.map(formatRule),
    'ตั้งแต่ Platinum ขึ้นไป ผู้นำ Qualified ไม่จำเป็นต้องเป็นผู้ได้รับการ Sponsor ตรงชั้น G1 สามารถใช้หลาน เหลน หรือผู้สืบสาย Sponsor ชั้น G2, G3, G4, G5... ได้โดยไม่จำกัดความลึก',
    'การตรวจต้องใช้ต้นไม้สองแบบร่วมกัน: Sponsor Tree ใช้ยืนยันว่าผู้นำเป็นสายเลือดของสมาชิก และ Placement/Upline Tree ใช้ระบุว่าผู้นำนั้นอยู่ฝั่งซ้ายหรือฝั่งขวา',
    'ผู้นำหนึ่งคนให้นับตาม Placement ได้เพียงฝั่งเดียว และต้องมีตำแหน่งอย่างน้อยตามระดับที่กำหนดในเดือนที่ตรวจ',
    'ผู้รับโบนัสต้องรักษาสถานะ Active และ Qualified โดยจ่ายวันที่ 15 ของเดือนถัดไปหลังขึ้นตำแหน่ง',
    'หมายเหตุจากเอกสาร: Blue Diamond ถึง Crown ระบุโครงสร้าง 3 ขา และ Crown Royal ระบุ 5 ขา แต่ห้ามใช้หมายเหตุนี้ตัดสิน Qualification อัตโนมัติจนกว่าจะมีนิยามขาอย่างเป็นทางการ',
  ].join('\n')
}

export function rankAdvancementReply(question: string): string | null {
  const normalized = question.toLowerCase().replace(/\s+/g, ' ').trim()
  const asksCriteria = /เงื่อนไข|เกณฑ์|ต้องมี|ต้องใช้|ต้องทำ|ขึ้นตำแหน่ง|ขึ้นเป็น|โบนัส.*ตำแหน่ง|rank advancement/i.test(normalized)
  if (!asksCriteria) return null

  const matchedCode = RANK_ALIASES.find(([, aliases]) =>
    aliases.some((alias) => normalized.includes(alias))
  )?.[0]
  const asksAll = /ทุกตำแหน่ง|แต่ละตำแหน่ง|ทั้งหมด|ตารางตำแหน่ง/i.test(normalized)
  if (!matchedCode && !asksAll) return null

  const rules = matchedCode
    ? RANK_ADVANCEMENT_RULES.filter((rule) => rule.rank === matchedCode)
    : RANK_ADVANCEMENT_RULES
  return [
    matchedCode ? `เงื่อนไขขึ้น ${rules[0].label}` : 'เงื่อนไขขึ้นตำแหน่งแต่ละระดับ',
    ...rules.map(formatRule),
    '',
    'สำคัญ: ผู้นำ Qualified เป็นสายเลือด Sponsor ได้ทุกชั้น G1, G2, G3... ไม่จำเป็นต้องเป็นลูก Sponsor ตรง',
    'Sponsor Tree ใช้ยืนยันสายเลือด ส่วน Placement/Upline Tree ใช้ตัดสินว่าผู้นำนับฝั่งซ้ายหรือขวา',
    'โบนัสจ่ายวันที่ 15 ของเดือนถัดไป และผู้รับต้องรักษาสถานะ Active และ Qualified',
  ].join('\n')
}
