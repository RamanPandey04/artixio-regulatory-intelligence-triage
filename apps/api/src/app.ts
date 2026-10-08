/**
 * HTTP boundary for the triage API. Routes validate external input before
 * passing it to the query and status-update functions.
 */
import express, { type RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { listDirectives, getDirective } from './directives.js';
import { updateActionStatus } from './actions.js';
import { ApiError, errorHandler } from './errors.js';
import { actionStatusBodySchema, directiveQuerySchema, idSchema } from './validation.js';

// Express 4 needs rejected async route promises forwarded to its error handler.
const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

// Injecting Prisma keeps the HTTP layer testable against an isolated schema.
export function createApp(prisma: PrismaClient) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', asyncRoute(async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'ok' });
    } catch {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' } });
    }
  }));

  app.get('/api/directives', asyncRoute(async (request, response) => {
    const query = directiveQuerySchema.parse(request.query);
    response.json(await listDirectives(prisma, query));
  }));

  app.get('/api/directives/:id', asyncRoute(async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const directive = await getDirective(prisma, id);
    // A valid UUID with no record is missing; malformed UUIDs fail Zod with 400.
    if (!directive) throw new ApiError(404, 'NOT_FOUND', 'Directive not found.');
    response.json({ data: directive });
  }));

  app.patch('/api/action-items/:id/status', asyncRoute(async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const { status } = actionStatusBodySchema.parse(request.body);
    response.json({ data: await updateActionStatus(prisma, id, status) });
  }));

  app.use(errorHandler);
  return app;
}
