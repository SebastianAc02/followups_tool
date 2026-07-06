// Modulo PURO de la ventana de actividad del panel (Fase 7). Sin DB, sin imports
// externos. Fechas en UTC para que el dia de la semana no dependa de la zona horaria.

export const DIAS_HABILES = 7;

function partes(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

export function esDiaHabil(iso: string): boolean {
  const [y, m, d] = partes(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo ... 6=sabado
  return dow >= 1 && dow <= 5;
}

export function restarUnDia(iso: string): string {
  const [y, m, d] = partes(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

export function promedioDiario(totalToques: number): number {
  return totalToques / DIAS_HABILES;
}

// Ventana de los ultimos DIAS_HABILES dias HABILES anteriores a hoy. `hasta` es
// siempre ayer literal (aunque sea fin de semana); `desde` es el dia habil mas
// antiguo que hay que contar para juntar DIAS_HABILES habiles. Los fines de
// semana que caigan en medio del rango quedan dentro de [desde, hasta] aunque no
// cuenten como habiles: sus toques suman despues al calcular el promedio.
export function ventanaPromedio(hoy: string): { desde: string; hasta: string } {
  const hasta = restarUnDia(hoy);
  let cursor = hasta;
  let desde = hasta;
  let habilesContados = 0;
  while (habilesContados < DIAS_HABILES) {
    if (esDiaHabil(cursor)) {
      desde = cursor;
      habilesContados++;
    }
    if (habilesContados < DIAS_HABILES) cursor = restarUnDia(cursor);
  }
  return { desde, hasta };
}
