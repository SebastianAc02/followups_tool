// Fase 8, Task 8.2: goteo de ingreso. No es el motor de TOQUES de una cuenta ya inscrita
// (eso es motor-cadencia.ts / calcularCalendario) sino cuantos contactos NUEVOS entran a
// la campana cada dia. Puro y determinista: mismas entradas, misma salida.

import { sumarDias, diaSemana } from '../lib/date-utils';

export type RitmoIngreso = 'diario' | 'dia_si_dia_no' | 'personalizado';

export type DiaGoteo = { fecha: string; cuantos: number };

export type ResultadoGoteo = {
  porDia: DiaGoteo[];
  diasHabiles: number;
};

// Fin de semana bloqueado para el goteo (sabado=6, domingo=0). El goteo de ingreso siempre
// respeta dias habiles; no hay UI hoy para configurar esto distinto (a diferencia de
// ConfigCalendario, que sí deja bloquear otros dias para los TOQUES de una cadencia ya
// activa). Si mas adelante se necesita, se puede parametrizar igual que ConfigCalendario.
const FIN_DE_SEMANA = [0, 6];

function esHabil(iso: string): boolean {
  return !FIN_DE_SEMANA.includes(diaSemana(iso));
}

function siguienteHabil(iso: string): string {
  let fecha = iso;
  while (!esHabil(fecha)) fecha = sumarDias(fecha, 1);
  return fecha;
}

// Decision de Sebastian (checkpoint 8.2): en dia_si_dia_no el cupo completo (intakeDiario)
// entra en cada dia ACTIVO, sin repartir a la mitad. Los dias "no" no meten a nadie, pero
// siguen contando como dia habil transcurrido (afectan diasHabiles, no el reparto).
//
// 'personalizado' no tiene mas especificacion todavia (ni en el plan ni en el schema hoy).
// Se trata como placeholder que se comporta igual que 'diario' hasta que haya una decision
// de dominio real que lo distinga (ej. ritmo variable por dia de semana).
export function calcularGoteo(
  total: number,
  intakeDiario: number,
  ritmo: RitmoIngreso,
  inicio: string,
): ResultadoGoteo {
  const porDia: DiaGoteo[] = [];

  if (total <= 0 || intakeDiario <= 0) {
    return { porDia, diasHabiles: 0 };
  }

  let restante = total;
  let fecha = siguienteHabil(inicio);
  let diaIndex = 0; // cuenta dias HABILES transcurridos desde el primero (0-based)
  let diasHabiles = 0;

  while (restante > 0) {
    diasHabiles += 1;
    const activo = ritmo === 'dia_si_dia_no' ? diaIndex % 2 === 0 : true;
    if (activo) {
      const cuantos = Math.min(intakeDiario, restante);
      porDia.push({ fecha, cuantos });
      restante -= cuantos;
    }
    diaIndex += 1;
    if (restante > 0) fecha = siguienteHabil(sumarDias(fecha, 1));
  }

  return { porDia, diasHabiles };
}
