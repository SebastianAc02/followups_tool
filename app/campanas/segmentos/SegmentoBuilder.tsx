'use client';

import { useState, useTransition } from 'react';
import type { DefinicionSegmento } from '../../db/validation';
import { previsualizarSegmentoAction, guardarSegmentoAction, type PreviewSegmento } from '../actions';

type Condicion = DefinicionSegmento['condiciones'][number];

// Campos de texto -> dropdown de valores; numericos -> rango desde/hasta.
const CAMPOS_TEXTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'owner'] as const;
const CAMPOS_RANGO = ['usuarios', 'prioridad'] as const;

const LABELS: Record<string, string> = {
  estado: 'Estado (Notion)',
  categoria: 'Categoría',
  estado_comercial: 'Estado comercial',
  ciudad: 'Ciudad',
  owner: 'Owner',
  usuarios: 'Usuarios',
  prioridad: 'Prioridad (tier)',
};

type Props = { opciones: Record<(typeof CAMPOS_TEXTO)[number], string[]> };

export default function SegmentoBuilder({ opciones }: Props) {
  const [condiciones, setCondiciones] = useState<Condicion[]>([]);
  const [preview, setPreview] = useState<PreviewSegmento | null>(null);
  const [nombre, setNombre] = useState('');
  const [guardado, setGuardado] = useState('');
  const [pending, startTransition] = useTransition();

  function refrescar(nuevas: Condicion[]) {
    setCondiciones(nuevas);
    setGuardado('');
    if (nuevas.length === 0) {
      setPreview(null);
      return;
    }
    startTransition(async () => {
      setPreview(await previsualizarSegmentoAction({ condiciones: nuevas }));
    });
  }

  function agregarTexto(campo: (typeof CAMPOS_TEXTO)[number]) {
    refrescar([...condiciones, { campo, op: 'en', valores: [opciones[campo][0] ?? ''] }]);
  }
  function agregarRango(campo: (typeof CAMPOS_RANGO)[number]) {
    refrescar([...condiciones, { campo, op: 'entre', desde: 0, hasta: campo === 'usuarios' ? 10000 : 9 }]);
  }
  function actualizar(i: number, c: Condicion) {
    refrescar(condiciones.map((prev, j) => (j === i ? c : prev)));
  }
  function quitar(i: number) {
    refrescar(condiciones.filter((_, j) => j !== i));
  }

  async function guardar() {
    const r = await guardarSegmentoAction(nombre, { condiciones });
    setGuardado(r.ok ? `Guardado (#${r.idSegmento})` : r.error);
  }

  return (
    <div className="capture">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {CAMPOS_TEXTO.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => agregarTexto(c)}>
            + {LABELS[c]}
          </button>
        ))}
        {CAMPOS_RANGO.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => agregarRango(c)}>
            + {LABELS[c]} (rango)
          </button>
        ))}
      </div>

      {condiciones.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="mono" style={{ minWidth: 140 }}>
            {LABELS[c.campo]}
          </span>
          {c.op === 'entre' ? (
            <>
              <input
                type="number"
                value={c.desde}
                onChange={(e) => actualizar(i, { ...c, desde: Number(e.target.value) })}
                style={{ width: 100 }}
              />
              <span>a</span>
              <input
                type="number"
                value={c.hasta}
                onChange={(e) => actualizar(i, { ...c, hasta: Number(e.target.value) })}
                style={{ width: 100 }}
              />
            </>
          ) : c.op === 'en' || c.op === 'no_en' ? (
            <>
              <select value={c.op} onChange={(e) => actualizar(i, { ...c, op: e.target.value as 'en' | 'no_en' })}>
                <option value="en">es</option>
                <option value="no_en">no es</option>
              </select>
              <select
                multiple
                value={c.valores}
                onChange={(e) => actualizar(i, { ...c, valores: Array.from(e.target.selectedOptions, (o) => o.value) })}
              >
                {(opciones[c.campo as (typeof CAMPOS_TEXTO)[number]] ?? []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="conector-desc">{c.op === 'es_null' ? 'sin valor' : 'con valor'}</span>
          )}
          <button type="button" className="chip" onClick={() => quitar(i)}>
            quitar
          </button>
        </div>
      ))}

      {preview && (
        <div style={{ marginTop: 16 }}>
          {preview.ok ? (
            <>
              <div className="section-label">{pending ? 'Contando...' : `${preview.total} empresas caen en el segmento`}</div>
              {preview.sinDatoUsuarios !== null && preview.sinDatoUsuarios > 0 && (
                <p className="conector-desc">
                  {preview.sinDatoUsuarios} empresas cumplen el resto de filtros pero no tienen dato de usuarios y
                  quedaron fuera del rango.
                </p>
              )}
              <div className="cad-list">
                {preview.muestra.map((e) => (
                  <div key={e.id} className="cad-item">
                    <span className="cad-item-nombre">{e.nombre}</span>
                    <span className="cad-item-meta mono">
                      {e.estado ?? 'sin estado'} · {e.categoria ?? 'sin categoria'} ·{' '}
                      {e.usuarios != null ? `${e.usuarios} usuarios` : 'sin dato'}
                    </span>
                  </div>
                ))}
                {preview.total > preview.muestra.length && (
                  <p className="conector-desc">Mostrando 20 de {preview.total}.</p>
                )}
              </div>
            </>
          ) : (
            <p className="login-error">{preview.error}</p>
          )}
        </div>
      )}

      {condiciones.length > 0 && preview?.ok && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            placeholder="Nombre del segmento (ej. Tier 1 ISP)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <button type="button" className="save" onClick={guardar}>
            Guardar segmento
          </button>
          {guardado && <span className="conector-desc">{guardado}</span>}
        </div>
      )}
    </div>
  );
}
