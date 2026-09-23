import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  process.env = { ...originalEnv }
  delete process.env.GROQ_MODEL
  delete process.env.OPENROUTER_MODEL
  delete process.env.CLOUDFLARE_ACCOUNT_ID
  delete process.env.CLOUDFLARE_AI_TOKEN
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...originalEnv }
})

describe('Coach AI provider routing', () => {
  it('uses the supported Qwen 3.8 model by default', async () => {
    process.env.GROQ_API_KEY = 'fixture-groq-key'
    delete process.env.OPENROUTER_API_KEY
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'พร้อมครับ' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', request)

    const { generateCoachReply } = await import('../src/lib/coach-ai')
    const result = await generateCoachReply([{ role: 'user', content: 'ทดสอบ' }])

    expect(result).toMatchObject({ provider: 'groq', model: 'qwen/qwen3.8-27b' })
    const init = request.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'qwen/qwen3.8-27b',
      reasoning_effort: 'none',
    })
  })

  it('falls through to OpenRouter when Groq generation fails', async () => {
    process.env.GROQ_API_KEY = 'fixture-groq-key'
    process.env.OPENROUTER_API_KEY = 'fixture-openrouter-key'
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response())
      .mockResolvedValueOnce(new Response('{"error":"model unavailable"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'ตอบจาก OpenRouter' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', request)

    const { generateCoachReply } = await import('../src/lib/coach-ai')
    const result = await generateCoachReply([{ role: 'user', content: 'ทดสอบ fallback' }])

    expect(result).toMatchObject({ provider: 'openrouter', model: 'qwen/qwen3.8-27b' })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('checks real completions and caches the health result', async () => {
    process.env.GROQ_API_KEY = 'fixture-groq-key'
    process.env.OPENROUTER_API_KEY = 'fixture-openrouter-key'
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response())
      .mockResolvedValueOnce(new Response('{"error":"model unavailable"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', request)

    const { getCoachAiHealth } = await import('../src/lib/coach-ai')
    const first = await getCoachAiHealth()
    const second = await getCoachAiHealth()

    expect(first).toEqual([
      { provider: 'groq', model: 'qwen/qwen3.8-27b', configured: true, online: false },
      { provider: 'openrouter', model: 'qwen/qwen3.8-27b', configured: true, online: true },
      { provider: 'cloudflare', model: '', configured: false, online: false },
    ])
    expect(second).toEqual(first)
    expect(request).toHaveBeenCalledTimes(2)
    for (const call of request.mock.calls) {
      const body = JSON.parse(String((call[1] as RequestInit).body))
      expect(body.max_tokens).toBe(32)
      expect(body.reasoning_effort).toBe('none')
    }
  })
})
