# Двухстадийная сборка.
#
# Стадия `build` — «толстая»: в ней есть исходники, компилятор и Prisma CLI.
# Из неё же docker-compose.prod.yml поднимает одноразовый сервис `migrate`,
# который прогоняет миграции перед стартом приложения.
#
# Стадия `runtime` — то, что реально крутится на сервере: только
# скомпилированный dist и зависимости без devDependencies. Prisma CLI сюда
# НЕ попадает намеренно: он тянет за собой Prisma Studio (react-dom, @visx,
# elkjs, typescript и прочее) — больше 300 МБ, которые приложению в рантайме
# не нужны ни на секунду.

# ---- стадия 1: сборка + миграции --------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# ВАЖНО: NODE_ENV=production здесь НЕ ставим. Если выставить его до `npm ci`,
# npm молча пропустит devDependencies (typescript, @types/*, сам prisma CLI),
# и сборка упадёт на компиляции.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma.config.ts требует непустой DATABASE_URL даже просто для генерации
# клиента (реального подключения при этом не происходит). Плейсхолдер живёт
# только на время сборки; в рантайме реальный DATABASE_URL приходит через
# env_file в docker-compose.prod.yml и переопределяет его.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npx tsc
# generator в schema.prisma пишет клиент в src/generated — tsconfig.json
# сознательно исключает эту папку из компиляции (это уже готовый JS, не
# исходники), поэтому после tsc её нужно скопировать в dist вручную.
RUN cp -r src/generated dist/src/generated

# ---- стадия 2: рантайм -------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Отдельная чистая установка только production-зависимостей — не копируем
# node_modules из стадии build, там лежит вся сборочная обвязка.
#
# --omit=optional здесь принципиален: @prisma/client объявляет `prisma` и
# `typescript` как ОПЦИОНАЛЬНЫЕ peerDependencies, а npm по умолчанию ставит их
# всё равно — и вместе с prisma CLI приезжает Prisma Studio со своим
# React-интерфейсом. Без этого флага node_modules весит 382 МБ вместо 108 МБ.
# Именно --omit=optional, а не --omit=peer: npm помечает в package-lock.json
# флагом peer:true в том числе grammy/ioredis/pg — они у нас прямые
# зависимости, но одновременно чьи-то peer'ы, и --omit=peer их бы вырезал.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

COPY --from=build /app/dist ./dist

# Запускаем не через npm, а напрямую node — чтобы сигналы SIGTERM от Docker
# доходили до процесса и отрабатывал graceful shutdown в prod.ts.
EXPOSE 3000
CMD ["node", "dist/src/prod.js"]
