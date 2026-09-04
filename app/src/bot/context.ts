import type { Context as DefaultContext } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

/**
 * Единственное место, где собирается тип контекста бота. «Флейворы» плагинов
 * навешиваются здесь, а не по месту использования — иначе при добавлении
 * следующего плагина пришлось бы править каждый хендлер.
 *
 * Контекстов два, и путать их нельзя:
 *
 * - `Context` — СНАРУЖИ визарда: обычные хендлеры, features/, композеры. Умеет
 *   `ctx.conversation.enter(...)`.
 * - `ConversationContext` — ВНУТРИ визарда: то, что возвращает
 *   `conversation.wait()`. Войти в диалог из диалога нельзя, поэтому у него
 *   `ctx.conversation` нет вовсе.
 *
 * Функции, вызываемые и оттуда и оттуда (например экраны в features/events-menu.ts),
 * должны принимать `ConversationContext` — он менее требовательный, и внешний
 * контекст ему подходит, а наоборот не работает.
 */
export type Context = ConversationFlavor<DefaultContext>;

export type ConversationContext = DefaultContext;

/** Тип первого аргумента любой conversation-функции. */
export type MyConversation = Conversation<Context, ConversationContext>;
