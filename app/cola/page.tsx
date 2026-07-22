import {
  colaDelDia,
  colaLeads,
  colaCierres,
  colaReagendar,
  colaContactoIniciadoSinSeguimiento,
  contadoresHoy,
  agendaHoyCadencias,
  historialPasosDestinatario,
  empresasConRespuestaPendiente,
  resumenTrackingPorEmpresa,
} from "../db/repository";
import { resumirTracking } from "../core/resumen-tracking.ts";
import { registrarTapAction } from "../actions";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { StatCard } from "../ui/home/StatCard";
import CadenciasHoy from "./CadenciasHoy";
import { BarraAhora } from "./BarraAhora";
import { AgendaHoy } from "./AgendaHoy";
import { ColaUnificada } from "./ColaUnificada";
import { ContactoIniciadoSinSeguimiento } from "./ContactoIniciadoSinSeguimiento";
import { contarCerradas } from "./stats";
import {
  filaConVencimiento,
  unificarCola,
  bucketDeEtapa,
  pendientesDeHoy,
  vencidasDeHoy,
  OWNER_COLA_SPLIT,
  type FilaAgenda,
  type FilaColaConBucket,
} from "./agenda.ts";
import { hoy as hoyDemo } from "../lib/reloj";

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion, ya no OWNERS[0]. Visitante (solo
  // lectura) sin ?owner= ve la cola de TODOS los owners, no una propia (que estaria vacia).
  // verTodoPipeline (CRO, Fase 3): mismo default que el visitante -- sin ?owner= ve TODOS
  // los owners, Felipe y Sebastian incluidos, sin perder su propio owner si algo se lo pide.
  const owner = sp.owner ?? (usuario.soloLectura || usuario.verTodoPipeline ? undefined : usuario.owner);
  const hoy = hoyDemo();
  const splitActivo = owner === OWNER_COLA_SPLIT;
  const cola = splitActivo ? colaLeads(hoy, owner, usuario.idOrganizacion) : colaDelDia(hoy, owner, usuario.idOrganizacion);
  const cierres = splitActivo ? colaCierres(owner, usuario.idOrganizacion) : [];
  const reagendar = splitActivo ? colaReagendar(hoy, owner, usuario.idOrganizacion) : [];
  // Seccion "Contacto iniciado sin seguimiento" (2026-07-14): para CUALQUIER owner, no
  // solo el split de Sebastian. Sin owner por ser visitante, la seccion simplemente no se
  // muestra (decision anterior de Sebastian: un visitante no tiene "lo suyo" que completar).
  // Sin owner por ser CRO (Fase 3), si se muestra: org-wide, la misma seccion pero de
  // Felipe + Sebastian juntos -- es lectura, exactamente lo que el CRO pidio ver.
  const sinSeguimiento = owner
    ? colaContactoIniciadoSinSeguimiento(owner, usuario.idOrganizacion)
    : usuario.verTodoPipeline
      ? colaContactoIniciadoSinSeguimiento(undefined, usuario.idOrganizacion)
      : [];
  const contadores = contadoresHoy(hoy, owner, usuario.idOrganizacion);
  // V5.7: cadencias (automatico Apollo + manual Tier 1) no son por owner todavia
  // (campana.owner es la campana masiva, no un individuo -- ver memoria del proyecto);
  // se muestran a cualquier sesion, la cola unificada es informativa para todos.
  // Parte 4 campanas: el historial (dias ya tocados) solo tiene sentido para los
  // manuales -- son los unicos con boton de "Aprobar" que necesita saber en que
  // paso va el lead. Se evita la consulta extra para los automaticos.
  // splitActivo: la lista unificada de Sebastian solo debe traer SUS cadencias, no las de
  // todos -- sin esto, cadenciasParaUnificar se mezclaria con empresas de otros owners.
  const cadenciasHoy = agendaHoyCadencias(hoy, splitActivo ? owner : undefined).map((t) => ({
    ...t,
    historial: t.esManual === 1 ? historialPasosDestinatario(t.idDestinatario) : [],
  }));

  const filas: FilaAgenda[] = cola.map((c, i) => filaConVencimiento(c, hoy, i === 0));

  // Lista unificada (2026-07-14): solo para Sebastian. GrupoBatch (esManual=1 + modo=batch)
  // queda fuera -- ese flujo aprueba varias empresas a la vez con un solo copy, no cabe en
  // una fila por empresa; se sigue mostrando aparte reusando CadenciasHoy tal cual.
  const cadenciasParaCadenciasHoy = splitActivo ? cadenciasHoy.filter((t) => t.esManual === 1 && t.modo === 'batch') : cadenciasHoy;
  const cadenciasParaUnificar = splitActivo ? cadenciasHoy.filter((t) => !(t.esManual === 1 && t.modo === 'batch')) : [];

  const respuestasPendientes = new Set(empresasConRespuestaPendiente(usuario.idOrganizacion).map((f) => f.idEmpresa));

  const filasParaUnificar: FilaColaConBucket[] = splitActivo
    ? [
        ...cola.map((c): FilaColaConBucket => ({ ...c, bucket: 'lead', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...cierres.map((c): FilaColaConBucket => ({ ...c, bucket: 'cierre', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...reagendar.map((c): FilaColaConBucket => ({ ...c, bucket: 'reagendar', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...cadenciasParaUnificar.map(
          (t): FilaColaConBucket => ({
            id: t.idEmpresa,
            empresa: t.empresaNombre,
            ciudad: t.ciudad,
            contacto: t.nombre,
            cargo: null,
            canal: t.canal,
            estado: t.estadoNotion,
            fecha: t.fechaProgramada ? t.fechaProgramada.slice(0, 10) : null,
            campana: t.nombreCampana,
            bucket: bucketDeEtapa(t.estadoNotion),
            origen: 'cadencia',
            respuestaPendiente: respuestasPendientes.has(t.idEmpresa),
          }),
        ),
      ]
    : [];

  // Tracking por empresa para el pill "abrió/vio/clic" (2026-07-15). Un solo query para toda
  // la cola; el core (resumirTracking) decide texto y temperatura. El reloj de demo (hoyDemo)
  // NO aplica: la hora de "hace 2h" es tiempo real de reloj, no la fecha de negocio, por eso
  // ahora = new Date() y no hoyDemo(). resumenTrackingPorEmpresa([]) no toca la DB.
  const trackingPorEmpresa = resumenTrackingPorEmpresa(filasParaUnificar.map((f) => f.id));
  const ahora = new Date();
  const filasConTracking: FilaColaConBucket[] = filasParaUnificar.map((f) => {
    const s = trackingPorEmpresa.get(f.id);
    return s ? { ...f, tracking: resumirTracking(s, ahora) } : f;
  });

  const filasUnificadas = splitActivo ? unificarCola(filasConTracking, hoy) : [];

  // Las tarjetas cuentan sobre las MISMAS filas que se listan abajo. En el split eso son las
  // 4 fuentes juntas (leads/cierres/reagendar/cadencias); fuera del split, colaDelDia ya es
  // la lista entera. Antes contaban `cola.length` -- solo colaLeads -- asi que un WhatsApp de
  // cadencia salia listado con la tarjeta en 0 (2026-07-15).
  const filasParaContar: FilaColaConBucket[] = splitActivo
    ? filasParaUnificar
    : cola.map((c): FilaColaConBucket => ({ ...c, bucket: 'lead' }));
  const pendientes = pendientesDeHoy(filasParaContar, hoy);
  const vencidos = vencidasDeHoy(filasParaContar, hoy);

  // La barra "AHORA" sale de la lista unificada, no de cola[0]: con 0 leads y un WhatsApp
  // debido, cola[0] era undefined y la barra desaparecia aunque hubiera trabajo. unificarCola
  // ya ordena por urgencia, asi que su primera fila ES el siguiente toque -- y ya trae sev y
  // severidadTexto resueltos (incluido el "sin fecha" de un cierre, que el calculo viejo de
  // dias no sabia expresar).
  const actual = splitActivo ? filasUnificadas[0] : cola[0] ? filaConVencimiento(cola[0], hoy, true) : undefined;

  const cerradas = contarCerradas(contadores);

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{splitActivo ? "Leads" : "Toques de hoy"}</h2>
        <p className="mt-1 text-sm text-muted">{splitActivo ? "Leads con follow-up vencido o de hoy." : "Tu cola de follow-ups pendientes."}</p>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Pendientes" valor={pendientes} sub="hoy o vencido" />
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
          sev={actual.sev}
          severidadTexto={actual.severidadTexto}
        />
      )}

      <section id="today-agenda">
        {splitActivo ? (
          <>
            {filasUnificadas.length === 0 ? (
              <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
                Sin follow-ups pendientes. Buen trabajo.
              </div>
            ) : (
              <ColaUnificada filas={filasUnificadas} registrarTapAction={registrarTapAction} />
            )}

            {cadenciasParaCadenciasHoy.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
                <CadenciasHoy items={cadenciasParaCadenciasHoy} hoy={hoy} />
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </section>

      {owner && <ContactoIniciadoSinSeguimiento filas={sinSeguimiento} owner={owner} />}
    </AppShell>
  );
}
