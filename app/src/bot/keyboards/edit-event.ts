import { InlineKeyboard } from "grammy";
import type { CustomDateEntry } from "../../types/event.js";
import { CUSTOM_MGMT, DEL, EDIT_CONFIRM, EDIT_DONE, EDIT_FIELD, FIELD_EDIT, delToggleData } from "../callback-data/edit.js";
import { formatDate } from "../helpers/date-format.js";

/** Клавиатуры экранов редактирования события (features/edit-event/). */

/** Подменю «Что изменить?» — 8 полей + «Готово». */
export const editMenuKeyboard = () =>
  new InlineKeyboard()
    .text("📌 Название", EDIT_FIELD.name)
    .text("📝 Описание", EDIT_FIELD.description)
    .row()
    .text("🔔 Текст напоминаний", EDIT_FIELD.reminderText)
    .row()
    .text("🖼 Фото", EDIT_FIELD.photo)
    .row()
    .text("🔁 Тип события", EDIT_FIELD.kind)
    .row()
    .text("▶️ Дата начала", EDIT_FIELD.startDate)
    .text("⏹ Дата окончания", EDIT_FIELD.endDate)
    .row()
    .text("⏰ Напоминания", EDIT_FIELD.schedule)
    .row()
    .text("✅ Готово", EDIT_DONE);

/** Мини-экран поля: «Редактировать» (подпись зависит от поля) / «Назад». */
export function fieldEditGateKeyboard(editLabel: string): InlineKeyboard {
  return new InlineKeyboard().text(editLabel, FIELD_EDIT.go).row().text("← Назад", FIELD_EDIT.back);
}

/** Да/нет в одну строку — подписи зависят от того, что подтверждаем. */
export function confirmKeyboard(yesLabel: string, noLabel: string): InlineKeyboard {
  return new InlineKeyboard().text(yesLabel, EDIT_CONFIRM.yes).text(noLabel, EDIT_CONFIRM.no);
}

/** Меню «Управление своими датами». */
export const customDatesManageKeyboard = () =>
  new InlineKeyboard()
    .text("➕ Добавить новые даты", CUSTOM_MGMT.add)
    .row()
    .text("🗑 Удалить старые", CUSTOM_MGMT.delete)
    .row()
    .text("← Назад", CUSTOM_MGMT.back);

/**
 * Чекбоксы удаления своих дат: по строке на дату (в порядке sorted),
 * отмеченные — ✅, остальные — ⬜.
 */
export function deleteCustomDatesKeyboard(sorted: CustomDateEntry[], selected: Set<number>): InlineKeyboard {
  const kb = new InlineKeyboard();
  sorted.forEach((entry, i) => {
    const mark = selected.has(i) ? "✅" : "⬜";
    kb.text(`${mark} ${formatDate(entry.date)}: ${entry.times.join(", ")}`, delToggleData(i)).row();
  });
  kb.text("✅ Готово", DEL.done).row();
  kb.text("← Назад", DEL.back);
  return kb;
}
