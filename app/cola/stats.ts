import type { ContadoresHoy } from "../db/repository";

// "Cerradas" = contadores.total: cualquier toque registrado hoy, sin importar el
// resultado. Sigue el mismo criterio que ya usa app/page.tsx ("Ayer cerraste X" se
// arma con hechoAyer.total, ver linea 76) -- se reusa esa convencion ya establecida
// en vez de inventar una regla distinta para el mismo dato.
export function contarCerradas(contadores: ContadoresHoy): number {
  return contadores.total;
}
