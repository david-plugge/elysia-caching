import Elysia, { StatusMap } from 'elysia';
import { redis } from './redis';

export interface ApiCacheOptions {
	statusCodes?: {
		include?: number[];
		exclude?: number[];
	};
	headers?: {
		include?: string[];
		exclude?: string[];
	};
	defaultDuration?: number;
}

interface CachedResponse {
	status: number;
	headers: Record<string, string>;
	data: unknown;
	timestamp: number;
}

interface CacheApi {
	get(key: string): Promise<{ duration: number; response: CachedResponse }>;
	set(key: string, value: CachedResponse, duration: number): Promise<void>;
}

const redisCache: CacheApi = {
	async set(key, response, duration) {
		await redis.hset(key, {
			response: JSON.stringify(response),
			duration,
		});
		await redis.expire(key, duration);
	},
	async get(key) {
		const data = await redis.hgetall(key);

		return {
			duration: parseInt(data.duration),
			response: JSON.parse(data.response),
		};
	},
};

export class ApiCache {
	#options: ApiCacheOptions;

	constructor(options: ApiCacheOptions = {}) {
		this.#options = options;
	}

	shouldCacheResponse(status: number) {
		if (this.#options.statusCodes?.exclude?.includes(status) === true) {
			return false;
		}
		if (this.#options.statusCodes?.include?.includes(status) === false) {
			return false;
		}
		return true;
	}

	getCacheKey(request: Request) {
		const { pathname, search } = new URL(request.url);
		return pathname + search;
	}

	async getCachedResponse(key: string) {
		try {
			return await redisCache.get(key);
		} catch {
			return null;
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
			await redisCache.set(
				key,
				{
					data,
					headers,
					status,
					timestamp: Date.now(),
				},
				duration,
			);
			console.log(key + ' cached!');
		} catch {
			console.log(key + ' could not be cached!');
		}
	}
}

export function cacheApiPlugin() {
	const apicache = new ApiCache();

	return new Elysia()
		.derive(() => {
			return {
				cache: {
					enabed: true,
				},
			};
		})
		.macro(({ onBeforeHandle, onAfterHandle }) => {
			return {
				cache: (options: {} | true) => {
					onBeforeHandle(async (ctx) => {
						if (
							ctx.request.headers.get('cache-control') ==
							'no-cache'
						) {
							return;
						}

						const key = apicache.getCacheKey(ctx.request);
						const res = await apicache.getCachedResponse(key);

						if (res) {
							ctx.store = { ...ctx.store, __cached: true };
							console.log('Sending cached response for ' + key);

							const cachedEtag = res.response.headers['etag'];
							const requestEtag =
								res.response.headers['if-none-match'];
							if (requestEtag && cachedEtag === requestEtag) {
								return new Response(null, { status: 304 });
							}

							ctx.set.status = res.response.status;
							ctx.set.headers = res.response.headers;

							const maxAge = Math.max(
								0,
								Math.floor(
									res.duration -
										(Date.now() - res.response.timestamp) /
											1000,
								),
							);
							ctx.set.headers[
								'cache-control'
							] = `max-age=${maxAge}`;

							return res.response.data;
						} else {
							ctx.set.headers['cache-control'] =
								'no-cache, no-store, must-revalidate';
						}
					});

					onAfterHandle(({ request, set, response }) => {
						const key = apicache.getCacheKey(request);

						const status =
							typeof set.status === 'string'
								? StatusMap[set.status]
								: set.status ?? 200;

						if (!apicache.shouldCacheResponse(status)) {
							set.headers['cache-control'] =
								'no-cache, no-store, must-revalidate';
							return;
						}

						set.headers['cache-control'] = `max-age=${60}`;

						// check if newly generated
						apicache.cacheResponse(
							key,
							60,
							status,
							set.headers,
							response,
						);
					});
				},
			};
		});
}
