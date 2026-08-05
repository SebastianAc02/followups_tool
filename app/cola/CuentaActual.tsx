// El centro de la pantalla: UNA cuenta, la actual, con lo mínimo para marcar. Nada de métricas,
// nada de badges de más -- eso es justo lo que el rediseño le saca a esta tarjeta (antes vivían
// acá los pills de estado/canal y una lista de 20 cuentas debajo, que era la fuga mental: la
// lista devolvía la decisión que esta tarjeta acababa de quitar).
//
// La única marca que SÍ va, siempre visible y nunca oculta (regla dura del rediseño de tandas):
// si la cuenta trae advertencias, se ve marcada -- ver EvidenciaTanda.
import Link from "next/link";
import { RESULTADO_LABELS } from "../db/validation";
import { EvidenciaTanda } from "../ui/EvidenciaTanda";
import { textoDiasEnEstado } from "../ui/tanda.variants";
import type { FichaCuentaActual, CuentaTanda } from "./tandas-datos";

function labelResultado(resultado: string | null): string | null {
  if (!resultado) return null;
  return resultado in RESULTADO_LABELS ? RESULTADO_LABELS[resultado as keyof typeof RESULTADO_LABELS] : resultado;
}

export function CuentaActual({
  ficha,
  clasificacion,
  hrefRegistrar,
  hrefSiguiente,
}: {
  ficha: FichaCuentaActual;
  clasificacion: CuentaTanda;
  hrefRegistrar: string;
  hrefSiguiente: string | null;
}) {
  const resultado = labelResultado(ficha.ultimoResultado);

  return (
    <section className="mb-6 rounded-2xl border border-line-card border-l-2 border-l-accent bg-card px-6 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-serif text-[26px] leading-[1.1] text-ink">{ficha.nombre}</div>
          <div className="mt-1 text-[13px] text-faint">{textoDiasEnEstado(clasificacion.diasEnEstado)}</div>
        </div>
        <EvidenciaTanda regla={clasificacion.regla} evidencia={clasificacion.evidencia} advertencias={clasificacion.advertencias} />
      </div>

      <dl className="grid grid-cols-1 gap-4 border-t border-line-card pt-4 md:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Contacto</dt>
          <dd className="mt-1 text-[14.5px] text-ink">
            {ficha.contacto ?? "sin contacto registrado"}
            {ficha.cargo ? <span className="text-muted"> · {ficha.cargo}</span> : null}
          </dd>
          <dd className="mt-0.5 text-[13.5px] text-ink-soft">
            {ficha.telefono ? (
              <a href={`tel:${ficha.telefono}`} className="hover:text-accent-soft">
                {ficha.telefono}
              </a>
            ) : (
              "sin teléfono registrado"
            )}
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Qué se le va a decir</dt>
          <dd className="mt-1 text-[14.5px] leading-relaxed text-ink">{ficha.proximoPaso ?? "sin próximo paso definido"}</dd>
        </div>

        <div className="md:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Qué pasó la última vez</dt>
          <dd className="mt-1 text-[14.5px] leading-relaxed text-ink-soft">
            {ficha.ultimoQuePaso ?? (resultado ? resultado : "sin toques previos registrados")}
            {resultado && ficha.ultimoQuePaso ? <span className="text-muted"> ({resultado})</span> : null}
            {ficha.ultimaFecha && <span className="text-faint"> · {ficha.ultimaFecha.slice(0, 10)}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2.5 border-t border-line-card pt-5 sm:flex-row">
        <Link
          href={hrefRegistrar}
          className="rounded-[10px] bg-[#eef1f4] px-4 py-[13px] text-center text-[14px] font-bold text-[#14181d] transition-colors hover:bg-white sm:flex-1"
        >
          Registrar toque
        </Link>
        {hrefSiguiente ? (
          <Link
            href={hrefSiguiente}
            className="rounded-[10px] border border-[#33333a] bg-transparent px-4 py-[11px] text-center text-[13px] font-semibold text-[#c9c9cd] transition-colors hover:bg-hover sm:flex-1"
          >
            Saltar, ver siguiente
          </Link>
        ) : null}
      </div>
    </section>
  );
}
