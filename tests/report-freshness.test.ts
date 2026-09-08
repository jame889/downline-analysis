import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../src/lib/business-report-sync', () => ({ loadBusinessReportSyncStatus: vi.fn(), loadLatestBusinessReportSnapshot: vi.fn(), loadBusinessReportSnapshot: vi.fn() }))
import * as store from '../src/lib/business-report-sync'
import { getFreshReport } from '../src/lib/report-freshness'
import { assertTelegramWeeklyFreshness } from '../src/lib/telegram-weekly-summary'

const date = new Date('2026-09-08T02:15:37.928Z')
const status = { ok: true, supabaseSynced: true, month: '2026-09', checksum: 'abc', rows: 1, members: 1, syncedAt: '2026-09-08T01:15:37.928Z', telegramNotified: true }
const snapshot = { month: '2026-09', checksum: 'abc', syncedAt: '2026-09-08T01:15:37.928+00:00', reports: [{member_id:'test',month:'2026-09'}], members: {test:{id:'test'}} }
beforeEach(() => {
  vi.mocked(store.loadBusinessReportSyncStatus).mockResolvedValue(status)
  vi.mocked(store.loadLatestBusinessReportSnapshot).mockResolvedValue(snapshot as never)
  vi.mocked(store.loadBusinessReportSnapshot).mockResolvedValue(snapshot as never)
})
describe('report freshness', () => {
  it('accepts Z and +00:00 for the same instant', async () => {
    await expect(getFreshReport(date)).resolves.toHaveProperty('snapshot')
    await expect(assertTelegramWeeklyFreshness(date)).resolves.toHaveProperty('month','2026-09')
  })
  it('blocks incomplete table sync', async () => {
    vi.mocked(store.loadBusinessReportSyncStatus).mockResolvedValue({...status,supabaseSynced:false})
    await expect(getFreshReport(date)).rejects.toThrow('incomplete')
  })
  it('blocks mismatched checksum and invalid timestamps', async () => {
    vi.mocked(store.loadBusinessReportSyncStatus).mockResolvedValue({...status,checksum:'wrong'})
    await expect(getFreshReport(date)).rejects.toThrow()
    vi.mocked(store.loadBusinessReportSyncStatus).mockResolvedValue({...status,syncedAt:'invalid'})
    await expect(assertTelegramWeeklyFreshness(date)).rejects.toThrow()
  })
  it('blocks stale and future data', async () => {
    await expect(getFreshReport(new Date('2026-09-09T02:00:00Z'))).rejects.toThrow('stale')
    await expect(getFreshReport(new Date('2026-09-07T02:00:00Z'))).rejects.toThrow('stale')
  })
  it('ignores Excel packaging checksum changes in the delivery key', async () => {
    const before = await getFreshReport(date)
    vi.mocked(store.loadBusinessReportSyncStatus).mockResolvedValue({...status,checksum:'new'})
    vi.mocked(store.loadLatestBusinessReportSnapshot).mockResolvedValue({...snapshot,checksum:'new'} as never)
    expect((await getFreshReport(date)).sourceVersion).toBe(before.sourceVersion)
  })
})
