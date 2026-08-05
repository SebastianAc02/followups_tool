// Responde la segunda pregunta que la pantalla vieja escondía: qué está esperando algo del
// operador. bloqueado_por_tarea es deuda propia (Jigartel llevaba desde el 22-jul quieta por un
// número de gerente que faltaba conseguir) y hoy se mezclaba entre "las que no contestan" -- no
// es que el prospecto no responda, es que el operador no ha hecho su parte. Tono propio (ámbar,
// no rojo de advertencia ni gris de frío) para que no se lea como una más de la lista.
import { textoDiasEnEstado } from '../tanda.variants';
import type { GrupoTanda } from '../../seguimiento/tandas-datos';

export function DeudaOperadorCallout({ grupo }: { grupo: GrupoTanda | null }) {
  if (!grupo) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-400">
        Esperando de ti · {grupo.total}
      </div>
      <ul className="space-y-1.5">
        {grupo.cuentas.map((c) => (
          <li key={c.idEmpresa}>
            <article data-empresa-id={c.idEmpresa} className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-soft">{c.cuenta}</span>
              <span className="flex-shrink-0 text-faint">{c.evidencia.valor ?? textoDiasEnEstado(c.diasEnEstado)}</span>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
