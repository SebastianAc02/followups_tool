'use client';

import Link from 'next/link';
import { cn } from '../../ui/cn';
import { PASOS_WIZARD, type PasoWizardItem } from './pasos-wizard-items';

export type { PasoWizardItem };

// Item sin href/onClick = todavia no hay a donde ir (ej. Destinatarios antes de que
// exista idCampana): se pinta como texto plano, no como link muerto.
export function PasosWizard({ pasos, activo }: { pasos: PasoWizardItem[]; activo: (typeof PASOS_WIZARD)[number] }) {
  const idxActivo = PASOS_WIZARD.indexOf(activo);

  return (
    <div className="flex min-w-0 items-center gap-3 overflow-x-auto whitespace-nowrap px-6 py-[15px] text-[13px]">
      <span className="shrink-0 text-faint">Nueva campaña</span>
      <span className="shrink-0 text-line-strong">·</span>
      {pasos.map((paso, i) => {
        const esActivo = paso.label === activo;
        const contenido = (
          <span className={cn('flex items-center gap-[7px]', esActivo ? 'font-semibold text-ink' : 'text-faint')}>
            {esActivo && (
              <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent font-mono text-[11px] font-semibold text-bg">
                {idxActivo + 1}
              </span>
            )}
            {paso.label}
          </span>
        );
        return (
          <span key={paso.label} className="flex shrink-0 items-center gap-3">
            {i > 0 && <span className="text-line-strong">›</span>}
            {paso.href ? (
              <Link href={paso.href} className="hover:opacity-80">
                {contenido}
              </Link>
            ) : paso.onClick ? (
              <button type="button" onClick={paso.onClick} className="text-ink-soft hover:text-ink">
                {contenido}
              </button>
            ) : (
              contenido
            )}
          </span>
        );
      })}
    </div>
  );
}
