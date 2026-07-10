'use client';

import { useState } from 'react';
import Link from 'next/link';
import { aprobarLoteManualAction } from '../actions';
import { cn } from '../ui/cn';
import { Pill } from '../ui/Pill';
import { CanalTag } from '../ui/CanalTag';
import { SeverityText } from '../ui/SeverityText';
import { button } from '../ui/button.variants.ts';
import { canalNormalizado } from './agenda.ts';

export type ItemCadenciaHoy = {
  idPasoInscripcion: number;
  idDestinatario: number;
  idCampana: number;
  modo: string;
  fechaProgramada: string | null;
  canal: string;
  esManual: number;
  orden: number;
  diaOffset: number;
  email: string | null;
  nombre: string | null;
  asunto: string | null;
  cuerpo: string | null;
  firmaApollo: boolean;
  variables: string[];
  idEmpresa: string;
  empresaNombre: string;
  historial: { orden: number; diaOffset: number; canal: string; fechaEnviada: string | null }[];
};

// Llamadas primero (siguen igual, sin copy que mostrar), luego correo, luego
// whatsapp: es el orden de trabajo que pidió Sebastián para la jornada.
const PRIORIDAD_CANAL: Record<string, number> = { llamada: 0, correo: 1, whatsapp: 2 };

function conVariablesResaltadas(texto: string) {
  const partes = texto.split(/(\[[^[\]]+\])/g);
  return partes.map((p, i) =>
    /^\[[^[\]]+\]$/.test(p) ? (
      <mark key={i} className="rounded-[4px] bg-today-bg px-1 text-today">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function diaLabel(item: Pick<ItemCadenciaHoy, 'orden' | 'diaOffset' | 'historial'>) {
  const tocados = item.historial.map((h) => `D${h.diaOffset}`).join(', ');
  return `Paso ${item.orden} (día ${item.diaOffset})${tocados ? ` · ya tocados: ${tocados}` : ' · primer toque'}`;
}

function CopyBox({
  cuerpo,
  onChange,
  firmaApollo,
  placeholder,
  original,
}: {
  cuerpo: string;
  onChange: (v: string) => void;
  firmaApollo: boolean;
  placeholder: string;
  original: string;
}) {
  return (
    <div className="my-2">
      <div className="mb-1.5 text-[13px] leading-[1.5] text-ink-soft">
        {conVariablesResaltadas(original)}
        {firmaApollo ? ' · lleva firma' : ''}
      </div>
      <textarea
        rows={4}
        value={cuerpo}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-line bg-hover px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
      />
    </div>
  );
}

// Sesion 2026-07-10 (pedido de Sebastian): un manual de whatsapp/correo ya NO se
// aprueba desde una tarjetica inline con el copy crudo -- igual que la llamada, lleva
// al cockpit (/llamada/[idEmpresa], que despacha por canal a EditorWhatsapp/
// EditorCorreo) donde se ve el contexto completo del lead (info + toques previos en la
// columna) y el copy YA con las variables resueltas, para revisarlo antes de mandar.
function FilaPrioritaria({ item, atrasado }: { item: ItemCadenciaHoy; atrasado: boolean }) {
  const canal = canalNormalizado(item.canal);
  const labelAccion = canal === 'whatsapp' ? 'Ir a mandar WhatsApp' : canal === 'correo' ? 'Ir a mandar correo' : 'Ir al toque';

  return (
    <div className="border-b border-line py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{item.empresaNombre}</span>
          <Pill tone="warm">manual · Tier 1</Pill>
          <CanalTag canal={canal} />
          {item.nombre && <span className="text-[13px] text-muted">{item.nombre}</span>}
        </div>
        <SeverityText variant={atrasado ? 'overdue' : 'today'} className="shrink-0">
          {atrasado ? 'atrasado' : 'hoy'}
        </SeverityText>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          contacto <b className="text-ink-soft">{item.email ?? '—'}</b>
        </span>
        {item.asunto && (
          <span>
            asunto <b className="text-ink-soft">{item.asunto}</b>
          </span>
        )}
        <span className="mono text-faint">{diaLabel(item)}</span>
      </div>
      <Link href={`/llamada/${item.idEmpresa}`} className={cn(button({ variant: 'pill' }), 'mt-2 inline-block text-[12.5px]')}>
        {labelAccion}
      </Link>
    </div>
  );
}

function GrupoBatch({ items }: { items: ItemCadenciaHoy[] }) {
  const base = items[0];
  const [cuerpo, setCuerpo] = useState(base.cuerpo ?? '');
  const tieneCopy = base.canal !== 'llamada' && base.cuerpo != null;

  return (
    <div className="border-b border-line py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">
          {items.length} empresas
        </span>
        <CanalTag canal={canalNormalizado(base.canal)} />
        <Pill tone="warm">batch · {diaLabel(base)}</Pill>
      </div>
      <div className="mt-1.5 text-[12.5px] text-muted">{items.map((i) => i.empresaNombre).join(', ')}</div>

      {tieneCopy && (
        <CopyBox
          cuerpo={cuerpo}
          onChange={setCuerpo}
          firmaApollo={base.firmaApollo}
          original={base.cuerpo!}
          placeholder="Editar para todo el grupo..."
        />
      )}

      <form action={aprobarLoteManualAction} className="mt-2">
        {items.map((i) => (
          <input key={i.idPasoInscripcion} type="hidden" name="idPasoInscripcion" value={i.idPasoInscripcion} />
        ))}
        {tieneCopy && <input type="hidden" name="cuerpoFinal" value={cuerpo} />}
        <button type="submit" className={cn(button({ variant: 'pill' }), "text-[12.5px]")}>
          Confirmar para las {items.length}
        </button>
      </form>
    </div>
  );
}

// Sesion 2026-07-09: una llamada de cadencia no es "aprobar un texto que ya se
// mando" (Tier 1, correo/whatsapp) -- es un toque real que todavia no paso, con un
// resultado de las 4 salidas cerradas que solo se captura en el cockpit de /llamada.
// "Aprobar (ya lo hice)" dejaria un toque sin resultado (aprobarPasoManual no lo
// pide), asi que en vez de ese boton se linkea directo al cockpit real de Toques.
function FilaLlamada({ item, atrasado }: { item: ItemCadenciaHoy; atrasado: boolean }) {
  return (
    <div className="border-b border-line py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{item.empresaNombre}</span>
          <CanalTag canal={canalNormalizado(item.canal)} />
          {item.nombre && <span className="text-[13px] text-muted">{item.nombre}</span>}
        </div>
        <SeverityText variant={atrasado ? 'overdue' : 'today'} className="shrink-0">
          {atrasado ? 'atrasado' : 'hoy'}
        </SeverityText>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          contacto <b className="text-ink-soft">{item.email ?? '—'}</b>
        </span>
        <span className="mono text-faint">{diaLabel(item)}</span>
      </div>
      <Link href={`/llamada/${item.idEmpresa}`} className={cn(button({ variant: 'pill' }), 'mt-2 inline-block text-[12.5px]')}>
        Ir a llamar
      </Link>
    </div>
  );
}

function FilaAutomatica({ item, atrasado }: { item: ItemCadenciaHoy; atrasado: boolean }) {
  return (
    <div className="border-b border-line py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{item.empresaNombre}</span>
          <Pill tone="cold">automático</Pill>
          <CanalTag canal={canalNormalizado(item.canal)} />
          {item.nombre && <span className="text-[13px] text-muted">{item.nombre}</span>}
        </div>
        <SeverityText variant={atrasado ? 'overdue' : 'today'} className="shrink-0">
          {atrasado ? 'atrasado' : 'hoy'}
        </SeverityText>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          contacto <b className="text-ink-soft">{item.email ?? '—'}</b>
        </span>
        {item.asunto && (
          <span>
            asunto <b className="text-ink-soft">{item.asunto}</b>
          </span>
        )}
      </div>
    </div>
  );
}

export default function CadenciasHoy({ items, hoy }: { items: ItemCadenciaHoy[]; hoy: string }) {
  const ordenadas = [...items].sort((a, b) => {
    const pa = PRIORIDAD_CANAL[a.canal] ?? 9;
    const pb = PRIORIDAD_CANAL[b.canal] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.fechaProgramada ?? '').localeCompare(b.fechaProgramada ?? '');
  });

  const automaticos = ordenadas.filter((t) => t.esManual === 0);
  // llamada nunca es "aprobar un texto" (Tier 1): tiene su propia fila (FilaLlamada,
  // linkea a /llamada) sin importar el modo prioritaria/batch de la campana -- un
  // "lote" de llamadas no es real, cada una necesita su propia conversacion.
  const porLlamar = ordenadas.filter((t) => t.esManual === 1 && t.canal === 'llamada');
  const manuales = ordenadas.filter((t) => t.esManual === 1 && t.canal !== 'llamada');
  const prioritarios = manuales.filter((t) => t.modo !== 'batch');
  const enLote = manuales.filter((t) => t.modo === 'batch');

  const grupos = new Map<string, ItemCadenciaHoy[]>();
  for (const t of enLote) {
    const key = `${t.idCampana}-${t.orden}`;
    const arr = grupos.get(key) ?? [];
    arr.push(t);
    grupos.set(key, arr);
  }

  return (
    <div className="mb-8">
      <div className="mb-2.5 font-serif text-[15px] font-medium text-ink">Cadencias de hoy</div>

      {porLlamar.map((t) => (
        <FilaLlamada key={t.idPasoInscripcion} item={t} atrasado={(t.fechaProgramada ?? '').slice(0, 10) < hoy} />
      ))}

      {prioritarios.map((t) => (
        <FilaPrioritaria key={t.idPasoInscripcion} item={t} atrasado={(t.fechaProgramada ?? '').slice(0, 10) < hoy} />
      ))}

      {[...grupos.values()].map((grupo) => (
        <GrupoBatch key={`${grupo[0].idCampana}-${grupo[0].orden}`} items={grupo} />
      ))}

      {automaticos.map((t) => (
        <FilaAutomatica key={t.idPasoInscripcion} item={t} atrasado={(t.fechaProgramada ?? '').slice(0, 10) < hoy} />
      ))}
    </div>
  );
}
