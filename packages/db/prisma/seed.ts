/**
 * Repeatable fictional feed for local review. It stores both the untouched
 * source payload and the domain's normalized records with quality issues.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { normalizeDirective, type SourceDirective } from '@artixio/domain';

const prisma = new PrismaClient();
const sourceSystem = 'ARTIXIO_SIMULATED_FEED';
// Fix the evaluation date so overdue flags do not change between seed runs.
const simulatedAsOf = new Date('2026-10-06T00:00:00.000Z');

const authorities = [
  { code: 'NMC', name: 'National Medicines Commission', jurisdiction: 'United Kingdom' },
  { code: 'FSA', name: 'Food Safety Agency', jurisdiction: 'European Union' },
  { code: 'EPA', name: 'Environmental Protection Authority', jurisdiction: 'United States' },
  { code: 'DPA', name: 'Data Protection Authority', jurisdiction: 'European Union' },
  { code: 'CMA', name: 'Consumer Markets Authority', jurisdiction: 'United Kingdom' },
  { code: 'MDR', name: 'Medical Devices Regulator', jurisdiction: 'Canada' },
] as const;

const topics = [
  'Adverse event reporting', 'Supplier traceability', 'Product labeling', 'Clinical evidence',
  'Cross-border data transfer', 'Record retention', 'Incident notification', 'Packaging controls',
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): string {
  return isoDate(new Date(date.getTime() + days * 86_400_000));
}

// Generate ordinary records first, then override a few to exercise review cases.
function makeSource(index: number): SourceDirective {
  const authority = authorities[index % authorities.length]!;
  const topic = topics[index % topics.length]!;
  const published = new Date(Date.UTC(2025 + Math.floor(index / 24), index % 12, 4 + (index % 20)));
  const status = index % 11 === 0 ? 'WITHDRAWN' : index % 7 === 0 ? 'SUPERSEDED' : 'ACTIVE';
  const actionStatus = index % 4 === 0 ? 'RESOLVED' : index % 3 === 0 ? 'IN_PROGRESS' : 'PENDING';
  const source: SourceDirective = {
    sourceId: `SIM-${String(index + 1).padStart(3, '0')}`,
    reference: `${authority.code}-${published.getUTCFullYear()}-${String(index + 1).padStart(3, '0')}`,
    title: `${topic}: ${['revised guidance', 'reporting notice', 'consultation update'][index % 3]}`,
    summary: `Simulated ${topic.toLowerCase()} requirements for regulated organizations. Review applicability and document the response.`,
    sourceStatus: status,
    priority: index % 9 === 0 ? 'CRITICAL' : index % 3 === 0 ? 'HIGH' : index % 3 === 1 ? 'MEDIUM' : 'LOW',
    publishedAt: isoDate(published),
    effectiveAt: addDays(published, 45),
    actions: [{
      sourceId: 'ACT-1',
      title: `Assess applicability of ${topic.toLowerCase()}`,
      sourceStatus: actionStatus,
      dueAt: actionStatus === 'RESOLVED' ? addDays(published, 30) : '2027-12-31',
      resolvedAt: actionStatus === 'RESOLVED' ? `${addDays(published, 20)}T12:00:00.000Z` : null,
      important: index % 5 === 0,
    }],
  };

  // Directive-level gaps, contradictions, and malformed text remain in rawSource.
  if (index === 2) source.effectiveAt = null;
  if (index === 7) source.effectiveAt = addDays(published, -5);
  if (index === 12) source.sourceStatus = 'ACTIVE / WITHDRAWN';
  if (index === 17) {
    source.title = 'Supplier\u0007  traceability   update';
    source.summary = 'Simulated\t\ttraceability  requirements\nfor  review.';
  }
  // Action anomalies test resolution evidence, overdue work, and missing deadlines.
  if (index === 22) {
    source.actions[0]!.sourceStatus = 'RESOLVED';
    source.actions[0]!.resolvedAt = null;
  }
  if (index === 27) {
    source.actions[0]!.sourceStatus = 'PENDING';
    source.actions[0]!.dueAt = '2024-12-31';
  }
  if (index === 32) {
    source.actions[0]!.important = true;
    source.actions[0]!.dueAt = null;
  }

  return source;
}

// Rebuild only this feed in one transaction, leaving unrelated directives alone.
async function main(): Promise<void> {
  const sources = Array.from({ length: 48 }, (_, index) => makeSource(index));

  await prisma.$transaction(async (tx) => {
    const authorityIds = new Map<string, string>();
    for (const authority of authorities) {
      const row = await tx.regulatoryAuthority.upsert({
        where: { code: authority.code },
        update: { name: authority.name, jurisdiction: authority.jurisdiction },
        create: authority,
      });
      authorityIds.set(authority.code, row.id);
    }

    // Deleting the old feed also resets its action edits and history on reseed.
    await tx.complianceDirective.deleteMany({ where: { sourceSystem } });

    for (const [index, source] of sources.entries()) {
      const normalized = normalizeDirective(source, simulatedAsOf);
      const authorityCode = authorities[index % authorities.length]!.code;
      const directive = await tx.complianceDirective.create({
        data: {
          authorityId: authorityIds.get(authorityCode)!,
          sourceSystem,
          sourceId: normalized.sourceId,
          reference: normalized.reference,
          title: normalized.title,
          summary: normalized.summary,
          sourceStatus: normalized.sourceStatus,
          status: normalized.status,
          priority: normalized.priority,
          publishedAt: normalized.publishedAt,
          effectiveAt: normalized.effectiveAt,
          // Never serialize the normalized object as the source evidence.
          rawSource: source as unknown as Prisma.InputJsonValue,
        },
      });

      const actionIds = new Map<string, string>();
      for (const action of normalized.actions) {
        const row = await tx.actionItem.create({
          data: {
            directiveId: directive.id,
            sourceId: action.sourceId,
            title: action.title,
            sourceStatus: action.sourceStatus,
            status: action.status,
            dueAt: action.dueAt,
            resolvedAt: action.resolvedAt,
            important: action.important,
          },
        });
        actionIds.set(action.sourceId, row.id);
      }

      for (const issue of normalized.issues) {
        const actionId = issue.sourceActionId ? (actionIds.get(issue.sourceActionId) ?? null) : null;
        if (issue.sourceActionId && !actionId) {
          throw new Error(`Issue refers to missing action ${issue.sourceActionId}`);
        }
        await tx.dataQualityIssue.create({
          data: {
            directiveId: directive.id,
            actionId,
            code: issue.code,
            severity: issue.severity,
            field: issue.field,
            rawValue: issue.rawValue,
            explanation: issue.explanation,
          },
        });
      }
    }
  }, { timeout: 30_000 });

  console.info(`Seeded ${sources.length} simulated directives across ${authorities.length} authorities.`);
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
