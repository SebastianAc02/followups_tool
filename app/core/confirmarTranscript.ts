import type { SesionTranscript } from './ports/transcript';

// El core no importa el Repository directo (violaria el aislamiento de capas); recibe
// lo que necesita por dependencias inyectadas. La UI/action real (V3.4) le pasa
// funciones que sí tocan la DB.
export type ConfirmarTranscriptDeps = {
  leerToque: (idToque: number) => { transcriptId: string | null } | undefined;
  escribirCompleto: (idToque: number, sesion: SesionTranscript) => void;
  escribirSoloPuntero: (idToque: number, sesion: SesionTranscript) => void;
};

export function confirmarTranscript(idToque: number, sesion: SesionTranscript, deps: ConfirmarTranscriptDeps): void {
  const actual = deps.leerToque(idToque);
  const esMismaGrabacionYaConfirmada = actual?.transcriptId === sesion.transcriptId;

  if (esMismaGrabacionYaConfirmada) {
    // Ya se confirmo esta grabacion antes: que_paso quedo en territorio humano desde
    // esa primera confirmacion (Sebastian pudo haberlo editado). Solo se refresca el
    // puntero (proveedor/id/url), nunca el texto.
    deps.escribirSoloPuntero(idToque, sesion);
  } else {
    // Primera confirmacion de este toque, o Sebastian eligio una grabacion DISTINTA:
    // en ambos casos es una decision nueva, se escribe todo de cero.
    deps.escribirCompleto(idToque, sesion);
  }
}
