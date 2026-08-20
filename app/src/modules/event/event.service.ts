import type { Prisma } from "../../generated/prisma/client.js";
import { NotFound } from "../../middleware/generalMiddleware/errorMessage.js";
import { shiftMonthClamped, utcDateToDatePart } from "../../utils/datePart.js";
import { computeOccurrences } from "../../utils/occurrences.js";
import type { CompleteEventDraft } from "../../types/event.js";
import * as eventModel from "./event.model.js";
import { fromPrismaIntervalUnit, fromPrismaKind, fromPrismaScheduleType } from "./event.mappers.js";
import * as reminderService from "../reminder/reminder.service.js";

type EventWithRelations = Prisma.EventGetPayload<{ include: typeof eventModel.eventWithRelations }>;
type EventWithRelationsAndUser = Prisma.EventGetPayload<{ include: typeof eventModel.eventWithRelationsAndUser }>;

/** Обратное превращение сохранённого события в форму визарда — нужно для «Редактировать» и для «Возобновить». */
export function toDraftShape(event: EventWithRelations): CompleteEventDraft {
  const intervalSchedule = event.intervalSchedule;

  return {
    name: event.name,
    description: event.description,
    reminderText: event.reminderText,
    ...(event.photoFileId ? { photoFileId: event.photoFileId } : {}),
    kind: fromPrismaKind(event.kind),
    startDate: utcDateToDatePart(event.startDate),
    endDate: utcDateToDatePart(event.endDate),
    scheduleType: fromPrismaScheduleType(event.scheduleType),
    ...(event.scheduleType === "CUSTOM"
      ? {
          customDates: event.customDates.map((cd) => ({
            date: utcDateToDatePart(cd.date),
            times: cd.times.map((t) => t.time),
          })),
        }
      : {}),
    ...(intervalSchedule
      ? {
          intervalSchedule: {
            unit: fromPrismaIntervalUnit(intervalSchedule.unit),
            every: intervalSchedule.every,
            ...(intervalSchedule.time ? { time: intervalSchedule.time } : {}),
            ...(intervalSchedule.weekday !== null ? { weekday: intervalSchedule.weekday } : {}),
            ...(intervalSchedule.dayOfMonth !== null ? { dayOfMonth: intervalSchedule.dayOfMonth } : {}),
          },
        }
      : {}),
  };
}

/** Считает моменты отправки из драфта и планирует только будущие (SENT в прошлом не дублируются). */
async function scheduleFromDraft(eventId: string, draft: CompleteEventDraft, timezone: string): Promise<number> {
  const occurrences = computeOccurrences({
    startDate: draft.startDate,
    endDate: draft.endDate,
    scheduleType: draft.scheduleType,
    ...(draft.customDates ? { customDates: draft.customDates } : {}),
    ...(draft.intervalSchedule ? { intervalSchedule: draft.intervalSchedule } : {}),
    timezone,
  });
  const now = Date.now();
  const future = occurrences.filter((d) => d.getTime() > now);
  return reminderService.scheduleForEvent(eventId, future);
}

export async function createEvent(
  userId: string,
  draft: CompleteEventDraft,
  timezone: string,
): Promise<{ event: EventWithRelations; scheduledCount: number }> {
  const event = await eventModel.createEvent(userId, draft);
  const scheduledCount = await scheduleFromDraft(event.id, draft, timezone);
  return { event, scheduledCount };
}

export async function listByUser(userId: string): Promise<EventWithRelations[]> {
  return eventModel.listByUser(userId);
}

export async function getForUser(eventId: string, userId: string): Promise<EventWithRelations> {
  const event = await eventModel.findByIdForUser(eventId, userId);
  if (!event) throw new NotFound("Событие не найдено");
  return event;
}

export async function pauseEvent(eventId: string, userId: string): Promise<void> {
  await getForUser(eventId, userId);
  await reminderService.cancelPendingForEvent(eventId);
  await eventModel.setState(eventId, "PAUSED");
}

export async function resumeEvent(eventId: string, userId: string, timezone: string): Promise<void> {
  const event = await getForUser(eventId, userId);
  await eventModel.setState(eventId, "ACTIVE");
  await scheduleFromDraft(eventId, toDraftShape(event), timezone);
}

export async function deleteEvent(eventId: string, userId: string): Promise<void> {
  await getForUser(eventId, userId);
  await reminderService.cancelPendingForEvent(eventId);
  await eventModel.deleteEvent(eventId);
}

export async function updateScalarFields(
  eventId: string,
  userId: string,
  data: { name?: string; description?: string; reminderText?: string; photoFileId?: string },
): Promise<EventWithRelations> {
  await getForUser(eventId, userId);
  return eventModel.updateScalarFields(eventId, data);
}

/** Правки, влияющие на расписание (даты, свои даты, интервал) — полный пересчёт напоминаний. */
export async function updateSchedule(
  eventId: string,
  userId: string,
  draft: CompleteEventDraft,
  timezone: string,
): Promise<EventWithRelations> {
  await getForUser(eventId, userId);
  await reminderService.cancelPendingForEvent(eventId);
  const event = await eventModel.replaceSchedule(eventId, draft);
  await scheduleFromDraft(eventId, draft, timezone);
  return event;
}

/**
 * Done: разовое событие завершается насовсем (снимаем напоминания и удаляем
 * событие). Ежемесячное — снимаем оставшиеся в ЭТОМ цикле напоминания и
 * помечаем doneThisCycle, событие ждёт следующего месяца (см. rollover ниже)
 * либо Restore до этого момента.
 */
export async function markDone(eventId: string, userId: string): Promise<{ deleted: boolean }> {
  const event = await getForUser(eventId, userId);
  await reminderService.cancelPendingForEvent(eventId);

  if (event.kind === "ONCE") {
    await eventModel.deleteEvent(eventId);
    return { deleted: true };
  }

  await eventModel.setDoneThisCycle(eventId, true);
  return { deleted: false };
}

/** Отменяет Done, снятый в этом цикле, — пересчитывает и досылает оставшиеся в текущем окне напоминания. */
export async function restoreCycle(eventId: string, userId: string, timezone: string): Promise<void> {
  const event = await getForUser(eventId, userId);
  if (event.kind !== "MONTHLY" || !event.doneThisCycle) return;
  await eventModel.setDoneThisCycle(eventId, false);
  await scheduleFromDraft(eventId, toDraftShape(event), timezone);
}

function shiftDraftByOneMonth(draft: CompleteEventDraft): CompleteEventDraft {
  return {
    ...draft,
    startDate: shiftMonthClamped(draft.startDate, 1),
    endDate: shiftMonthClamped(draft.endDate, 1),
    ...(draft.customDates
      ? {
          customDates: draft.customDates.map((entry) => ({
            date: shiftMonthClamped(entry.date, 1),
            times: entry.times,
          })),
        }
      : {}),
  };
}

async function rolloverSingleEvent(event: EventWithRelationsAndUser): Promise<void> {
  if (!event.user.timezone) return; // не должно происходить — TZ обязателен для расписания
  const shiftedDraft = shiftDraftByOneMonth(toDraftShape(event));
  await eventModel.replaceSchedule(event.id, shiftedDraft);
  await eventModel.setDoneThisCycle(event.id, false);
  await scheduleFromDraft(event.id, shiftedDraft, event.user.timezone);
}

/**
 * Раз в сутки (см. modules/event/event.rollover.ts) переносит ежемесячные
 * события, у которых не осталось ни одного pending-напоминания в текущем
 * окне (естественная отправка всех, либо ранний Done), на тот же диапазон
 * дней следующего месяца.
 */
export async function rolloverDueMonthlyEvents(): Promise<number> {
  const due = await eventModel.findMonthlyEventsWithNoPendingReminders();
  for (const event of due) {
    await rolloverSingleEvent(event);
  }
  return due.length;
}
