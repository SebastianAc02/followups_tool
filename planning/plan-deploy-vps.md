# Plan: deploy de followups-tool al VPS (dominio público + login) + CI/CD

Estado: PROPUESTO (2026-07-13). Pendiente de aprobar por Sebastián antes de ejecutar.

## Objetivo

Levantar followups-tool en el VPS de Hetzner (co-locado con dario y Evolution),
detrás de un dominio público con HTTPS y login, conectada a Evolution (WhatsApp)
y a dario (Claude), con un pipeline de CI/CD que actualice el server en cada push
a `main` SOLO si el código pasa el gate (tsc + tests + build).

## Decisiones tomadas

- **Exposición:** dominio público + login (Caddy + Let's Encrypt). La tool es el
  ÚNICO servicio público del stack; dario y Evolution siguen solo-Tailscale. Caddy
  es la única puerta pública y termina TLS; detrás, la app exige login (better-auth,
  gate `requireSession` en 18/21 páginas + todos los server actions).
- **Dominio:** se registra hoy (Sebastián). Recomendado Cloudflare (DNS gratis,
  propagación rápida). Registro A → IP pública del VPS, en modo "DNS only".
- **Build del CI:** en el VPS (git pull + docker build). Sin registry por ahora;
  el VPS (8 GB, 67 G libres) tiene de sobra. Migrable a GHCR después.

## Estado del VPS (verificado 2026-07-13)

- Host `ubuntu-8gb-hel1-2` — Hetzner, IP pública `62.238.55.238`, Tailscale `100.71.80.117`.
- SSH `deploy@62.238.55.238` (key `~/.ssh/id_ed25519`) OK.
- Corriendo: `evolution_api/postgres/redis` (:8080), `whatsapp_webhook_catcher`, `dario-gateway` (:3456).
- Red docker `onepay` (external) existe. UFW: solo SSH público. Sin Caddy.
- Disco 67 G libres / RAM 6.7 G disponibles.
- ⚠️ `dario-gateway` lleva días `unhealthy` — verificar `dario doctor` antes de dar OK.

## Arquitectura resultante

```
Internet → dominio → Caddy (:443 público, TLS Let's Encrypt) ─┐
                                                               ↓ red onepay
                                                    followups-web:3000  ── ISPS_DB_PATH=/data/isps.db (volumen)
                                                    followups-worker     ── mismo volumen (SQLite WAL)
                                                               ↑
Evolution (:8080, onepay) ── webhook interno → followups-web:3000/api/webhooks/whatsapp?token=…
dario-gateway (:3456) ────── DARIO_URL desde followups-web/worker
```

Puntos clave de diseño:
- **Caddy es la única puerta pública.** No se expone ningún servicio crudo:
  followups-web solo escucha en la red `onepay`, Caddy lo proxifica. dario y
  Evolution siguen sin puerto público (solo Tailscale / red interna).
- **Web + worker comparten el volumen de la DB (SQLite WAL), no hay blue-green.**
  SQLite tiene un solo escritor; dos contenedores en el mismo volumen del mismo host
  funcionan en WAL, pero dos versiones simultáneas de la app escribiendo la misma DB
  (blue-green) es frágil. Por eso el deploy es un recreate rápido (segundos de blip),
  no zero-downtime real. Consistente con "si se cae, se cae": el gate del CI es lo que
  evita subir código roto, no un balanceador.
- **El webhook de WhatsApp queda interno** (Evolution → followups por la red onepay),
  no pasa por el dominio público. Igual exige `?token=` (WHATSAPP_WEBHOOK_TOKEN).

## Secretos de producción (.env.production, chmod 600, nunca al repo)

| Variable | Valor |
|---|---|
| `BETTER_AUTH_SECRET` | nuevo (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://<dominio>` |
| `APP_BASE_URL` | `https://<dominio>` (reemplaza el ngrok de dev) |
| `FOLLOWUPS_CRYPTO_KEY` | **REUSAR el de dev** — cifra credenciales de conectores guardadas en la DB; si cambia, no se descifran |
| `ISPS_DB_PATH` | `/data/isps.db` |
| `DARIO_URL` | `http://dario-gateway:3456` (tras unir dario a la red onepay) o `http://100.71.80.117:3456` |
| `DARIO_KEY` | el actual |
| `AUTHENTICATION_API_KEY` (Evolution) | el de `~/evolution/.env` del VPS |
| `WHATSAPP_WEBHOOK_TOKEN` | el actual (o rotar) |
| `APOLLO_MAILBOX_ID` | el actual |
| `EVOLUTION_API_BASE_URL` | `http://evolution_api:8080` (nombre del contenedor en la red onepay; sin esto la app cae al default `localhost:8080` = ella misma) |

Nota: las API keys de WhatsApp (Evolution) y Apollo NO son env -- viven cifradas en
la DB (`conector.credencial_ciphertext`), descifradas con `FOLLOWUPS_CRYPTO_KEY`. Por
eso reusar esa llave es lo que las mantiene legibles. El `.env.production` esta
gitignored: los deploys de CI/CD (git pull) NO lo tocan, persiste entre deploys.

## Fases

### Fase 0 — Prep en el repo (código, PR-able, NO necesita dominio) — IA
- `next.config.ts`: agregar `output: "standalone"` (imagen slim). Verificar que el
  `.node` de better-sqlite3 se copia al standalone.
- `Dockerfile` multi-stage (deps → build → runner). better-sqlite3 compila dentro
  de la imagen para la arch del VPS (amd64); el builder necesita `python3`+`make`+`g++`.
- `.dockerignore`.
- `app/api/health/route.ts`: endpoint liviano para Caddy healthcheck y el gate del CI.
- `docker-compose.followups.yml`: servicios `followups-web` (:3000, red onepay,
  volumen DB) y `followups-worker` (misma imagen, `command: node … worker`, mismo volumen).
- `Caddyfile` + servicio `caddy` (público :80/:443, proxy → followups-web:3000).
- Correr `tsc` + `npm test` + `next build` local para dejar el gate verde.

### Fase 1 — Dominio + DNS — Sebastián (+ IA)
- Sebastián registra el dominio (Cloudflare) y crea registro A → `62.238.55.238` (DNS only).
- IA: abrir UFW `80` y `443` en el VPS (`ufw allow 80,443/tcp`).

### Fase 2 — Primer deploy manual — IA (con SSH)
- Copiar `../isps.db` (7.5 MB) al VPS → volumen `followups_data:/data/isps.db`.
  ⚠️ Cutover: desde aquí la DB del VPS es la fuente de la verdad; no seguir editando la del Mac.
- Subir `.env.production` (chmod 600), Caddyfile, compose.
- `docker compose up -d` (web + worker + caddy). Caddy saca el cert Let's Encrypt solo.
- Verificar: `https://<dominio>` muestra login → entrar → worker con heartbeats OK.

### Fase 3 — Cablear WhatsApp + dario — IA
- Unir `dario-gateway` a la red onepay (`docker network connect onepay dario-gateway`).
- Verificar dario desde el contenedor de la tool (`dario doctor` sano primero).
- Re-apuntar el webhook de cada instancia de Evolution de `webhook-catcher:4000`
  a `http://followups-web:3000/api/webhooks/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>`.
- Apagar (no borrar) `webhook-catcher` del compose de Evolution.
- Prueba E2E: un inbound de WhatsApp entra al webhook; una llamada a Claude pasa por dario.

### Fase 4 — CI/CD (GitHub Actions) — IA
- Workflow en push a `main`:
  - **Job gate:** `npm ci` → `tsc --noEmit` → `npm test` → `next build`. Si algo falla, PARA.
  - **Job deploy (solo si gate verde):** SSH al VPS → `git pull` → `docker compose build
    followups-web followups-worker` → `docker compose up -d`. Caddy sigue arriba; blip corto
    solo en el swap de la app.
- Secrets de GitHub: `VPS_SSH_KEY` (deploy key dedicada), `VPS_HOST`.
- El gate es la garantía de "no meter código que tire el server".

## Riesgos / flags
- `FOLLOWUPS_CRYPTO_KEY` debe reusarse o las credenciales cifradas en la DB no abren.
- Cutover de DB: la del VPS pasa a ser la fuente; el dev local diverge.
- Caddy en 80/443 públicos es la puerta intencional; los servicios crudos siguen internos.
- `dario-gateway` unhealthy: resolver antes de dar el deploy por bueno (la tool depende de él).
- better-sqlite3 nativo: el builder de Docker necesita toolchain de compilación.

## Lo que necesito de Sebastián para arrancar
1. Registrar el dominio hoy y darme el nombre exacto + IP a apuntar (A → 62.238.55.238).
2. Confirmar reusar `FOLLOWUPS_CRYPTO_KEY` de dev en prod (sí/no).
3. OK para empezar Fase 0 (código en el repo) YA, en paralelo al registro del dominio.
