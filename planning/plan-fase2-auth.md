# Fase 2 · Auth (B3) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Better Auth email+password sobre la misma isps.db; sin sesión no se ve nada; el owner de la cola y de las escrituras sale de la sesión; alta de Sebastián y Felipe con flag admin.

**Architecture:** Auth es un ADAPTADOR (B3): vive en `app/lib/auth.ts` + tablas propias en isps.db; el core (`app/db/repository.ts`, validation, schema de dominio) no importa better-auth ni cambia una línea. La identidad cruza la frontera solo como datos planos (`email`, `owner`, `admin`) vía un helper de sesión. El gate es por página y por server action (patrón seguro en Next 16; no se usa middleware/proxy).

**Tech Stack:** Next.js 16 (App Router), better-auth (drizzle adapter, sqlite), Drizzle + better-sqlite3, node --test para pruebas. Sin Tailwind: CSS a mano en globals.css.

**Decisión que este plan fija (refinamiento de B3):** B3 decía "identidad = email = owner", pero en isps.db la columna `empresa.owner` guarda NOMBRES ("Sebastian Acosta Molina", "Felipe Castro"), no emails, y la tabla maestra no se migra (CLAUDE.md). El mapeo vive en el usuario de auth: campo adicional `owner` (string exacto de `empresa.owner`) en la tabla `user`. El Repository sigue recibiendo `owner: string` como parámetro; no sabe que existe auth.

**Contexto de lectura previa (regla de tasks-v2.md):** CLAUDE.md, sección Fase 2 de plan-claude-v2.md, B3 en funcionalidades-v2.md (líneas 344-358). Skills de routing: api-patterns + database; testing antes de cerrar.

**Nota de alcance (B1.c, agregada 2026-07-04):** `empresa.owner` (lo que esta fase lee de
la sesión) es atribución a nivel PERSONA. El 89% de empresas no tiene owner (frío nunca
tocado); eso ya pasa hoy y esta fase no lo cambia: esas empresas simplemente no aparecen en
ninguna cola personal. La atribución de campañas masivas (`campana.owner`) es un concepto
aparte que se construye en Fase 4, no aquí. Detalle completo en `plan-claude-v2.md` B1.c.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| Create `app/lib/auth.ts` | Instancia servidor de Better Auth (el adaptador) |
| Create `app/db/auth-schema.ts` | Schema Drizzle de las tablas de auth (generado por CLI) |
| Create `scripts/migrate_auth_dryrun.py` / `_apply.py` | Migración de tablas auth, patrón dry-run + apply idempotente |
| Create `app/api/auth/[...all]/route.ts` | Handler HTTP de auth |
| Create `app/lib/auth-client.ts` | Cliente React (login/logout) |
| Create `app/lib/session-user.ts` | Mapeo puro sesión -> {email, owner, admin} (testeable sin Next) |
| Create `app/lib/session-user.test.ts` | Pruebas del mapeo |
| Create `app/lib/session.ts` | `requireSession()`: gate con redirect (usa next/headers) |
| Create `app/login/page.tsx` + `app/login/LoginForm.tsx` | Pantalla de login |
| Create `app/SignOutButton.tsx` | Botón de salir en la cabecera |
| Create `scripts/seed_auth_users.ts` | Alta de Sebastián y Felipe + flag admin |
| Modify `app/db/index.ts` | Mergear auth-schema en la instancia drizzle |
| Modify `app/page.tsx`, `app/actions.ts`, `app/llamada/[id]/page.tsx`, `app/llamada/[id]/actions.ts` | Gate + owner desde la sesión |
| Modify `package.json` | Dependencia better-auth + glob de tests a app/lib |
| Modify `planning/tasks-v2.md`, `planning/planeacion-ejecucion.md`, `planning/CONTINUAR-IMPLEMENTACION.md` | Cierre de fase |

---

### Task 0: Rama de trabajo

- [ ] **Step 1: Crear la rama**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool
git checkout -b fase2-auth
```

---

### Task 1: V2.1a · Instalar Better Auth y crear la instancia servidor

**Files:**
- Create: `app/lib/auth.ts`
- Modify: `package.json` (dependencia)
- Create: `.env.local` (gitignored, `.env*` ya está en .gitignore línea 34)

- [ ] **Step 1: Instalar la dependencia (justificada en B3, única nueva de la fase)**

```bash
npm install better-auth
```

- [ ] **Step 2: Variables de entorno**

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
echo "BETTER_AUTH_URL=http://localhost:3000" >> .env.local
```

Verificar que NO queda trackeado: `git status --short` no debe listar `.env.local`.

- [ ] **Step 3: Crear `app/lib/auth.ts`**

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index';

// Adaptador de auth (B3). El core no importa este archivo: la identidad entra a la app
// solo como datos planos (email, owner, admin) via app/lib/session.ts.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    // Alta de usuarios solo por script (V2.3). Sin ALLOW_SIGNUP=1 nadie se registra solo.
    disableSignUp: process.env.ALLOW_SIGNUP !== '1',
  },
  user: {
    additionalFields: {
      // Valor EXACTO de empresa.owner en isps.db ("Sebastian Acosta Molina").
      // B3 decia owner=email, pero la columna owner guarda nombres y la tabla maestra
      // no se migra; el mapeo vive aqui. input:false: no se setea desde el cliente.
      owner: { type: 'string', required: false, input: false },
      admin: { type: 'boolean', defaultValue: false, input: false },
    },
  },
});
```

- [ ] **Step 4: Generar el schema de auth con la CLI**

```bash
npx @better-auth/cli@latest generate --config app/lib/auth.ts --output app/db/auth-schema.ts
```

Expected: crea `app/db/auth-schema.ts` con las tablas `user`, `session`, `account`, `verification` en sintaxis Drizzle sqlite, incluyendo las columnas adicionales `owner` y `admin` en `user`. Si la CLI pide confirmación, aceptar. Si falla por el import de `../db/index` (ESM/paths), correrla con `npx @better-auth/cli@latest generate` a secas desde la raíz y pasarle la ruta cuando la pida.

- [ ] **Step 5: Mergear el schema de auth en la instancia drizzle**

En `app/db/index.ts` (el drizzle adapter resuelve sus tablas desde el schema de la instancia):

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';

// isps.db es la fuente de la verdad (un nivel arriba del proyecto).
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } });
export { schema };
```

- [ ] **Step 6: Compilar y commitear**

```bash
npx tsc --noEmit
```

Expected: sin errores.

```bash
git add package.json package-lock.json app/lib/auth.ts app/db/auth-schema.ts app/db/index.ts
git commit -m "V2.1: instala Better Auth, instancia servidor y schema drizzle de auth"
```

---

### Task 2: V2.1b · Migración de tablas auth + handler montado

**Files:**
- Create: `scripts/migrate_auth_dryrun.py`
- Create: `scripts/migrate_auth_apply.py`
- Create: `app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Transcribir el DDL desde `app/db/auth-schema.ts` a los scripts de migración**

REGLA: el archivo generado es la fuente; los nombres de tabla y columna del DDL se copian
de ahí, no de este plan (la CLI puede emitir camelCase o snake_case según versión). El DDL
esperado tiene esta forma (ajustar nombres al generado):

```sql
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" integer NOT NULL,
  "image" text,
  "createdAt" integer NOT NULL,
  "updatedAt" integer NOT NULL,
  "owner" text,
  "admin" integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expiresAt" integer NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" integer NOT NULL,
  "updatedAt" integer NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" integer,
  "refreshTokenExpiresAt" integer,
  "scope" text,
  "password" text,
  "createdAt" integer NOT NULL,
  "updatedAt" integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" integer NOT NULL,
  "createdAt" integer NOT NULL,
  "updatedAt" integer NOT NULL
);
```

`scripts/migrate_auth_dryrun.py` (patrón de migrate_f0: idempotente por catálogo, ruta configurable):

```python
#!/usr/bin/env python3
"""Dry-run: muestra que tablas de auth (Better Auth) faltan en isps.db. No escribe nada."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS_AUTH = ["user", "session", "account", "verification"]

def main():
    con = sqlite3.connect(DB_PATH)
    existentes = {
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    for t in TABLAS_AUTH:
        estado = "YA EXISTE (no se toca)" if t in existentes else "SE CREARIA"
        print(f"  {t}: {estado}")
    con.close()

if __name__ == "__main__":
    main()
```

`scripts/migrate_auth_apply.py` (el DDL de la constante `DDL` se transcribe del
auth-schema.ts generado; los `CREATE TABLE IF NOT EXISTS` lo hacen idempotente):

```python
#!/usr/bin/env python3
"""Apply: crea las tablas de auth (Better Auth) en isps.db. Idempotente."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS_AUTH = ["user", "session", "account", "verification"]

# Transcrito de app/db/auth-schema.ts (generado por la CLI de Better Auth).
DDL = """
CREATE TABLE IF NOT EXISTS "user" ( ... );
CREATE TABLE IF NOT EXISTS "session" ( ... );
CREATE TABLE IF NOT EXISTS "account" ( ... );
CREATE TABLE IF NOT EXISTS "verification" ( ... );
"""  # <- aqui va el DDL completo del Step 1, columna por columna del archivo generado

def main():
    con = sqlite3.connect(DB_PATH)
    try:
        con.executescript(DDL)  # executescript maneja su propia transaccion
        for t in TABLAS_AUTH:
            cols = con.execute(f'PRAGMA table_info("{t}")').fetchall()
            print(f"  {t}: {len(cols)} columnas -> {[c[1] for c in cols]}")
    finally:
        con.close()

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Correr dry-run, luego apply, luego apply otra vez (idempotencia)**

```bash
python3 scripts/migrate_auth_dryrun.py
python3 scripts/migrate_auth_apply.py
python3 scripts/migrate_auth_apply.py
```

Expected: el dry-run lista las 4 tablas como SE CREARIA; el primer apply las crea; el
segundo no falla y no duplica. Verificar contra la DB real:

```bash
sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db ".tables" | grep -E "user|session|account|verification"
```

- [ ] **Step 3: Montar el handler HTTP**

Create `app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '../../../lib/auth';

export const { POST, GET } = toNextJsHandler(auth);
```

- [ ] **Step 4: Verificar que el server arranca con auth montado (criterio de cierre V2.1)**

```bash
npm run dev
```

En otra terminal:

```bash
curl -s http://localhost:3000/api/auth/ok
```

Expected: `{"ok":true}`.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate_auth_dryrun.py scripts/migrate_auth_apply.py "app/api/auth/[...all]/route.ts"
git commit -m "V2.1: tablas de auth en isps.db (dry-run + apply) y handler montado"
```

**V2.1 lista cuando:** las tablas de auth existen en isps.db y el server arranca con auth montado. ✔ marcar en tasks-v2.md.

---

### Task 3: V2.2a · Mapeo de sesión (TDD) + pantalla de login

**Files:**
- Create: `app/lib/session-user.ts`
- Create: `app/lib/session-user.test.ts`
- Create: `app/lib/session.ts`
- Create: `app/lib/auth-client.ts`
- Create: `app/login/page.tsx`, `app/login/LoginForm.tsx`
- Modify: `package.json` (glob de tests)

- [ ] **Step 1: Escribir la prueba que falla** — `app/lib/session-user.test.ts`

El mapeo es puro (sin next/headers) para poder probarlo con node --test:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usuarioDeSesion } from './session-user.ts';

test('usa el campo owner cuando existe', () => {
  const u = usuarioDeSesion({
    email: 'sacostamolin@gmail.com',
    name: 'Sebastián Acosta',
    owner: 'Sebastian Acosta Molina',
    admin: true,
  });
  assert.equal(u.owner, 'Sebastian Acosta Molina');
  assert.equal(u.admin, true);
});

test('cae al name si owner viene vacio (usuario sin mapear)', () => {
  const u = usuarioDeSesion({ email: 'x@y.co', name: 'Felipe Castro', owner: null, admin: null });
  assert.equal(u.owner, 'Felipe Castro');
  assert.equal(u.admin, false);
});
```

- [ ] **Step 2: Ampliar el glob de tests y verificar que falla**

En `package.json`:

```json
"test": "node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/*.test.ts app/lib/*.test.ts"
```

```bash
npm test
```

Expected: FAIL (module `./session-user.ts` not found).

- [ ] **Step 3: Implementación mínima** — `app/lib/session-user.ts`

```ts
// Mapeo puro del usuario de Better Auth a lo unico que la app necesita saber de la
// identidad. El resto del codigo (paginas, actions) consume ESTE tipo, nunca el objeto
// de better-auth: la frontera del adaptador queda aqui.
export type UsuarioSesion = { email: string; owner: string; admin: boolean };

export function usuarioDeSesion(user: {
  email: string;
  name: string;
  owner?: string | null;
  admin?: boolean | null;
}): UsuarioSesion {
  return {
    email: user.email,
    // owner mapea a empresa.owner (nombres, no emails). Fallback al name para un
    // usuario nuevo sin mapear: ve una cola vacia, no la de otro.
    owner: user.owner ?? user.name,
    admin: Boolean(user.admin),
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm test
```

Expected: PASS (los 8 tests previos + 2 nuevos, 10/10).

- [ ] **Step 5: El gate con redirect** — `app/lib/session.ts`

```ts
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0]);
}
```

- [ ] **Step 6: Cliente de auth** — `app/lib/auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
```

- [ ] **Step 7: Pantalla de login**

`app/login/page.tsx` (server: si ya hay sesión, a la cola):

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');
  return (
    <div className="wrap login-wrap">
      <div className="h-title">Follow-ups OnePay</div>
      <LoginForm />
    </div>
  );
}
```

`app/login/LoginForm.tsx` (client, estilo con clases de globals.css, sin Tailwind):

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../lib/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setEnviando(false);
    if (error) {
      setError('Correo o password incorrectos');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <input name="email" type="email" placeholder="Correo" required autoFocus />
      <input name="password" type="password" placeholder="Password" required />
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
```

Agregar al final de `app/globals.css` (siguiendo las variables existentes):

```css
/* Login (V2.2) */
.login-wrap { max-width: 360px; padding-top: 18vh; }
.login-form { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.login-form input {
  padding: 10px 12px; border: 1px solid var(--line-strong);
  border-radius: 8px; background: var(--surface); font: inherit; color: var(--ink);
}
.login-error { color: #b3261e; font-size: 13px; }
```

(Verificar los nombres de variables contra globals.css real; usar los que existan.)

- [ ] **Step 8: Compilar y commitear**

```bash
npx tsc --noEmit && npm test
git add app/lib/session-user.ts app/lib/session-user.test.ts app/lib/session.ts app/lib/auth-client.ts app/login/ app/globals.css package.json
git commit -m "V2.2: mapeo de sesion con pruebas y pantalla de login"
```

---

### Task 4: V2.2b · Gate en páginas y actions + owner desde la sesión

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/actions.ts`
- Modify: `app/llamada/[id]/page.tsx`
- Modify: `app/llamada/[id]/actions.ts`
- Create: `app/SignOutButton.tsx`

- [ ] **Step 1: Botón de salir** — `app/SignOutButton.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { authClient } from './lib/auth-client';

export default function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  return (
    <button
      className="signout"
      title={email}
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
```

CSS (globals.css):

```css
.signout { background: none; border: none; color: var(--ink); opacity: .5; cursor: pointer; font: inherit; }
.signout:hover { opacity: 1; }
```

- [ ] **Step 2: `app/page.tsx` — gate + owner de la sesión**

Cambios exactos sobre el archivo actual:

1. Import nuevo: `import { requireSession } from "./lib/session";` y `import SignOutButton from "./SignOutButton";`
2. En `Home`, reemplazar la resolución del owner:

```tsx
export default async function Home({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0].
  const owner = sp.owner ?? usuario.owner;
  const esPropia = owner === usuario.owner;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const contadores = contadoresHoy(hoy, owner);
```

3. En `.h-meta` agregar el botón: `<SignOutButton email={usuario.email} />` junto al conteo.
4. El form de repartir: quitar `<input type="hidden" name="owner" ...>` (el action lo toma de la sesión) y renderizarlo solo si `esPropia` (`{esPropia && (<form ...>...</form>)}`): repartir solo reparte lo TUYO.
5. El array `OWNERS` se queda como está (switcher de vista compartida, v1).

- [ ] **Step 3: `app/actions.ts` — owner de la sesión, no del form**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repartirFollowups, registrarToque } from "./db/repository";
import { plusDias } from "./lib/date-utils";
import { requireSession } from "./lib/session";

export async function repartirAction(formData: FormData) {
  // El owner viene de la sesion (V2.2): nadie reparte los follow-ups de otro.
  const { owner } = await requireSession();
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);

  repartirFollowups(owner, porDia);

  revalidatePath("/");
  redirect("/");
}
```

En `registrarTapAction`, agregar como primera línea del cuerpo:

```ts
  await requireSession();
```

(el toque no lleva owner directo; el gate alcanza).

- [ ] **Step 4: Gate en la ficha de llamada**

`app/llamada/[id]/page.tsx`: agregar `import { requireSession } from "../../lib/session";` y `await requireSession();` como primera línea del componente de página (es async server component).

`app/llamada/[id]/actions.ts`: agregar `import { requireSession } from "../../lib/session";` y `await requireSession();` como primera línea de `registrarToqueAction`.

- [ ] **Step 5: Verificación en vivo (criterio V2.2)**

```bash
npx tsc --noEmit && npm test
npm run dev
```

Checks manuales (aún sin usuarios: el redirect es lo verificable ahora):
- `http://localhost:3000/` sin sesión -> redirige a `/login`.
- `http://localhost:3000/llamada/cualquier-id` sin sesión -> redirige a `/login`.
- `curl -s -X POST http://localhost:3000/` (server action sin sesión) no escribe nada.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/actions.ts "app/llamada/[id]/page.tsx" "app/llamada/[id]/actions.ts" app/SignOutButton.tsx app/globals.css
git commit -m "V2.2: gate de sesion en paginas y actions; owner sale de la sesion"
```

**V2.2 lista cuando:** sin login redirige; con login la cola filtra por el owner de la sesión. ✔ marcar en tasks-v2.md (la mitad "con login" se demuestra al cerrar V2.3, cuando existan usuarios).

---

### Task 5: V2.3 · Alta de Sebastián y Felipe + flag admin

**Files:**
- Create: `scripts/seed_auth_users.ts`

- [ ] **Step 1: Script de alta** — `scripts/seed_auth_users.ts`

Passwords y email de Felipe por variable de entorno, NUNCA hardcodeados ni en el repo.
El UPDATE directo de owner/admin es tooling de ops (mismo estatus que los scripts Python
existentes), no código de producto: additionalFields con `input:false` no se pueden setear
por signUp, que es justo lo que queremos.

```ts
import Database from 'better-sqlite3';
import { auth } from '../app/lib/auth.ts';

const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// owner = valor EXACTO de empresa.owner en isps.db.
const USUARIOS = [
  {
    email: process.env.SEED_EMAIL_SEBASTIAN ?? 'sacostamolin@gmail.com',
    nombre: 'Sebastián Acosta',
    owner: 'Sebastian Acosta Molina',
    admin: 1,
    passwordEnv: 'SEED_PASSWORD_SEBASTIAN',
  },
  {
    email: process.env.SEED_EMAIL_FELIPE ?? '',
    nombre: 'Felipe Castro',
    owner: 'Felipe Castro',
    admin: 0,
    passwordEnv: 'SEED_PASSWORD_FELIPE',
  },
];

async function main() {
  const db = new Database(DB_PATH);
  for (const u of USUARIOS) {
    const password = process.env[u.passwordEnv];
    if (!u.email || !password) {
      console.error(`Falta ${u.passwordEnv} o el email de ${u.nombre}. No se crea.`);
      continue;
    }
    try {
      await auth.api.signUpEmail({ body: { email: u.email, password, name: u.nombre } });
      console.log(`Creado: ${u.email}`);
    } catch (e) {
      console.log(`${u.email} ya existia o fallo el alta: ${(e as Error).message}`);
    }
    // owner y admin son input:false: solo se setean aqui, nunca desde el cliente.
    const r = db
      .prepare('UPDATE "user" SET "owner" = ?, "admin" = ? WHERE "email" = ?')
      .run(u.owner, u.admin, u.email);
    console.log(`  owner/admin seteados (${r.changes} fila)`);
  }
  db.close();
}

main();
```

(Ajustar los nombres de columna `owner`/`admin` a los del auth-schema.ts generado, igual que en la migración.)

- [ ] **Step 2: Correr el alta**

```bash
ALLOW_SIGNUP=1 \
SEED_PASSWORD_SEBASTIAN='<password de Sebastian>' \
SEED_EMAIL_FELIPE='<email de Felipe>' \
SEED_PASSWORD_FELIPE='<password de Felipe>' \
node --env-file=.env.local --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_auth_users.ts
```

Expected: `Creado: ...` dos veces y `owner/admin seteados (1 fila)` para cada uno.
NOTA: los passwords y el email de Felipe los define Sebastián al ejecutar; no van en
ningún archivo.

- [ ] **Step 3: Verificar contra la DB**

```bash
sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db \
  'SELECT email, owner, admin FROM "user";'
```

Expected: 2 filas, Sebastián con admin=1.

- [ ] **Step 4: Verificar login en vivo (criterio V2.3 + la demo de V2.2)**

Con `npm run dev` corriendo: login con cada usuario; la cola por defecto es la del owner de
la sesión (Sebastián ve la suya, Felipe la suya); el switcher sigue permitiendo mirar la del
otro; "Salir" vuelve al login. Intento de signup por API debe fallar (disableSignUp):

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"intruso@x.co","password":"12345678","name":"Intruso"}'
```

Expected: error (signup deshabilitado), no crea fila en `user`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed_auth_users.ts
git commit -m "V2.3: alta de usuarios dia 1 por script con owner y flag admin"
```

**V2.3 lista cuando:** ambos entran con su password; el flag admin se lee de la sesión (queda expuesto en `UsuarioSesion.admin`, consumidor real en Fase 7). ✔ marcar en tasks-v2.md.

---

### Task 6: V2.4 · Cierre de fase (pruebas + demo + /code-review + bitácora)

**Files:**
- Modify: `planning/tasks-v2.md` (checkboxes V2.1-V2.4)
- Modify: `planning/planeacion-ejecucion.md` (bitácora + gate de fase)
- Modify: `planning/CONTINUAR-IMPLEMENTACION.md` (próxima acción -> Fase 3, V3.1)

- [ ] **Step 1: Suite completa y tipos**

```bash
npm test && npx tsc --noEmit
```

Expected: 10/10 PASS, tsc limpio.

- [ ] **Step 2: Demo de cierre (la de plan-claude-v2.md)**

"Login de Sebastián y Felipe; sin sesión no se ve nada": recorrer los checks de Task 5
Step 4 de corrido y anotar el resultado en la bitácora.

- [ ] **Step 3: /code-review (CodeRabbit, patrón del cierre de Fase 1)**

Correr la review sobre la rama, corregir hallazgos reales, documentar falsos positivos.

- [ ] **Step 4: Actualizar planning**

- `tasks-v2.md`: marcar V2.1 a V2.4 con la nota de qué se decidió (mapeo owner por campo
  adicional, no email; alta por script con ALLOW_SIGNUP).
- `planeacion-ejecucion.md`: bitácora de la fase (decisiones, hallazgos de review).
- `CONTINUAR-IMPLEMENTACION.md`: "Dónde estamos" + "Próxima acción" -> Fase 3 (V3.1,
  migración de conector y outbox).

- [ ] **Step 5: Commit final y merge**

```bash
git add planning/
git commit -m "Cierre de Fase 2: auth con Better Auth, gate de sesion y usuarios dia 1"
git checkout main && git merge --ff-only fase2-auth
```

(Si ff-only falla, merge normal; luego push a origin main.)

---

## Riesgos y cómo el plan los cubre

- **DDL desalineado con lo que Better Auth espera:** la migración se transcribe del
  auth-schema.ts GENERADO, no de memoria; el criterio de V2.1 (server arranca y /api/auth/ok
  responde) más el login real de V2.3 lo verifican de punta a punta.
- **Lockout (nadie puede entrar):** el seed script es re-ejecutable; con acceso a la
  máquina siempre se puede resembrar password borrando la fila de `account` del usuario y
  corriendo el seed de nuevo con ALLOW_SIGNUP=1.
- **Owner sin mapear:** fallback a `user.name` en `usuarioDeSesion` (cola vacía, nunca la
  de otro), cubierto por prueba.
- **Server actions expuestos sin gate:** cada action llama `requireSession()` primero; el
  gate no depende solo de la página.
