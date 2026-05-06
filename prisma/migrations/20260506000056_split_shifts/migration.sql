-- AlterTable
ALTER TABLE "ScheduleShift" ADD COLUMN "endTime2" TEXT;
ALTER TABLE "ScheduleShift" ADD COLUMN "startTime2" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "checkIn2" DATETIME;
ALTER TABLE "TimeEntry" ADD COLUMN "checkOut2" DATETIME;
