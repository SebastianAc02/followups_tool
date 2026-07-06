// Poll de tracking + reply detection (V5.5). Mismo estilo que outbox.ts/push.ts:
// logica pura, deps inyectadas, una campana caida no bloquea el poll de las demas.
import type { EnvioAdapter, EventoProveedor } from './ports/envio';

export type CampanaConSecuencia = { idCampana: number; proveedorCampanaId: string };
export type DestinatarioResuelto = { idPasoInscripcion: number; idDestinatario: number; idInscripcion: number };

export type TrackingDeps = {
  campanasConSecuencia: () => CampanaConSecuencia[];
  // Correlaciona por (proveedorCampanaId, email) -- no por id de mensaje (ver
  // core/ports/envio.ts). null si el evento es de un contacto que no reconocemos.
  resolverDestinatario: (proveedorCampanaId: string, email: string) => DestinatarioResuelto | null;
  // Idempotente por proveedor_evento_id (indice unico, V5.1): 'duplicado' si ya
  // se proceso este evento en una corrida anterior.
  guardarEvento: (idPasoInscripcion: number, evento: EventoProveedor) => 'insertado' | 'duplicado';
  pausarInscripcion: (idInscripcion: number, motivo: string) => void;
  marcarDestinatarioSalio: (idDestinatario: number) => void;
  quedanDestinatariosActivos: (idInscripcion: number) => boolean;
};

// Ventana fija de lectura: no hay cursor incremental persistido todavia (eso es una
// optimizacion futura -- releer historia vieja cada corrida no rompe nada porque el
// indice unico de evento_tracking dedupe de todas formas).
const DIAS_VENTANA = 30;

export async function pollTracking(deps: TrackingDeps, envio: EnvioAdapter, ahora: Date = new Date()): Promise<void> {
  const desde = new Date(ahora.getTime() - DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();

  for (const camp of deps.campanasConSecuencia()) {
    let eventos: EventoProveedor[];
    try {
      eventos = await envio.leerEventosNuevos(camp.proveedorCampanaId, desde);
    } catch {
      continue; // una campana caida (secuencia archivada, etc.) no bloquea a las demas
    }

    for (const evento of eventos) {
      const destinatario = deps.resolverDestinatario(camp.proveedorCampanaId, evento.email);
      if (!destinatario) continue; // ruido: contacto que no reconocemos

      if (deps.guardarEvento(destinatario.idPasoInscripcion, evento) === 'duplicado') continue;

      if (evento.tipo === 'respondio') {
        // Reply de CUALQUIER destinatario pausa la inscripcion de inmediato (B6):
        // ningun paso futuro sale, sin importar si otros destinatarios siguen activos.
        deps.pausarInscripcion(destinatario.idInscripcion, 'respuesta detectada');
      } else if (evento.tipo === 'rebota') {
        deps.marcarDestinatarioSalio(destinatario.idDestinatario);
        if (!deps.quedanDestinatariosActivos(destinatario.idInscripcion)) {
          deps.pausarInscripcion(destinatario.idInscripcion, 'todos los destinatarios salieron (rebote)');
        }
      }
    }
  }
}
