/**
 * Action status workflow. A status change and its audit row commit together;
 * source directive fields are outside this write path.
 */
import type { PrismaClient } from '@prisma/client';
import { ApiError } from './errors';
import type { RequestedActionStatus } from './validation';

// No-op updates leave history alone; real transitions update resolvedAt and audit together.
export async function updateActionStatus(prisma: PrismaClient, id: string, status: RequestedActionStatus) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.actionItem.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Action item not found.');
    if (current.status === status) return current;

    const changedAt = new Date();
    // Match the status we read so a concurrent change cannot silently be overwritten.
    const updated = await tx.actionItem.updateMany({
      where: { id, status: current.status },
      data: { status, resolvedAt: status === 'RESOLVED' ? changedAt : null },
    });
    if (updated.count !== 1) throw new ApiError(409, 'CONFLICT', 'Action status changed; refresh and retry.');

    await tx.actionItemStatusHistory.create({
      data: { actionItemId: id, previousStatus: current.status, newStatus: status, changedAt },
    });
    return tx.actionItem.findUniqueOrThrow({ where: { id } });
  });
}
