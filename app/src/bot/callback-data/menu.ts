/**
 * Строки callback_data для главного меню — собраны здесь, чтобы клавиатура
 * (keyboards/main-menu.ts) и хендлеры (features/) не расходились из-за опечатки
 * в литерале: TS поймает ошибку в имени константы, но никогда — в тексте строки.
 */
export const MENU = {
  main: "menu:main",
  list: "menu:list",
  create: "menu:create",
  timezone: "menu:timezone",
} as const;

/** callback_data выбора часового пояса: tz:pick:<индекс в TIMEZONE_OPTIONS>. */
export function timezonePickData(index: number): string {
  return `tz:pick:${index}`;
}

const TIMEZONE_PICK_PATTERN = /^tz:pick:(\d+)$/;

/** Индекс выбранного пояса из callback_data или null, если это не tz:pick. */
export function parseTimezonePick(data: string): number | null {
  const match = data.match(TIMEZONE_PICK_PATTERN);
  return match ? Number(match[1]) : null;
}
