/**
 * Переиспользуемые шаги визарда — общие для создания события
 * (features/create-event.ts) и его редактирования (features/edit-event/):
 * правишь дату — используешь тот же pickCalendarDate/pickFixedMonthDate, что и
 * при создании, и т.д.
 *
 * Слои снизу вверх:
 *   wizard-screen.ts          — что такое «экран шага» и как его перерисовать
 *   wait-input.ts             — ожидание текста/фото/кнопки, ничего не рисует
 *   time.ts, date-pickers.ts  — выбор одного времени / одной даты
 *   custom-dates-flow.ts      — режим «Свои даты» (даты × времена)
 *   interval-flow.ts          — режим «Интервал»
 *   date-and-schedule-flow.ts — даты начала/конца + выбор режима целиком
 */
export { renderStep, todayInConversation, type WizardScreen } from "./wizard-screen.js";
export {
  waitChoice,
  waitNumericPick,
  waitPhotoField,
  waitTextField,
  type ChoiceResult,
  type PhotoFieldResult,
  type TextFieldResult,
} from "./wait-input.js";
export { collectTimesForDate, parseTime, pickManualTime, pickSingleTime, waitTimePick } from "./time.js";
export { pickCalendarDate, pickFixedMonthDate, pickYearMonth } from "./date-pickers.js";
export { runCustomDatesFlow, type CustomDatesDraft, type CustomDatesResult } from "./custom-dates-flow.js";
export { availableIntervalUnits, runIntervalFlow, type IntervalDraft, type IntervalResult } from "./interval-flow.js";
export {
  runDateAndScheduleFlow,
  type DateAndScheduleDraft,
  type DateAndScheduleResult,
  type StepLabels,
} from "./date-and-schedule-flow.js";
