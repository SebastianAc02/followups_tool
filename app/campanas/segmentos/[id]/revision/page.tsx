import Link from 'next/link';
import { notFound } from 'next/navigation';
import { empresasParaRevision, listarSegmentos } from '../../../../db/repository';
import { requireSession } from '../../../../lib/session';
import RevisionLeads from './RevisionLeads';

// Parte 2 campanas: revision de leads de un segmento ya guardado, ANTES de crear la
// campana. Cada lead se puede sacar ("esta no va") o volver a meter; el toggle
// persiste de inmediato en segmento_exclusion, no hay boton de "guardar" aparte.
export default async function RevisionSegmento({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idSegmento = Number(id);
  if (!Number.isInteger(idSegmento) || idSegmento <= 0) notFound();

  const seg = listarSegmentos().find((s) => s.id === idSegmento);
  const revision = empresasParaRevision(idSegmento);
  if (!seg || !revision) notFound();

  return (
    <div className="wrap">
      <Link href="/campanas/segmentos" className="back">
        ← Segmentos
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Revisión: {seg.nombre}
      </div>
      <p className="conector-desc">
        Saca los leads que no deberían ir en esta campaña antes de seguir. El resto continúa.
      </p>

      <RevisionLeads idSegmento={idSegmento} empresas={revision} />
    </div>
  );
}
