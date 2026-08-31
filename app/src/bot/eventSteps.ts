import { Context, InlineKeyboard } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import {
  buildCalendar,
  buildCustomDatePicker,
  buildFixedMonthCalendar,
  buildNumberPicker,
  buildTimePicker,
  buildWeekdayPicker,
  buildYearMonthPicker,
  formatDate,
  monthTitle,
  WEEKDAYS,
  type CalendarRange,
} from "./calendar.js";
import { dateSortKey } from "../utils/datePart.js";
import type {
  CustomDateEntry,
  DatePart,
  EventDraft,
  EventKind,
  IntervalSchedule,
  IntervalUnit,
  ScheduleType,
} from "../types/event.js";
import { escapeHtml } from "../utils/html.js";

/**
 * Переиспользуемые шаги визарда — вынесены из wizard.ts, чтобы и создание
 * события (wizard.ts), и его редактирование (editWizard.ts) прогоняли
 * ПОЛЬЗОВАТЕЛЯ через один и тот же UI-код: правишь дату — используешь тот же
 * pickCalendarDate/pickFixedMonthDate, что и при создании, и т.д.
 */

export type MyConversation = Conversation<Context>;

/**
 * Какие единицы интервала вообще имеют смысл при выбранном промежутке
 * событие←→конец. Один день в промежутке — только часы, два и больше — и
 * дни, неделя и больше — и недели, месяц и больше — и месяцы. «Месяцы»
 * никогда не предлагаются для ежемесячного типа события — там и так есть
 * свой помесячный повтор.
 */
export function availableIntervalUnits(
  startDate: DatePart,
  endDate: DatePart,
  kind: EventKind | undefined,
): IntervalUnit[] {
  const spanDays = Math.round((dateSortKey(endDate) - dateSortKey(startDate)) / 86_400_000) + 1;
  const units: IntervalUnit[] = ["hours"];
  if (spanDays >= 2) units.push("days");
  if (spanDays >= 7) units.push("weeks");
  if (spanDays >= 31 && kind !== "monthly") units.push("months");
  return units;
}

/**
 * Разбирает время, введённое текстом, в двух форматах: "14:30"/"14.30" и
 * слитно "1430". Возвращает нормализованное "ЧЧ:ММ" или null, если не похоже
 * ни на один из них.
 */
export function parseTime(raw: string): string | null {
  const cleaned = raw.trim();
  let match = cleaned.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) match = cleaned.match(/^([01]\d|2[0-3])([0-5]\d)$/);
  if (!match) return null;
  const [, hours, minutes] = match;
  if (hours === undefined || minutes === undefined) return null;
  return `${hours.padStart(2, "0")}:${minutes}`;
}


/**
 * Все экраны визарда отправляются с parse_mode: "HTML" — единая точка,
 * чтобы не забыть его на одном из мест правки сообщения.
 */
export async function renderScreen(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
  keyboard: InlineKeyboard,
) {
  await ctx.api.editMessageText(chatId, messageId, text, {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
}

/**
 * Кнопка «В меню» встроена в buildCalendar с фиксированной callback_data
 * "menu:main" — внутри визарда она означает то же, что и наша "wizard:cancel".
 */
export function isCancel(data: string | undefined): boolean {
  return data === "wizard:cancel" || data === "menu:main";
}

export async function tryDelete(ctx: Context) {
  try {
    await ctx.deleteMessage();
  } catch {
    // сообщение могло устареть, или у бота нет прав — для теста не критично
  }
}

const STALE_CALLBACK_MESSAGE =
  "Это старое меню — у вас уже открыт другой диалог. Закончите его или нажмите «✖ Отмена» в текущем сообщении.";

/**
 * Тап по кнопке из чужого/устаревшего сообщения, пока идёт этот диалог —
 * grammY conversations забирает себе все апдейты чата, такой тап не подходит
 * ни под один ожидаемый шаг. Без ответа кнопка просто «зависает» без
 * объяснений — отвечаем алертом вместо тишины.
 */
export async function answerStaleCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery({ text: STALE_CALLBACK_MESSAGE, show_alert: true });
  } catch {
    // callback мог устареть — не критично
  }
}

/**
 * Единая реакция на апдейт, которого текущий шаг не ждал: сообщение (не тот
 * тип ответа, стикер, команда) убираем из чата, чтобы оно не копилось и не
 * попало в поле как значение; чужой или устаревший callback объясняем алертом.
 * В обоих случаях шаг просто продолжает ждать нужный апдейт.
 */
export async function skipUnexpected(ctx: Context): Promise<void> {
  if (ctx.message) await tryDelete(ctx);
  else await answerStaleCallback(ctx);
}

type TextFieldResult = { kind: "text"; value: string } | { kind: "skip" } | { kind: "cancel" };

export async function waitTextField(
  conversation: MyConversation,
  allowSkip: boolean,
): Promise<TextFieldResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (allowSkip && data === "step:skip") {
      await next.answerCallbackQuery();
      return { kind: "skip" };
    }
    const text = next.message?.text?.trim();
    if (text && !text.startsWith("/")) {
      await tryDelete(next);
      return { kind: "text", value: text };
    }
    // сюда попадает и команда вроде /test — она отсеяна проверкой выше, иначе
    // событие можно было бы случайно назвать "/test"
    await skipUnexpected(next);
  }
}

type PhotoFieldResult = { kind: "photo"; fileId: string } | { kind: "skip" } | { kind: "cancel" };

export async function waitPhotoField(conversation: MyConversation): Promise<PhotoFieldResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (data === "step:skip") {
      await next.answerCallbackQuery();
      return { kind: "skip" };
    }
    const photo = next.message?.photo?.at(-1);
    if (photo) {
      await tryDelete(next);
      return { kind: "photo", fileId: photo.file_id };
    }
    await skipUnexpected(next);
  }
}

type ChoiceResult = { kind: "choice"; value: string } | { kind: "cancel" };

export async function waitChoice(conversation: MyConversation, options: string[]): Promise<ChoiceResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (data && options.includes(data)) {
      await next.answerCallbackQuery();
      return { kind: "choice", value: data };
    }
    await skipUnexpected(next);
  }
}

export async function pickCalendarDate(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  renderText: (question: string) => string,
  question: string,
  range?: CalendarRange,
): Promise<DatePart | "cancel"> {
  const nowMs = await conversation.now();
  const now = new Date(nowMs);
  const today: DatePart = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  // если есть нижняя граница — сразу открываем её месяц, а не текущий
  let year = range?.min?.year ?? today.year;
  let month = range?.min?.month ?? today.month;

  await renderScreen(
    ctx,
    chatId,
    messageId,
    renderText(question),
    buildCalendar(year, month, range, today),
  );

  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "cal:noop") {
      await next.answerCallbackQuery();
      continue;
    }

    const nav = data.match(/^cal:nav:(-?\d+):(-?\d+)$/);
    if (nav) {
      year = Number(nav[1]);
      month = Number(nav[2]);
      await renderScreen(
        ctx,
        chatId,
        messageId,
        renderText(question),
        buildCalendar(year, month, range, today),
      );
      await next.answerCallbackQuery();
      continue;
    }

    const day = data.match(/^cal:day:(-?\d+):(-?\d+):(-?\d+)$/);
    if (day) {
      await next.answerCallbackQuery();
      return { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) };
    }

    await answerStaleCallback(next);
  }
}

export async function pickYearMonth(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  renderText: (question: string) => string,
  question: string,
): Promise<{ year: number; month: number } | "cancel"> {
  const nowMs = await conversation.now();
  const now = new Date(nowMs);
  const today = { year: now.getFullYear(), month: now.getMonth() };
  let year = today.year;

  await renderScreen(ctx, chatId, messageId, renderText(question), buildYearMonthPicker(year, today));

  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "ym:noop") {
      await next.answerCallbackQuery();
      continue;
    }

    const nav = data.match(/^ym:nav:(-?\d+)$/);
    if (nav) {
      year = Number(nav[1]);
      await renderScreen(ctx, chatId, messageId, renderText(question), buildYearMonthPicker(year, today));
      await next.answerCallbackQuery();
      continue;
    }

    const pick = data.match(/^ym:pick:(-?\d+):(\d+)$/);
    if (pick) {
      await next.answerCallbackQuery();
      return { year: Number(pick[1]), month: Number(pick[2]) };
    }

    await answerStaleCallback(next);
  }
}

/**
 * Выбор дня в уже зафиксированном месяце (без переключения месяцев) —
 * используется для даты начала/конца ежемесячного события.
 */
export async function pickFixedMonthDate(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  year: number,
  month: number,
  renderText: (question: string) => string,
  question: string,
  range?: CalendarRange,
): Promise<DatePart | "cancel"> {
  await renderScreen(
    ctx,
    chatId,
    messageId,
    renderText(question),
    buildFixedMonthCalendar(year, month, range),
  );

  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "cal:noop") {
      await next.answerCallbackQuery();
      continue;
    }

    const day = data.match(/^cal:day:(-?\d+):(-?\d+):(-?\d+)$/);
    if (day) {
      await next.answerCallbackQuery();
      return { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) };
    }

    await answerStaleCallback(next);
  }
}

export async function pickManualTime(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  renderText: (question: string) => string,
): Promise<string | "cancel"> {
  let hint = "Введите время в формате ЧЧ:ММ — например 09:05, 18.30 или 1845.";

  while (true) {
    await renderScreen(
      ctx,
      chatId,
      messageId,
      renderText(hint),
      new InlineKeyboard().text("✖ Отмена", "wizard:cancel"),
    );

    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }

    const text = next.message?.text?.trim();
    if (text) {
      await tryDelete(next);
      const parsed = parseTime(text);
      if (parsed) return parsed;
      hint = `Не понял время «${escapeHtml(text)}». Формат — ЧЧ:ММ, например 09:05, 18.30 или 1845.`;
      continue;
    }
    await skipUnexpected(next);
  }
}

/** Один тап по сетке времени: слот, переход к ручному вводу, или «Готово» для текущей даты. */
export async function waitTimePick(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  renderText: (question: string) => string,
): Promise<string | "done" | "cancel"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "times:done") {
      await next.answerCallbackQuery();
      return "done";
    }
    if (data === "time:manual") {
      await next.answerCallbackQuery();
      return await pickManualTime(conversation, ctx, chatId, messageId, renderText);
    }
    if (data === "time:noop") {
      await next.answerCallbackQuery();
      continue;
    }
    if (data) {
      const match = data.match(/^time:pick:(\d{2}:\d{2})$/);
      const slot = match?.[1];
      if (slot) {
        await next.answerCallbackQuery();
        return slot;
      }
    }
    await skipUnexpected(next);
  }
}

/**
 * Собирает несколько времён для одной даты: сетка перерисовывается после
 * каждого выбора — уже выбранные слоты помечаются галочкой, кнопка «Готово»
 * появляется, как только выбрано хотя бы одно время.
 */
export async function collectTimesForDate(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  formText: (question: string) => string,
  dateLabel: string,
): Promise<string[] | "cancel"> {
  const times: string[] = [];

  while (true) {
    const question =
      times.length > 0
        ? `${dateLabel}. Уже выбрано: ${times.join(", ")}. Выберите ещё время — или нажмите «Готово».`
        : `${dateLabel}. Выберите время напоминания.`;

    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText(question),
      buildTimePicker(times, times.length > 0),
    );

    const result = await waitTimePick(conversation, ctx, chatId, messageId, formText);
    if (result === "cancel") return "cancel";
    if (result === "done") return times;
    if (!times.includes(result)) times.push(result);
  }
}

/** Выбор ровно одного времени (без «Готово» — кнопки нет, первый же тап завершает выбор). */
export async function pickSingleTime(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  formText: (question: string) => string,
  question: string,
): Promise<string | "cancel"> {
  await renderScreen(ctx, chatId, messageId, formText(question), buildTimePicker());
  const result = await waitTimePick(conversation, ctx, chatId, messageId, formText);
  if (result === "done") return "cancel"; // не должно происходить: кнопки «Готово» тут нет
  return result;
}

type CustomDatePick = { kind: "day"; date: DatePart } | { kind: "nav"; year: number; month: number };

async function waitCustomDatePick(
  conversation: MyConversation,
): Promise<CustomDatePick | "done" | "switch" | "cancel"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "custom:done") {
      await next.answerCallbackQuery();
      return "done";
    }
    if (data === "sched:back") {
      await next.answerCallbackQuery();
      return "switch";
    }
    if (data === "cal:noop") {
      await next.answerCallbackQuery();
      continue;
    }
    if (data) {
      const nav = data.match(/^cal:nav:(-?\d+):(-?\d+)$/);
      if (nav) {
        await next.answerCallbackQuery();
        return { kind: "nav", year: Number(nav[1]), month: Number(nav[2]) };
      }
      const day = data.match(/^cal:day:(-?\d+):(-?\d+):(-?\d+)$/);
      if (day) {
        await next.answerCallbackQuery();
        return {
          kind: "day",
          date: { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) },
        };
      }
    }
    await skipUnexpected(next);
  }
}

export type CustomDatesResult = "cancel" | "switch" | "done";

/**
 * Режим «Свои даты»: пока пользователь не нажмёт «Готово», по кругу —
 * выбор даты в календаре (уже выбранные помечены галочкой), затем выбор
 * времени для неё, снова календарь. Список дат+времени копится в
 * draft.customDates и сразу виден в живой форме через fieldsSummary.
 */
export async function runCustomDatesFlow(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  formText: (question: string) => string,
  draft: { customDates?: CustomDateEntry[]; startDate?: DatePart; endDate?: DatePart },
  fixedMonth: { year: number; month: number } | undefined,
): Promise<CustomDatesResult> {
  const entries = draft.customDates ?? [];
  draft.customDates = entries;

  // диапазон нужен в обоих режимах: для ежемесячного start/end лежат в одном
  // и том же зафиксированном месяце (сузит его до дней 20–30 и т.п.), для
  // разового может охватывать несколько месяцев — тогда промежуточные месяцы
  // окажутся полностью внутри диапазона и покажутся целиком, это нормально.
  const range: CalendarRange | undefined =
    draft.startDate && draft.endDate ? { min: draft.startDate, max: draft.endDate } : undefined;

  let year = fixedMonth?.year ?? draft.startDate?.year;
  let month = fixedMonth?.month ?? draft.startDate?.month;
  if (year === undefined || month === undefined) return "cancel"; // не должно происходить

  while (true) {
    const question =
      entries.length > 0
        ? "Выберите ещё одну дату — или нажмите «Готово»."
        : "Выберите дату для отдельного напоминания.";

    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText(question),
      buildCustomDatePicker(year, month, {
        fixed: Boolean(fixedMonth),
        ...(range ? { range } : {}),
        marked: entries.map((e) => e.date),
        canFinish: entries.length > 0,
      }),
    );

    const picked = await waitCustomDatePick(conversation);
    if (picked === "cancel" || picked === "switch" || picked === "done") return picked;

    if (picked.kind === "nav") {
      year = picked.year;
      month = picked.month;
      continue;
    }

    const timesRes = await collectTimesForDate(
      conversation,
      ctx,
      chatId,
      messageId,
      formText,
      formatDate(picked.date),
    );
    if (timesRes === "cancel") return "cancel";

    entries.push({ date: picked.date, times: timesRes });
  }
}

type UnitPickResult = { kind: "unit"; unit: IntervalUnit } | "switch" | "cancel";

async function waitIntervalUnitPick(conversation: MyConversation, units: IntervalUnit[]): Promise<UnitPickResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === "sched:back") {
      await next.answerCallbackQuery();
      return "switch";
    }
    if (data === "int:unit:hours" && units.includes("hours")) {
      await next.answerCallbackQuery();
      return { kind: "unit", unit: "hours" };
    }
    if (data === "int:unit:days" && units.includes("days")) {
      await next.answerCallbackQuery();
      return { kind: "unit", unit: "days" };
    }
    if (data === "int:unit:weeks" && units.includes("weeks")) {
      await next.answerCallbackQuery();
      return { kind: "unit", unit: "weeks" };
    }
    if (data === "int:unit:months" && units.includes("months")) {
      await next.answerCallbackQuery();
      return { kind: "unit", unit: "months" };
    }
    await skipUnexpected(next);
  }
}

const NUMBER_PICK = /^int:num:(\d+)$/;
const WEEKDAY_PICK = /^wd:pick:(\d)$/;

/**
 * Ждёт тап по кнопке, callback_data которой подходит под pattern с одной
 * захватывающей группой-числом. Один цикл на «раз в N часов/дней/недель/
 * месяцев» (buildNumberPicker) и на выбор дня недели (buildWeekdayPicker) —
 * отличались они только шаблоном.
 */
async function waitNumericPick(conversation: MyConversation, pattern: RegExp): Promise<number | "cancel"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data) {
      const match = data.match(pattern);
      if (match) {
        await next.answerCallbackQuery();
        return Number(match[1]);
      }
    }
    await skipUnexpected(next);
  }
}

export type IntervalResult = "cancel" | "switch" | "done";

/**
 * Режим «Интервал»: сначала выбор единицы (часы/дни/недели/месяцы —
 * доступность зависит от длины промежутка начало→конец, см.
 * availableIntervalUnits), затем число («раз в N [unit]»); для дней/недель/
 * месяцев ещё и время суток, для недель — ещё и день недели, для месяцев —
 * ещё и число месяца.
 */
export async function runIntervalFlow(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  formText: (question: string) => string,
  draft: { startDate?: DatePart; endDate?: DatePart; kind?: EventKind; intervalSchedule?: IntervalSchedule },
): Promise<IntervalResult> {
  if (!draft.startDate || !draft.endDate) return "cancel"; // не должно происходить

  const units = availableIntervalUnits(draft.startDate, draft.endDate, draft.kind);

  const unitKeyboard = new InlineKeyboard();
  if (units.includes("hours")) unitKeyboard.text("⏱ Часы", "int:unit:hours");
  if (units.includes("days")) unitKeyboard.text("📆 Дни", "int:unit:days");
  if (units.includes("hours") || units.includes("days")) unitKeyboard.row();
  if (units.includes("weeks")) unitKeyboard.text("📅 Недели", "int:unit:weeks");
  if (units.includes("months")) unitKeyboard.text("🗓 Месяцы", "int:unit:months");
  if (units.includes("weeks") || units.includes("months")) unitKeyboard.row();
  unitKeyboard.text("↩ Сменить режим", "sched:back").row().text("✖ Отмена", "wizard:cancel");

  await renderScreen(ctx, chatId, messageId, formText("Выберите, как часто присылать напоминание."), unitKeyboard);

  const unitRes = await waitIntervalUnitPick(conversation, units);
  if (unitRes === "cancel" || unitRes === "switch") return unitRes;

  if (unitRes.unit === "hours") {
    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText("Раз во сколько часов присылать напоминание?"),
      buildNumberPicker(1, 24),
    );
    const n = await waitNumericPick(conversation, NUMBER_PICK);
    if (n === "cancel") return "cancel";
    draft.intervalSchedule = { unit: "hours", every: n };
    return "done";
  }

  if (unitRes.unit === "days") {
    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText("Раз во сколько дней присылать напоминание?"),
      buildNumberPicker(1, 7),
    );
    const days = await waitNumericPick(conversation, NUMBER_PICK);
    if (days === "cancel") return "cancel";

    const timeRes = await pickSingleTime(conversation, ctx, chatId, messageId, formText, "В какое время присылать напоминание?");
    if (timeRes === "cancel") return "cancel";

    draft.intervalSchedule = { unit: "days", every: days, time: timeRes };
    return "done";
  }

  if (unitRes.unit === "weeks") {
    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText("Раз во сколько недель присылать напоминание?"),
      buildNumberPicker(1, 4),
    );
    const weeks = await waitNumericPick(conversation, NUMBER_PICK);
    if (weeks === "cancel") return "cancel";

    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText("В какой день недели присылать напоминание?"),
      buildWeekdayPicker(),
    );
    const weekday = await waitNumericPick(conversation, WEEKDAY_PICK);
    if (weekday === "cancel") return "cancel";

    const timeRes = await pickSingleTime(conversation, ctx, chatId, messageId, formText, "В какое время присылать напоминание?");
    if (timeRes === "cancel") return "cancel";

    draft.intervalSchedule = { unit: "weeks", every: weeks, weekday, time: timeRes };
    return "done";
  }

  // unitRes.unit === "months"
  await renderScreen(
    ctx,
    chatId,
    messageId,
    formText("Раз во сколько месяцев присылать напоминание?"),
    buildNumberPicker(1, 12),
  );
  const months = await waitNumericPick(conversation, NUMBER_PICK);
  if (months === "cancel") return "cancel";

  await renderScreen(
    ctx,
    chatId,
    messageId,
    formText("Какого числа месяца присылать напоминание?"),
    buildNumberPicker(1, 31),
  );
  const dayOfMonth = await waitNumericPick(conversation, NUMBER_PICK);
  if (dayOfMonth === "cancel") return "cancel";

  const timeRes = await pickSingleTime(conversation, ctx, chatId, messageId, formText, "В какое время присылать напоминание?");
  if (timeRes === "cancel") return "cancel";

  draft.intervalSchedule = { unit: "months", every: months, dayOfMonth, time: timeRes };
  return "done";
}

export interface DateAndScheduleDraft {
  kind?: EventKind;
  startDate?: DatePart;
  endDate?: DatePart;
  scheduleType?: ScheduleType;
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
}

export type DateAndScheduleResult = "cancel" | "done";

/**
 * Даты начала/конца (в зависимости от kind) + выбор режима напоминаний —
 * идентичная последовательность и при создании события (шаги 6-8 в
 * wizard.ts), и при редактировании «Даты и напоминания» одним блоком
 * (editWizard.ts). stepLabel — только текст подписи шага, сама логика общая.
 */
export async function runDateAndScheduleFlow(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  formText: (question: string) => string,
  draft: DateAndScheduleDraft,
  stepLabel: { start: string; end: string; schedule: string },
): Promise<DateAndScheduleResult> {
  let fixedMonth: { year: number; month: number } | undefined;

  if (draft.kind === "monthly") {
    const ymRes = await pickYearMonth(
      conversation,
      ctx,
      chatId,
      messageId,
      formText,
      `${stepLabel.start} Выберите месяц, с которого начнутся напоминания.`,
    );
    if (ymRes === "cancel") return "cancel";
    fixedMonth = ymRes;

    const nowMs = await conversation.now();
    const now = new Date(nowMs);
    const today: DatePart = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };

    const startRes = await pickFixedMonthDate(
      conversation,
      ctx,
      chatId,
      messageId,
      fixedMonth.year,
      fixedMonth.month,
      formText,
      `${stepLabel.start} ${monthTitle(fixedMonth.year, fixedMonth.month)}. Выберите дату начала.`,
      { min: today },
    );
    if (startRes === "cancel") return "cancel";
    draft.startDate = startRes;
  } else {
    const dateRes = await pickCalendarDate(
      conversation,
      ctx,
      chatId,
      messageId,
      formText,
      `${stepLabel.start} Выберите дату начала события.`,
    );
    if (dateRes === "cancel") return "cancel";
    draft.startDate = dateRes;
  }

  let endRes: DatePart | "cancel";
  if (draft.kind === "monthly" && fixedMonth && draft.startDate) {
    endRes = await pickFixedMonthDate(
      conversation,
      ctx,
      chatId,
      messageId,
      fixedMonth.year,
      fixedMonth.month,
      formText,
      `${stepLabel.end} ${monthTitle(fixedMonth.year, fixedMonth.month)}. Выберите дату окончания.`,
      { min: draft.startDate },
    );
  } else {
    const endRange: CalendarRange | undefined = draft.startDate ? { min: draft.startDate } : undefined;
    endRes = await pickCalendarDate(
      conversation,
      ctx,
      chatId,
      messageId,
      formText,
      `${stepLabel.end} Выберите дату окончания события.`,
      endRange,
    );
  }
  if (endRes === "cancel") return "cancel";
  draft.endDate = endRes;

  const scheduleChoiceKeyboard = () =>
    new InlineKeyboard()
      .text("🗓 Свои даты", "sched:custom")
      .text("🔁 Интервал", "sched:interval")
      .row()
      .text("✖ Отмена", "wizard:cancel");

  await renderScreen(
    ctx,
    chatId,
    messageId,
    formText(`${stepLabel.schedule} Выберите, как задать напоминания.`),
    scheduleChoiceKeyboard(),
  );

  while (true) {
    const choiceRes = await waitChoice(conversation, ["sched:custom", "sched:interval"]);
    if (choiceRes.kind === "cancel") return "cancel";
    draft.scheduleType = choiceRes.value === "sched:custom" ? "custom" : "interval";

    if (draft.scheduleType === "custom") {
      const customRes = await runCustomDatesFlow(conversation, ctx, chatId, messageId, formText, draft, fixedMonth);
      if (customRes === "cancel") return "cancel";
      if (customRes === "switch") {
        delete draft.scheduleType;
        delete draft.customDates;
        await renderScreen(
          ctx,
          chatId,
          messageId,
          formText(`${stepLabel.schedule} Выберите, как задать напоминания.`),
          scheduleChoiceKeyboard(),
        );
        continue;
      }
      return "done";
    }

    const intervalRes = await runIntervalFlow(conversation, ctx, chatId, messageId, formText, draft);
    if (intervalRes === "cancel") return "cancel";
    if (intervalRes === "switch") {
      delete draft.scheduleType;
      delete draft.intervalSchedule;
      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(`${stepLabel.schedule} Выберите, как задать напоминания.`),
        scheduleChoiceKeyboard(),
      );
      continue;
    }
    return "done";
  }
}

/**
 * Единый рендер полей события в виде маркированного списка с иконками —
 * используется живой формой визарда, экраном «Мои события» и редактированием,
 * поэтому принимает EventDraft (общая форма, см. types/event.ts), а не
 * что-то специфичное для одного экрана.
 */
export function summarizeDraft(draft: EventDraft): string {
  const kindLabel = draft.kind === "once" ? "разовое" : draft.kind === "monthly" ? "ежемесячное" : "—";
  const startLabel = draft.startDate ? formatDate(draft.startDate) : "—";
  const endLabel = draft.endDate ? formatDate(draft.endDate) : "—";
  const photoLabel = draft.photoFileId ? "добавлена ✅" : "—";

  let scheduleLine: string;
  if (draft.scheduleType === "custom") {
    if (draft.customDates && draft.customDates.length > 0) {
      const sorted = [...draft.customDates].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date));
      const rows = sorted
        .map((e) => `    • <b>${formatDate(e.date)}</b>: ${[...e.times].sort().join(", ")}`)
        .join("\n");
      scheduleLine = `свои даты\n${rows}`;
    } else {
      scheduleLine = "свои даты — пока не выбраны";
    }
  } else if (draft.scheduleType === "interval") {
    const s = draft.intervalSchedule;
    if (s === undefined) {
      scheduleLine = "интервал — пока не настроено";
    } else if (s.unit === "hours") {
      scheduleLine = `раз в ${s.every} ч.`;
    } else if (s.unit === "days") {
      scheduleLine = `раз в ${s.every} дн. в ${s.time}`;
    } else if (s.unit === "weeks") {
      scheduleLine = `раз в ${s.every} нед., по ${WEEKDAYS[s.weekday ?? 0]}, в ${s.time}`;
    } else {
      scheduleLine = `раз в ${s.every} мес., ${s.dayOfMonth} числа, в ${s.time}`;
    }
  } else {
    scheduleLine = "—";
  }

  return [
    `📌 <b>Название:</b> ${draft.name ? escapeHtml(draft.name) : "—"}`,
    `📝 <b>Описание:</b> ${draft.description ? escapeHtml(draft.description) : "—"}`,
    `🔔 <b>Текст напоминаний:</b> ${draft.reminderText ? escapeHtml(draft.reminderText) : "—"}`,
    `🖼 <b>Картинка:</b> ${photoLabel}`,
    `🔁 <b>Тип:</b> ${kindLabel}`,
    `▶️ <b>Дата начала:</b> ${startLabel}`,
    `⏹ <b>Дата окончания:</b> ${endLabel}`,
    `⏰ <b>Напоминания:</b> ${scheduleLine}`,
  ].join("\n\n");
}

export const cancelOnlyKeyboard = () => new InlineKeyboard().text("✖ Отмена", "wizard:cancel");

export const skipOrCancelKeyboard = () =>
  new InlineKeyboard().text("Пропустить", "step:skip").row().text("✖ Отмена", "wizard:cancel");
