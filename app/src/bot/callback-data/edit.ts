/**
 * callback_data экранов редактирования события (features/edit-event/).
 * Разбор и сборка — только здесь, см. пояснение в callback-data/wizard.ts.
 */

/** Кнопки подменю «Что изменить?» — по одной на каждое из 8 полей. */
export const EDIT_FIELD = {
  name: "edit:field:name",
  description: "edit:field:description",
  reminderText: "edit:field:reminderText",
  photo: "edit:field:photo",
  kind: "edit:field:kind",
  startDate: "edit:field:startDate",
  endDate: "edit:field:endDate",
  schedule: "edit:field:schedule",
} as const;

/** «✅ Готово» в подменю — выход из редактирования к карточке события. */
export const EDIT_DONE = "edit:done";

/** Подтверждение любого изменения: ничего не сохраняется без явного «да». */
export const EDIT_CONFIRM = {
  yes: "edit:confirm:yes",
  no: "edit:confirm:no",
} as const;

/** Гейт мини-экрана поля: «Редактировать» либо «Назад». */
export const FIELD_EDIT = {
  go: "fieldedit:go",
  back: "fieldedit:back",
} as const;

/** Меню управления «своими датами» (тот же режим, что и был). */
export const CUSTOM_MGMT = {
  add: "custommgmt:add",
  delete: "custommgmt:delete",
  back: "custommgmt:back",
} as const;

/** Экран удаления своих дат: чекбоксы + «Готово»/«Назад». */
export const DEL = {
  done: "del:done",
  back: "del:back",
} as const;

export function delToggleData(index: number): string {
  return `del:toggle:${index}`;
}

const DEL_TOGGLE_PATTERN = /^del:toggle:(\d+)$/;

export function parseDelToggle(data: string): number | null {
  const match = data.match(DEL_TOGGLE_PATTERN);
  return match ? Number(match[1]) : null;
}
