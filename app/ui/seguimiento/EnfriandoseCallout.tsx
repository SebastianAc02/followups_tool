// Responde de frente la primera pregunta que la pantalla vieja no contestaba: quién se está
// enfriando de verdad. Cruza TODAS las tandas por días en el estado (ver masViejasEnEstado en
// app/seguimiento/tandas-datos.ts) -- una cuenta con 20 días sin respuesta no es lo mismo que una
// de 2, y en la vista por columnas esa diferencia solo se ve si se abren y comparan varias
// columnas a mano. Acá está arriba, ya comparada.
import { TANDA_LABEL, textoDiasEnEstado } from '../tanda.variants';
import type { CuentaTanda } from '../../seguimiento/tandas-datos';

export function EnfriandoseCallout({ cuentas }: { cuentas: CuentaTanda[] }) {
  if (cuentas.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-overdue/25 bg-overdue-bg/40 px-4 py-3.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-overdue">Se están enfriando</div>
      <ul className="space-y-1.5">
        {cuentas.map((c) => (
          <li key={c.idEmpresa}>
            <article data-empresa-id={c.idEmpresa} className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-soft">{c.cuenta}</span>
              <span className="flex-shrink-0 text-faint">
                {textoDiasEnEstado(c.diasEnEstado)} · {TANDA_LABEL[c.tanda]}
              </span>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
