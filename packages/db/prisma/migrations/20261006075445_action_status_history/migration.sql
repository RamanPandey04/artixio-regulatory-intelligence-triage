-- CreateTable
CREATE TABLE "ActionItemStatusHistory" (
    "id" UUID NOT NULL,
    "actionItemId" UUID NOT NULL,
    "previousStatus" "ActionStatus" NOT NULL,
    "newStatus" "ActionStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionItemStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionItemStatusHistory_actionItemId_changedAt_idx" ON "ActionItemStatusHistory"("actionItemId", "changedAt");

-- AddForeignKey
ALTER TABLE "ActionItemStatusHistory" ADD CONSTRAINT "ActionItemStatusHistory_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
