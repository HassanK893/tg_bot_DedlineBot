import type { MyConversation } from "../../context.js";
import { FIELD_EDIT } from "../../callback-data/edit.js";
import { isCancel } from "../../filters/is-cancel.js";
import { skipUnexpected } from "../../helpers/screen.js";
import { waitPhotoField, waitTextField } from "../../helpers/steps/index.js";
import { cancelOnlyKeyboard } from "../../keyboards/wizard.js";
import { confirmKeyboard, fieldEditGateKeyboard } from "../../keyboards/edit-event.js";
import { escapeHtml } from "../../../utils/html.js";
import * as eventService from "../../../modules/event/event.service.js";
import type { EditSession } from "./session.js";

/**
 * Правка «плоских» полей — трёх текстовых и фото. Расписание они не трогают,
 * поэтому сохраняются точечно через updateScalarFields, а не через persist().
 */

/** Текстовые поля события, редактируемые одним и тем же экраном. */
export type TextFieldKey = "name" | "description" | "reminderText";

type ScalarPatch = Parameters<typeof eventService.updateScalarFields>[2];

/**
 * Гейт мини-экрана правки поля: ждёт «✏️ Редактировать» либо «← Назад».
 * Всё прочее — не тот апдейт: сообщение убираем из чата, чужой callback
 * объясняем алертом и ждём дальше. Общий для текстовых полей и для фото —
 * экран у них разный, а развилка одна и та же.
 */
export async function waitFieldEditGate(conversation: MyConversation): Promise<"go" | "back"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (data === FIELD_EDIT.back || isCancel(data)) {
      if (data) await next.answerCallbackQuery();
      return "back";
    }
    if (data === FIELD_EDIT.go) {
      await next.answerCallbackQuery();
      return "go";
    }
    await skipUnexpected(next);
  }
}

/**
 * Общий паттерн для простых текстовых полей: мини-экран с текущим
 * значением (Редактировать/Назад) → ввод нового значения → подтверждение
 * (Подтвердить/Назад) — ничего не сохраняется без явного подтверждения.
 */
export async function editTextField(session: EditSession, label: string, key: TextFieldKey): Promise<void> {
  while (true) {
    const current = session.draft[key];
    await session.render(
      `Текущее значение — «${label}»: ${current ? escapeHtml(current) : "—"}`,
      fieldEditGateKeyboard("✏️ Редактировать"),
    );

    if ((await waitFieldEditGate(session.conversation)) === "back") return;

    await session.render(`Введите новое значение — «${label}».`, cancelOnlyKeyboard());
    const res = await waitTextField(session.conversation, false);
    if (res.kind !== "text") continue;

    await session.render(
      `Изменить «${label}» на «${escapeHtml(res.value)}»?`,
      confirmKeyboard("✅ Подтвердить", "← Назад"),
    );
    if (await session.waitYesNo()) {
      session.draft[key] = res.value;
      const patch: ScalarPatch = {};
      patch[key] = res.value;
      await session.conversation.external(() => eventService.updateScalarFields(session.eventId, session.userId, patch));
    }
  }
}

/** Тот же паттерн, что editTextField, только приём фото вместо текста. */
export async function editPhotoField(session: EditSession): Promise<void> {
  while (true) {
    const hasPhoto = Boolean(session.draft.photoFileId);
    await session.render(
      `Текущее фото: ${hasPhoto ? "добавлено ✅" : "—"}.`,
      fieldEditGateKeyboard("✏️ Изменить фото"),
    );

    if ((await waitFieldEditGate(session.conversation)) === "back") return;

    await session.render("Пришлите новое фото.", cancelOnlyKeyboard());
    const res = await waitPhotoField(session.conversation);
    if (res.kind !== "photo") continue;

    await session.render(
      "Сохранить это фото как новое изображение события?",
      confirmKeyboard("✅ Подтвердить", "← Назад"),
    );
    if (await session.waitYesNo()) {
      session.draft.photoFileId = res.fileId;
      await session.conversation.external(() =>
        eventService.updateScalarFields(session.eventId, session.userId, { photoFileId: res.fileId }),
      );
    }
  }
}
