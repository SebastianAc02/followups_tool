// Diff puro: las que aparecen en el conjunto relajado pero no en el estricto entraron
// por el relleno a la meta que hizo el Copiloto. La UI las pinta distinto para que se
// revisen con mas ojo.
export function marcarRelajadas(idsEstrictas: string[], idsRelajadas: string[]): { id: string; relajada: boolean }[] {
  const duras = new Set(idsEstrictas);
  return idsRelajadas.map((id) => ({ id, relajada: !duras.has(id) }));
}
