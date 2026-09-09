import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({rows:new Map<string,Record<string,unknown>>(),unavailable:false,receiptFailure:false}))
vi.mock('../src/lib/supabase',()=>{
  class SupabaseError extends Error { constructor(public status:number,public code:string){super(code)} }
  return {
    SupabaseError, hasSupabase:()=>true,
    sbInsert:async (_table:string,row:Record<string,unknown>)=>{
      if(state.unavailable)throw new Error('unavailable')
      const key=String(row.delivery_key)
      if(state.rows.has(key))throw new SupabaseError(409,'23505')
      state.rows.set(key,{...row})
    },
    sbSelect:async (_table:string,query:string)=>{
      const key=new URLSearchParams(query).get('delivery_key')!.slice(3)
      const row=state.rows.get(key);return row?[row]:[]
    },
    sbPatch:async (_table:string,query:string,changes:Record<string,unknown>)=>{
      if(state.receiptFailure)throw new Error('write unconfirmed')
      const q=new URLSearchParams(query),key=q.get('delivery_key')!.slice(3),row=state.rows.get(key)
      if(!row||row.state!==q.get('state')?.slice(3)||row.attempt_id!==q.get('attempt_id')?.slice(3))return []
      Object.assign(row,changes);return [row]
    },
  }
})
import { sendScheduledTelegram } from '../src/lib/telegram-delivery'
const input={memberId:'fixture-member',chatId:'fixture-chat',token:'fixture-token',type:'activity',sourceVersion:'source-one',message:'Fixture report'}
beforeEach(()=>{state.rows.clear();state.unavailable=false;state.receiptFailure=false})
afterEach(()=>vi.unstubAllGlobals())
describe('durable outbound delivery',()=>{
  it('sends only once when two workers race for the same source',async()=>{
    const send=vi.fn(async()=>new Response('{"ok":true,"result":{"message_id":123}}'))
    vi.stubGlobal('fetch',send)
    const outcomes=await Promise.all([sendScheduledTelegram(input),sendScheduledTelegram(input)])
    expect(send).toHaveBeenCalledTimes(1)
    expect(outcomes.some(x=>x.state==='sent')).toBe(true)
    expect((await sendScheduledTelegram(input)).state).toBe('already_sent')
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not retry ambiguous timeouts',async()=>{
    const send=vi.fn(async()=>{throw new Error('timeout')});vi.stubGlobal('fetch',send)
    expect((await sendScheduledTelegram(input)).state).toBe('unknown')
    expect((await sendScheduledTelegram(input)).state).toBe('unknown')
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not resend after an unconfirmed receipt write',async()=>{
    const send=vi.fn(async()=>new Response('{"ok":true,"result":{"message_id":123}}'));vi.stubGlobal('fetch',send)
    state.receiptFailure=true
    expect((await sendScheduledTelegram(input)).state).toBe('unknown')
    state.receiptFailure=false
    expect((await sendScheduledTelegram(input)).state).toBe('pending')
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('retries explicit provider rejections, never claimed as successful',async()=>{
    const send=vi.fn().mockResolvedValueOnce(new Response('{"ok":false,"error_code":429}',{status:429}))
      .mockResolvedValueOnce(new Response('{"ok":true,"result":{"message_id":123}}'))
    vi.stubGlobal('fetch',send)
    expect((await sendScheduledTelegram(input)).success).toBe(false)
    expect((await sendScheduledTelegram(input)).state).toBe('sent')
  })
  it('does not send when persistence is unavailable',async()=>{
    const send=vi.fn();vi.stubGlobal('fetch',send);state.unavailable=true
    expect((await sendScheduledTelegram(input)).success).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})
