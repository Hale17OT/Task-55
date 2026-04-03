import { buildApp } from './app';
import { parseConfig } from './infrastructure/config';

async function main() {
  const config = parseConfig();
  const app = await buildApp({ config });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${(err as Error).message}\n`);
  process.exit(1);
});
