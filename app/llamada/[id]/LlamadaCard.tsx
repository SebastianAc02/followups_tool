import type { ContextoToque } from "../../db/repository";
import type { Calificacion } from "../../core/calificacion";
import { Pill, pillParaEstado } from "../../ui/Pill";
import { SecuenciaRail } from "./SecuenciaRail";
import { CalificacionChecklist } from "./CalificacionChecklist";
import { RegistrarToqueToggle } from "./RegistrarToqueToggle";
import { PreguntarProvider } from "./PreguntarContext";

// Ensambla la specimen card "Onepay Llamada Toque 1": header de la cuenta, riel de
// secuencia a la izquierda y el cuerpo de trabajo (accion sugerida, datos de la cuenta,
// calificacion) a la derecha. El breadcrumb es solo el rotulo visual; el boton "Registrar
// toque" (RegistrarToqueToggle, Tarea 8) revela <CapturaLlamada> debajo sin romper el layout
// flex de la fila.

// Tile de "La cuenta": a diferencia de <Stat> (pensado para un numero grande de
// dashboard), aca el valor es texto corto y variable (ciudad, estado, fecha+canal) --
// tamano moderado + truncate para que un valor largo nunca reviente el grid de 3 columnas.
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

export function LlamadaCard({
  ctx,
  urlNotion,
  calificacion,
}: {
  ctx: ContextoToque;
  urlNotion: string | null;
  calificacion: Calificacion;
}) {
  const { emp, principal, secuencia, objetivo, toques } = ctx;
  const estadoPill = pillParaEstado(emp?.estado);
  const ultimoToque = toques[0];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-line bg-shell-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent-llamada">
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

      {/* Two-column body */}
      <div className="flex flex-col md:grid md:grid-cols-[192px_1fr]">
        <SecuenciaRail pasos={secuencia} objetivo={objetivo} toques={toques} />

        <PreguntarProvider>
          <div className="flex flex-col gap-4 p-5">
            {/* Suggested action */}
            <div>
              <div className="rounded-xl border border-accent-llamada bg-accent-llamada-soft p-4">
                <div className="text-base font-semibold leading-tight text-ink">Llamar a {principal?.nombre ?? "el contacto"}</div>
                {principal?.telefono && (
                  <div className="mt-0.5 font-toque-mono text-xs font-medium text-accent-llamada">{principal.telefono}</div>
                )}
              </div>
              <div className="mt-2 text-[10.5px] text-muted">
                Si no contesta, pasa al siguiente canal de la secuencia.
              </div>
            </div>

            {/* Account facts */}
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

            <CalificacionChecklist idEmpresa={emp?.id ?? ""} calificacion={calificacion} />

            {/* Bottom action row */}
            <div className="mt-auto flex flex-col gap-4 border-t border-line pt-4">
              <div className="flex items-center gap-2 font-toque-mono text-[10.5px] font-medium text-muted">
                <span className="text-accent-llamada">Llamada</span>
                <span>·</span>
                <span>Registrar</span>
                <span>·</span>
                <span>Confirmar</span>
              </div>
              <RegistrarToqueToggle idEmpresa={emp?.id ?? ""} calificacion={calificacion} />
            </div>
          </div>
        </PreguntarProvider>
      </div>
    </div>
  );
}
