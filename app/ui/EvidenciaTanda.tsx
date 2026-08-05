// Regla dura del rediseño de tandas (2026-08-04): una cuenta con advertencias se muestra
// marcada, visiblemente, nunca limpia. El día que esto se armó a mano, dos cuentas de un aliado
// entraron a una lista de llamadas porque un campo vacío se leyó como "no es aliado" -- la
// advertencia existía en el dato y no se veía en la pantalla.
//
// <details> nativo, sin JS: funciona igual en la ficha de una sola cuenta (Toques) que en una
// fila angosta de columna (Seguimiento), y el tap para abrir funciona en móvil sin cablear un
// estado de React aparte por cada fila.
type Evidencia = { campo: string; valor: string | null; fuente: string | null; fecha: string | null; quien: string | null };

export function EvidenciaTanda({
  regla,
  evidencia,
  advertencias,
}: {
  regla: string;
  evidencia: Evidencia;
  advertencias: string[];
}) {
  const tieneAdvertencias = advertencias.length > 0;

  return (
    <details className="group">
      <summary
        className={
          tieneAdvertencias
            ? "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[7px] border border-overdue/40 bg-overdue-bg px-2 py-0.5 text-[11px] font-semibold text-overdue"
            : "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[7px] border border-line-strong px-2 py-0.5 text-[11px] text-faint hover:text-muted"
        }
      >
        {tieneAdvertencias ? (
          <>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-overdue" aria-hidden="true" />
            {advertencias.length === 1 ? "1 advertencia" : `${advertencias.length} advertencias`}
          </>
        ) : (
          "evidencia"
        )}
      </summary>
      <div className="mt-1.5 max-w-sm rounded-lg border border-line-card bg-card p-2.5 text-[11.5px] leading-relaxed">
        {tieneAdvertencias && (
          <ul className="mb-2 list-disc space-y-1 pl-4 text-overdue">
            {advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
        <div className="text-muted">
          <span className="font-medium text-ink-soft">Regla:</span> {regla}
        </div>
        {evidencia.campo && (
          <div className="text-muted">
            <span className="font-medium text-ink-soft">{evidencia.campo}:</span> {evidencia.valor ?? "sin valor"}
            {evidencia.fuente ? ` · fuente ${evidencia.fuente}` : ""}
            {evidencia.fecha ? ` · ${evidencia.fecha}` : ""}
            {evidencia.quien ? ` · ${evidencia.quien}` : ""}
          </div>
        )}
      </div>
    </details>
  );
}
