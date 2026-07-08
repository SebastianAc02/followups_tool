# Rediseño Login + Register: Cockpit Nocturno (1A) — Plan de implementación

> **Para el que ejecuta:** los pasos usan checkbox (`- [ ]`) para tracking. Este plan NO usa TDD
> porque el repo no tiene runner de tests de UI (el script `test` corre `node --test` solo sobre
> `app/core|db|lib|adapters|worker`, lógica de dominio pura). Restyle de UI, sin lógica de dominio
> nueva: se verifica con el preview server (visual + interacción), tal como permite CLAUDE.md para UI.

**Goal:** Dejar `/login` y `/register` con el diseño 1A "Cockpit Nocturno" del archivo de direcciones,
sin tocar la lógica de autenticación (better-auth) ni el resto de la app.

**Arquitectura:** Solo capa de presentación. Los server actions y `authClient` NO cambian. Todo el CSS
nuevo vive namespaced bajo `.auth-cockpit` para no filtrar el look a la app (que también es dark pero con
acento blanco, no verde). El Register pasa de 1 paso a un wizard de 2 pasos 100% client-side; el submit al
servidor sigue mandando `{ idMiembro, email, password }` en una sola llamada, igual que hoy.

**Tech stack:** Next.js 16 (App Router) + React 19 + TypeScript, better-auth, CSS plano en `globals.css`,
fuentes vía `next/font/google` (Space Grotesk + IBM Plex Mono).

---

## Decisiones tomadas (con recomendación, se pueden vetar antes de ejecutar)

1. **Register en 2 pasos (fiel al mockup).** Paso 1 = correo + contraseña + confirmar contraseña.
   Paso 2 = organización (fija, chip bloqueado) + persona del equipo (el `select` actual). El wizard es
   estado de React; el server action `registrarUsuarioAction` NO cambia (recibe todo junto al enviar el
   paso 2). *Alternativa vetable: dejar 1 solo paso y solo repintar. Recomiendo el de 2 pasos porque es el
   diseño que se aprobó.*

2. **Confirmar contraseña:** campo nuevo, validación solo en cliente (que coincida y tenga >= 8). No toca
   backend ni el schema de auth.

3. **Organización fija:** hoy solo existe la org id 1 (Onepay). El mockup muestra un dropdown de org; como
   solo hay una, se renderiza como chip bloqueado "Onepay" (no editable), no como dropdown. La persona del
   equipo sí es un `select` real (los `miembros` libres).

4. **Login "recordar sesión":** se conserva (es funcional, `rememberMe`), repintado como checkbox pequeño.
   El mockup no lo trae pero es lógica útil que ya existe; quitarlo sería perder función por estética.

5. **"¿Olvidaste tu contraseña?" (link del mockup en login):** se OMITE. No existe flujo de reset de
   contraseña en el proyecto; ponerlo sería un dead-end (contra la voz OnePay). Queda anotado como futuro.
   *Alternativa vetable: dejarlo visible pero deshabilitado.*

6. **Fuentes:** se agregan Space Grotesk (títulos/botones) e IBM Plex Mono (labels/tags/paso) vía
   `next/font/google`, expuestas como CSS variables. Solo las usa auth; no cambian el resto de la app.

7. **Copy:** se mantienen las líneas fuertes del mockup ("Retoma el mando", "Tu cola del día te está
   esperando", "Crea tu cuenta", "Configura tu cabina") con un pase ligero de voz OnePay. Sin emojis, sin
   em dashes.

---

## Mapa de archivos

- **Crear:** rama `feat/auth-cockpit-nocturno` (aislada, se mergea después).
- **Modificar:** `app/layout.tsx` — registrar las 2 fuentes nuevas y añadir sus variables al `<html>`.
- **Modificar:** `app/globals.css` — añadir el bloque de estilos `.auth-cockpit` al final. No tocar nada
  de lo existente.
- **Reescribir:** `app/login/page.tsx` — wrapper full-screen centrado, sin el `.h-title` externo (el logo
  ahora vive dentro de la tarjeta).
- **Reescribir:** `app/login/LoginForm.tsx` — misma lógica de submit, markup nuevo (tarjeta cockpit).
- **Reescribir:** `app/register/page.tsx` — wrapper full-screen centrado.
- **Reescribir:** `app/register/RegisterForm.tsx` — wizard de 2 pasos, misma llamada al server action.
- **NO tocar:** `app/register/actions.ts`, `app/lib/auth.ts`, `app/lib/auth-client.ts`,
  `app/db/auth-schema.ts`, `app/db/organizacion-repository.ts`.

Paleta y tokens del mockup (referencia para el CSS):

```
fondo tarjeta register : radial-gradient(120% 90% at 15% 0%, #14181d 0%, #0b0d10 62%)
fondo tarjeta login    : radial-gradient(120% 90% at 85% 0%, #14181d 0%, #0b0d10 62%)
borde tarjeta          : #20262d
overlay de puntos      : radial-gradient(circle at 1px 1px, rgba(255,255,255,.025) 1px, transparent 0) / 22px
acento verde           : #3ddc8b   (hover #4ee79a)   texto sobre verde: #08120c
input shell            : bg #0f1317, borde #232a31, radio 11px, alto 50px
input shell activo/foco: borde #2f8f5f + animación "breathe"
texto                  : #f2f4f6 / #e7ecef (fuerte), #8a939b (muted), #5b636e (faint)
titulos/botones        : Space Grotesk    labels/tags/paso: IBM Plex Mono
```

---

## Task 1: Crear la rama aislada

**Files:** ninguno (solo git).

- [ ] **Step 1:** Partir desde `main` para que la rama quede limpia y mergeable.

```bash
git checkout main
git pull
git checkout -b feat/auth-cockpit-nocturno
```

- [ ] **Step 2:** Confirmar rama.

```bash
git branch --show-current
```
Esperado: `feat/auth-cockpit-nocturno`

---

## Task 2: Registrar las fuentes Space Grotesk + IBM Plex Mono

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1:** Añadir los imports y las instancias de fuente. Reemplazar el bloque de imports/fuentes
  superior de `app/layout.tsx` por:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600"] });
const monoTag = IBM_Plex_Mono({ variable: "--font-mono-tag", subsets: ["latin"], weight: ["400", "500"] });
```

- [ ] **Step 2:** Añadir las dos variables nuevas al `className` del `<html>`:

```tsx
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${display.variable} ${monoTag.variable}`}>
      <body>{children}</body>
    </html>
```

- [ ] **Step 3:** Verificar que compila.

```bash
npx tsc --noEmit
```
Esperado: sin errores.

- [ ] **Step 4:** Commit.

```bash
git add app/layout.tsx
git commit -m "feat(auth): registrar fuentes Space Grotesk e IBM Plex Mono"
```

---

## Task 3: Estilos Cockpit Nocturno (namespaced)

**Files:**
- Modify: `app/globals.css` (añadir al final, no tocar lo existente)

- [ ] **Step 1:** Añadir este bloque completo al final de `app/globals.css`:

```css
/* ============ Auth Cockpit Nocturno (rama feat/auth-cockpit-nocturno) ============ */
/* Namespaced bajo .auth-cockpit para no filtrar el look a la app. */

@keyframes ac-breathe {
  0%, 100% { border-color: #2f8f5f; box-shadow: 0 0 0 0 rgba(61, 220, 139, 0.0); }
  50%      { border-color: #3ddc8b; box-shadow: 0 0 0 4px rgba(61, 220, 139, 0.08); }
}

.auth-cockpit {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: #08090b;
}

.ac-card {
  position: relative;
  width: 452px;
  max-width: 100%;
  min-height: 640px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid #20262d;
  background: radial-gradient(120% 90% at 15% 0%, #14181d 0%, #0b0d10 62%);
}
.ac-card.ac-login { background: radial-gradient(120% 90% at 85% 0%, #14181d 0%, #0b0d10 62%); }

.ac-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.025) 1px, transparent 0);
  background-size: 22px 22px;
  pointer-events: none;
}

.ac-inner { position: relative; padding: 38px 40px; }
.ac-inner.ac-login-inner { min-height: 640px; display: flex; flex-direction: column; }

.ac-brand { display: flex; align-items: center; gap: 11px; margin-bottom: 44px; }
.ac-brand-mark {
  width: 30px; height: 30px; border-radius: 8px; background: #3ddc8b;
  display: flex; align-items: center; justify-content: center;
}
.ac-brand-name {
  font-family: var(--font-display), sans-serif; font-size: 15px; font-weight: 600;
  color: #e7ecef; letter-spacing: -0.01em;
}

.ac-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 26px; }
.ac-seg { height: 3px; flex: 1; border-radius: 2px; background: #232a31; }
.ac-seg.on { background: #3ddc8b; }
.ac-step {
  font-family: var(--font-mono-tag), monospace; font-size: 11px; color: #8a939b; margin-left: 6px;
}

.ac-h {
  font-family: var(--font-display), sans-serif; font-weight: 600; color: #e7ecef;
  letter-spacing: -0.02em; margin: 0 0 6px;
}
.ac-h.big { font-size: 29px; margin-bottom: 8px; }
.ac-h.med { font-size: 26px; }
.ac-sub { font-size: 13.5px; color: #8a939b; margin: 0 0 28px; line-height: 1.5; }
.ac-sub em { color: #c7cdd3; font-style: normal; }

.ac-label {
  display: block; font-size: 12px; font-weight: 500; color: #8a939b; margin-bottom: 8px;
}

.ac-field {
  display: flex; align-items: center; gap: 11px; height: 50px; padding: 0 14px;
  border-radius: 11px; background: #0f1317; border: 1px solid #232a31; margin-bottom: 18px;
}
.ac-field:focus-within { animation: ac-breathe 3.2s ease-in-out infinite; }
.ac-field svg { flex: 0 0 auto; }
.ac-field input {
  flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14.5px; color: #e7ecef; letter-spacing: normal;
}
.ac-field input::placeholder { color: #5b636e; }

.ac-field.ac-select { padding: 0; }
.ac-field.ac-select select {
  flex: 1; height: 100%; padding: 0 40px 0 14px; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14.5px; color: #e7ecef; -webkit-appearance: none; appearance: none; cursor: pointer;
}
.ac-field.ac-select { position: relative; }
.ac-field.ac-select::after {
  content: ""; position: absolute; right: 16px; top: 50%; width: 10px; height: 10px;
  transform: translateY(-70%) rotate(45deg); border-right: 2px solid #5b636e; border-bottom: 2px solid #5b636e;
  pointer-events: none;
}

.ac-orgchip {
  display: flex; align-items: center; gap: 12px; height: 50px; padding: 0 14px;
  border-radius: 11px; background: #0f1317; border: 1px solid #232a31; margin-bottom: 20px;
}
.ac-orgchip-badge {
  width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg, #3ddc8b, #1e8f5b);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #0b0d10;
}
.ac-orgchip-name { flex: 1; font-size: 14.5px; color: #e7ecef; }

.ac-remember {
  display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: #8a939b;
  margin-bottom: 24px; cursor: pointer; user-select: none;
}
.ac-remember input { width: 15px; height: 15px; accent-color: #3ddc8b; cursor: pointer; }

.ac-btn {
  width: 100%; height: 50px; border: none; border-radius: 11px; background: #3ddc8b; color: #08120c;
  font-family: var(--font-display), sans-serif; font-size: 15px; font-weight: 600; cursor: pointer;
  transition: background 0.14s;
}
.ac-btn:hover { background: #4ee79a; }
.ac-btn:disabled { opacity: 0.55; cursor: default; }

.ac-error {
  color: #ff8b7d; font-size: 13px; margin: 0 0 16px; line-height: 1.4;
}

.ac-foot { text-align: center; margin-top: 18px; font-size: 13px; }
.ac-foot .muted { color: #5b636e; }
.ac-foot a { color: #e7ecef; font-weight: 500; }
.ac-foot a:hover { color: #3ddc8b; }

.ac-back {
  display: block; text-align: center; margin-top: 18px; font-size: 13px; color: #5b636e;
  background: none; border: none; width: 100%; cursor: pointer; font: inherit;
}
.ac-back:hover { color: #8a939b; }

.ac-login-body { margin-top: auto; margin-bottom: auto; padding: 40px 0; }

@media (max-width: 480px) {
  .ac-inner, .ac-inner.ac-login-inner { padding: 30px 24px; }
  .ac-card { min-height: 0; }
}
```

- [ ] **Step 2:** Commit (los estilos aún no se usan; se cablean en Task 4 y 5).

```bash
git add app/globals.css
git commit -m "feat(auth): estilos Cockpit Nocturno namespaced"
```

---

## Task 4: Login con el diseño cockpit

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/login/LoginForm.tsx`

- [ ] **Step 1:** Reescribir `app/login/page.tsx` (quitar el `.h-title` externo; el logo va dentro de la
  tarjeta). La lógica de sesión/redirect NO cambia:

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  return (
    <div className="auth-cockpit">
      <LoginForm />
    </div>
  );
}
```

- [ ] **Step 2:** Reescribir `app/login/LoginForm.tsx`. La función `onSubmit` y las llamadas a
  `authClient.signIn.email` quedan idénticas; solo cambia el markup:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recordar, setRecordar] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const { error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: recordar,
      });
      if (error) {
        setError('Correo o password incorrectos');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ac-card ac-login">
      <div className="ac-inner ac-login-inner">
        <div className="ac-brand" style={{ marginBottom: 0 }}>
          <div className="ac-brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8" stroke="#0b0d10" strokeWidth="2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#0b0d10" strokeWidth="2" />
              <circle cx="12" cy="12" r="2" fill="#0b0d10" />
            </svg>
          </div>
          <span className="ac-brand-name">OnePay Cockpit</span>
        </div>

        <form onSubmit={onSubmit} className="ac-login-body">
          <h2 className="ac-h big">Retoma el mando</h2>
          <p className="ac-sub">Tu cola del día te está esperando.</p>

          <label className="ac-label" htmlFor="email">Correo</label>
          <div className="ac-field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#5b636e" strokeWidth="1.6" />
              <path d="M4 7l8 6 8-6" stroke="#5b636e" strokeWidth="1.6" />
            </svg>
            <input id="email" name="email" type="email" placeholder="ana@onepay.co" required autoFocus />
          </div>

          <label className="ac-label" htmlFor="password">Contraseña</label>
          <div className="ac-field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
              <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
            </svg>
            <input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>

          <label className="ac-remember">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordar sesión
          </label>

          {error && <div className="ac-error">{error}</div>}

          <button className="ac-btn" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="ac-foot">
          <span className="muted">¿Sin cuenta? </span>
          <Link href="/register">Crear una</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Verificar que compila.

```bash
npx tsc --noEmit
```
Esperado: sin errores.

- [ ] **Step 4:** Verificación visual con el preview server (ver Task 6). Confirmar: tarjeta oscura
  centrada, acento verde, campo de correo respira al enfocar, botón verde, error se pinta si las
  credenciales fallan.

- [ ] **Step 5:** Commit.

```bash
git add app/login/page.tsx app/login/LoginForm.tsx
git commit -m "feat(auth): login con diseno Cockpit Nocturno"
```

---

## Task 5: Register como wizard de 2 pasos con el diseño cockpit

**Files:**
- Modify: `app/register/page.tsx`
- Modify: `app/register/RegisterForm.tsx`

- [ ] **Step 1:** Reescribir `app/register/page.tsx` (quitar `.h-title` externo). La carga de `miembros` y
  el redirect NO cambian:

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { miembrosLibres } from '../db/organizacion-repository';
import RegisterForm from './RegisterForm';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  const miembros = miembrosLibres(ID_ORGANIZACION_ONEPAY);

  return (
    <div className="auth-cockpit">
      <RegisterForm miembros={miembros} />
    </div>
  );
}
```

- [ ] **Step 2:** Reescribir `app/register/RegisterForm.tsx` como wizard de 2 pasos. El envío al server
  action `registrarUsuarioAction({ idMiembro, email, password })` ocurre al enviar el paso 2, con la misma
  forma que hoy. La validación de "confirmar contraseña" es solo cliente:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registrarUsuarioAction } from './actions';

type Miembro = { id: number; nombreDisplay: string };

export default function RegisterForm({ miembros }: { miembros: Miembro[] }) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [idMiembro, setIdMiembro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function irAPaso2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setPaso(2);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const resultado = await registrarUsuarioAction({ idMiembro, email, password });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.push('/login');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const marca = (
    <div className="ac-brand">
      <div className="ac-brand-mark">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="#0b0d10" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#0b0d10" strokeWidth="2" />
          <circle cx="12" cy="12" r="2" fill="#0b0d10" />
        </svg>
      </div>
      <span className="ac-brand-name">OnePay Cockpit</span>
    </div>
  );

  if (miembros.length === 0) {
    return (
      <div className="ac-card">
        <div className="ac-inner">
          {marca}
          <h2 className="ac-h med">Sin cupos libres</h2>
          <p className="ac-sub">Ya no hay nombres libres para registrar. Habla con Sebastián.</p>
          <div className="ac-foot">
            <Link href="/login">Ir a iniciar sesión</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-card">
      <div className="ac-inner">
        {marca}

        <div className="ac-progress">
          <div className="ac-seg on" />
          <div className={`ac-seg ${paso === 2 ? 'on' : ''}`} />
          <span className="ac-step">{paso === 1 ? '01 / 02' : '02 / 02'}</span>
        </div>

        {paso === 1 && (
          <form onSubmit={irAPaso2}>
            <h2 className="ac-h med">Crea tu cuenta</h2>
            <p className="ac-sub">Primero tus credenciales. Luego elegimos organización y rol.</p>

            <label className="ac-label" htmlFor="email">Correo</label>
            <div className="ac-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M4 7l8 6 8-6" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="email" type="email" placeholder="ana@onepay.co" required
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>

            <label className="ac-label" htmlFor="password">Contraseña</label>
            <div className="ac-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <label className="ac-label" htmlFor="confirmar">Confirmar contraseña</label>
            <div className="ac-field" style={{ marginBottom: 24 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="confirmar" type="password" placeholder="Repite la contraseña" required
                value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </div>

            {error && <div className="ac-error">{error}</div>}

            <button className="ac-btn">Continuar</button>
            <div className="ac-foot">
              <span className="muted">¿Ya tienes cuenta? </span>
              <Link href="/login">Inicia sesión</Link>
            </div>
          </form>
        )}

        {paso === 2 && (
          <form onSubmit={onSubmit}>
            <h2 className="ac-h med">Configura tu cabina</h2>
            <p className="ac-sub">Cuenta creada para <em>{email}</em>. Dinos quién eres en el equipo.</p>

            <label className="ac-label">Organización</label>
            <div className="ac-orgchip">
              <div className="ac-orgchip-badge">O</div>
              <span className="ac-orgchip-name">Onepay</span>
            </div>

            <label className="ac-label" htmlFor="idMiembro">Persona del equipo</label>
            <div className="ac-field ac-select" style={{ marginBottom: 24 }}>
              <select id="idMiembro" required value={idMiembro}
                onChange={(e) => setIdMiembro(e.target.value)}>
                <option value="" disabled>Elige tu nombre</option>
                {miembros.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombreDisplay}</option>
                ))}
              </select>
            </div>

            {error && <div className="ac-error">{error}</div>}

            <button className="ac-btn" disabled={enviando || idMiembro === ''}>
              {enviando ? 'Creando cuenta...' : 'Entrar a la cabina'}
            </button>
            <button type="button" className="ac-back" onClick={() => { setError(null); setPaso(1); }}>
              Volver a datos de cuenta
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Verificar que compila.

```bash
npx tsc --noEmit
```
Esperado: sin errores.

- [ ] **Step 4:** Verificación visual con el preview server (Task 6). Confirmar: paso 1 valida
  contraseña >= 8 y que coincidan antes de pasar; barra de progreso 01/02 -> 02/02; org bloqueada;
  "Volver a datos de cuenta" regresa al paso 1 conservando lo escrito; el submit del paso 2 crea la
  cuenta y redirige a `/login`.

- [ ] **Step 5:** Commit.

```bash
git add app/register/page.tsx app/register/RegisterForm.tsx
git commit -m "feat(auth): register wizard 2 pasos con diseno Cockpit Nocturno"
```

---

## Task 6: Verificación en el navegador (preview)

**Files:** ninguno.

- [ ] **Step 1:** Levantar el dev server (preview_start con la config de Next; puerto 3000).

- [ ] **Step 2:** Abrir `/login`. Screenshot. Chequear con preview_inspect:
  - `.ac-card` fondo oscuro con gradiente radial y borde `#20262d`.
  - `.ac-btn` color de fondo `rgb(61, 220, 139)`.
  - Fuente de `.ac-h` = Space Grotesk (comprobar `font-family` computado).

- [ ] **Step 3:** En `/login`, enfocar el campo de correo y confirmar que el borde respira (animación
  `ac-breathe`). Enviar credenciales falsas y confirmar que aparece `.ac-error`.

- [ ] **Step 4:** Abrir `/register`. Screenshot del paso 1. Poner contraseñas distintas, click Continuar,
  confirmar error "Las contraseñas no coinciden.". Corregir, Continuar, confirmar paso 2 (progreso
  02/02, chip Onepay, select de personas). Click "Volver" y confirmar que vuelve al paso 1 con los datos.

- [ ] **Step 5:** preview_resize a mobile (375px) en ambas páginas y confirmar que la tarjeta no
  desborda horizontalmente (padding se reduce por el media query).

- [ ] **Step 6:** preview_console_logs nivel error: sin errores de React/hidratación.

---

## Task 7: Cierre

- [ ] **Step 1:** `npm run build` para confirmar que la app compila en producción.

```bash
npm run build
```
Esperado: build exitoso.

- [ ] **Step 2:** Dejar la rama lista para merge posterior (no mergear todavía; el usuario decide cuándo).

```bash
git log --oneline main..feat/auth-cockpit-nocturno
```
Esperado: los 5 commits de este plan.

---

## Self-review (cobertura del mockup 1A)

- Logo "OnePay Cockpit" con marca verde: Task 4/5 (marca).
- Register paso 1 (correo, contraseña, confirmar) + barra 01/02: Task 5.
- Register paso 2 (organización + persona) + barra 02/02: Task 5.
- Login (Retoma el mando, correo con campo activo que respira, contraseña, botón): Task 4.
- Paleta, fondo con puntos, campos oscuros, acento verde, breathe: Task 3.
- Fuentes Space Grotesk + IBM Plex Mono: Task 2.
- Sin tocar auth/actions/schema: respetado (solo presentación).
- Divergencias documentadas y resueltas: org como chip fijo (no dropdown), forgot-password omitido,
  recordar sesión conservado. Ver "Decisiones tomadas".
