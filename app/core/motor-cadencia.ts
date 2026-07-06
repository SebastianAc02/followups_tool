// Motor de cadencia EN SECO (Fase 4): logica pura, sin DB ni envios. Produce lo que
// "tocaria" hacer, no lo hace. V4.4 aporta el reparto A/B por peso; V4.6 agrega el
// calculo de fechas. Todo aca es determinista: mismas entradas -> mismas salidas, para
// que el motor sea testeable y predecible (nada de Math.random).

export type VersionPeso = { id: number; peso: number };

// Reparto A/B determinista por peso. Dado el indice del destinatario (su posicion en el
// orden de inscripcion), elige que version le toca. Metodo: bucketing por
// indice mod pesoTotal. Para pesos [2,1] (total 3): posiciones 0,1 -> primera version,
// 2 -> segunda, y cicla. Exactamente proporcional en cada bloque de pesoTotal.
// Versiones con peso 0 no participan (una version apagada no debe recibir trafico).
export function elegirVersionPorPeso(versiones: VersionPeso[], indice: number): number {
  const conPeso = versiones.filter((v) => v.peso > 0);
  if (conPeso.length === 0) {
    throw new Error('no hay versiones con peso > 0 para repartir');
  }
  const total = conPeso.reduce((s, v) => s + v.peso, 0);
  // maneja indices negativos por si acaso (((i % n) + n) % n)
  let p = ((indice % total) + total) % total;
  for (const v of conPeso) {
    if (p < v.peso) return v.id;
    p -= v.peso;
  }
  // inalcanzable: p < total garantiza que alguna rama de arriba retorna.
  return conPeso[conPeso.length - 1].id;
}
