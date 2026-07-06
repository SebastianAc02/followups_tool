'use client';

import { useState } from 'react';
import { aprobarPasoManualAction, aprobarLoteManualAction } from '../actions';

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
  return partes.map((p, i) => (/^\[[^[\]]+\]$/.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

function diaLabel(item: Pick<ItemCadenciaHoy, 'orden' | 'diaOffset' | 'historial'>) {
  const tocados = item.historial.map((h) => `D${h.diaOffset}`).join(', ');
  return `Paso ${item.orden} (día ${item.diaOffset})${tocados ? ` · ya tocados: ${tocados}` : ' · primer toque'}`;
}

function FilaPrioritaria({ item, atrasado }: { item: ItemCadenciaHoy; atrasado: boolean }) {
  const [cuerpo, setCuerpo] = useState(item.cuerpo ?? '');
  const tieneCopy = item.canal !== 'llamada' && item.cuerpo != null;

  return (
    <div className="row-wrap">
      <div className="row">
        <div>
          <div className="l1">
            <span className={`dot ${atrasado ? 'overdue' : 'today'}`} aria-hidden="true" />
            <span className="emp">{item.empresaNombre}</span>
            <span className="pill warm">manual · Tier 1</span>
            {item.nombre && <span className="contact">{item.nombre}</span>}
          </div>
          <div className="l2">
            <span>
              canal <b>{item.canal}</b>
            </span>
            <span>
              contacto <b>{item.email ?? '—'}</b>
            </span>
            {item.asunto && (
              <span>
                asunto <b>{item.asunto}</b>
              </span>
            )}
          </div>
          <div className="conector-desc mono" style={{ marginTop: 4 }}>
            {diaLabel(item)}
          </div>
        </div>
        <div className="right">
          <div className={`when ${atrasado ? 'overdue' : 'today'}`}>{atrasado ? 'atrasado' : 'hoy'}</div>
        </div>
      </div>

      {tieneCopy && (
        <div style={{ margin: '8px 0' }}>
          <div className="conector-desc">
            {conVariablesResaltadas(item.cuerpo!)}
            {item.firmaApollo ? ' · lleva firma' : ''}
          </div>
          <textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Personaliza antes de mandarlo..." />
        </div>
      )}

      <form className="tap-row" action={aprobarPasoManualAction}>
        <input type="hidden" name="idPasoInscripcion" value={item.idPasoInscripcion} />
        {tieneCopy && <input type="hidden" name="cuerpoFinal" value={cuerpo} />}
        <button type="submit" className="tap-btn">
          Aprobar (ya lo hice)
        </button>
      </form>
    </div>
  );
}

function GrupoBatch({ items }: { items: ItemCadenciaHoy[] }) {
  const base = items[0];
  const [cuerpo, setCuerpo] = useState(base.cuerpo ?? '');
  const tieneCopy = base.canal !== 'llamada' && base.cuerpo != null;

  return (
    <div className="row-wrap">
      <div className="row">
        <div>
          <div className="l1">
            <span className="emp">
              {items.length} empresas · {base.canal}
            </span>
            <span className="pill warm">batch · {diaLabel(base)}</span>
          </div>
          <div className="l2">
            <span>{items.map((i) => i.empresaNombre).join(', ')}</span>
          </div>
        </div>
      </div>

      {tieneCopy && (
        <div style={{ margin: '8px 0' }}>
          <div className="conector-desc">
            {conVariablesResaltadas(base.cuerpo!)}
            {base.firmaApollo ? ' · lleva firma' : ''}
          </div>
          <textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Editar para todo el grupo..." />
        </div>
      )}

      <form className="tap-row" action={aprobarLoteManualAction}>
        {items.map((i) => (
          <input key={i.idPasoInscripcion} type="hidden" name="idPasoInscripcion" value={i.idPasoInscripcion} />
        ))}
        {tieneCopy && <input type="hidden" name="cuerpoFinal" value={cuerpo} />}
        <button type="submit" className="tap-btn">
          Confirmar para las {items.length}
        </button>
      </form>
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
  const manuales = ordenadas.filter((t) => t.esManual === 1);
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
    <div className="cadencias-hoy">
      <div className="h-title" style={{ fontSize: 15, marginBottom: 10 }}>
        Cadencias de hoy
      </div>

      {prioritarios.map((t) => (
        <FilaPrioritaria key={t.idPasoInscripcion} item={t} atrasado={(t.fechaProgramada ?? '').slice(0, 10) < hoy} />
      ))}

      {[...grupos.values()].map((grupo) => (
        <GrupoBatch key={`${grupo[0].idCampana}-${grupo[0].orden}`} items={grupo} />
      ))}

      {automaticos.map((t) => {
        const atrasado = (t.fechaProgramada ?? '').slice(0, 10) < hoy;
        return (
          <div className="row-wrap" key={t.idPasoInscripcion}>
            <div className="row">
              <div>
                <div className="l1">
                  <span className={`dot ${atrasado ? 'overdue' : 'today'}`} aria-hidden="true" />
                  <span className="emp">{t.empresaNombre}</span>
                  <span className="pill cold">automático</span>
                  {t.nombre && <span className="contact">{t.nombre}</span>}
                </div>
                <div className="l2">
                  <span>
                    canal <b>{t.canal}</b>
                  </span>
                  <span>
                    contacto <b>{t.email ?? '—'}</b>
                  </span>
                  {t.asunto && (
                    <span>
                      asunto <b>{t.asunto}</b>
                    </span>
                  )}
                </div>
              </div>
              <div className="right">
                <div className={`when ${atrasado ? 'overdue' : 'today'}`}>{atrasado ? 'atrasado' : 'hoy'}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
