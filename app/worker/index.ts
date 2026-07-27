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
  registrarRespuestaDetectada,
  leerConfiguracionAdmin,
  guardarConfiguracionAdmin,
  enviosGmailHoy,
  snapshotEstados,
} from '../db/repository';
import { drenarOutbox } from '../core/outbox';
import { pushPendientes } from '../core/push';
import { pollTracking } from '../core/tracking';
import type { ConfigCalendario } from '../core/motor-cadencia';
import { dentroDeVentana, esperaEntreMensajes, VENTANA_DEFAULT, ESPACIADO_WHATSAPP_DEFAULT } from '../core/ventana-envio';
import { crearNotionAdapter } from '../adapters/notion';
import { crearRegistroEnvio, crearRegistroEntrega, agruparPendientesCorreo } from '../adapters/registro-envio';
import { hoy } from '../lib/reloj';
import { fechaBogotaISO, horaBogota } from '../lib/date-utils';
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

// Gate del drenado de outbox hacia Notion (2026-07-24). Default APAGADO, y apagado quiere
// decir que la tarea ni siquiera se registra en el ciclo: el brain escribe Notion por su
// cuenta y nunca encola en `outbox`, asi que en produccion la tabla tiene 2 filas, las dos
// fallidas desde julio -- este camino nunca entrego nada. Dejarlo corriendo solo suma
// reintentos contra Notion y ensucia el heartbeat de 'notion', que ademas termina
// reportando el conector como caido por un camino que nadie usa.
//
// tareaOutbox y core/outbox.ts se quedan intactos a proposito: reencender esto es poner
// OUTBOX_NOTION_ENABLED=true (o =1) en el entorno, sin volver a tocar codigo.
//
// Encendido SOLO con valor explicito: variable ausente, vacia o con cualquier otro valor
// es apagado. Se lee en cada llamada (no en una constante de modulo) para que los tests
// puedan alternarla, mismo criterio que syncExtendidoHabilitado en adapters/notion.ts.
function outboxNotionHabilitado(): boolean {
  const valor = (process.env.OUTBOX_NOTION_ENABLED ?? '').trim().toLowerCase();
  return valor === 'true' || valor === '1';
}

// V? (materializador): antes de esto, inscribirCampana dejaba la inscripcion activa
// pero nunca escribia paso_inscripcion -- nada llegaba a /cola para NINGUN canal (ver
// planning/experimento-apollo.md, Hallazgo real #4). Corre primero en el ciclo (antes
// de tareaPush) para que el correo recien materializado alcance a salir en la misma
// pasada, mismo catch-up-first que el resto del worker.
// hoy() y no new Date(): esta funcion la llama el worker (proceso aparte, sin sesion, donde
// hoy() es la fecha real y punto) PERO tambien materializarYEmpujarAhora, que corre DENTRO
// del request de "Siguiente dia" y de lanzarCampanaAction. En ese caso hay que respetar el
// reloj de demo, o el boton miente: el banner dice "Dia simulado: +1" porque las paginas si
// leen hoy(), mientras el materializador calculaba contra la fecha real y no encontraba
// nada debido. Sintoma exacto (2026-07-15): avanzar el dia no hacia nada, el paso 2 nunca
// se materializaba. offsetActual() ya se defiende solo -- devuelve 0 si no hay modo prueba,
// asi que el worker sigue viendo la fecha real sin cambiar nada.
async function tareaMaterializar(): Promise<void> {
  materializarPasosDebidos(hoy(), CONFIG_CALENDARIO_DEFAULT);
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
// 'worker'  = ciclo automatico y desatendido (nadie espera la respuesta).
// 'manual'  = lo disparo un humano a proposito ("Lanzar hoy" / "Siguiente dia", via
//             materializarYEmpujarAhora) y hay un request esperando del otro lado.
//
// Cambian dos cosas (2026-07-16), y las dos por una razon concreta:
//  - VENTANA horaria: solo en 'worker'. Si Sebastian aprieta lanzar a las 11pm, sabe que son
//    las 11pm; bloquearlo en silencio seria peor que el problema que la ventana resuelve, y
//    romperia la demo. El riesgo real es el goteo masivo desatendido, no un click explicito.
//  - ESPACIADO: en 'worker' es el jitter completo (45-90s), que es lo que de verdad protege
//    la linea del ban. En 'manual' seria inaceptable: 30 empresas x 60s = 30 minutos con el
//    request colgado. Ahi se usa un espaciado corto y fijo (el mismo 3s que Gmail ya usaba),
//    que protege algo sin tumbar la pantalla. El grueso del envio de una campana igual sale
//    por el worker (el goteo reparte las empresas por dia), asi que el jitter largo cubre el
//    caso que importa.
type ModoPush = 'worker' | 'manual';
const ESPACIADO_MANUAL_MS = 3000;

// Cada cuanto sale un WhatsApp del worker, configurable sin desplegar (2026-07-26). El
// default sigue siendo el mismo 45-90s de siempre; las claves existen para poder decir "uno
// cada dos minutos" (min 120000) mientras se mira como se comporta la linea, y para poder
// bajarlo despues sin tocar codigo. Mismo patron que gmail_tope_diario, que ya vive ahi.
//
// Sigue siendo un RANGO y no un numero: un mensaje cada exactamente 120s es tan patron de bot
// como mandarlos todos juntos, asi que un min sin max se abre un 25% hacia arriba en vez de
// quedar fijo. Un max menor o igual al min tambien cae ahi: una config incoherente no puede
// terminar en un intervalo de reloj.
const ESPACIADO_APERTURA_RELATIVA = 1.25;

export function espaciadoWhatsapp(): { minMs: number; maxMs: number } {
  const minMs = configNumeroAdmin('whatsapp_espaciado_min_ms', ESPACIADO_WHATSAPP_DEFAULT.minMs);
  const maxConfigurado = configNumeroAdmin('whatsapp_espaciado_max_ms', ESPACIADO_WHATSAPP_DEFAULT.maxMs);
  return { minMs, maxMs: maxConfigurado > minMs ? maxConfigurado : Math.round(minMs * ESPACIADO_APERTURA_RELATIVA) };
}

async function tareaPush(
  canal: Canal,
  envio: ReturnType<typeof crearRegistroEntrega>[Canal],
  modo: ModoPush = 'worker',
): Promise<void> {
  if (!envio) return; // canal sin proveedor automatico (llamada/whatsapp hoy): nada que empujar

  // Antes esto empujaba TODO lo debido de una, a cualquier hora: 30 WhatsApps en un minuto
  // por la misma linea es patron de bot y WhatsApp banea la linea (se cae el canal entero,
  // no se recupera). Lo que no se manda ahora queda 'pendiente' y sale en el proximo ciclo
  // del worker -- mismo mecanismo que ya usa el tope diario de Gmail, no se pierde ni se
  // marca fallo.
  //
  // Solo aplica a whatsapp: correo va por tareaPushCorreo, y llamada no tiene proveedor.
  const ahora = new Date();
  if (canal === 'whatsapp' && modo === 'worker') {
    const veredicto = dentroDeVentana(ahora, VENTANA_DEFAULT);
    if (!veredicto.puede) {
      console.log(`[push:whatsapp] no se manda nada este ciclo: ${veredicto.motivo}`);
      return;
    }
  }

  const espaciado =
    canal !== 'whatsapp'
      ? 0
      : modo === 'worker'
        ? () => esperaEntreMensajes(espaciadoWhatsapp()) // jitter, no intervalo fijo
        : ESPACIADO_MANUAL_MS;

  await pushPendientes(
    {
      pendientes: () => pasoInscripcionesPendientes(canal),
      marcarEnviando: marcarPasoInscripcionEnviando,
      marcarEnviada: marcarPasoInscripcionEnviada,
      marcarFallo: marcarPasoInscripcionFallo,
    },
    envio,
    ahora,
    espaciado,
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

function configNumeroAdmin(clave: string, porDefecto: number): number {
  const val = leerConfiguracionAdmin(clave);
  const n = val ? Number(val) : NaN;
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export async function tareaPushCorreo(modo: ModoPush = 'worker'): Promise<void> {
  const ahora = new Date();

  // Misma ventana horaria que WhatsApp (2026-07-16), y con la misma excepcion para el
  // empuje manual (ver el comentario de tareaPush): un correo comercial a las 2am no solo
  // no sirve, quema la cuenta con el prospecto. El tope diario y el throttle de Gmail que ya
  // existian son otra cosa (limite del proveedor), esto es la hora del dia.
  if (modo === 'worker') {
    const veredicto = dentroDeVentana(ahora, VENTANA_DEFAULT);
    if (!veredicto.puede) {
      console.log(`[push:correo] no se manda nada este ciclo: ${veredicto.motivo}`);
      return;
    }
  }

  const topeDiario = configNumeroAdmin('gmail_tope_diario', GMAIL_TOPE_DIARIO_DEFAULT);
  const throttleMs = configNumeroAdmin('gmail_throttle_ms', GMAIL_THROTTLE_MS_DEFAULT);

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
      registrarRespuestaDetectada,
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
//
// modo 'manual' (2026-07-16): sin ventana horaria y con espaciado corto -- hay un request
// esperando del otro lado. Ver el comentario de tareaPush para el porque de cada uno.
export async function materializarYEmpujarAhora(): Promise<void> {
  await tareaMaterializar();
  const registro = crearRegistroEntrega();
  for (const canal of Object.keys(registro) as Canal[]) {
    if (canal === 'correo') {
      await tareaPushCorreo('manual');
    } else {
      await tareaPush(canal, registro[canal], 'manual');
    }
  }
}

// --- snapshot_estados: la foto diaria de etapas -----------------------------------------
//
// APAGADA POR DEFAULT (2026-07-25). Se enciende con SNAPSHOT_ESTADOS_ENABLED=true (o =1) en
// el entorno del worker y reiniciando, sin volver a tocar codigo. El default apagado es para
// que desplegar el codigo y empezar a escribir historial sean dos decisiones separadas: la
// tarea depende de `empresa_estado_snapshot`, que crea la migracion 0014, y un despliegue por
// delante de su migracion solo llenaria el heartbeat de "no such table".
//
// Misma mecanica de gate que outboxNotionHabilitado: apagado quiere decir que la tarea ni
// siquiera se registra en el ciclo, y solo un valor explicito enciende (vacio, 0, false o
// cualquier otra cosa es apagado). Se lee en cada llamada, no en una constante de modulo, para
// que los tests puedan alternarla.
const ORGANIZACION_SNAPSHOT = 1; // unica organizacion real (misma constante que app/mcp/tools.ts)
const SNAPSHOT_HORA_DEFAULT = 5; // 5am Bogota: antes del barrido de /dia-sales y nadie mueve tarjetas a esa hora
const CLAVE_ULTIMA_FOTO = 'snapshot_estados_ultima_fecha';

function snapshotEstadosHabilitado(): boolean {
  const valor = (process.env.SNAPSHOT_ESTADOS_ENABLED ?? '').trim().toLowerCase();
  return valor === 'true' || valor === '1';
}

// Hora objetivo en BOGOTA, no en la del proceso (el host del VPS corre en UTC). Fuera de
// rango o no numerica cae al default en vez de reventar: una variable mal escrita no puede
// dejar la foto sin tomarse.
function snapshotHoraObjetivo(): number {
  const crudo = (process.env.SNAPSHOT_ESTADOS_HORA ?? '').trim();
  // El vacio se corta ANTES del Number: Number('') es 0, no NaN, asi que sin este return una
  // variable ausente daba hora objetivo 0 y la compuerta quedaba abierta las 24 horas.
  if (crudo === '') return SNAPSHOT_HORA_DEFAULT;
  const n = Number(crudo);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : SNAPSHOT_HORA_DEFAULT;
}

// UNA VEZ AL DIA, y esto no es optimizacion: correrla en cada ciclo CORROMPE el historial.
// snapshotEstados deriva transiciones comparando el estado actual contra la foto ANTERIOR, no
// contra la de hoy. Si una cuenta va A -> B a las 10am, el ciclo de las 10:05 escribe A -> B;
// si despues va B -> C a las 3pm, el ciclo de las 15:05 compara contra la misma foto anterior
// (A) y escribe A -> C, que es un movimiento que nunca ocurrio. El dedupe no lo atrapa porque
// mira estado_nuevo=C y esa fila no existe. La foto en si es idempotente; las transiciones no.
//
// El marcador va en configuracion_admin y NO en el heartbeat de la tarea: ejecutarCiclo estampa
// ultima_corrida en CADA ciclo, incluso cuando la tarea sale temprano por la hora, asi que
// usarlo como "ya corrio hoy" la dejaria sin correr nunca. Persiste en la base, asi que un
// reinicio del worker a media tarde tampoco la vuelve a disparar.
//
// El marcador se escribe DESPUES de que snapshotEstados vuelve bien. Si truena, no se marca y
// el proximo ciclo (5 min) reintenta.
// `ahora` es parametro (con default) y no `new Date()` adentro para que el test pueda fijar la
// hora sin tocar el reloj del proceso, mismo criterio que el `modo` de tareaPush.
export async function tareaSnapshotEstados(ahora: Date = new Date()): Promise<void> {
  const fecha = fechaBogotaISO(ahora);

  if (horaBogota(ahora) < snapshotHoraObjetivo()) return;
  if (leerConfiguracionAdmin(CLAVE_ULTIMA_FOTO) === fecha) return;

  // Sin try/catch a proposito: que reviente. ejecutarCiclo lo atrapa y deja
  // `error: <mensaje>` en el heartbeat de 'snapshot-estados', que es el rastro que se
  // consulta. Tragarse el error aca y devolver normal es exactamente el modo de falla del
  // adaptador de Notion (heartbeat en ok mientras no entregaba nada); no se repite.
  const r = snapshotEstados(fecha, ORGANIZACION_SNAPSHOT);
  guardarConfiguracionAdmin(CLAVE_ULTIMA_FOTO, fecha);

  console.log(
    `[snapshot-estados] ${fecha} (anterior: ${r.fechaAnterior ?? 'ninguna'}): ` +
      `${r.filasEscritas} filas de foto, ${r.filasYaExistian} ya estaban, ` +
      `${r.transiciones.length} transiciones escritas, ` +
      `${r.transicionesYaRegistradas} ya registradas por otra via, ` +
      `${r.salidasDelEmbudoNoEscritas.length} salidas del embudo no escritas`,
  );
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

// Exportada (2026-07-24) para que worker.test.ts pueda verificar las dos ramas del gate de
// outbox sin arrancar el proceso del worker.
export function construirTareas(): Tarea[] {
  const registroCompleto = crearRegistroEnvio();
  const registroEntrega = crearRegistroEntrega();
  return [
    ...(outboxNotionHabilitado()
      ? ([{ nombre: 'outbox', proveedorHeartbeat: 'notion', ejecutar: tareaOutbox }] as Tarea[])
      : []),
    // Primera del ciclo cuando esta encendida: la foto es del estado con el que arranco el dia,
    // asi que se toma antes de que nada mas del ciclo corra.
    ...(snapshotEstadosHabilitado()
      ? ([{ nombre: 'snapshot-estados', proveedorHeartbeat: 'snapshot-estados', ejecutar: () => tareaSnapshotEstados() }] as Tarea[])
      : []),
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
