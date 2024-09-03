import Elysia, { StatusMap } from 'elysia'
import type { CacheAdapter } from './types'

export interface ApiCacheOptions {
	adapter: CacheAdapter
	statusCodes?: {
		include?: number[]
		exclude?: number[]
	}
	headers?: {
		include?: string[]
		exclude?: string[]
	}
	defaultDuration?: number
}

export class ApiCache {
	#options: ApiCacheOptions

	constructor(options: ApiCacheOptions) {
		this.#options = options
	}

	shouldCacheResponse(status: number) {
		if (this.#options.statusCodes?.exclude?.includes(status) === true) {
			return false
		}
		if (this.#options.statusCodes?.include?.includes(status) === false) {
			return false
		}
		return true
	}

	getCacheKey(request: Request) {
		const { pathname, search } = new URL(request.url)
		return pathname + search
	}

	async getCachedResponse(key: string) {
		try {
			return await this.#options.adapter.get(key)
		} catch {
			return null
		}
	}

	async cacheResponse(
		key: string,
		duration: number,

		status: number,
		headers: Record<string, string>,
		data: unknown,
	) {
		try {
			await this.#options.adapter.set(
				key,
				{
					data,
					headers,
					status,
					timestamp: Date.now(),
				},
				duration,
			)
			console.log(key + ' cached!')
		} catch {
			console.log(key + ' could not be cached!')
		}
	}
}

export function cacheApiPlugin(options: ApiCacheOptions) {
	const apicache = new ApiCache(options)

	return new Elysia()
		.derive(() => {
			return {
				cache: {
					enabed: true,
				},
			}
		})
		.macro(({ onBeforeHandle, onAfterHandle }) => {
			return {
				cache: (options: {} | true) => {
					onBeforeHandle(async (ctx) => {
						if (ctx.request.headers.get('cache-control') == 'no-cache') {
							return
						}

						const key = apicache.getCacheKey(ctx.request)
						const res = await apicache.getCachedResponse(key)

						if (res) {
							ctx.store = { ...ctx.store, __cached: true }
							console.log('Sending cached response for ' + key)

							const cachedEtag = res.response.headers['etag']
							const requestEtag = res.response.headers['if-none-match']
							if (requestEtag && cachedEtag === requestEtag) {
								return new Response(null, { status: 304 })
							}

							ctx.set.status = res.response.status
							ctx.set.headers = res.response.headers

							const maxAge = Math.max(
								0,
								Math.floor(
									res.duration - (Date.now() - res.response.timestamp) / 1000,
								),
							)
							ctx.set.headers['cache-control'] = `max-age=${maxAge}`

							return res.response.data
						} else {
							ctx.set.headers['cache-control'] =
								'no-cache, no-store, must-revalidate'
						}
					})

					onAfterHandle(({ request, set, response }) => {
						const key = apicache.getCacheKey(request)

						const status =
							typeof set.status === 'string'
								? StatusMap[set.status]
								: (set.status ?? 200)

						if (!apicache.shouldCacheResponse(status)) {
							set.headers['cache-control'] =
								'no-cache, no-store, must-revalidate'
							return
						}

						set.headers['cache-control'] = `max-age=${60}`

						// check if newly generated
						apicache.cacheResponse(key, 60, status, set.headers, response)
					})
				},
			}
		})
}
