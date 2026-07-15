# ---- deps: dependencias completas (incluye devDependencies, hacen falta para build) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compila la app ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# app/db/index.ts abre la conexión SQLite en la carga del módulo (side effect al
# importar, no dentro de un handler). `next build` recolecta metadata de cada ruta
# en varios procesos en paralelo -- un archivo compartido (/tmp/build.db) los hace
# pelear por el lock de WAL (SQLITE_BUSY). ":memory:" le da a cada proceso su propia
# base aislada, sin archivo ni lock que compartir. Se descarta al terminar este
# stage; la ruta real la pone .env.production en runtime.
ENV ISPS_DB_PATH=:memory:
# Misma razon para pruebas.db (modo prueba abre las dos bases al cargar el modulo). Sin
# esto el default apunta a una ruta del Mac que no existe en la imagen y el build muere.
ENV PRUEBAS_DB_PATH=:memory:
# Techo de heap: el VPS tiene 7.6GB y CERO swap, compartidos con Evolution/Postgres/dario.
# Sin techo, un pico del build se lo lleva el OOM killer del kernel, que no mata al build
# sino al daemon de Docker -- y con el, TODOS los contenedores del host (caido el
# 2026-07-15). Acotado, si no cabe revienta el build y produccion sigue viva.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ---- runner: imagen final. Un solo runtime para dos procesos (web y worker): el
# worker corre TS crudo con --experimental-strip-types, no pasa por el bundler de
# Next, así que necesita el árbol completo + node_modules completo, no una carpeta
# podada tipo "output: standalone". docker-compose decide cuál arranca con `command:`.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
