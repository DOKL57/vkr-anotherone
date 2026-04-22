import { createApp } from "./app.js";
import { query } from "./db.js";
import { env } from "./env.js";
import { closePool } from "./db.js";

const app = createApp();

async function bootstrap() {
  await query("SELECT 1");

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`API ready on http://${env.HOST}:${env.PORT}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      server.close();
      await closePool();
      process.exit(0);
    });
  }
}

bootstrap().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
