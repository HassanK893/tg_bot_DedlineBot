# Один слой с devDependencies (включая prisma CLI) — нужен на старте контейнера
# для `prisma migrate deploy`. На масштабе одного VPS размер образа не критичен,
# а раздельная сборка runtime-без-devDeps добавляет риск (prisma CLI пропадает).
FROM node:22-alpine
WORKDIR /app

# ВАЖНО: NODE_ENV=production ставим только в конце, после npm ci — если
# выставить его раньше, npm молча пропускает devDependencies (typescript,
# @types/*, сам prisma CLI), из-за чего сборка либо падает на компиляции,
# либо на старте контейнера не находит `prisma` для миграций.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma.config.ts требует непустой DATABASE_URL даже просто для генерации
# клиента (без реального подключения) — реальный придёт в контейнер через
# env_file в рантайме и переопределит этот плейсхолдер.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npx tsc
# generator в schema.prisma пишет клиент в src/generated — tsconfig.json
# сознательно исключает эту папку из компиляции (это уже готовый JS, не
# исходники), поэтому после tsc её нужно скопировать в dist вручную.
RUN cp -r src/generated dist/src/generated

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/prod.js"]
