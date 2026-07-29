// Empujón manual ACOTADO (tool empujar_envios, 2026-07-28).
//
// Diferencia con materializarYEmpujarAhora, que es lo que usa lanzar_campana: aquello materializa
// TODA la base y después empuja TODO lo pendiente de TODAS las campañas activas. Por eso
// lanzar_campana tiene que cantar un "colateral" antes de confirmar: lo que sale de más no es un
// bug, es cómo está construido. Acá el blanco lo pone quien llama, y lo que no está en la lista de
// ids NO se toca. El colateral de esta función es cero por construcción, y eso es exactamente lo
// que la vuelve usable para "mandale a estas dos cuentas y a nadie más".
//
// Vive en su propio archivo y no dentro de worker/index.ts a propósito: el worker no tiene ni
// tendrá nunca el caso "empujá sólo estos ids", así que meterle un parámetro de scope a
// tareaPush/tareaPushCorreo sería complicar el camino caliente por un caller que no es suyo.
//
// Modo manual siempre, con las dos consecuencias que ya documenta tareaPush y que acá son el
// punto y no un efecto colateral:
//   - NO se evalúa la ventana de 8:00-18:00 Bogotá. Un empujón a las 20:00 sale a las 20:00.
//   - El espaciado es el corto y fijo (3s), no el jitter de 45-90s: hay un request esperando.
// Lo que NO se salta: el tope diario de Gmail (protege la cuenta, no la hora), el gate de
// aprobada_envio_gmail y el gate de revisión humana de WhatsApp. Los tres viven adentro de
// pasoInscripcionesPendientes / agruparPendientesCorreo, así que se aplican igual acá.
import { pushPendientes } from '../core/push';
import {
  pasoInscripcionesPendientesDe,
  marcarPasoInscripcionEnviando,
  marcarPasoInscripcionEnviada,
  marcarPasoInscripcionFallo,
  leerConfiguracionAdmin,
  enviosGmailHoy,
} from '../db/repository';
import { crearRegistroEntrega, agruparPendientesCorreo } from '../adapters/registro-envio';
import type { Canal } from '../db/validation';

const ESPACIADO_MANUAL_MS = 3000;
const GMAIL_TOPE_DIARIO_DEFAULT = 300;
const GMAIL_THROTTLE_MS_DEFAULT = 3000;

function configNumeroAdmin(clave: string, porDefecto: number): number {
  const val = leerConfiguracionAdmin(clave);
  const n = val ? Number(val) : NaN;
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

const marcadores = {
  marcarEnviando: marcarPasoInscripcionEnviando,
  marcarEnviada: marcarPasoInscripcionEnviada,
  marcarFallo: marcarPasoInscripcionFallo,
};

// ids = paso_inscripcion.id_paso_inscripcion. Los que no pasen los gates de la cola real
// simplemente no aparecen y no se tocan; quién no pasó y por qué lo explica el caller
// (empujarEnviosTool), que ya leyó los candidatos antes.
export async function empujarPasosAhora(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const ahora = new Date();
  const registro = crearRegistroEntrega();

  // Correo: agruparPendientesCorreo resuelve el adaptador por dueño (Gmail propio vs Apollo por
  // fallback) y aplica el gate de aprobada_envio_gmail. Se le inyecta la cola ACOTADA por el
  // parámetro `pendientes`, que es el único punto que hay que cambiar para pasar de global a
  // acotado: la decisión de proveedor y el gate quedan intactos, no reimplementados.
  for (const grupo of agruparPendientesCorreo(ahora.toISOString(), { pendientes: (t) => pasoInscripcionesPendientesDe('correo', ids, t) })) {
    let filas = grupo.filas;
    let throttle = 0;
    if (grupo.idUsuarioGmail) {
      const tope = configNumeroAdmin('gmail_tope_diario', GMAIL_TOPE_DIARIO_DEFAULT);
      // Sin dia explicito: enviosGmailHoy toma el dia de calendario en Bogota (2026-07-28).
      // Aca importa mas que en el worker, porque este camino NO tiene ventana horaria: es el
      // unico que de verdad corre despues de las 19:00, y con el dia en UTC el contador del tope
      // se reiniciaba justo ahi, dejando mandar el cupo entero por segunda vez el mismo dia.
      const yaEnviados = enviosGmailHoy(grupo.idUsuarioGmail, filas[0]?.idOrganizacion ?? 0);
      const restante = tope - yaEnviados;
      if (restante <= 0) {
        console.error(`[empujon-manual] la cuenta de Gmail ${grupo.idUsuarioGmail} ya llegó al tope diario de ${tope}: ${filas.length} fila(s) no salen`);
        continue;
      }
      if (filas.length > restante) {
        console.error(`[empujon-manual] tope diario de Gmail: sólo quedan ${restante} de ${tope}, así que salen ${restante} de ${filas.length} fila(s)`);
      }
      filas = filas.slice(0, restante);
      throttle = configNumeroAdmin('gmail_throttle_ms', GMAIL_THROTTLE_MS_DEFAULT);
    }
    await pushPendientes({ ...marcadores, pendientes: () => filas }, grupo.adaptador, ahora, throttle);
  }

  // El resto de canales con proveedor automático (hoy: whatsapp). 'llamada' no tiene adaptador
  // registrado y por eso no entra en este loop: se cierra registrando el toque, no empujando.
  for (const canal of Object.keys(registro) as Canal[]) {
    if (canal === 'correo') continue;
    const envio = registro[canal];
    if (!envio) continue;
    await pushPendientes({ ...marcadores, pendientes: () => pasoInscripcionesPendientesDe(canal, ids, ahora.toISOString()) }, envio, ahora, ESPACIADO_MANUAL_MS);
  }
}
