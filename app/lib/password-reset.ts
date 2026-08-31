import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { dbReal } from '../db/index';
import { user, account, session, passwordResetToken } from '../db/auth-schema';

// Reset de password self-service (2026-08-31). Tabla propia (app/db/auth-schema.ts,
// scripts/migrate_password_reset_apply.py) y NO el mecanismo nativo de Better Auth
// (requestPasswordReset/reset-password): ese guarda el token CRUDO en
// `verification.identifier`. Aca el token nunca toca la base en claro -- solo su sha256.

const TOKEN_BYTES = 32; // 256 bits de entropia: no hace falta un hash lento (bcrypt/scrypt)
// como con una password de usuario, con SHA-256 sobra para que la fila filtrada no sirva de
// nada sin el token original.
const EXPIRACION_MINUTOS = 45; // dentro del rango pedido (30-60 min)

function hashToken(tokenCrudo: string): string {
  return createHash('sha256').update(tokenCrudo).digest('hex');
}

function appBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

export type SolicitudReset = { existeCuenta: boolean; urlReset?: string; nombre?: string };

// Genera (o no) un token de reset para `email`. El resultado interno SI distingue si la
// cuenta existe (para loguear/exponer el link solo cuando existe), pero quien llama a esto
// desde una Server Action de cara al usuario debe responder SIEMPRE el mismo mensaje
// generico, exista o no la cuenta -- si no, el formulario se vuelve un oraculo para
// enumerar correos validos de la herramienta.
export async function generarSolicitudReset(email: string): Promise<SolicitudReset> {
  const fila = dbReal.select().from(user).where(eq(user.email, email)).get();
  if (!fila) return { existeCuenta: false };

  // Invalida cualquier token previo sin usar de este usuario: un solo link vivo a la vez.
  dbReal
    .update(passwordResetToken)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetToken.userId, fila.id), isNull(passwordResetToken.usedAt)))
    .run();

  const tokenCrudo = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  dbReal
    .insert(passwordResetToken)
    .values({ id: randomUUID(), userId: fila.id, tokenHash: hashToken(tokenCrudo), expiresAt })
    .run();

  const urlReset = `${appBaseUrl()}/reset-password?token=${tokenCrudo}`;
  return { existeCuenta: true, urlReset, nombre: fila.name };
}

export type ConfirmarResetResultado =
  | { ok: true }
  | { ok: false; motivo: 'token_invalido' | 'token_expirado' | 'token_usado' };

// Consume el token (una sola vez) y escribe la password nueva. Se escribe con el MISMO
// hasher que usa el login normal (`hashPassword` de 'better-auth/crypto', el subpath que
// exporta node_modules/better-auth/dist/crypto/index.mjs) directo en `account.password`
// (provider `credential`) -- Better Auth no distingue de donde salio el hash, solo que sea
// el formato que el sabe verificar.
export async function confirmarReset(
  tokenCrudo: string,
  nuevaPassword: string,
): Promise<ConfirmarResetResultado> {
  const hash = hashToken(tokenCrudo);
  const fila = dbReal
    .select()
    .from(passwordResetToken)
    .where(eq(passwordResetToken.tokenHash, hash))
    .get();

  if (!fila) return { ok: false, motivo: 'token_invalido' };
  if (fila.usedAt) return { ok: false, motivo: 'token_usado' };
  if (fila.expiresAt.getTime() < Date.now()) return { ok: false, motivo: 'token_expirado' };

  const passwordHasheada = await hashPassword(nuevaPassword);

  const cuentaCredencial = dbReal
    .select()
    .from(account)
    .where(and(eq(account.userId, fila.userId), eq(account.providerId, 'credential')))
    .get();

  if (cuentaCredencial) {
    dbReal.update(account).set({ password: passwordHasheada }).where(eq(account.id, cuentaCredencial.id)).run();
  } else {
    dbReal
      .insert(account)
      .values({ id: randomUUID(), accountId: fila.userId, providerId: 'credential', userId: fila.userId, password: passwordHasheada })
      .run();
  }

  dbReal.update(passwordResetToken).set({ usedAt: new Date() }).where(eq(passwordResetToken.id, fila.id)).run();

  // Resetear la password es un evento de seguridad: cierra cualquier sesion activa de ese
  // usuario, igual que `revokeSessionsOnPasswordReset` del flujo nativo de Better Auth.
  dbReal.delete(session).where(eq(session.userId, fila.userId)).run();

  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// TRANSPORTE DE CORREO: NO IMPLEMENTADO. El repo no tiene SMTP ni proveedor transaccional
// (Resend/SES/Postmark) configurado -- solo hay un adapter de Gmail (app/adapters/gmail.ts)
// atado al OAuth personal de un usuario para CAMPANAS salientes a prospectos, que no es el
// canal correcto para un correo de seguridad del sistema. Falta, como minimo:
//   - Una variable de entorno con la credencial del proveedor (ej. RESEND_API_KEY o
//     SMTP_HOST/SMTP_USER/SMTP_PASS) en .env.local y en el .env de produccion del VPS.
//   - Un adapter nuevo (ej. app/adapters/email-transaccional.ts) que la use.
// Mientras eso no exista, `logueaLinkDeResetParaPruebas` de abajo es la unica salida: deja
// el link en el log del servidor (nunca en produccion real) para poder probar el flujo
// manualmente. NUNCA se envia la password en texto plano por ningun canal.
export function logueaLinkDeResetParaPruebas(email: string, urlReset: string): void {
  if (process.env.NODE_ENV === 'production') {
    // No hay transporte de correo real: en produccion NO se expone el link por consola
    // (quedaria en logs de docker legibles por cualquiera con acceso al VPS). Se loguea
    // solo que faltó transporte, sin el token.
    console.error(
      '[reset-password] Falta transporte de correo (SMTP/Resend/SES). No se pudo enviar el link a',
      email,
      '-- token generado pero NUNCA logueado en produccion. Configura el transporte antes de usar este flujo con usuarios reales.',
    );
    return;
  }
  // Fuera de produccion (dev/test): se expone el link completo en consola a proposito,
  // para poder probar "olvide mi password" de punta a punta sin correo real.
  console.warn(`[reset-password][SOLO DEV/TEST, no produccion] link para ${email}: ${urlReset}`);
}
