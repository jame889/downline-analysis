import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { process.env.JWT_SECRET = 'local-regression-test-secret-32-characters'; process.env.ROOT_INITIAL_PASSWORD = 'test-root-initial' })
const mocks = vi.hoisted(() => ({ rows: new Map<string,string>(), cookies: new Map<string,string>(), unavailable: false, rejectWrite: false }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => mocks.cookies.has(key) ? {value: mocks.cookies.get(key)} : undefined }) }))
vi.mock('../src/lib/supabase', () => ({
  hasSupabase: () => true,
  sbSelect: async (_table: string, query: string) => {
    if (mocks.unavailable) throw new Error('database unavailable')
    const id = new URLSearchParams(query).get('member_id')!.slice(3)
    return mocks.rows.has(id) ? [{ password: mocks.rows.get(id) }] : []
  },
  sbUpsert: async (table: string, value: {member_id:string,password:string}) => {
    if (mocks.rejectWrite) throw new Error('write rejected')
    if (table === 'passwords') mocks.rows.set(value.member_id,value.password)
    return []
  },
}))
import { checkPassword, createPasswordOverrideValue, passwordOverrideCookieName } from '../src/lib/auth'
import { savePassword, verifyStoredPassword } from '../src/lib/password-store'
beforeEach(() => { mocks.rows.clear(); mocks.cookies.clear(); mocks.unavailable=false; mocks.rejectWrite=false })
describe('durable credentials', () => {
  it('rejects the old password from a second browser after changing the password', async () => {
    await savePassword('900197','changed-password-for-test')
    mocks.cookies.clear()
    expect(mocks.rows.get('900197')).toMatch(/^scrypt\$/)
    expect(mocks.rows.get('900197')).not.toContain('changed-password-for-test')
    await expect(checkPassword('900197','changed-password-for-test')).resolves.toBe(true)
    await expect(checkPassword('900197','900197')).resolves.toBe(false)
  })
  it('does not use the initial password when the database is unavailable', async () => {
    mocks.unavailable=true
    await expect(checkPassword('900197','900197')).rejects.toThrow('unavailable')
  })
  it('does not report persistence success on failed writes', async () => {
    mocks.rejectWrite=true
    await expect(savePassword('900197','test-password')).rejects.toThrow()
  })
  it('upgrades legacy plaintext after successful verification', async () => {
    mocks.rows.set('900197','legacy-password')
    await expect(checkPassword('900197','wrong-password')).resolves.toBe(false)
    expect(mocks.rows.get('900197')).toBe('legacy-password')
    await expect(checkPassword('900197','legacy-password')).resolves.toBe(true)
    expect(mocks.rows.get('900197')).toMatch(/^scrypt\$/)
  })
  it('migrates a legacy browser cookie once, then ignores it in favor of the database', async () => {
    mocks.cookies.set(passwordOverrideCookieName('900197'),createPasswordOverrideValue('900197','legacy-cookie-password'))
    await expect(checkPassword('900197','legacy-cookie-password')).resolves.toBe(true)
    await savePassword('900197','newer-server-password')
    await expect(checkPassword('900197','legacy-cookie-password')).resolves.toBe(false)
  })
  it('preserves a short legacy password during hash migration', async () => {
    mocks.rows.set('900197','old')
    await expect(checkPassword('900197','old')).resolves.toBe(true)
    expect(mocks.rows.get('900197')).toMatch(/^scrypt\$/)
  })
  it('rejects malformed hashes without interpreting attacker supplied cost parameters', async () => {
    await expect(verifyStoredPassword('test-password','scrypt$999999999$8$1$salt$bad')).resolves.toBe(false)
  })
})
