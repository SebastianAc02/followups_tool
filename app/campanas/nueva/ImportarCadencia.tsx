'use client';

import { useState, type DragEvent } from 'react';
import { previsualizarCadenciaAction, type PreviewCadencia } from './actions';
import type { FormatoCadencia } from '../../core/cadencia-parser';
import { CanalTag, type Canal } from '../../ui/CanalTag';
import { cn } from '../../ui/cn';

const CANALES_CONOCIDOS = new Set<Canal>(['llamada', 'correo', 'whatsapp']);

function formatoDeArchivo(nombre: string): FormatoCadencia | null {
  const ext = nombre.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
}

// V2.9: resalta [variables] dentro de un texto con el mismo tratamiento que el
// mockup V3 (pill violeta translucido) para que se note de un vistazo que ese
// fragmento se personaliza por cuenta al inscribir.
function conVariablesResaltadas(texto: string) {
  const partes = texto.split(/(\[[^[\]]+\])/g);
  return partes.map((parte, i) =>
    /^\[[^[\]]+\]$/.test(parte) ? (
      <span key={i} className="rounded-[4px] bg-accent-bg px-[5px] py-px text-[0.92em] text-accent-ink">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

export function ImportarCadencia() {
  const [preview, setPreview] = useState<PreviewCadencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  async function cargarArchivo(file: File) {
    const formato = formatoDeArchivo(file.name);
    if (!formato) {
      setPreview({ ok: false, error: `Formato no reconocido: "${file.name}". Usa un archivo .csv, .md o .json` });
      return;
    }
    setCargando(true);
    const contenido = await file.text();
    setPreview(await previsualizarCadenciaAction(formato, contenido, file.name.replace(/\.[^.]+$/, '')));
    setCargando(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files[0];
    if (file) void cargarArchivo(file);
  }

  function cambiarCadencia() {
    setPreview(null);
  }

  if (!preview) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-16 text-center transition-colors',
          arrastrando ? 'border-accent bg-accent-bg/40' : 'border-line',
        )}
      >
        <p className="font-serif text-lg text-ink">Arrastra tu cadencia acá</p>
        <p className="text-sm text-muted">CSV, Markdown o JSON — se previsualiza automático al soltar</p>
        <label className="mt-2 cursor-pointer text-sm font-medium text-accent-soft hover:text-accent">
          o elige un archivo
          <input
            type="file"
            accept=".csv,.md,.markdown,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void cargarArchivo(file);
              e.target.value = '';
            }}
          />
        </label>
        {cargando && <p className="text-xs text-faint">Leyendo…</p>}
      </div>
    );
  }

  if (!preview.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-overdue/30 bg-overdue-bg px-4 py-3 text-sm text-overdue">{preview.error}</p>
        <button type="button" onClick={cambiarCadencia} className="self-start text-sm font-medium text-accent-soft hover:text-accent">
          Cambiar cadencia
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-serif text-lg text-ink">{preview.nombre}</p>
          <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">{preview.pasos.length} pasos</p>
        </div>
        <button type="button" onClick={cambiarCadencia} className="text-sm font-medium text-accent-soft hover:text-accent">
          Cambiar cadencia
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {preview.pasos.map((paso) => {
          const canal = CANALES_CONOCIDOS.has(paso.canal as Canal) ? (paso.canal as Canal) : null;
          return (
            <div key={paso.orden} className="rounded-[13px] border border-line bg-card px-[18px] py-4">
              <div className="mb-2.5 flex items-center gap-2.5">
                {canal ? <CanalTag canal={canal} /> : <span className="text-[11px] font-medium text-muted">{paso.canal}</span>}
                <span className="font-mono-tag text-xs text-faint">Día {paso.diaOffset}</span>
              </div>
              {paso.asunto && (
                <p className="mb-1.5 text-sm font-medium text-ink">
                  Asunto: {conVariablesResaltadas(paso.asunto)}
                </p>
              )}
              {paso.cuerpo && <p className="text-[13px] leading-relaxed text-ink-soft">{conVariablesResaltadas(paso.cuerpo)}</p>}
              {paso.variables.length > 0 && (
                <p className="mt-2.5 font-mono-tag text-xs text-faint">
                  variables: {paso.variables.join(', ')}
                  {paso.firmaApollo ? ' · con firma Apollo' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
