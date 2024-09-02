import { Redis } from 'ioredis';

const REDIS_HOST = Bun.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(Bun.env.REDIS_PORT ?? '6379');

export const redis = new Redis({
	host: REDIS_HOST,
	port: REDIS_PORT,
});
