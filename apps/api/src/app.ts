import express, { type RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { listDirectives, getDirective } from './directives';
import { updateActionStatus } from './actions';
import { ApiError, errorHandler } from './errors';
import { actionStatusBodySchema, directiveQuerySchema, idSchema } from './validation';

const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

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
