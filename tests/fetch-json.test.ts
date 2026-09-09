import { afterEach, expect, it, vi } from 'vitest'
import { fetchJson } from '../src/lib/client/fetch-json'
afterEach(()=>vi.unstubAllGlobals())
it('surfaces expired sessions instead of parsing login HTML', async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401})))
  await expect(fetchJson('/api/my')).rejects.toMatchObject({status:401})
})
it('rejects invalid content and failed requests', async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>Login</html>',{headers:{'content-type':'text/html'}})))
  await expect(fetchJson('/api/my')).rejects.toMatchObject({status:502})
})
