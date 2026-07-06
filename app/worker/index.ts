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
} from '../db/repository';
import { drenarOutbox } from '../core/outbox';
import { pushPendientes } from '../core/push';
import { pollTracking } from '../core/tracking';
import { crearNotionAdapter } from '../adapters/notion';
import { crearApolloAdapter } from '../adapters/apollo';

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

// V5.4: push reanudable de cadencias por Apollo. Aislada de outbox (si Apollo esta
// caido, Notion sigue drenando igual, y viceversa -- mismo principio del comentario
// de arriba en ejecutarCiclo).
async function tareaPush(): Promise<void> {
  await pushPendientes(
    {
      pendientes: pasoInscripcionesPendientes,
      marcarEnviando: marcarPasoInscripcionEnviando,
      marcarEnviada: marcarPasoInscripcionEnviada,
      marcarFallo: marcarPasoInscripcionFallo,
    },
    crearApolloAdapter(),
  );
}

// V5.5: poll de tracking + reply detection. Heartbeat propio ('apollo-tracking', no
// 'apollo') para que un fallo aca no pise el heartbeat de tareaPush en el mismo ciclo.
async function tareaTracking(): Promise<void> {
  await pollTracking(
    {
      campanasConSecuencia,
      resolverDestinatario: resolverDestinatarioPorEmail,
      guardarEvento: guardarEventoTracking,
      pausarInscripcion,
      marcarDestinatarioSalio,
      quedanDestinatariosActivos,
    },
    crearApolloAdapter(),
  );
}

const TAREAS: Tarea[] = [
  { nombre: 'outbox', proveedorHeartbeat: 'notion', ejecutar: tareaOutbox },
  { nombre: 'push', proveedorHeartbeat: 'apollo', ejecutar: tareaPush },
  { nombre: 'tracking', proveedorHeartbeat: 'apollo-tracking', ejecutar: tareaTracking },
];

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
  await ejecutarCiclo(TAREAS);
  const otra = () => {
    ejecutarCiclo(TAREAS).finally(() => setTimeout(otra, INTERVALO_MS));
  };
  setTimeout(otra, INTERVALO_MS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
