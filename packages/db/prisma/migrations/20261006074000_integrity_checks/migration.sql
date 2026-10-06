-- Keep canonical resolved actions complete. Source claims without a timestamp remain NEEDS_REVIEW.
ALTER TABLE "ActionItem"
  ADD CONSTRAINT "ActionItem_resolution_consistent"
  CHECK (("status" = 'RESOLVED') = ("resolvedAt" IS NOT NULL));

ALTER TABLE "RegulatoryAuthority"
  ADD CONSTRAINT "RegulatoryAuthority_code_nonempty" CHECK (btrim("code") <> ''),
  ADD CONSTRAINT "RegulatoryAuthority_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "ComplianceDirective"
  ADD CONSTRAINT "ComplianceDirective_reference_nonempty" CHECK (btrim("reference") <> ''),
  ADD CONSTRAINT "ComplianceDirective_title_nonempty" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "ComplianceDirective_raw_source_object" CHECK (jsonb_typeof("rawSource") = 'object');

ALTER TABLE "ActionItem"
  ADD CONSTRAINT "ActionItem_title_nonempty" CHECK (btrim("title") <> '');
