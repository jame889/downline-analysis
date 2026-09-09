import { afterEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { process.env.SUPABASE_URL='https://database.test'; process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key' })
import { sbSelect } from '../src/lib/supabase'
afterEach(() => vi.unstubAllGlobals())
describe('paginated live reads', () => {
  it('reads every row even when the server caps pages below requested limit', async () => {
    const calls: URL[]=[]
    vi.stubGlobal('fetch',vi.fn(async (url: string, options: RequestInit) => {
      const parsed=new URL(url);calls.push(parsed)
      const offset=Number(parsed.searchParams.get('offset'))
      const count=Math.min(400,2475-offset)
      expect(options.cache).toBe('no-store')
      return new Response(JSON.stringify(Array.from({length:count},(_,i)=>({id:offset+i}))),{headers:{'content-range':`${offset}-${offset+count-1}/2475`}})
    }))
    const rows=await sbSelect<{id:number}>('monthly_reports','select=month')
    expect(rows).toHaveLength(2475);expect(rows.at(-1)?.id).toBe(2474)
    expect(calls[0].searchParams.get('order')).toBe('month,member_id')
  })
  it('honors caller limit and offset', async () => {
    vi.stubGlobal('fetch',vi.fn(async (url:string)=>{
      const q=new URL(url).searchParams
      expect(q.get('offset')).toBe('1200');expect(q.get('limit')).toBe('20')
      return new Response(JSON.stringify(Array.from({length:20},(_,id)=>({id}))),{headers:{'content-range':'1200-1219/2475'}})
    }))
    expect(await sbSelect('monthly_reports','limit=20&offset=1200')).toHaveLength(20)
  })
  it('rejects partial reads when a later page fails', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('[{}]',{headers:{'content-range':'0-0/2'}}))
      .mockResolvedValueOnce(new Response('{"code":"unavailable"}',{status:503})))
    await expect(sbSelect('members')).rejects.toThrow('503')
  })
})
