import type { CacheAdapter } from '../types'

interface RedisInterface {
	hset(key: string, object: object): Promise<number>
	hgetall(key: string): Promise<Record<string, string>>
	expire(key: string, seconds: number | string): Promise<number>
}

export function redisAdapter(redis: RedisInterface): CacheAdapter {
	return {
		async set(key, response, duration) {
			await redis.hset(key, {
				response: JSON.stringify(response),
				duration,
			})
			await redis.expire(key, duration)
		},
		async get(key) {
			const data = await redis.hgetall(key)

			return {
				duration: parseInt(data.duration),
				response: JSON.parse(data.response),
			}
		},
	}
}
