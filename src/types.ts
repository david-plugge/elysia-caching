export interface CachedResponse {
	status: number
	headers: Record<string, string>
	data: unknown
	timestamp: number
}

export interface CacheAdapter {
	get(key: string): Promise<{ duration: number; response: CachedResponse }>
	set(key: string, value: CachedResponse, duration: number): Promise<void>
}
