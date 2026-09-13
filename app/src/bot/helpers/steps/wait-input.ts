import type { MyConversation } from "../../context.js";
import { STEP_SKIP } from "../../callback-data/wizard.js";
import { isCancel } from "../../filters/is-cancel.js";
import { skipUnexpected, tryDelete } from "../screen.js";

/**
 * Примитивы ожидания ответа пользователя — самый нижний слой шагов визарда.
 * Ничего не рисуют (экран к этому моменту уже перерисован вызывающим кодом),
 * только крутятся в цикле, пока не придёт апдейт нужного вида, а всё лишнее
 * убирают через skipUnexpected.
 */

export type TextFieldResult = { kind: "text"; value: string } | { kind: "skip" } | { kind: "cancel" };

export async function waitTextField(
  conversation: MyConversation,
  allowSkip: boolean,
): Promise<TextFieldResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (allowSkip && data === STEP_SKIP) {
      await next.answerCallbackQuery();
      return { kind: "skip" };
    }
    const text = next.message?.text?.trim();
    if (text && !text.startsWith("/")) {
      await tryDelete(next);
      return { kind: "text", value: text };
    }
    // сюда попадает и команда вроде /test — она отсеяна проверкой выше, иначе
    // событие можно было бы случайно назвать "/test"
    await skipUnexpected(next);
  }
}

export type PhotoFieldResult = { kind: "photo"; fileId: string } | { kind: "skip" } | { kind: "cancel" };

export async function waitPhotoField(conversation: MyConversation): Promise<PhotoFieldResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (data === STEP_SKIP) {
      await next.answerCallbackQuery();
      return { kind: "skip" };
    }
    const photo = next.message?.photo?.at(-1);
    if (photo) {
      await tryDelete(next);
      return { kind: "photo", fileId: photo.file_id };
    }
    await skipUnexpected(next);
  }
}

export type ChoiceResult = { kind: "choice"; value: string } | { kind: "cancel" };

/** Тап по одной из заранее известных кнопок (options — их callback_data). */
export async function waitChoice(conversation: MyConversation, options: string[]): Promise<ChoiceResult> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return { kind: "cancel" };
    }
    if (data && options.includes(data)) {
      await next.answerCallbackQuery();
      return { kind: "choice", value: data };
    }
    await skipUnexpected(next);
  }
}

/**
 * Ждёт тап по кнопке, callback_data которой подходит под pattern с одной
 * захватывающей группой-числом. Один цикл на «раз в N часов/дней/недель/
 * месяцев» (buildNumberPicker) и на выбор дня недели (buildWeekdayPicker) —
 * отличались они только шаблоном.
 */
export async function waitNumericPick(conversation: MyConversation, pattern: RegExp): Promise<number | "cancel"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data) {
      const match = data.match(pattern);
      if (match) {
        await next.answerCallbackQuery();
        return Number(match[1]);
      }
    }
    await skipUnexpected(next);
  }
}
