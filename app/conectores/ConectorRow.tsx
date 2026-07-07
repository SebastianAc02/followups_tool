import { Dot } from "../ui/Dot";
import { Pill } from "../ui/Pill";
import { Button } from "../ui/Button";
import type { EstadoConector } from "../db/repository";
import type { ConectorCatalogo, ModoConector } from "./catalogo.ts";
import { vistaEstado } from "./estado-ui.ts";
import { cambiarModoAction, quitarConectorAction } from "./actions";
import { CredencialForm } from "./CredencialForm";

// Una fila de conector: columna izquierda de estado (punto + label + timestamp), columna
// derecha con nombre + badge de modo + descripcion + formulario/estado/error. La autoridad
// ya la garantiza el server action; aca solo mostramos lo que corresponde al rol.
export function ConectorRow({
  cat,
  estado,
  modo,
  esAdmin,
}: {
  cat: ConectorCatalogo;
  estado: EstadoConector;
  modo: ModoConector;
  esAdmin: boolean;
}) {
  const v = vistaEstado(estado);
  const color =
    v.sev === "done" ? "text-done" : v.sev === "overdue" ? "text-overdue" : v.sev === "today" ? "text-today" : "text-faint";
  const badge = modo === "personal" ? "Personal" : "Equipo";
  const puedeEditar = modo === "personal" || esAdmin;
  const hayError = estado.ultimoResultado && estado.ultimoResultado.startsWith("error");

  return (
    <div className="flex flex-col gap-8 border-b border-line py-9 sm:flex-row">
      {/* Columna de estado */}
      <div className="w-full flex-none sm:w-40">
        <div className="mb-2 flex items-center gap-2.5">
          <Dot sev={v.sev} />
          <span className={`text-lg font-semibold tracking-tight ${color}`}>{v.label}</span>
        </div>
        {estado.ultimaCorrida && (
          <p className="pl-5 font-[family-name:var(--ff-mono)] text-xs text-muted">
            {estado.ultimaCorrida.slice(0, 16).replace("T", " ")}
          </p>
        )}
      </div>

      {/* Columna principal */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-base font-semibold text-ink">{cat.nombre}</span>
          <Pill tone="cold">{badge}</Pill>
        </div>
        <p className="mb-3 max-w-sm text-sm leading-relaxed text-muted">{cat.descripcion}</p>

        {hayError && (
          <div className="mb-4 max-w-sm rounded-r-md border-l-2 border-overdue bg-overdue-bg px-3 py-2.5 font-[family-name:var(--ff-mono)] text-xs leading-relaxed text-overdue">
            {estado.ultimoResultado}
          </div>
        )}

        {puedeEditar ? (
          <CredencialForm proveedor={cat.id} tieneCredencial={estado.tieneCredencial} />
        ) : (
          <p className="max-w-sm rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
            Solo un admin puede configurar esta conexión. Si algo no llega, avísale a tu admin.
          </p>
        )}

        {/* Controles de admin: cambiar modo + quitar. Ghost/quiet a proposito: son
            secundarios frente al boton primario de conectar/reemplazar de arriba. Labels
            explicitos ("Aplicar modo" / "Quitar conector") para que no se confundan con el
            boton de guardar credencial de justo encima. */}
        {esAdmin && (
          <div className="mt-4 flex max-w-sm flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
            <span className="pl-1 text-xs text-faint">Modo</span>
            <form action={cambiarModoAction} className="flex items-center gap-1.5">
              <input type="hidden" name="proveedor" value={cat.id} />
              <select
                name="modo"
                defaultValue={modo}
                className="rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="personal">Personal</option>
                <option value="admin">Equipo</option>
              </select>
              <Button type="submit" variant="quiet">
                Aplicar modo
              </Button>
            </form>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <form action={quitarConectorAction}>
              <input type="hidden" name="proveedor" value={cat.id} />
              <Button type="submit" variant="quiet" className="text-overdue/80 hover:text-overdue">
                Quitar conector
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
