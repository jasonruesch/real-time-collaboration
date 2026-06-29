import { env } from '~/env.ts';
import { buildApp } from '~/server.ts';

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
