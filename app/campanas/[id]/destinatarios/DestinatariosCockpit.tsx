'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { previsualizarInscripcionAction } from './actions';
import type { CampanaParaPreview, FilaPreviewInscripcion } from '../../../db/repository';
import { CANAL_LABEL, type Canal } from '../../../ui/canal-tag.variants.ts';
import { cn } from '../../../ui/cn';

// Fase 6 (V4 Destinatarios): calca "Cockpit Destinatarios html4/index.html" -- la
// factura de a quien se inscribe, con la cadencia ajustada por la regla activa
// (canales tachados/reemplazados), toques totales, estado y el resumen por canal.
// No escribe nada: es un preview de usar y tirar (ver actions.ts).
//
// El estado (lista/con_ajuste/bloqueada) usa un pill propio en vez del primitivo
// <Pill>: ese primitivo fija su propio fondo/borde neutro (calca la tarjeta "Ahora"
// de la cola) y solo varia el color del punto -- aca el mockup pinta el pill entero
// con el color del tono (fondo+texto), un patron distinto que no vale la pena forzar
// dentro de <Pill> a puro parche de className.
const ESTADO_PILL: Record<FilaPreviewInscripcion['estado'], { label: string; className: string }> = {
  lista: { label: 'Completa', className: 'bg-done/10 text-done' },
  con_ajuste: { label: 'Con ajuste', className: 'bg-today/10 text-today' },
  bloqueada: { label: 'Bloqueada', className: 'bg-overdue/10 text-overdue' },
};

const CANAL_TEXT_CLASS: Record<Canal, string> = {
  llamada: 'text-canal-llamada',
  correo: 'text-canal-correo',
  whatsapp: 'text-canal-whatsapp',
};

const CANAL_BG_CLASS: Record<Canal, string> = {
  llamada: 'bg-canal-llamada/10',
  correo: 'bg-canal-correo/10',
  whatsapp: 'bg-canal-whatsapp/10',
};

export function DestinatariosCockpit({
  campana,
  filasIniciales,
}: {
  campana: CampanaParaPreview;
  filasIniciales: FilaPreviewInscripcion[];
}) {
  const [filas, setFilas] = useState(filasIniciales);
  const [error, setError] = useState('');
  const [pendiente, startTransition] = useTransition();

  function recargar() {
    setError('');
    startTransition(async () => {
      const res = await previsualizarInscripcionAction(campana.idCampana);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFilas(res.filas);
    });
  }

  const destinatarios = filas.filter((f) => f.idContacto != null);
  const bloqueadas = filas.filter((f) => f.idContacto == null);
  const totalesPorCanal = destinatarios.reduce(
    (acc, f) => {
      for (const paso of f.pasosAjustados) {
        if (paso.omitido) continue;
        acc[paso.canal] += 1;
      }
      return acc;
    },
    { correo: 0, llamada: 0, whatsapp: 0 } as Record<Canal, number>,
  );
  const totalToques = totalesPorCanal.correo + totalesPorCanal.llamada + totalesPorCanal.whatsapp;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Campaña · Destinatarios</p>
        <h1 className="font-serif text-2xl text-ink">{campana.nombre}</h1>
        <p className="text-[13px] text-muted">
          Cada uno recibe la cadencia <span className="font-semibold text-ink">{campana.cadencia}</span> ·{' '}
          {destinatarios.length} {destinatarios.length === 1 ? 'contacto' : 'contactos'} listos para inscribir. Revísalo
          como una factura antes de lanzar.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-[13px] border border-line bg-card px-5 py-4">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-bg"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent))' }}
          aria-hidden="true"
        >
          ✦
        </span>
        <p className="text-sm text-muted">
          Regla activa: cuando falta un canal, <span className="font-semibold text-ink">{ROTULO_REGLA[campana.reglaFaltante]}</span>.
        </p>
        <Link
          href={`/campanas/${campana.idCampana}/reglas`}
          className="ml-auto text-xs font-semibold text-accent-ink hover:underline"
        >
          Cambiar regla
        </Link>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <section className="min-w-0 flex-1 overflow-hidden rounded-[18px] border border-line" aria-labelledby="tabla-destinatarios">
          <h2 id="tabla-destinatarios" className="sr-only">
            Destinatarios
          </h2>
          <div
            className="grid gap-3 border-b border-line bg-surface px-5 py-3 text-[10px] uppercase tracking-wide text-muted"
            style={{ gridTemplateColumns: '1.4fr 1.1fr 2fr 0.5fr 0.85fr' }}
          >
            <span>Contacto</span>
            <span>Empresa</span>
            <span>Cadencia que recibe</span>
            <span className="text-right">Toques</span>
            <span>Estado</span>
          </div>

          {destinatarios.map((fila) => (
            <div
              key={fila.idEmpresa}
              className={cn('grid items-center gap-3 border-b border-line px-5 py-4 transition-opacity last:border-b-0', pendiente && 'opacity-60')}
              style={{ gridTemplateColumns: '1.4fr 1.1fr 2fr 0.5fr 0.85fr' }}
            >
              <div>
                <div className="text-sm font-semibold text-ink">{fila.nombreContacto ?? '—'}</div>
                {fila.cargo && <div className="mt-0.5 text-xs text-muted">{fila.cargo}</div>}
              </div>
              <span className="text-sm text-muted">{fila.nombreEmpresa}</span>
              <span className="flex flex-wrap gap-1.5">
                {fila.pasosAjustados.map((paso) => (
                  <PasoChip key={paso.orden} paso={paso} />
                ))}
              </span>
              <span className="text-right font-mono-tag text-sm text-ink">{fila.toquesTotales}</span>
              <span>
                <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', ESTADO_PILL[fila.estado].className)}>
                  {ESTADO_PILL[fila.estado].label}
                </span>
              </span>
            </div>
          ))}

          {destinatarios.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted">Ninguna cuenta del segmento tiene un destinatario con correo todavía.</p>
          )}

          {bloqueadas.length > 0 && (
            <p className="border-t border-line px-5 py-4 text-xs text-muted">
              Las {bloqueadas.length} {bloqueadas.length === 1 ? 'cuenta' : 'cuentas'} sin contacto identificado quedan en la
              cola. El Copiloto intentará conseguir un correo o teléfono antes del lanzamiento.
            </p>
          )}
        </section>

        <aside className="w-full shrink-0 rounded-[18px] border border-line bg-card px-5 py-5 xl:w-[280px]">
          <h2 className="mb-4 font-serif text-lg text-ink">Resumen de envío</h2>
          <dl className="flex flex-col gap-2.5 text-sm">
            <ResumenFila label="Correos" value={totalesPorCanal.correo} className="text-canal-correo" />
            <ResumenFila label="Llamadas" value={totalesPorCanal.llamada} className="text-canal-llamada" />
            <ResumenFila label="WhatsApp" value={totalesPorCanal.whatsapp} className="text-canal-whatsapp" />
            <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-semibold text-ink">Total de toques</dt>
              <dd className="font-serif text-2xl text-ink">{totalToques}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={recargar}
            disabled={pendiente}
            className="mt-5 w-full rounded-lg border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-line-strong disabled:opacity-40"
          >
            {pendiente ? 'Recalculando…' : 'Recalcular preview'}
          </button>
          {error && <p className="mt-3 text-xs text-overdue">{error}</p>}
        </aside>
      </div>
    </div>
  );
}

const ROTULO_REGLA: Record<CampanaParaPreview['reglaFaltante'], string> = {
  reemplazar: 'reemplazo el paso por el primer canal disponible',
  saltar: 'salto el paso para esa cuenta',
  cola: 'la dejo en cola de revisión',
};

function PasoChip({ paso }: { paso: FilaPreviewInscripcion['pasosAjustados'][number] }) {
  if (paso.omitido) {
    return (
      <span className="whitespace-nowrap rounded-md border border-line px-2 py-1 text-xs font-semibold text-faint line-through">
        {paso.orden} {CANAL_LABEL[paso.canalOriginal]}
      </span>
    );
  }
  const ajustado = paso.canal !== paso.canalOriginal;
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold',
        ajustado ? cn('border border-dashed', CANAL_TEXT_CLASS[paso.canal]) : cn(CANAL_BG_CLASS[paso.canal], CANAL_TEXT_CLASS[paso.canal]),
      )}
    >
      {paso.orden} {CANAL_LABEL[paso.canal]}
      {ajustado && <span className="ml-1 font-normal text-faint line-through">{CANAL_LABEL[paso.canalOriginal]}</span>}
    </span>
  );
}

function ResumenFila({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('font-mono-tag', className)}>{value}</dd>
    </div>
  );
}
