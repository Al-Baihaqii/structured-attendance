ALTER TABLE "AttendanceSession" ADD COLUMN "attendanceVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActivityLog" ADD COLUMN "metadata" JSONB;
