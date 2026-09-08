import { expect, it, vi } from 'vitest'
import { requestMemo, withDataRequest } from '../src/lib/data-request'
it('deduplicates reads within a request without sharing stale results between requests', async () => {
  const read=vi.fn(async (id:string)=>({id,version:read.mock.calls.length}))
  const cached=requestMemo('test',read)
  const first=await withDataRequest(()=>Promise.all([cached('one'),cached('one')]))
  expect(read).toHaveBeenCalledTimes(1);expect(first[0]).toBe(first[1])
  const second=await withDataRequest(()=>cached('one'))
  expect(read).toHaveBeenCalledTimes(2);expect(second.version).toBe(2)
})
