// Poll de tracking + reply detection (V5.5). Mismo estilo que outbox.ts/push.ts:
// logica pura, deps inyectadas, una campana caida no bloquea el poll de las demas.
import type { TrackingPoll, EventoProveedor } from './ports/envio';
import type { OrigenFin } from './reinscripcion';

// owner/idOrganizacion (2026-07-28): son lo que resuelve QUE PROVEEDOR lee esta campana,
// exactamente igual que en el camino de envio (agruparPendientesCorreo). Que no vinieran era
// la falla: sin ellos el poll no tenia con que preguntar y asumia Apollo para todo, incluidas
// las campanas mandadas por Gmail -- una respuesta por correo no cortaba la cadencia, y sin
// error de por medio (Apollo contesta 200 y lista vacia a un id que no es suyo, verificado en
// produccion). Preguntarle al proveedor equivocado se ve exactamente igual que "nadie
// contesto": por eso el ruteo es el arreglo y el rastro de errores de abajo no alcanza.
export type CampanaConSecuencia = { idCampana: number; proveedorCampanaId: string; owner: string | null; idOrganizacion: number };
export type DestinatarioResuelto = { idPasoInscripcion: number; idDestinatario: number; idInscripcion: number; idEmpresa: string };

// Que hay que consultarle a UN proveedor para UNA campana.
//
// `referencias` es lista porque la unidad de lectura NO es la misma en los dos proveedores:
// Apollo lee por secuencia (una referencia por campana, su emailer_campaign_id) y Gmail lee
// por HILO (una referencia por envio -- un hilo es un destinatario, Gmail no tiene concepto
// de campana externa, ver adapters/gmail.ts). Modelarlo como lista deja los dos casos en el
// mismo loop en vez de ramificar por proveedor dentro del core.
export type PollDeCampana = { proveedor: string; adaptador: TrackingPoll; referencias: string[] };

export type FallaPoll = {
  idCampana: number;
  proveedorCampanaId: string;
  proveedor: string;
  referencia: string;
  error: string;
};

// Lo que el llamador necesita para decidir si este ciclo estuvo bien (2026-07-28). Es la
// razon de ser del retorno: antes pollTracking devolvia void y el `catch { continue }` de
// abajo se tragaba TODO, asi que el worker no podia distinguir "ninguna campana fallo" de
// "fallaron todas" y estampaba 'ok' en el heartbeat en los dos casos.
//
// campanasConsultadas cuenta solo las que tenian al menos una referencia que consultar: una
// campana de Gmail que todavia no mando nada no tiene hilos, y no haber preguntado nada no
// es ni exito ni fracaso.
export type ResultadoPoll = { campanasConsultadas: number; campanasFallidas: number; fallas: FallaPoll[] };

export type TrackingDeps = {
  campanasConSecuencia: () => CampanaConSecuencia[];
  // Rutea la campana a su proveedor real. Es el arreglo del 2026-07-28: quien llama resuelve
  // aca el adaptador (Gmail para campana de Gmail, Apollo para campana de Apollo) reusando la
  // MISMA decision del camino de envio (decidirProveedorCorreo en adapters/registro-envio.ts),
  // y el core sigue sin conocer a ninguno de los dos por nombre.
  resolverPoll: (campana: CampanaConSecuencia) => PollDeCampana;
  // Correlaciona por (proveedorCampanaId, email) -- no por id de mensaje (ver
  // core/ports/envio.ts). null si el evento es de un contacto que no reconocemos.
  // Recibe SIEMPRE el proveedorCampanaId de la campana, nunca la referencia del poll: con
  // Gmail esa referencia es un hilo, que no identifica campana alguna en nuestra base.
  resolverDestinatario: (proveedorCampanaId: string, email: string) => DestinatarioResuelto | null;
  // Idempotente por proveedor_evento_id (indice unico, V5.1): 'duplicado' si ya
  // se proceso este evento en una corrida anterior.
  guardarEvento: (idPasoInscripcion: number, evento: EventoProveedor) => 'insertado' | 'duplicado';
  // origen es el DATO del que depende quien puede volver a la cadencia; motivo es la
  // prosa de la bitacora. Va en la firma y sin default a proposito (spec 2026-07-17):
  // una via de pausa nueva tiene que declarar de que tipo es, o el compilador para.
  pausarInscripcion: (idInscripcion: number, motivo: string, origen: OrigenFin) => void;
  marcarDestinatarioSalio: (idDestinatario: number) => void;
  quedanDestinatariosActivos: (idInscripcion: number) => boolean;
  // Aviso de respuesta (V6.1): se llama SIEMPRE junto a pausarInscripcion cuando el
  // evento es 'respondio', nunca por separado -- es aditivo, no reemplaza el corte
  // de cadencia que pausarInscripcion ya hace.
  registrarRespuestaDetectada: (idInscripcion: number, idEmpresa: string, canal: string) => void;
  // Se llama por CADA referencia que truena. Reemplaza al `catch { continue }` pelado: la
  // campana caida sigue sin bloquear a las demas (eso estaba bien), pero ahora deja dicho
  // cual, de que proveedor y con que error (eso faltaba).
  onFalla?: (falla: FallaPoll) => void;
};

// Ventana fija de lectura: no hay cursor incremental persistido todavia (eso es una
// optimizacion futura -- releer historia vieja cada corrida no rompe nada porque el
// indice unico de evento_tracking dedupe de todas formas).
const DIAS_VENTANA = 30;

export async function pollTracking(deps: TrackingDeps, ahora: Date = new Date()): Promise<ResultadoPoll> {
  const desde = new Date(ahora.getTime() - DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();
  const fallas: FallaPoll[] = [];
  let campanasConsultadas = 0;
  let campanasFallidas = 0;

  const anotar = (falla: FallaPoll) => {
    fallas.push(falla);
    deps.onFalla?.(falla);
  };
  const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

  for (const camp of deps.campanasConSecuencia()) {
    let plan: PollDeCampana;
    try {
      plan = deps.resolverPoll(camp);
    } catch (e) {
      // Resolver el proveedor puede tronar por su cuenta (credencial de Gmail ilegible, por
      // ejemplo). Cuenta como campana consultada y fallida: se quiso leer y no se pudo.
      campanasConsultadas++;
      campanasFallidas++;
      anotar({
        idCampana: camp.idCampana,
        proveedorCampanaId: camp.proveedorCampanaId,
        proveedor: 'sin resolver',
        referencia: camp.proveedorCampanaId,
        error: mensajeDe(e),
      });
      continue;
    }

    if (plan.referencias.length === 0) continue; // nada que consultar todavia (campana sin envios)
    campanasConsultadas++;
    let referenciasCaidas = 0;

    for (const referencia of plan.referencias) {
      let eventos: EventoProveedor[];
      try {
        eventos = await plan.adaptador.leerEventosNuevos(referencia, desde);
      } catch (e) {
        // Una referencia caida (secuencia archivada, hilo borrado) no bloquea a las demas.
        referenciasCaidas++;
        anotar({
          idCampana: camp.idCampana,
          proveedorCampanaId: camp.proveedorCampanaId,
          proveedor: plan.proveedor,
          referencia,
          error: mensajeDe(e),
        });
        continue;
      }

      for (const evento of eventos) {
        const destinatario = deps.resolverDestinatario(camp.proveedorCampanaId, evento.email);
        if (!destinatario) continue; // ruido: contacto que no reconocemos

        if (deps.guardarEvento(destinatario.idPasoInscripcion, evento) === 'duplicado') continue;

        if (evento.tipo === 'respondio') {
          // Reply de CUALQUIER destinatario pausa la inscripcion de inmediato (B6):
          // ningun paso futuro sale, sin importar si otros destinatarios siguen activos.
          deps.pausarInscripcion(destinatario.idInscripcion, 'respuesta detectada', 'respuesta');
          deps.registrarRespuestaDetectada(destinatario.idInscripcion, destinatario.idEmpresa, evento.canal);
        } else if (evento.tipo === 'rebota') {
          deps.marcarDestinatarioSalio(destinatario.idDestinatario);
          if (!deps.quedanDestinatariosActivos(destinatario.idInscripcion)) {
            deps.pausarInscripcion(destinatario.idInscripcion, 'todos los destinatarios salieron (rebote)', 'rebote');
          }
        }
      }
    }

    // La campana cuenta como fallida solo si NINGUNA de sus referencias respondio. Con Gmail
    // un hilo roto entre veinte sanos no es una campana caida, y contarlo asi convertiria
    // cualquier ruido en una alarma que despues nadie mira.
    if (referenciasCaidas === plan.referencias.length) campanasFallidas++;
  }

  return { campanasConsultadas, campanasFallidas, fallas };
}
