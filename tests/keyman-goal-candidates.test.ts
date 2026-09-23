import { describe, expect, it } from 'vitest'
import {
  formatKeymanGoalQueryReply,
  getKeymanGoalCandidates,
  parseKeymanGoalQuery,
  type KeymanGoalSource,
} from '../src/lib/keyman-goal-candidates'

function member(
  id: string,
  weakBv: number,
  side: string = 'ซ้าย',
  position: string = 'FA',
): KeymanGoalSource {
  return {
    id,
    name: `Member ${id}`,
    side,
    position,
    highestPosition: position,
    isActive: true,
    leftBv: weakBv,
    rightBv: weakBv + 500,
  }
}

describe('Keyman goal query engine', () => {
  it('uses the same Star gap rule as Telegram and returns all matching people', () => {
    const keymen = [
      member('900617', 904),
      member('900926', 843),
      member('900909', 700, 'ขวา'),
      member('900297', 666),
      member('900196', 635, 'ขวา'),
      member('900608', 529, 'ขวา'),
      member('900701', 500),
      member('900702', 480),
      member('900703', 460),
      member('900704', 440),
      member('900705', 420),
      member('900706', 401),
      member('900799', 400), // gap exactly 600 -> excluded by strict <
    ]

    const candidates = getKeymanGoalCandidates(keymen, 'ST', 600)
    expect(candidates).toHaveLength(12)
    expect(candidates[0]).toMatchObject({ keyman: { id: '900617' }, weakBv: 904, gap: 96 })
    expect(candidates.at(-1)?.gap).toBe(599)

    const reply = formatKeymanGoalQueryReply(
      'ขอรายชื่อ Star gap<600 bv ทั้งหมด 12 คน',
      keymen,
      '2026-09',
    )
    expect(reply).toContain('Star · Gap < 600 BV (12 คน)')
    expect(reply).toContain('1. Member 900617 (900617)')
    expect(reply).toContain('12. Member 900706 (900706)')
    expect(reply).not.toContain('และอีก')
  })

  it('keeps next-target semantics so FA members are not Bronze candidates', () => {
    const keymen = [
      member('900001', 1900, 'ซ้าย', 'FA'),
      member('900002', 1900, 'ซ้าย', 'ST'),
    ]
    const bronze = getKeymanGoalCandidates(keymen, 'BR', 1200)
    expect(bronze.map((item) => item.keyman.id)).toEqual(['900002'])
  })

  it('parses explicit Star gap queries', () => {
    expect(parseKeymanGoalQuery('ขอรายชื่อ Star gap<600 bv ทั้งหมด 12 คน')).toEqual({
      targetCode: 'ST',
      gapLimit: 600,
    })
  })
})
