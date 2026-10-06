-- An action-linked quality issue must belong to the action's directive.
CREATE UNIQUE INDEX "ActionItem_id_directiveId_key" ON "ActionItem"("id", "directiveId");

ALTER TABLE "DataQualityIssue" DROP CONSTRAINT "DataQualityIssue_actionId_fkey";

ALTER TABLE "DataQualityIssue"
  ADD CONSTRAINT "DataQualityIssue_actionId_directiveId_fkey"
  FOREIGN KEY ("actionId", "directiveId")
  REFERENCES "ActionItem"("id", "directiveId") ON DELETE CASCADE ON UPDATE CASCADE;
