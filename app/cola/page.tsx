import { colaDelDia, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { registrarTapAction } from "../actions";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { StatCard } from "../ui/home/StatCard";
import CadenciasHoy from "./CadenciasHoy";
import { BarraAhora } from "./BarraAhora";
import { AgendaHoy } from "./AgendaHoy";
import { contarCerradas } from "./stats";
import { canalNormalizado, type FilaAgenda } from "./agenda.ts";

function diasVencido(fechaISO: string, hoyISO: string) {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0].
  const owner = sp.owner ?? usuario.owner;
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

  const actual = cola[0];
  const diasActual = actual ? diasVencido(actual.fecha!, hoy) : 0;

  const cerradas = contarCerradas(contadores);

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">Toques de hoy</h2>
        <p className="mt-1 text-sm text-muted">Tu cola de follow-ups pendientes.</p>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Pendientes" valor={cola.length} sub="en cola" />
        <StatCard label="Cerradas" valor={cerradas} sub="hoy" tone="done" subTone="done" />
        <StatCard
          label="Vencidas"
          valor={vencidos}
          sub={vencidos > 0 ? "requieren acción" : "al día"}
          tone="overdue"
          subTone="overdue"
        />
      </div>

      {actual && (
        <BarraAhora
          id={actual.id}
          empresa={actual.empresa}
          ciudad={actual.ciudad}
          contacto={actual.contacto}
          cargo={actual.cargo}
          canal={actual.canal}
          estado={actual.estado}
          sev={diasActual > 0 ? "overdue" : "today"}
          severidadTexto={diasActual > 0 ? `vencido ${diasActual}d` : "hoy"}
        />
      )}

      <section id="today-agenda">
        {filas.length === 0 ? (
          <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
            Sin follow-ups para hoy. Buen trabajo.
          </div>
        ) : (
          <AgendaHoy filas={filas} registrarTapAction={registrarTapAction} />
        )}

        {cadenciasHoy.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
            <CadenciasHoy items={cadenciasHoy} hoy={hoy} />
          </div>
        )}
      </section>
    </AppShell>
  );
}
