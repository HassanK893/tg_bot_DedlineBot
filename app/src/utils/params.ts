/** Express 5 типизирует req.params как string | string[] (репитабельные сегменты) — почти всегда нам нужен просто string. */
export function getParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
