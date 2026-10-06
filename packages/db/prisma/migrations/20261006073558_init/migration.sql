-- CreateEnum
CREATE TYPE "DirectiveStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "IssueCode" AS ENUM ('MISSING_EFFECTIVE_DATE', 'EFFECTIVE_BEFORE_PUBLICATION', 'CONFLICTING_SOURCE_STATUS', 'MALFORMED_TEXT', 'RESOLVED_WITHOUT_TIMESTAMP', 'OVERDUE_PENDING_ACTION', 'IMPORTANT_ACTION_WITHOUT_DUE_DATE');

-- CreateTable
CREATE TABLE "RegulatoryAuthority" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "jurisdiction" VARCHAR(100) NOT NULL,

    CONSTRAINT "RegulatoryAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDirective" (
    "id" UUID NOT NULL,
    "authorityId" UUID NOT NULL,
    "sourceSystem" VARCHAR(64) NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceStatus" VARCHAR(100) NOT NULL,
    "status" "DirectiveStatus" NOT NULL,
    "priority" "Priority" NOT NULL,
    "publishedAt" DATE NOT NULL,
    "effectiveAt" DATE,
    "rawSource" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDirective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" UUID NOT NULL,
    "directiveId" UUID NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "sourceStatus" VARCHAR(100) NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" DATE,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityIssue" (
    "id" UUID NOT NULL,
    "directiveId" UUID NOT NULL,
    "actionId" UUID,
    "code" "IssueCode" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "field" VARCHAR(100) NOT NULL,
    "rawValue" TEXT,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryAuthority_code_key" ON "RegulatoryAuthority"("code");

-- CreateIndex
CREATE INDEX "ComplianceDirective_authorityId_publishedAt_idx" ON "ComplianceDirective"("authorityId", "publishedAt");

-- CreateIndex
CREATE INDEX "ComplianceDirective_status_priority_idx" ON "ComplianceDirective"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDirective_sourceSystem_sourceId_key" ON "ComplianceDirective"("sourceSystem", "sourceId");

-- CreateIndex
CREATE INDEX "ActionItem_status_dueAt_idx" ON "ActionItem"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActionItem_directiveId_sourceId_key" ON "ActionItem"("directiveId", "sourceId");

-- CreateIndex
CREATE INDEX "DataQualityIssue_directiveId_severity_idx" ON "DataQualityIssue"("directiveId", "severity");

-- CreateIndex
CREATE INDEX "DataQualityIssue_code_idx" ON "DataQualityIssue"("code");

-- AddForeignKey
ALTER TABLE "ComplianceDirective" ADD CONSTRAINT "ComplianceDirective_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "RegulatoryAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_directiveId_fkey" FOREIGN KEY ("directiveId") REFERENCES "ComplianceDirective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_directiveId_fkey" FOREIGN KEY ("directiveId") REFERENCES "ComplianceDirective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
