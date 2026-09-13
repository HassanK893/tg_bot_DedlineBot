import { TIME_MANUAL, TIME_NOOP, TIMES_DONE, parseTimePick } from "../../callback-data/wizard.js";
import { isCancel } from "../../filters/is-cancel.js";
import { buildTimePicker } from "../../keyboards/time-picker.js";
import { cancelOnlyKeyboard } from "../../keyboards/wizard.js";
import { escapeHtml } from "../../../utils/html.js";
import { skipUnexpected, tryDelete } from "../screen.js";
import { renderStep, type WizardScreen } from "./wizard-screen.js";

/**
 * Шаги выбора времени суток: сетка слотов (buildTimePicker) с возможностью
 * ввести время текстом. Используются и в режиме «Свои даты» (несколько времён
 * на дату), и в интервальном (ровно одно время).
 */

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

const MANUAL_TIME_HINT = "Введите время в формате ЧЧ:ММ — например 09:05, 18.30 или 1845.";

function manualTimeRetryHint(text: string): string {
  return `Не понял время «${escapeHtml(text)}». Формат — ЧЧ:ММ, например 09:05, 18.30 или 1845.`;
}

/** Ввод времени текстом — с подсказкой, которая после неудачной попытки цитирует ввод. */
export async function pickManualTime(screen: WizardScreen): Promise<string | "cancel"> {
  let hint = MANUAL_TIME_HINT;

  while (true) {
    await renderStep(screen, hint, cancelOnlyKeyboard());

    const next = await screen.conversation.wait();
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
      hint = manualTimeRetryHint(text);
      continue;
    }
    await skipUnexpected(next);
  }
}

/** Один тап по сетке времени: слот, переход к ручному вводу, или «Готово» для текущей даты. */
export async function waitTimePick(screen: WizardScreen): Promise<string | "done" | "cancel"> {
  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === TIMES_DONE) {
      await next.answerCallbackQuery();
      return "done";
    }
    if (data === TIME_MANUAL) {
      await next.answerCallbackQuery();
      return await pickManualTime(screen);
    }
    if (data === TIME_NOOP) {
      await next.answerCallbackQuery();
      continue;
    }
    if (data) {
      const slot = parseTimePick(data);
      if (slot) {
        await next.answerCallbackQuery();
        return slot;
      }
    }
    await skipUnexpected(next);
  }
}

function collectTimesQuestion(dateLabel: string, times: string[]): string {
  return times.length > 0
    ? `${dateLabel}. Уже выбрано: ${times.join(", ")}. Выберите ещё время — или нажмите «Готово».`
    : `${dateLabel}. Выберите время напоминания.`;
}

/**
 * Собирает несколько времён для одной даты: сетка перерисовывается после
 * каждого выбора — уже выбранные слоты помечаются галочкой, кнопка «Готово»
 * появляется, как только выбрано хотя бы одно время.
 */
export async function collectTimesForDate(screen: WizardScreen, dateLabel: string): Promise<string[] | "cancel"> {
  const times: string[] = [];

  while (true) {
    await renderStep(screen, collectTimesQuestion(dateLabel, times), buildTimePicker(times, times.length > 0));

    const result = await waitTimePick(screen);
    if (result === "cancel") return "cancel";
    if (result === "done") return times;
    if (!times.includes(result)) times.push(result);
  }
}

/** Выбор ровно одного времени (без «Готово» — кнопки нет, первый же тап завершает выбор). */
export async function pickSingleTime(screen: WizardScreen, question: string): Promise<string | "cancel"> {
  await renderStep(screen, question, buildTimePicker());
  const result = await waitTimePick(screen);
  if (result === "done") return "cancel"; // не должно происходить: кнопки «Готово» тут нет
  return result;
}
