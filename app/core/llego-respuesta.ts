// Tarea 6 (plan-whatsapp-adapter.md): una respuesta entrante de WhatsApp corta la
// cadencia de ese contacto. Mismo estilo que tracking.ts/push.ts: logica PURA, deps
// inyectadas, el core no importa Evolution ni Apollo (los toca por el puerto TrackingPoll).
//
// Diferencia clave con pollTracking (leer antes de tocar): alla el evento 'respondio'
// viene de Apollo mismo, que ya sabe que el contacto respondio -> basta pausar la
// inscripcion local. Aca el reply llega por WhatsApp, INVISIBLE para Apollo: pausar lo
// local frena nuestro motor, pero Apollo sigue mandando su secuencia de correo por su
// cuenta. Por eso este caso de uso SI empuja envio.sacarDestinatario(...) -- es la
// decision B (corte directo, 2026-07-09): cortar tambien la secuencia en Apollo.
import type { TrackingPoll } from './ports/envio';

// Evento de dominio que cruza del adaptador (parsea el payload de Evolution) al core.
// El core no sabe nada de 'messages.upsert' ni de remoteJid: recibe esto ya limpio.
export type MensajeEntrante = {
  referenciaProveedor: string; // instancia/linea por la que entro (data.instance)
  telefono: string; // solo digitos, del remoteJid sin @s.whatsapp.net
  texto: string; // el cuerpo del mensaje
  mensajeId: string; // key.id de Evolution -- correlator de idempotencia
  fecha: string; // ISO
};

// Contacto matcheado + su empresa/organizacion. idOrganizacion se arrastra para poder
// registrar el toque (toque.id_organizacion es NOT NULL e inmutable).
export type ContactoMatch = {
  idContacto: number;
  idEmpresa: string;
  idOrganizacion: number;
};

// Una inscripcion activa de la empresa (lo que hay que cortar). proveedorCampanaId y
// email pueden ser null: campana sin secuencia Apollo, o contacto sin email -> en ese
// caso solo se corta lo local (no hay a quien sacar de Apollo).
export type InscripcionActiva = {
  idInscripcion: number;
  proveedorCampanaId: string | null;
  email: string | null;
};

export type RespuestaEntranteDeps = {
  // Idempotencia + auditoria en una: inserta la fila en mensaje_whatsapp (mensaje_id es
  // UNIQUE). Devuelve 'duplicado' si el webhook reintenta el mismo mensaje -- molde
  // guardarEventoTracking. Recibe el match para guardar a que contacto matcheo (o null).
  registrarEntrante: (mensaje: MensajeEntrante, match: ContactoMatch | null) => 'insertado' | 'duplicado';
  // Match por ULTIMOS 10 DIGITOS (decision A, 2026-07-09). null si el numero no
  // corresponde a ningun contacto conocido (numero desconocido que escribio).
  matchearContacto: (telefono: string) => ContactoMatch | null;
  // Inscripciones activas de la empresa. Puede haber mas de una (aunque el indice
  // ux_inscripcion_activa deja una activa por empresa, se modela lista por robustez).
  inscripcionesActivas: (idEmpresa: string) => InscripcionActiva[];
  pausarInscripcion: (idInscripcion: number, motivo: string) => void;
  // Deja el toque entrante en el historial de la empresa, fuente 'whatsapp_entrante'
  // (decision C: es un hecho ocurrido, se persiste directo, no pasa por borrador).
  registrarToqueEntrante: (match: ContactoMatch, texto: string, fecha: string) => void;
};

export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, '');
}

// Match por ULTIMOS 10 DIGITOS (decision A, 2026-07-09): el celular de Colombia tiene 10
// digitos y WhatsApp manda 57+10; comparar los ultimos 10 absorbe +, 57 y separadores de
// cualquiera de los dos lados. Guarda: si el numero normalizado tiene menos de 10 digitos
// no matcheamos (muy corto para confiar). Colision (dos contactos con el mismo sufijo de
// 10): devuelve el primero -- caso de borde aceptable en v1, se afina con dato real.
export function resolverPorUltimos10(
  candidatos: (ContactoMatch & { telefono: string | null })[],
  telefono: string,
): ContactoMatch | null {
  const objetivo = normalizarTelefono(telefono).slice(-10);
  if (objetivo.length < 10) return null;
  for (const c of candidatos) {
    if (!c.telefono) continue;
    if (normalizarTelefono(c.telefono).slice(-10) === objetivo) {
      return { idContacto: c.idContacto, idEmpresa: c.idEmpresa, idOrganizacion: c.idOrganizacion };
    }
  }
  return null;
}

export async function procesarRespuestaEntrante(
  deps: RespuestaEntranteDeps,
  envio: TrackingPoll,
  mensaje: MensajeEntrante,
): Promise<void> {
  const match = deps.matchearContacto(mensaje.telefono);

  // Idempotencia primero, ANTES de cualquier efecto: si el webhook reintento el
  // mismo mensaje (mensaje_id repetido), 'duplicado' corta aca y ningun efecto de
  // abajo se re-ejecuta -- mismo criterio que guardarEventoTracking en tracking.ts.
  const resultado = deps.registrarEntrante(mensaje, match);
  if (resultado === 'duplicado') return;

  // Sin match: solo queda el registro de auditoria de arriba. No hay empresa a la
  // que pertenezca una cadencia que cortar, ni contacto para el toque.
  if (!match) return;

  const activas = deps.inscripcionesActivas(match.idEmpresa);
  for (const activa of activas) {
    // Corte local siempre, incondicional: es lo minimo que garantiza que el motor
    // deja de mandar el siguiente paso, sin depender de que Apollo responda.
    deps.pausarInscripcion(activa.idInscripcion, 'respuesta detectada (whatsapp)');

    if (activa.proveedorCampanaId && activa.email) {
      try {
        await envio.sacarDestinatario(activa.proveedorCampanaId, activa.email);
      } catch {
        // Apollo caido/errando no debe frenar el corte de las demas inscripciones
        // de la empresa (aislamiento, mismo criterio que el worker por-tarea): lo
        // local ya quedo pausado, que Apollo siga mandando un paso mas es un riesgo
        // menor que dejar sin cortar al resto por un solo fallo de red.
      }
    }
  }

  deps.registrarToqueEntrante(match, mensaje.texto, mensaje.fecha);
}
