import crypto from 'crypto'

const SERVER_CONTEXT = 'jarvis-downline-server-v1'
const JARVIS_CLIENT_IDENTITY_URL = process.env.JARVIS_DOWNLINE_CLIENT_IDENTITY_URL?.trim()
  || 'https://mac-mini.tailac7560.ts.net/jarvis-downline/api/jarvis/downline/client-identity'

let clientIdentityCache: { at: number; keyId: string; publicKey: string } | undefined

function serverPrivateKey() {
  const root = process.env.JWT_SECRET?.trim()
  if (!root) throw new Error('JWT_SECRET is required for Jarvis Downline signing')
  const seed = crypto.createHmac('sha256', root).update(SERVER_CONTEXT).digest()
  const ecdh = crypto.createECDH('secp256k1')
  ecdh.setPrivateKey(seed)
  const pub = ecdh.getPublicKey(undefined, 'uncompressed')
  const b64 = (value: Buffer) => value.toString('base64url')
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'secp256k1', x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)), d: b64(seed) },
    format: 'jwk',
  })
}

export function downlineServerIdentity() {
  const publicKey = crypto.createPublicKey(serverPrivateKey()).export({ format: 'pem', type: 'spki' }).toString()
  return {
    algorithm: 'ECDSA-secp256k1-SHA256',
    keyId: crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 24),
    publicKey,
  }
}

export function signDownlineServerBody(body: string): string {
  return crypto.sign('sha256', Buffer.from(body), serverPrivateKey()).toString('base64url')
}

export async function verifyJarvisClientRequest(request: Request): Promise<boolean> {
  const timestamp = request.headers.get('x-jarvis-client-timestamp')?.trim() || ''
  const signature = request.headers.get('x-jarvis-client-signature')?.trim() || ''
  if (!timestamp || !signature) return false
  const at = Date.parse(timestamp)
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > 5 * 60_000) return false
  const identity = await jarvisClientIdentity()
  if (!identity) return false
  const pathname = new URL(request.url).pathname
  const message = `${request.method.toUpperCase()}\n${pathname}\n${timestamp}`
  try {
    return crypto.verify(null, Buffer.from(message), crypto.createPublicKey(identity.publicKey), Buffer.from(signature, 'base64url'))
  } catch {
    return false
  }
}

async function jarvisClientIdentity() {
  if (clientIdentityCache && Date.now() - clientIdentityCache.at < 10 * 60_000) return clientIdentityCache
  try {
    const response = await fetch(JARVIS_CLIENT_IDENTITY_URL, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return undefined
    const data = await response.json() as { keyId?: string; publicKey?: string; algorithm?: string }
    if (!data.keyId || !data.publicKey || data.algorithm !== 'Ed25519') return undefined
    clientIdentityCache = { at: Date.now(), keyId: data.keyId, publicKey: data.publicKey }
    return clientIdentityCache
  } catch {
    return undefined
  }
}
