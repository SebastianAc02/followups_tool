import Link from "next/link";
import { colaDelDia, contadoresHoy, listarCadencias, listarCampanas, estadoConector, getCadencia } from "./db/repository";
import { CANALES } from "./db/validation";
import { requireSession } from "./lib/session";
import TopNav from "./TopNav";
import { cx } from "./ui/cx";
import { SectionLabel } from "./ui/SectionLabel";

const CANAL_LABEL: Record<string, string> = { llamada: "llamadas", whatsapp: "whatsapp", correo: "correos" };

// Estados "calientes" del pipeline. Mismas claves que ESTADO_PILL en /cola; se cuentan
// en memoria sobre la cola del dia, sin query nueva.
const PIPELINE_CALIENTE: { estado: string; label: string }[] = [
  { estado: "reunion_agendada", label: "reuniones" },
  { estado: "oportunidad", label: "oportunidades" },
  { estado: "cierre_documentacion", label: "cierres" },
  { estado: "enviar_contrato", label: "contratos" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(d: Date) {
  const dia = DIAS[d.getDay()];
  const texto = `${dia} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function Dashboard() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);
  const ayerDate = new Date(ahora);
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayer = ayerDate.toISOString().slice(0, 10);

  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const hechoHoy = contadoresHoy(hoy, owner);
  const hechoAyer = contadoresHoy(ayer, owner);

  const pipeline = PIPELINE_CALIENTE.map((p) => ({
    ...p,
    n: cola.filter((c) => c.estado === p.estado).length,
  })).filter((p) => p.n > 0);

  const cadencias = listarCadencias();
  const cadenciaTop = cadencias.find((c) => c.activa);
  const pasosTop = cadenciaTop ? getCadencia(cadenciaTop.id)?.pasos.slice(0, 5) ?? [] : [];

  const campanasActivas = listarCampanas().filter((c) => c.estado === "activa").length;

  const conectados = [estadoConector("granola", usuario.id), estadoConector("notion")].filter(
    (e) => e.tieneCredencial,
  ).length;

  return (
    <div className="mx-auto max-w-[860px] px-6 pt-10 pb-[110px]">
      <TopNav email={usuario.email} />

      <div className="mb-5 font-serif text-[28px] font-medium tracking-[-0.01em]">{fechaLarga(ahora)}</div>

      {cola.length > 0 ? (
        <p className="mb-5 max-w-[60ch] text-[17px] leading-[1.5] text-ink-soft">
          <span className="mono font-medium text-ink">{cola.length}</span> follow-ups para hoy
          {vencidos > 0 && (
            <>
              , <span className="mono font-medium text-overdue">{vencidos}</span> ya vencidos
            </>
          )}
          .{" "}
          {hechoAyer.total > 0 && (
            <>
              Ayer cerraste <span className="mono font-medium text-done">{hechoAyer.total}</span>.
            </>
          )}
        </p>
      ) : (
        <p className="mb-5 max-w-[60ch] text-[17px] leading-[1.5] text-ink-soft">
          Sin follow-ups para hoy. Buen trabajo.
          {hechoAyer.total > 0 && (
            <>
              {" "}
              Ayer cerraste <span className="mono font-medium text-done">{hechoAyer.total}</span>.
            </>
          )}
        </p>
      )}

      {cola.length > 0 && (
        <Link
          href="/cola"
          className="mb-[26px] block rounded-full bg-white px-5 py-[15px] text-center text-[15px] font-medium text-[#0a0a0b] transition hover:opacity-90"
        >
          Entrar a los toques →
        </Link>
      )}

      <div className="mb-[30px] flex gap-8 max-sm:flex-col">
        <div className="flex-1">
          <SectionLabel className="mb-2">Hoy hiciste</SectionLabel>
          {hechoHoy.total === 0 ? (
            <div className="py-[3px] text-[13px] text-muted">Nada todavía.</div>
          ) : (
            CANALES.map((canal) => (
              <div key={canal} className="py-[3px] text-[13.5px] text-ink-soft">
                <span className="mono text-ink">{hechoHoy.porCanal[canal]}</span> {CANAL_LABEL[canal]}
              </div>
            ))
          )}
        </div>
        <div className="flex-1 border-l border-line pl-8 max-sm:border-l-0 max-sm:border-t max-sm:pt-4 max-sm:mt-1">
          <SectionLabel className="mb-2">Pipeline en cola</SectionLabel>
          {pipeline.length === 0 ? (
            <div className="py-[3px] text-[13px] text-muted">Nada caliente en cola.</div>
          ) : (
            pipeline.map((p) => (
              <div key={p.estado} className="py-[3px] text-[13.5px] text-ink-soft">
                <span className="mono text-ink">{p.n}</span> {p.label}
              </div>
            ))
          )}
        </div>
      </div>

      <Link
        href="/campanas"
        className="mb-[18px] block rounded-[14px] border border-line bg-surface px-[22px] py-5 transition hover:bg-surface-2 hover:border-muted active:scale-[.995]"
      >
        <div className="mb-2.5 flex items-baseline justify-between">
          <SectionLabel className="mb-0">Campañas</SectionLabel>
          <span className="mono text-[12.5px] text-muted">{campanasActivas} activas</span>
        </div>
        {pasosTop.length > 0 ? (
          <>
            <div className="mb-2.5 text-[15px] font-medium text-ink">{cadenciaTop!.nombre}</div>
            <div className="my-[3px] flex items-center">
              {pasosTop.map((p, i) => (
                <span key={p.idPaso} style={{ display: "contents" }}>
                  {i > 0 && <span className="h-px min-w-[10px] flex-1 bg-line-strong" />}
                  <span
                    className={cx(
                      "h-[7px] w-[7px] shrink-0 rounded-full border",
                      {
                        correo: "bg-today border-today",
                        whatsapp: "bg-done border-done",
                        llamada: "bg-ink-soft border-ink-soft",
                      }[p.canal ?? ""] ?? "bg-surface-2 border-line-strong",
                    )}
                  />
                </span>
              ))}
            </div>
            <span className="mono text-[11px] text-faint">{pasosTop.map((p) => `D${p.diaOffset}`).join(" · ")}</span>
          </>
        ) : (
          <div className="py-[3px] text-[13px] text-muted">Sin campañas todavía.</div>
        )}
      </Link>

      <div className="flex flex-wrap gap-6 pt-1">
        <Link href="/toque-independiente" className="text-[13px] text-muted transition-colors hover:text-ink">
          Agregar un toque manual
        </Link>
        <Link href="/conectores" className="text-[13px] text-muted transition-colors hover:text-ink">
          Conectores <span className="mono text-faint">({conectados} {conectados === 1 ? "conectado" : "conectados"})</span>
        </Link>
      </div>
    </div>
  );
}
