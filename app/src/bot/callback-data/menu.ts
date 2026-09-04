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

export const TIMEZONE_PICK_PATTERN = /^tz:pick:(\d+)$/;
