-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('ONCE', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('CUSTOM', 'INTERVAL');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('HOURS', 'DAYS', 'WEEKS', 'MONTHS');

-- CreateEnum
CREATE TYPE "EventState" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reminderText" TEXT NOT NULL,
    "photoFileId" TEXT,
    "kind" "EventKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "state" "EventState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCustomDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "EventCustomDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCustomTime" (
    "id" TEXT NOT NULL,
    "customDateId" TEXT NOT NULL,
    "time" TEXT NOT NULL,

    CONSTRAINT "EventCustomTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIntervalSchedule" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "unit" "IntervalUnit" NOT NULL,
    "every" INTEGER NOT NULL,
    "time" TEXT,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,

    CONSTRAINT "EventIntervalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "firesAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "Event_userId_idx" ON "Event"("userId");

-- CreateIndex
CREATE INDEX "EventCustomDate_eventId_idx" ON "EventCustomDate"("eventId");

-- CreateIndex
CREATE INDEX "EventCustomTime_customDateId_idx" ON "EventCustomTime"("customDateId");

-- CreateIndex
CREATE UNIQUE INDEX "EventIntervalSchedule_eventId_key" ON "EventIntervalSchedule"("eventId");

-- CreateIndex
CREATE INDEX "Reminder_eventId_status_idx" ON "Reminder"("eventId", "status");

-- CreateIndex
CREATE INDEX "Reminder_firesAt_idx" ON "Reminder"("firesAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCustomDate" ADD CONSTRAINT "EventCustomDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCustomTime" ADD CONSTRAINT "EventCustomTime_customDateId_fkey" FOREIGN KEY ("customDateId") REFERENCES "EventCustomDate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntervalSchedule" ADD CONSTRAINT "EventIntervalSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
