// Dominio puro: cuanto tiempo paso una empresa en cada etapa del pipeline. NO importa
// Notion ni el driver de DB -- recibe el historial ya leido (mismo shape que devuelve
// historialEtapasEmpresa en app/db/repository.ts, pero definido aca aparte para no
// importar el Repository desde el core) y un "ahora" explicito, nunca Date.now() adentro
// (mantiene la funcion pura y testeable).
//
// El historial solo trae transiciones desde que actualizarEstadoNotion empezo a
// registrar (coincide con la primera activacion real); "lead" antes de eso no tiene
// fila, y por eso no necesita caso especial: el timeline arranca donde arranca el dato.

export type TransicionEtapa = {
  estado: string;
  fecha: string; // ISO
};

export type HistorialEtapasInput = {
  transiciones: TransicionEtapa[]; // orden ascendente por fecha
};

export type DuracionEtapa = {
  estado: string;
  fechaInicio: string;
  fechaFin: string | null; // null = etapa actual, todavia abierta
  dias: number;
};

function diasEntre(inicio: string, fin: string): number {
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / (24 * 60 * 60 * 1000));
}

export function calcularDuracionPorEtapa(historial: HistorialEtapasInput, ahora: string): DuracionEtapa[] {
  return historial.transiciones.map((t, i) => {
    const siguiente = historial.transiciones[i + 1];
    const fechaFin = siguiente ? siguiente.fecha : null;
    return {
      estado: t.estado,
      fechaInicio: t.fecha,
      fechaFin,
      dias: diasEntre(t.fecha, fechaFin ?? ahora),
    };
  });
}
