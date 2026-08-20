/**
 * @prisma/adapter-pg публикует типы, но под moduleResolution "bundler" они не
 * резолвятся из-за package.json "exports" — та же история, что уже была с
 * express-fileupload/scan-каркасом. Не блокируем компиляцию всего проекта
 * из-за стороннего пакета.
 */
declare module "@prisma/adapter-pg";
