import Link from "next/link";
import { colaDelDia, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { repartirAction, registrarTapAction } from "../actions";
import { RESULTADO_LABELS, RESULTADOS } from "../db/validation";
import { requireSession } from "../lib/session";
import TopNav from "../TopNav";
import CadenciasHoy from "./CadenciasHoy";
import { DashboardHeader } from "./DashboardHeader";
import { BarraAhora } from "./BarraAhora";
import { AgendaHoy } from "./AgendaHoy";
import { contarCerradas } from "./stats";
import { canalNormalizado, type FilaAgenda } from "./agenda.ts";

const RESULTADOS_ORDEN = RESULTADOS;

function diasVencido(fechaISO: string, hoyISO: string) {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0].
  const owner = sp.owner ?? usuario.owner;
  const esPropia = owner === usuario.owner;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const contadores = contadoresHoy(hoy, owner);
  // V5.7: cadencias (automatico Apollo + manual Tier 1) no son por owner todavia
  // (campana.owner es la campana masiva, no un individuo -- ver memoria del proyecto);
  // se muestran a cualquier sesion, la cola unificada es informativa para todos.
  // Parte 4 campanas: el historial (dias ya tocados) solo tiene sentido para los
  // manuales -- son los unicos con boton de "Aprobar" que necesita saber en que
  // paso va el lead. Se evita la consulta extra para los automaticos.
  const cadenciasHoy = agendaHoyCadencias(hoy).map((t) => ({
    ...t,
    historial: t.esManual === 1 ? historialPasosDestinatario(t.idDestinatario) : [],
  }));

  const filas: FilaAgenda[] = cola.map((c, i) => {
    const dias = diasVencido(c.fecha!, hoy);
    return {
      id: c.id,
      empresa: c.empresa,
      ciudad: c.ciudad,
      contacto: c.contacto,
      cargo: c.cargo,
      canal: canalNormalizado(c.canal),
      estado: c.estado,
      sev: dias > 0 ? "overdue" : "today",
      severidadTexto: dias > 0 ? `vencido ${dias}d` : "hoy",
      actual: i === 0,
    };
  });

  return (
    <div className="mx-auto max-w-[1160px] px-11 pt-[38px] pb-[60px]">
      <TopNav email={usuario.email} />
      <Link href="/" className="mb-5 inline-block text-[13px] text-muted transition-colors hover:text-ink">
        ← Inicio
      </Link>
      <DashboardHeader
        nombre={usuario.owner.split(" ")[0]}
        hoy={hoy}
        owner={owner}
        pendientes={cola.length}
        vencidas={vencidos}
        cerradas={contarCerradas(contadores)}
      />

      {contadores.total > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted">
          {RESULTADOS_ORDEN.map((resultado) => (
            <span key={resultado}>
              <span className="mono text-ink-soft">{contadores.porResultado[resultado]}</span>{" "}
              {RESULTADO_LABELS[resultado].toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {cola.length > 0 && (
        <BarraAhora
          id={cola[0].id}
          empresa={cola[0].empresa}
          ciudad={cola[0].ciudad}
          contacto={cola[0].contacto}
          cargo={cola[0].cargo}
          canal={cola[0].canal}
          estado={cola[0].estado}
        />
      )}

      {cadenciasHoy.length > 0 && <CadenciasHoy items={cadenciasHoy} hoy={hoy} />}

      {filas.length === 0 ? (
        <div className="py-8 text-[13px] text-muted">Sin follow-ups para hoy. Buen trabajo.</div>
      ) : (
        <AgendaHoy filas={filas} registrarTapAction={registrarTapAction} />
      )}

      {esPropia && (
        <form action={repartirAction} className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5 text-[12.5px] text-muted">
          <span>¿Atrasado? Reparte tus follow-ups</span>
          <input
            name="porDia"
            type="number"
            min={1}
            defaultValue={10}
            aria-label="follow-ups por día"
            className="mono w-14 rounded-[7px] border border-line bg-hover px-2 py-1 text-center text-ink outline-none focus:border-line-strong"
          />
          <span>por día</span>
          <button type="submit" className="text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-ink">
            Repartir
          </button>
        </form>
      )}
    </div>
  );
}
