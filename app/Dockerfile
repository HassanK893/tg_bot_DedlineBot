# Трёхстадийная сборка, но `npm ci` выполняется РОВНО ОДИН раз.
#
# Стадия `build` — «толстая»: исходники, компилятор и Prisma CLI. Из неё же
# docker-compose.prod.yml поднимает одноразовый сервис `migrate`.
# Стадия `proddeps` — та же папка node_modules, из которой вычищено всё
# сборочное.
# Стадия `runtime` — то, что реально крутится: dist + чистые зависимости.
#
# Почему не две независимые установки (`npm ci` в build и `npm ci --omit=dev`
# в runtime): BuildKit собирает стадии параллельно, и два npm ci одновременно
# на скромном VPS с нестабильной сетью падают с «Exit handler never called!».
# Здесь runtime зависит от proddeps, а proddeps — от build, поэтому установка
# идёт одна и строго последовательно. Плюс `npm prune` работает офлайн, без
# единого запроса в сеть.

# ---- стадия 1: сборка + миграции --------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Дефолтные таймауты npm рассчитаны на хорошую связь. На VPS с плохим каналом
# обрыв одного запроса роняет всю установку, поэтому просим повторять.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm config set maxsockets 8

# ВАЖНО: NODE_ENV=production здесь НЕ ставим. Если выставить его до `npm ci`,
# npm молча пропустит devDependencies (typescript, @types/*, сам prisma CLI),
# и сборка упадёт на компиляции.
# --no-audit --no-fund убирают два лишних сетевых запроса после установки.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

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

# ---- стадия 2: зависимости для рантайма ---------------------------------------
FROM build AS proddeps

# Вычищаем из уже установленного node_modules всё, что нужно было только для
# сборки. Ни одного обращения в сеть — просто удаление лишних папок.
#
# --omit=optional здесь принципиален: @prisma/client объявляет `prisma` и
# `typescript` как ОПЦИОНАЛЬНЫЕ peerDependencies, а npm ставит их всё равно —
# и вместе с prisma CLI приезжает Prisma Studio со своим React-интерфейсом.
# Без этого флага остаётся 397 МБ вместо 108 МБ.
# Именно --omit=optional, а не --omit=peer: npm помечает в package-lock.json
# флагом peer:true в том числе grammy/ioredis/pg — они у нас прямые
# зависимости, но одновременно чьи-то peer'ы, и --omit=peer их бы вырезал.
RUN npm prune --omit=dev --omit=optional

# ---- стадия 3: рантайм -------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Запускаем не через npm, а напрямую node — чтобы сигналы SIGTERM от Docker
# доходили до процесса и отрабатывал graceful shutdown в prod.ts.
EXPOSE 3000
CMD ["node", "dist/src/prod.js"]
