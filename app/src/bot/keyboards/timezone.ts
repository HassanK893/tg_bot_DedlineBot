import { InlineKeyboard } from "grammy";
import { timezonePickData } from "../callback-data/menu.js";

export interface TimezoneOption {
  label: string;
  zone: string;
}

/** Курируемый список — основные часовые пояса России + соседние страны СНГ. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { label: "Калининград (UTC+2)", zone: "Europe/Kaliningrad" },
  { label: "Москва (UTC+3)", zone: "Europe/Moscow" },
  { label: "Самара (UTC+4)", zone: "Europe/Samara" },
  { label: "Екатеринбург (UTC+5)", zone: "Asia/Yekaterinburg" },
  { label: "Омск (UTC+6)", zone: "Asia/Omsk" },
  { label: "Красноярск (UTC+7)", zone: "Asia/Krasnoyarsk" },
  { label: "Иркутск (UTC+8)", zone: "Asia/Irkutsk" },
  { label: "Якутск (UTC+9)", zone: "Asia/Yakutsk" },
  { label: "Владивосток (UTC+10)", zone: "Asia/Vladivostok" },
  { label: "Магадан (UTC+11)", zone: "Asia/Magadan" },
  { label: "Камчатка (UTC+12)", zone: "Asia/Kamchatka" },
  { label: "Киев", zone: "Europe/Kyiv" },
  { label: "Минск", zone: "Europe/Minsk" },
  { label: "Алматы", zone: "Asia/Almaty" },
  { label: "Ташкент", zone: "Asia/Tashkent" },
];

export function buildTimezonePicker(): InlineKeyboard {
  const kb = new InlineKeyboard();
  TIMEZONE_OPTIONS.forEach((opt, i) => {
    kb.text(opt.label, timezonePickData(i));
    if (i % 2 === 1) kb.row();
  });
  if (TIMEZONE_OPTIONS.length % 2 !== 0) kb.row();
  return kb;
}
