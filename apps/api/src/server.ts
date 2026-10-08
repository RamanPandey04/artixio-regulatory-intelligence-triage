/** Starts the API with one Prisma client and closes it on shutdown. */
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';

const prisma = new PrismaClient();
const port = Number(process.env.PORT ?? 3101);
const server = createApp(prisma).listen(port, () => {
  console.info(`API listening on http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
