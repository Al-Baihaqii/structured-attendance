-- Disposable development/UAT data: no backfill of unassigned sessions.
-- Preserve the existing composite assignment/group foreign key and tenure history.
BEGIN;

ALTER TABLE "AttendanceSession" ALTER COLUMN "assignmentId" SET NOT NULL;
DROP TABLE "UserGroup";

COMMIT;
