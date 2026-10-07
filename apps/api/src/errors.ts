/**
 * Common API error response. Unexpected failures are logged on the server
 * while clients receive a safe, predictable 500 message.
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

// Use for expected service errors such as missing records or conflicting updates.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) { super(message); }
}

// Zod failures are 400; known service errors keep their status; internals stay private.
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: {
      code: 'VALIDATION_ERROR', message: 'Invalid request.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    } });
    return;
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body.' } });
    return;
  }
  console.error('API request failed', error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
};
