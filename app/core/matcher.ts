import type { SesionTranscript } from './ports/transcript';

// Verificado contra datos reales de Granola (V3.3): un intento fallido puede quedar
// como nota vacia (resumen ""); eso no aporta nada para confirmar, se descarta antes
// de agrupar. Lo que queda son sesiones CON contenido real; si dos de esas estan a
// menos de 1 hora, son la MISMA llamada partida por Granola en dos documentos (nunca
// dos toques por una sesion). Mas alla de eso, o fuera de la ventana del toque, son
// intentos distintos y se muestran todos para que Sebastian elija.
const FUSION_MINUTOS = 60;
const VENTANA_MAX_HORAS = 12;

export type CandidataOFusion = SesionTranscript & { fusionadaDe: string[] };

function minutosEntre(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

function tieneContenido(s: SesionTranscript): boolean {
  return Boolean(s.resumen && s.resumen.trim().length > 0);
}

export function agruparCandidatas(candidatas: SesionTranscript[], fechaToque: string): CandidataOFusion[] {
  const conContenido = candidatas.filter(
    (s) => tieneContenido(s) && minutosEntre(s.fecha, fechaToque) <= VENTANA_MAX_HORAS * 60,
  );
  const ordenadas = [...conContenido].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const resultado: CandidataOFusion[] = [];
  for (const sesion of ordenadas) {
    const anterior = resultado[resultado.length - 1];
    const seFusiona = anterior && minutosEntre(sesion.fecha, anterior.fecha) <= FUSION_MINUTOS;

    if (seFusiona) {
      const anteriorGana = (anterior.resumen?.length ?? 0) >= (sesion.resumen?.length ?? 0);
      resultado[resultado.length - 1] = anteriorGana
        ? { ...anterior, fusionadaDe: [...anterior.fusionadaDe, sesion.transcriptId] }
        : { ...sesion, fusionadaDe: [...anterior.fusionadaDe, sesion.transcriptId] };
    } else {
      resultado.push({ ...sesion, fusionadaDe: [sesion.transcriptId] });
    }
  }

  return resultado.sort((a, b) => minutosEntre(a.fecha, fechaToque) - minutosEntre(b.fecha, fechaToque));
}
