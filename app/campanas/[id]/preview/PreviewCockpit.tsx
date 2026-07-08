'use client';

import Link from 'next/link';
import { PreviewCinematico, type PasoPreview, type DestinatarioPreview } from '../../nueva/PreviewCinematico';
import type { PasoCadenciaUI } from '../../../cadencias/[id]/CadenciaCockpit';
import type { DestinatarioMuestra } from '../../../db/repository';
import type { Canal } from '../../../ui/canal-tag.variants';

// El parser/editor dejan canal como texto libre (el dominio lo valida aparte); el
// preview cinematico solo sabe pintar estos tres. Cualquier otro canal se omite del
// timeline en vez de reventar.
const CANALES_PREVIEW = new Set<Canal>(['correo', 'llamada', 'whatsapp']);

function pasosParaPreview(pasos: PasoCadenciaUI[]): PasoPreview[] {
  return pasos
    .filter((p) => CANALES_PREVIEW.has(p.canal as Canal))
    .map((p) => ({ orden: p.orden, dia: p.diaOffset, canal: p.canal as Canal, asunto: p.asunto, cuerpo: p.cuerpo ?? '' }));
}

// Remitente: placeholder de marca hasta que la conexion de buzon (Apollo) entregue el
// remitente real -- Owner = Sebastian por constitucion. Vive aca (no en el repository)
// porque no es un dato de dominio, es un default de presentacion.
function conRemitente(d: DestinatarioMuestra): DestinatarioPreview {
  return { ...d, remitente: 'Sebastián Acosta', remitenteEmail: 'sebastian@onepay.com' };
}

export function PreviewCockpit({
  idCampana,
  nombreCampana,
  pasos,
  muestra,
}: {
  idCampana: number;
  nombreCampana: string;
  pasos: PasoCadenciaUI[];
  muestra: DestinatarioMuestra | null;
}) {
  const pasosPreview = pasosParaPreview(pasos);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Campaña · Preview</p>
        <h1 className="font-serif text-2xl text-ink">{nombreCampana}</h1>
        <p className="text-[13px] text-muted">Así le llega la cadencia a un destinatario real del segmento. Última revisión antes de lanzar.</p>
      </header>

      {pasosPreview.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-5 py-6 text-sm text-muted">
          Esta cadencia todavía no tiene pasos para previsualizar.
        </p>
      ) : muestra ? (
        <PreviewCinematico pasos={pasosPreview} datos={conRemitente(muestra)} />
      ) : (
        <p className="rounded-2xl border border-line bg-card px-5 py-6 text-sm text-muted">
          El segmento no tiene contactos con nombre para previsualizar todavía.
        </p>
      )}

      <Link
        href={`/campanas/${idCampana}/lanzar`}
        className="self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg transition-colors hover:opacity-90"
      >
        Continuar a Lanzar
      </Link>
    </div>
  );
}
