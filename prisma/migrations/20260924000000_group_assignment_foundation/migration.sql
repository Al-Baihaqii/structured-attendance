-- Additive foundation only: existing sessions remain unassigned.
CREATE TABLE "GroupAssignment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "musyrifId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GroupAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupAssignment_valid_dates_check"
        CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);

ALTER TABLE "AttendanceSession" ADD COLUMN "assignmentId" TEXT;

CREATE UNIQUE INDEX "GroupAssignment_id_groupId_key" ON "GroupAssignment"("id", "groupId");
CREATE INDEX "GroupAssignment_musyrifId_endedAt_idx" ON "GroupAssignment"("musyrifId", "endedAt");
CREATE INDEX "GroupAssignment_groupId_startedAt_idx" ON "GroupAssignment"("groupId", "startedAt");
-- Kept in SQL: nullable composite uniqueness would not enforce this invariant.
CREATE UNIQUE INDEX "GroupAssignment_one_active_per_group_key"
    ON "GroupAssignment"("groupId") WHERE "endedAt" IS NULL;
CREATE INDEX "AttendanceSession_assignmentId_date_idx" ON "AttendanceSession"("assignmentId", "date");

ALTER TABLE "GroupAssignment" ADD CONSTRAINT "GroupAssignment_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupAssignment" ADD CONSTRAINT "GroupAssignment_musyrifId_fkey"
    FOREIGN KEY ("musyrifId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_assignmentId_groupId_fkey"
    FOREIGN KEY ("assignmentId", "groupId") REFERENCES "GroupAssignment"("id", "groupId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
