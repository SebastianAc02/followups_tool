// Página del Pipeline: embudo comercial por etapa (estado_notion). Lente ortogonal al
// seguimiento operativo por toque (ver /seguimiento) -- agrupa por etapa comercial, no
// por paso de cadencia. Envuelta por layout.tsx que ya hace requireSession() + AppShell.
import { EmbudoPanel } from '../ui/pipeline/EmbudoPanel';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; campana?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mb-8 space-y-4">
      <div>
        <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink font-bold">Pipeline</h2>
        <p className="mt-1 text-sm text-muted">Embudo comercial por etapa.</p>
      </div>
      <EmbudoPanel searchParams={{ owner: sp.owner, campana: sp.campana }} />
    </div>
  );
}
