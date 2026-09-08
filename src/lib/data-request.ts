import { AsyncLocalStorage } from 'node:async_hooks'
import { cache } from 'react'

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>()
/** Share reads only inside a request. Never keep member/report data across requests. */
export function withDataRequest<T>(run: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), run)
}
export function requestMemo<Args extends unknown[], T>(name: string, fn: (...args: Args) => Promise<T>) {
  const rsc = cache(fn)
  return (...args: Args): Promise<T> => {
    const request = scope.getStore()
    if (!request) return rsc(...args)
    const key = name + JSON.stringify(args)
    if (!request.has(key)) request.set(key, fn(...args))
    return request.get(key) as Promise<T>
  }
}
