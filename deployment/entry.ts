/** Deployment-only entry point for the existing Express app. */
import { PrismaClient } from '@prisma/client';
import { createApp } from '../apps/api/src/app';

const prisma = new PrismaClient();

export default createApp(prisma);
