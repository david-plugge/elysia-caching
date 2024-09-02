import Elysia from 'elysia';
import { cacheApiPlugin } from './apicache';

new Elysia()
	.use(cacheApiPlugin())
	.get(
		'/',
		() => {
			return {
				hello: 'World',
			};
		},
		{
			cache: true,
		},
	)
	.listen(
		{
			hostname: '0.0.0.0',
			port: 3000,
		},
		(server) => {
			console.log(
				`Server is running at http://${server.hostname}:${server.port}`,
			);
		},
	);
