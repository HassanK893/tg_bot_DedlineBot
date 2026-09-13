import { CUSTOM_MGMT, DEL, parseDelToggle } from "../../callback-data/edit.js";
import { isCancel } from "../../filters/is-cancel.js";
import { answerStaleCallback, tryDelete } from "../../helpers/screen.js";
import { runCustomDatesFlow } from "../../helpers/steps/index.js";
import { customDatesManageKeyboard, deleteCustomDatesKeyboard } from "../../keyboards/edit-event.js";
import { dateSortKey } from "../../../utils/datePart.js";
import type { EditSession } from "./session.js";

/**
 * Управление «своими датами» у события, которое уже в этом режиме: добавить
 * ещё дат тем же шагом, что при создании, либо снять галочками старые.
 * Смена режима целиком — в schedule.ts.
 */

type FixedMonth = { year: number; month: number } | undefined;

export async function runCustomDatesManageMenu(session: EditSession, fixedMonth: FixedMonth): Promise<void> {
  while (true) {
    await session.render("Управление своими датами.", customDatesManageKeyboard());

    const next = await session.conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (data === CUSTOM_MGMT.back) {
      await next.answerCallbackQuery();
      return;
    }
    if (data === CUSTOM_MGMT.add) {
      await next.answerCallbackQuery();
      const res = await runCustomDatesFlow(session, session.draft, fixedMonth);
      // добавленные до этого момента даты уже лежат в draft.customDates — сохраняем, чем бы шаг ни закончился
      await session.persist();
      if (res === "cancel") return;
      continue;
    }
    if (data === CUSTOM_MGMT.delete) {
      await next.answerCallbackQuery();
      const res = await runDeleteCustomDatesFlow(session);
      if (res === "cancel") return;
      continue;
    }

    await answerStaleCallback(next);
  }
}

/**
 * Чекбоксы по датам (отсортированы по календарю), «Готово» — удалить
 * отмеченные и пересчитать напоминания. Без отметок «Готово» не срабатывает.
 */
export async function runDeleteCustomDatesFlow(session: EditSession): Promise<"done" | "back" | "cancel"> {
  const { draft } = session;
  const entries = draft.customDates ?? [];
  if (entries.length === 0) return "back";
  const sorted = [...entries].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date));
  const selected = new Set<number>();

  while (true) {
    await session.render("Выберите даты, которые хотите удалить.", deleteCustomDatesKeyboard(sorted, selected));

    const next = await session.conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === DEL.back) {
      await next.answerCallbackQuery();
      return "back";
    }
    if (data === DEL.done) {
      if (selected.size === 0) {
        await next.answerCallbackQuery({ text: "Выберите хотя бы одну дату для удаления.", show_alert: true });
        continue;
      }
      await next.answerCallbackQuery();
      const toRemove = new Set(
        [...selected].map((i) => sorted[i]).filter((e): e is NonNullable<typeof e> => e !== undefined),
      );
      draft.customDates = entries.filter((e) => !toRemove.has(e));
      await session.persist();
      return "done";
    }
    const idx = parseDelToggle(data);
    if (idx !== null) {
      if (idx >= 0 && idx < sorted.length) {
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
      }
      await next.answerCallbackQuery();
      continue;
    }

    await answerStaleCallback(next);
  }
}
