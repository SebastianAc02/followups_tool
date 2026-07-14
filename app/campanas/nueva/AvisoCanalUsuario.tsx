import { readinessCanalUsuario } from '../../core/readiness-canal-usuario';
import { CANALES, type Canal } from '../../db/validation';

const NOMBRE_CANAL: Record<Canal, string> = { correo: 'Correo', whatsapp: 'WhatsApp', llamada: 'Llamada' };

export function AvisoCanalUsuario({ tieneLineaWhatsappActiva }: { tieneLineaWhatsappActiva: boolean }) {
  const bloqueados = CANALES.map((canal) => ({ canal, veredicto: readinessCanalUsuario(canal, tieneLineaWhatsappActiva) })).filter(
    (x) => !x.veredicto.listo,
  );
  if (bloqueados.length === 0) return null;

  return (
    <div className="mb-6 max-w-prose rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
      <p className="mb-1 font-semibold text-ink">Antes de lanzar, ten en cuenta:</p>
      <ul className="list-inside list-disc">
        {bloqueados.map(({ canal, veredicto }) => (
          <li key={canal}>
            <span className="font-medium">{NOMBRE_CANAL[canal]}:</span> {veredicto.listo === false ? veredicto.motivo : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
