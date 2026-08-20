/** Экранирует спецсимволы HTML — обязательно перед вставкой пользовательского текста в сообщение с parse_mode: "HTML". */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
