/**
 * callback_data действий над событием. Раньше эти строки собирались вручную в
 * features/events-menu.ts, а разбирались регулярками в bot/index.ts — то есть формат
 * жил в двух местах и мог разъехаться. Теперь и сборка, и разбор здесь.
 *
 * Формат: event:<действие>:<id события>
 */

const PREFIX = "event";

export type EventAction =
  | "view"
  | "pause"
  | "resume"
  | "edit"
  | "restore"
  | "delete:confirm"
  | "delete:do"
  | "done:confirm"
  | "done:do";

export function eventData(action: EventAction, eventId: string): string {
  return `${PREFIX}:${action}:${eventId}`;
}

/**
 * Регулярка под конкретное действие. Хвост берётся жадно (.+), потому что id —
 * это cuid без двоеточий, а вот само действие может состоять из двух сегментов
 * (delete:confirm), и разделить их по количеству двоеточий не выйдет.
 */
export function eventPattern(action: EventAction): RegExp {
  return new RegExp(`^${PREFIX}:${action}:(.+)$`);
}
