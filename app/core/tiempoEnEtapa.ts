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

// Exportada (ademas de usarse arriba): velocidadCambioEtapa (Fase 4) necesita el mismo
// calculo para convertir [desde, hasta] en "cuantos dias tiene la ventana", y duplicar la
// resta de fechas en otro archivo es exactamente el tipo de cosa que rompe silenciosamente
// cuando alguien ajusta el redondeo aca y no alla.
export function diasEntre(inicio: string, fin: string): number {
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

// Ciclo de venta completo (Fase 4, metrica 2 del plan-produccion-cro-campana.md): desde la
// primera transicion registrada hasta que la empresa llega a 'firma_pago' (ya cliente).
// Separado de calcularDuracionPorEtapa (que mide CADA ventana) porque esto es una sola
// medida de punta a punta del historial entero.
//
// cerrado=false (todavia no llego a firma_pago) tambien devuelve dias -- es el ciclo EN
// CURSO medido contra "ahora" -- para que el caller decida si lo promedia aparte o lo
// descarta; esta funcion no toma esa decision de agregacion, solo mide UNA empresa.
export type CicloVenta = {
  dias: number;
  cerrado: boolean;
};

export function calcularCicloVenta(historial: HistorialEtapasInput, ahora: string): CicloVenta | null {
  if (historial.transiciones.length === 0) return null;
  const inicio = historial.transiciones[0].fecha;
  const cierre = historial.transiciones.find((t) => t.estado === 'firma_pago');
  if (cierre) return { dias: diasEntre(inicio, cierre.fecha), cerrado: true };
  return { dias: diasEntre(inicio, ahora), cerrado: false };
}
