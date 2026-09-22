type AiRole = 'system' | 'user' | 'assistant'

export type AiMessage = {
  role: AiRole
  content: string
}

export type CoachAiProvider = 'groq' | 'openrouter' | 'cloudflare'

export type CoachAiResult = {
  content: string
  provider: CoachAiProvider
  model: string
}

export type ProviderHealth = {
  provider: CoachAiProvider
  model: string
  configured: boolean
  online: boolean
}

const cleanEnv = (value: string | undefined) => value?.replace(/\\n|\n/g, '').replace(/^"|"$/g, '').trim() ?? ''
const TIMEOUT_MS = Number(cleanEnv(process.env.AI_TIMEOUT_MS)) || 22_000
const MAX_TOKENS = Number(cleanEnv(process.env.AI_MAX_TOKENS)) || 900
const HEALTH_TIMEOUT_MS = 5_000
const HEALTH_MAX_TOKENS = 8
const HEALTH_CACHE_MS = 5 * 60_000

type ProviderConfig = {
  provider: CoachAiProvider
  model: string
  apiKey: string
  accountId?: string
}

function providerConfigs(): ProviderConfig[] {
  const configs: ProviderConfig[] = []
  const groqKey = cleanEnv(process.env.GROQ_API_KEY)
  const openRouterKey = cleanEnv(process.env.OPENROUTER_API_KEY)
  const cloudflareToken = cleanEnv(process.env.CLOUDFLARE_AI_TOKEN)
  const cloudflareAccountId = cleanEnv(process.env.CLOUDFLARE_ACCOUNT_ID)

  if (groqKey) {
    configs.push({
      provider: 'groq',
      model: cleanEnv(process.env.GROQ_MODEL) || 'qwen/qwen3.8-27b',
      apiKey: groqKey,
    })
  }
  if (openRouterKey) {
    configs.push({
      provider: 'openrouter',
      model: cleanEnv(process.env.OPENROUTER_MODEL) || 'openrouter/free',
      apiKey: openRouterKey,
    })
  }
  if (cloudflareToken && cloudflareAccountId) {
    configs.push({
      provider: 'cloudflare',
      model: cleanEnv(process.env.CLOUDFLARE_AI_MODEL) || '@cf/qwen/qwen3-30b-a3b-fp8',
      apiKey: cloudflareToken,
      accountId: cloudflareAccountId,
    })
  }
  return configs
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timeout)
  }
}

function readOpenAiContent(data: unknown): string {
  const result = data as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
  }
  const content = result.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('').trim()
  return ''
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  messages: AiMessage[],
  maxTokens = MAX_TOKENS,
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  const isGroq = config.provider === 'groq'
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
    temperature: 0.3,
    max_tokens: maxTokens,
  }
  if (isGroq && /^qwen\/qwen3\.(?:6|8)-27b$/.test(config.model)) {
    body.reasoning_effort = 'none'
  }
  if (!isGroq) {
    body.provider = {
      data_collection: 'deny',
      allow_fallbacks: true,
    }
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(isGroq ? {} : {
        'HTTP-Referer': 'https://downline-analyzer.vercel.app',
        'X-Title': 'First Community Coach JOE',
      }),
    },
    body: JSON.stringify(body),
  }, timeoutMs)
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`${config.provider} ${response.status}: ${detail}`)
  }
  const content = readOpenAiContent(await response.json())
  if (!content) throw new Error(`${config.provider} returned an empty response`)
  return content
}

async function callCloudflare(
  config: ProviderConfig,
  messages: AiMessage[],
  maxTokens = MAX_TOKENS,
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.3 }),
  }, timeoutMs)
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`cloudflare ${response.status}: ${detail}`)
  }
  const data = await response.json() as {
    result?: { response?: string; choices?: Array<{ message?: { content?: string } }> }
  }
  const content = data.result?.response ?? data.result?.choices?.[0]?.message?.content ?? ''
  if (!content.trim()) throw new Error('cloudflare returned an empty response')
  return content.trim()
}

export async function generateCoachReply(messages: AiMessage[]): Promise<CoachAiResult> {
  const configs = providerConfigs()
  if (!configs.length) throw new Error('No cloud AI provider is configured')

  const failures: string[] = []
  for (const config of configs) {
    try {
      const content = config.provider === 'cloudflare'
        ? await callCloudflare(config, messages)
        : await callOpenAiCompatible(config, messages)
      return { content, provider: config.provider, model: config.model }
    } catch (error) {
      const failure = errorMessage(error)
      failures.push(failure)
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'coach_ai_provider_failed',
        provider: config.provider,
        model: config.model,
        error: failure,
      }))
    }
  }
  throw new Error(failures.join(' | '))
}

async function checkProvider(config: ProviderConfig): Promise<ProviderHealth> {
  try {
    const messages: AiMessage[] = [{ role: 'user', content: 'Reply OK.' }]
    if (config.provider === 'cloudflare') {
      await callCloudflare(config, messages, HEALTH_MAX_TOKENS, HEALTH_TIMEOUT_MS)
    } else {
      await callOpenAiCompatible(config, messages, HEALTH_MAX_TOKENS, HEALTH_TIMEOUT_MS)
    }
    return { provider: config.provider, model: config.model, configured: true, online: true }
  } catch (error) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'coach_ai_healthcheck_failed',
      provider: config.provider,
      model: config.model,
      error: errorMessage(error),
    }))
    return { provider: config.provider, model: config.model, configured: true, online: false }
  }
}

let healthCache: { expiresAt: number; value: ProviderHealth[] } | null = null

export async function getCoachAiHealth(): Promise<ProviderHealth[]> {
  if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.value

  const configs = providerConfigs()
  const checked = await Promise.all(configs.map(checkProvider))
  const allProviders: CoachAiProvider[] = ['groq', 'openrouter', 'cloudflare']
  const value = allProviders.map((provider) => checked.find((item) => item.provider === provider) ?? {
    provider,
    model: '',
    configured: false,
    online: false,
  })
  healthCache = { expiresAt: Date.now() + HEALTH_CACHE_MS, value }
  return value
}
