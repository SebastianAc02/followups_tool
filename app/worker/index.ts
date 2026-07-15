import {
  registrarHeartbeatConector,
  outboxPendientes,
  marcarOutboxEnviado,
  marcarOutboxFallido,
  pasoInscripcionesPendientes,
  marcarPasoInscripcionEnviando,
  marcarPasoInscripcionEnviada,
  marcarPasoInscripcionFallo,
  campanasConSecuencia,
  resolverDestinatarioPorEmail,
  guardarEventoTracking,
  pausarInscripcion,
  marcarDestinatarioSalio,
  quedanDestinatariosActivos,
  materializarPasosDebidos,
  archivarCampanasCompletadas,
  leerConfiguracionAdmin,
  enviosGmailHoy,
} from '../db/repository';
import { drenarOutbox } from '../core/outbox';
import { pushPendientes } from '../core/push';
import { pollTracking } from '../core/tracking';
import type { ConfigCalendario } from '../core/motor-cadencia';
import { crearNotionAdapter } from '../adapters/notion';
import { crearRegistroEnvio, crearRegistroEntrega, agruparPendientesCorreo } from '../adapters/registro-envio';
import type { Canal } from '../db/validation';

// Calendario de la agenda real (sesion 2026-07-08, materializador): sin fin de semana
// bloqueado todavia porque ninguna campana tiene hoy una config propia -- se corre a
// diario y se corre hacia el siguiente dia habil si algun dia mas adelante se bloquea.
// Es un default de arranque, no una regla de negocio fija: cuando el wizard de
// campanas necesite pedirle esto al usuario, esta constante deja de ser la unica
// fuente y pasa a leerse por campana.
const CONFIG_CALENDARIO_DEFAULT: ConfigCalendario = { diasBloqueados: [], corrimiento: 'siguiente' };

// B7: proceso Node aparte (npm run worker), no un setInterval dentro de Next, el
// dev server de Next se reinicia con hot reload/deploys y se llevaria el timer con
// el. Catch-up-first: la primera pasada corre YA al arrancar (antes de programar la
// espera), porque el laptop pasa apagado de noche y todo lo atrasado se procesa de
// una vez, no se espera al primer tick del intervalo.

const INTERVALO_MS = 5 * 60 * 1000;

export type Tarea = { nombre: string; proveedorHeartbeat: string; ejecutar: () => Promise<void> };

async function tareaOutbox(): Promise<void> {
  await drenarOutbox(
    { pendientes: outboxPendientes, marcarEnviado: marcarOutboxEnviado, marcarFallido: marcarOutboxFallido },
    crearNotionAdapter(),
  );
}

// V? (materializador): antes de esto, inscribirCampana dejaba la inscripcion activa
// pero nunca escribia paso_inscripcion -- nada llegaba a /cola para NINGUN canal (ver
// planning/experimento-apollo.md, Hallazgo real #4). Corre primero en el ciclo (antes
// de tareaPush) para que el correo recien materializado alcance a salir en la misma
// pasada, mismo catch-up-first que el resto del worker.
async function tareaMaterializar(): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10);
  materializarPasosDebidos(hoy, CONFIG_CALENDARIO_DEFAULT);
}

// Auto-archivo (sesion 2026-07-10): distinto de "Cancelar" (cancelarCampanaAction,
// a mano, antes de tiempo). Corre despues de tareaMaterializar en el mismo ciclo --
// si materializar hoy todavia genero un paso nuevo para una inscripcion, esa
// inscripcion ya no cuenta como agotada y campanasParaArchivar() no la va a marcar.
// La base (campana.estado='archivada') es la fuente de la verdad, igual que en
// cancelarCampanaAction: si Apollo falla al archivar la secuencia, la campana ya
// quedo archivada aca, y solo logueamos el fallo por campana (heartbeat propio de la
// tarea, ejecutarCiclo aisla si esto revienta del resto del ciclo) -- no hay usuario
// esperando la respuesta como si la hay en la accion manual.
async function tareaArchivarCampanas(envioCorreo: ReturnType<typeof crearRegistroEnvio>['correo']): Promise<void> {
  const archivadas = archivarCampanasCompletadas();
  for (const c of archivadas) {
    if (!c.proveedorCampanaId || !envioCorreo) continue;
    try {
      await envioCorreo.archivarCampana(c.proveedorCampanaId);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      console.error(`[archivar-campanas] campana ${c.idCampana}: Apollo no confirmo el archivado (${mensaje})`);
    }
  }
}

// V5.4: push reanudable de cadencias, un proveedor real por canal. Aislada de outbox
// (si un proveedor esta caido, Notion sigue drenando igual, y viceversa -- mismo
// principio del comentario de arriba en ejecutarCiclo).
//
// Sesion 2026-07-09 (registro de proveedor por canal, ver app/adapters/registro-envio.ts):
// esta funcion NO sabe que Apollo existe. push.ts tampoco. Recibe el canal y el
// adaptador ya resueltos; agregar un proveedor nuevo (WhatsApp real, por ejemplo) es
// sumarlo al registro y nada mas cambia aca.
async function tareaPush(canal: Canal, envio: ReturnType<typeof crearRegistroEntrega>[Canal]): Promise<void> {
  if (!envio) return; // canal sin proveedor automatico (llamada/whatsapp hoy): nada que empujar
  await pushPendientes(
    {
      pendientes: () => pasoInscripcionesPendientes(canal),
      marcarEnviando: marcarPasoInscripcionEnviando,
      marcarEnviada: marcarPasoInscripcionEnviada,
      marcarFallo: marcarPasoInscripcionFallo,
    },
    envio,
  );
}

// Gmail Etapa 2 (2026-07-15): correo YA NO es "un proveedor, una llamada a
// pushPendientes" (a diferencia de whatsapp/llamada, que siguen usando tareaPush tal
// cual) -- puede haber un grupo por cada dueno con Gmail propio + un grupo Apollo que
// junta a todos los que caen a fallback. agruparPendientesCorreo ya resolvio y agrupo;
// esta funcion solo itera, aplicando tope diario + throttle SOLO a los grupos Gmail
// (Apollo no tiene esos limites, los maneja Apollo del otro lado).
const GMAIL_TOPE_DIARIO_DEFAULT = 300; // conservador a proposito, no el limite oficial de Workspace (~2000)
const GMAIL_THROTTLE_MS_DEFAULT = 3000;

function configGmailNumero(clave: string, porDefecto: number): number {
  const val = leerConfiguracionAdmin(clave);
  const n = val ? Number(val) : NaN;
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export async function tareaPushCorreo(): Promise<void> {
  const ahora = new Date();
  const topeDiario = configGmailNumero('gmail_tope_diario', GMAIL_TOPE_DIARIO_DEFAULT);
  const throttleMs = configGmailNumero('gmail_throttle_ms', GMAIL_THROTTLE_MS_DEFAULT);

  for (const grupo of agruparPendientesCorreo(ahora.toISOString())) {
    let filas = grupo.filas;
    let throttle = 0;

    if (grupo.idUsuarioGmail) {
      // Tope diario es POR CUENTA de Gmail (no por campana): si ya mando 250 de un
      // tope de 300, le quedan 50 en este ciclo -- no es todo-o-nada, las filas que
      // no alcanzan quedan 'pendiente' para el siguiente ciclo del worker (mismo
      // mecanismo de reintento que ya existe, no se pierden ni marcan fallo).
      const yaEnviados = enviosGmailHoy(grupo.idUsuarioGmail, filas[0]?.idOrganizacion ?? 0, ahora.toISOString().slice(0, 10));
      const restante = topeDiario - yaEnviados;
      if (restante <= 0) continue; // tope alcanzado, este grupo no manda nada este ciclo
      filas = filas.slice(0, restante);
      throttle = throttleMs;
    }

    await pushPendientes(
      {
        pendientes: () => filas,
        marcarEnviando: marcarPasoInscripcionEnviando,
        marcarEnviada: marcarPasoInscripcionEnviada,
        marcarFallo: marcarPasoInscripcionFallo,
      },
      grupo.adaptador,
      ahora,
      throttle,
    );
  }
}

// V5.5: poll de tracking + reply detection. Solo tiene sentido para el proveedor de
// correo hoy (es el unico con tracking real, ver experimento-apollo.md); si el dia de
// manana un proveedor de whatsapp tambien expone tracking, esto se vuelve un loop por
// canal igual que tareaPush. Heartbeat propio ('apollo-tracking', no 'apollo') para que
// un fallo aca no pise el heartbeat de push en el mismo ciclo.
async function tareaTracking(envioCorreo: ReturnType<typeof crearRegistroEnvio>['correo']): Promise<void> {
  if (!envioCorreo) return;
  await pollTracking(
    {
      campanasConSecuencia,
      resolverDestinatario: resolverDestinatarioPorEmail,
      guardarEvento: guardarEventoTracking,
      pausarInscripcion,
      marcarDestinatarioSalio,
      quedanDestinatariosActivos,
    },
    envioCorreo,
  );
}

// Sesion 2026-07-10 (prueba multicanal real): lanzar una campana no debia dejar al
// que la lanza esperando hasta 5 minutos (el intervalo del worker) a que el paso del
// dia 0 llegue de verdad a Apollo/Evolution -- confunde pensar "ya le di a lanzar,
// deberia estar mandado" cuando en realidad nadie ha materializado/empujado nada
// todavia. lanzarCampanaAction llama esto UNA vez, justo despues de inscribir,
// reusando el mismo codigo que corre el ciclo periodico (materializar + push por
// canal) en vez de duplicarlo -- disparado ahora, no en el proximo intervalo.
export async function materializarYEmpujarAhora(): Promise<void> {
  await tareaMaterializar();
  const registro = crearRegistroEntrega();
  for (const canal of Object.keys(registro) as Canal[]) {
    if (canal === 'correo') {
      await tareaPushCorreo();
    } else {
      await tareaPush(canal, registro[canal]);
    }
  }
}

// Heartbeat por canal: hoy solo 'correo' tiene proveedor real (Apollo, mismo id que
// app/conectores/catalogo.ts para que la pantalla /conectores muestre el estado
// correcto). Un canal nuevo sin entrada aca cae al nombre del canal como heartbeat --
// razonable por default, se puede afinar cuando ese proveedor exista de verdad.
const HEARTBEAT_POR_CANAL: Partial<Record<Canal, string>> = { correo: 'apollo' };

function tareasPush(registro: ReturnType<typeof crearRegistroEntrega>): Tarea[] {
  return (Object.keys(registro) as Canal[])
    .filter((canal) => canal !== 'correo' && registro[canal] !== null)
    .map((canal) => ({
      nombre: `push:${canal}`,
      proveedorHeartbeat: HEARTBEAT_POR_CANAL[canal] ?? canal,
      ejecutar: () => tareaPush(canal, registro[canal]),
    }));
}

function construirTareas(): Tarea[] {
  const registroCompleto = crearRegistroEnvio();
  const registroEntrega = crearRegistroEntrega();
  return [
    { nombre: 'outbox', proveedorHeartbeat: 'notion', ejecutar: tareaOutbox },
    { nombre: 'materializar', proveedorHeartbeat: 'materializador', ejecutar: tareaMaterializar },
    { nombre: 'push:correo', proveedorHeartbeat: 'apollo', ejecutar: tareaPushCorreo },
    ...tareasPush(registroEntrega),
    { nombre: 'tracking', proveedorHeartbeat: 'apollo-tracking', ejecutar: () => tareaTracking(registroCompleto.correo) },
    { nombre: 'archivar-campanas', proveedorHeartbeat: 'archivador', ejecutar: () => tareaArchivarCampanas(registroCompleto.correo) },
  ];
}

// Aislado a proposito: si una tarea truena, se loguea en su propio heartbeat y el
// ciclo sigue con las demas. Con una sola tarea hoy el efecto es chico, pero define
// el patron para cuando cadencias/tracking (fases 4 y 5) se sumen al mismo `for`: un
// proveedor caido no debe congelar el drenado de outbox de los demas.
export async function ejecutarCiclo(tareas: Tarea[]): Promise<void> {
  for (const tarea of tareas) {
    try {
      await tarea.ejecutar();
      registrarHeartbeatConector(tarea.proveedorHeartbeat, 'ok');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      registrarHeartbeatConector(tarea.proveedorHeartbeat, `error: ${mensaje}`);
    }
  }
}

async function main() {
  // Sesion 2026-07-10: construir aca adentro (no a nivel de modulo) para que
  // importar este archivo por materializarYEmpujarAhora (lanzarCampanaAction) no
  // arme adaptadores reales de Apollo/Evolution como efecto secundario del import.
  const tareas = construirTareas();
  await ejecutarCiclo(tareas);
  const otra = () => {
    ejecutarCiclo(tareas).finally(() => setTimeout(otra, INTERVALO_MS));
  };
  setTimeout(otra, INTERVALO_MS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
