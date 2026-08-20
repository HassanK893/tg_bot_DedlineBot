import prisma from "../../lib/prisma.js";
import dbFunctionWrapper from "../../utils/dbFunctionWrapper.js";
import { datePartToUtcDate } from "../../utils/datePart.js";
import type { CompleteEventDraft } from "../../types/event.js";
import { toPrismaIntervalUnit, toPrismaKind, toPrismaScheduleType } from "./event.mappers.js";

/** Модель event — единственное место, где модуль трогает Postgres напрямую. */

export const eventWithRelations = {
  customDates: { include: { times: true } },
  intervalSchedule: true,
} as const;

export const eventWithRelationsAndUser = {
  ...eventWithRelations,
  user: true,
} as const;

/** Общий для create/replaceSchedule фрагмент nested-create дат/интервала. */
function buildScheduleCreateData(draft: CompleteEventDraft) {
  return {
    ...(draft.scheduleType === "custom" && draft.customDates
      ? {
          customDates: {
            create: draft.customDates.map((entry) => ({
              date: datePartToUtcDate(entry.date),
              times: { create: entry.times.map((time) => ({ time })) },
            })),
          },
        }
      : {}),
    ...(draft.scheduleType === "interval" && draft.intervalSchedule
      ? {
          intervalSchedule: {
            create: {
              unit: toPrismaIntervalUnit(draft.intervalSchedule.unit),
              every: draft.intervalSchedule.every,
              ...(draft.intervalSchedule.time ? { time: draft.intervalSchedule.time } : {}),
              ...(draft.intervalSchedule.weekday !== undefined
                ? { weekday: draft.intervalSchedule.weekday }
                : {}),
              ...(draft.intervalSchedule.dayOfMonth !== undefined
                ? { dayOfMonth: draft.intervalSchedule.dayOfMonth }
                : {}),
            },
          },
        }
      : {}),
  };
}

export const createEvent = dbFunctionWrapper((userId: string, draft: CompleteEventDraft) =>
  prisma.event.create({
    data: {
      userId,
      name: draft.name,
      description: draft.description,
      reminderText: draft.reminderText,
      ...(draft.photoFileId ? { photoFileId: draft.photoFileId } : {}),
      kind: toPrismaKind(draft.kind),
      startDate: datePartToUtcDate(draft.startDate),
      endDate: datePartToUtcDate(draft.endDate),
      scheduleType: toPrismaScheduleType(draft.scheduleType),
      ...buildScheduleCreateData(draft),
    },
    include: eventWithRelations,
  }),
);

export const findByIdForUser = dbFunctionWrapper((eventId: string, userId: string) =>
  prisma.event.findFirst({ where: { id: eventId, userId }, include: eventWithRelations }),
);

export const listByUser = dbFunctionWrapper((userId: string) =>
  prisma.event.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
    include: eventWithRelations,
  }),
);

export const setState = dbFunctionWrapper((eventId: string, state: "ACTIVE" | "PAUSED") =>
  prisma.event.update({ where: { id: eventId }, data: { state } }),
);

export const deleteEvent = dbFunctionWrapper((eventId: string) => prisma.event.delete({ where: { id: eventId } }));

export const updateScalarFields = dbFunctionWrapper(
  (eventId: string, data: { name?: string; description?: string; reminderText?: string; photoFileId?: string }) =>
    prisma.event.update({ where: { id: eventId }, data, include: eventWithRelations }),
);

export const setDoneThisCycle = dbFunctionWrapper((eventId: string, value: boolean) =>
  prisma.event.update({ where: { id: eventId }, data: { doneThisCycle: value }, include: eventWithRelations }),
);

/**
 * Ежемесячные активные события, у которых в текущем цикле не осталось ни
 * одного PENDING-напоминания (либо всё уже отправлено, либо снято через
 * Done) — кандидаты на перенос дат на следующий месяц. См. event.rollover.ts.
 */
export const findMonthlyEventsWithNoPendingReminders = dbFunctionWrapper(() =>
  prisma.event.findMany({
    where: {
      kind: "MONTHLY",
      state: "ACTIVE",
      reminders: { none: { status: "PENDING" } },
    },
    include: eventWithRelationsAndUser,
  }),
);

/** Полная замена диапазона дат и расписания — старые customDates/intervalSchedule удаляются, пишутся новые. */
export const replaceSchedule = dbFunctionWrapper((eventId: string, draft: CompleteEventDraft) =>
  prisma.$transaction(async (tx) => {
    await tx.eventCustomDate.deleteMany({ where: { eventId } });
    await tx.eventIntervalSchedule.deleteMany({ where: { eventId } });
    return tx.event.update({
      where: { id: eventId },
      data: {
        kind: toPrismaKind(draft.kind),
        startDate: datePartToUtcDate(draft.startDate),
        endDate: datePartToUtcDate(draft.endDate),
        scheduleType: toPrismaScheduleType(draft.scheduleType),
        // любая правка расписания/дат обнуляет статус «пропущено до след. месяца» — он неактуален после изменения
        doneThisCycle: false,
        ...buildScheduleCreateData(draft),
      },
      include: eventWithRelations,
    });
  }),
);
