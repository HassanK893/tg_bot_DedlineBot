import { Context, InlineKeyboard } from "grammy";

export function mainMenuText(name: string): string {
  return `Добро пожаловать, ${name}!\n\nЧто хотите сделать?`;
}

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Мои события", "menu:list")
    .row()
    .text("➕ Создать событие", "menu:create")
    .row()
    .text("⚙️ Часовой пояс", "menu:timezone");
}

/**
 * chatId -> message_id последнего отправленного/зафиксированного главного
 * меню — /start, /menu и финальный экран онбординга каждый раз производят
 * НОВОЕ сообщение с меню; старые копии оставались кликабельными и путали
 * (кнопки будто не реагируют, если в этот момент открыт другой диалог). При
 * появлении нового меню гасим кнопки предыдущего. In-memory: не переживает
 * рестарт бота, но это лишь косметика — самый первый «потерянный» дубликат
 * после рестарта просто не погасится.
 */
const lastMainMenuMessage = new Map<number, number>();

export function markMainMenuMessage(chatId: number, messageId: number): void {
  lastMainMenuMessage.set(chatId, messageId);
}

export async function staleOldMainMenu(ctx: Context, chatId: number): Promise<void> {
  const prevId = lastMainMenuMessage.get(chatId);
  if (prevId === undefined) return;
  try {
    await ctx.api.editMessageText(
      chatId,
      prevId,
      "Меню устарело — используйте актуальное сообщение ниже 👇",
      { reply_markup: { inline_keyboard: [] } },
    );
  } catch {
    // старое сообщение уже недоступно/удалено — не критично
  }
}
