import { z } from "zod";

const datePartSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(0).max(11),
  day: z.number().int().min(1).max(31),
});

const customDateEntrySchema = z.object({
  date: datePartSchema,
  times: z.array(z.string()).min(1),
});

const intervalScheduleSchema = z.object({
  unit: z.enum(["hours", "days", "weeks", "months"]),
  every: z.number().int().positive(),
  time: z.string().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export const completeEventDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  reminderText: z.string().min(1),
  photoFileId: z.string().optional(),
  kind: z.enum(["once", "monthly"]),
  startDate: datePartSchema,
  endDate: datePartSchema,
  scheduleType: z.enum(["custom", "interval"]),
  customDates: z.array(customDateEntrySchema).optional(),
  intervalSchedule: intervalScheduleSchema.optional(),
});

export const updateScalarFieldsSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  reminderText: z.string().min(1).optional(),
  photoFileId: z.string().optional(),
});
