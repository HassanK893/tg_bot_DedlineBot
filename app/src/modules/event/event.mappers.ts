import type {
  EventKind as PrismaEventKind,
  ScheduleType as PrismaScheduleType,
  IntervalUnit as PrismaIntervalUnit,
} from "../../generated/prisma/client.js";
import type { EventKind, IntervalUnit, ScheduleType } from "../../types/event.js";

/** once/monthly <-> ONCE/MONTHLY и т.п. — визард использует лаконичные строковые литералы, Prisma enum. */

export function toPrismaKind(kind: EventKind): PrismaEventKind {
  return kind === "once" ? "ONCE" : "MONTHLY";
}
export function fromPrismaKind(kind: PrismaEventKind): EventKind {
  return kind === "ONCE" ? "once" : "monthly";
}

export function toPrismaScheduleType(type: ScheduleType): PrismaScheduleType {
  return type === "custom" ? "CUSTOM" : "INTERVAL";
}
export function fromPrismaScheduleType(type: PrismaScheduleType): ScheduleType {
  return type === "CUSTOM" ? "custom" : "interval";
}

export function toPrismaIntervalUnit(unit: IntervalUnit): PrismaIntervalUnit {
  return unit.toUpperCase() as PrismaIntervalUnit;
}
export function fromPrismaIntervalUnit(unit: PrismaIntervalUnit): IntervalUnit {
  return unit.toLowerCase() as IntervalUnit;
}
