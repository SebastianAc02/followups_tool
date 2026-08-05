// Los dos huecos que tandasTool reporta arriba de la lista, no escondidos dentro de cada
// cuenta (regla dura del rediseño de tandas): sinVerificarAliado y sinTamanoConfirmado. Quien
// arranca a llamar tiene que ver de una si medio pipeline esta sin verificar, antes de marcar el
// primer número.
export function ContadoresTandas({
  sinVerificarAliado,
  sinTamanoConfirmado,
}: {
  sinVerificarAliado: number;
  sinTamanoConfirmado: number;
}) {
  if (sinVerificarAliado === 0 && sinTamanoConfirmado === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2 text-[11.5px]">
      {sinVerificarAliado > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-overdue/40 bg-overdue-bg px-2.5 py-1 font-medium text-overdue">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-overdue" aria-hidden="true" />
          {sinVerificarAliado} sin verificar de quién son
        </span>
      )}
      {sinTamanoConfirmado > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-surface px-2.5 py-1 font-medium text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" aria-hidden="true" />
          {sinTamanoConfirmado} sin tamaño confirmado en Notion
        </span>
      )}
    </div>
  );
}
