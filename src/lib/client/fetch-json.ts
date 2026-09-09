export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal, redirect: 'error' })
  if (response.status === 401) throw new RequestError(401, 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง')
  if (!response.ok) throw new RequestError(response.status, 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
  if (!response.headers.get('content-type')?.includes('application/json')) throw new RequestError(502, 'รูปแบบข้อมูลไม่ถูกต้อง กรุณาลองใหม่')
  return response.json() as Promise<T>
}
