import type { ReactNode } from "react";
import type { ContextoToque } from "../../db/repository";
import { Pill, pillParaEstado } from "../../ui/Pill";
import { SecuenciaRail } from "./SecuenciaRail";

// Sesion 2026-07-10 (pedido de Sebastian): correo y whatsapp deben verse con el MISMO
// marco rico que la llamada (LlamadaCard) -- header de la cuenta, riel de secuencia a la
// izquierda y las fichas de "La cuenta" -- en vez del editor pelon. Este shell arma esa
// parte compartida y deja el cuerpo del canal (el editor de mensaje) como children. NO se
// toca LlamadaCard: la llamada tiene su propia accion (calificacion + Registrar toque) que
// no aplica a un mensaje, asi que conserva su card; este shell es para correo/whatsapp.

const ACCENT: Record<string, { fondo: string; texto: string; soft: string }> = {
  whatsapp: { fondo: "bg-accent-whatsapp", texto: "text-accent-whatsapp", soft: "border-accent-whatsapp bg-accent-whatsapp-soft" },
  correo: { fondo: "bg-accent-correo", texto: "text-accent-correo", soft: "border-accent-correo bg-accent-correo-soft" },
};

function FichaDato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-shell-2 p-2">
      <div className="truncate text-[13px] font-semibold text-ink" title={valor}>
        {valor}
      </div>
      <div className="mt-0.5 font-toque-mono text-[9.5px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  const letras = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : [partes[0]];
  return letras.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function fechaCorta(fecha: string | null): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function ToqueShell({
  ctx,
  urlNotion,
  canal,
  children,
  hoy,
}: {
  ctx: ContextoToque;
  urlNotion: string | null;
  // 'YYYY-MM-DD' del server, para el riel de toques (ver SecuenciaRail).
  hoy: string;
  canal: "whatsapp" | "correo";
  children: ReactNode;
}) {
  const { emp, principal, secuencia, objetivo, toques, idInscripcionActiva } = ctx;
  const estadoPill = pillParaEstado(emp?.estado);
  const ultimoToque = toques[0];
  const acc = ACCENT[canal];
  const destino = canal === "whatsapp" ? principal?.telefono : principal?.email;
  const accionLabel = canal === "whatsapp" ? "Mandar WhatsApp a" : "Mandar correo a";

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      {/* Header strip (mismo patron que LlamadaCard) */}
      <div className="flex items-center justify-between border-b border-line bg-shell-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${acc.fondo}`}>
            <span className="font-toque-mono text-xs font-bold text-ink">{iniciales(emp?.nombre)}</span>
          </div>
          <div>
            <div className="font-toque-heading text-sm leading-tight text-ink">{emp?.nombre ?? "Cuenta sin nombre"}</div>
            <div className="mt-0.5 font-toque-mono text-xs text-muted">
              {[emp?.ciudad, principal?.nombre, principal?.cargo].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {estadoPill ? (
            <Pill tone={estadoPill.tone} dot>
              {estadoPill.label}
            </Pill>
          ) : emp?.estado ? (
            <Pill tone="warm" dot>
              {emp.estado}
            </Pill>
          ) : null}
          {urlNotion && (
            <a href={urlNotion} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-ink">
              Ver en Notion
            </a>
          )}
        </div>
      </div>

      {/* Two-column body: riel de secuencia + cuerpo del canal */}
      <div className="flex flex-col md:grid md:grid-cols-[192px_1fr]">
        <SecuenciaRail
          pasos={secuencia}
          objetivo={objetivo}
          toques={toques}
          estado={emp?.estado}
          hoy={hoy}
          idEmpresa={emp?.id ?? ""}
          idInscripcionActiva={idInscripcionActiva}
        />

        <div className="flex flex-col gap-4 p-5">
          {/* Accion sugerida del canal (mismo lugar que "Llamar a X" en la llamada) */}
          <div>
            <div className={`rounded-xl border p-4 ${acc.soft}`}>
              <div className="text-base font-semibold leading-tight text-ink">
                {accionLabel} {principal?.nombre ?? "el contacto"}
              </div>
              {destino && <div className={`mt-0.5 font-toque-mono text-xs font-medium ${acc.texto}`}>{destino}</div>}
            </div>
          </div>

          {/* Fichas de La cuenta (mismas que la llamada) */}
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-soft">La cuenta</div>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <FichaDato label="Ciudad" valor={emp?.ciudad ?? "—"} />
              <FichaDato label="Estado" valor={estadoPill?.label ?? emp?.estado ?? "—"} />
              <FichaDato
                label="Último toque"
                valor={ultimoToque ? `${fechaCorta(ultimoToque.fecha)} · ${ultimoToque.canal}` : "Sin toques previos"}
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-shell p-2">
              <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Próximo paso</span>
              <span className="text-[12px] font-medium text-ink-soft">{emp?.proximoPaso ?? "Sin definir"}</span>
            </div>
          </div>

          {/* Cuerpo del canal: el editor de mensaje */}
          {children}
        </div>
      </div>
    </div>
  );
}
