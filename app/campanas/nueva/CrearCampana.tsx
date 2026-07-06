'use client';

import { useState } from 'react';
import { previsualizarCadenciaAction, crearCampanaConCadenciaAction, type PreviewCadencia, type CrearCampanaResultado } from './actions';
import type { ModoCampana } from '../../db/validation';

const PLACEHOLDER = `# ISP outbound Tier 1

## Día 0 · correo · Me presento
Hola [nombre], soy Sebastián de OnePay...
[[firma]]

## Día 3 · whatsapp
Seguí por acá, ¿lo pudiste ver?

## Día 7 · llamada · Cierre
Guion de la llamada.`;

type Segmento = { id: number; nombre: string; descripcionNatural: string | null };

// Resalta [variables] dentro del texto para que se vea claro que es personalizable.
function conVariablesResaltadas(texto: string) {
  const partes = texto.split(/(\[[^[\]]+\])/g);
  return partes.map((p, i) => (/^\[[^[\]]+\]$/.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

export default function CrearCampana({ segmentos }: { segmentos: Segmento[] }) {
  const [idSegmento, setIdSegmento] = useState(segmentos[0]?.id ?? 0);
  const [nombreCampana, setNombreCampana] = useState('');
  const [modo, setModo] = useState<ModoCampana>('prioritaria');
  const [formato, setFormato] = useState<'md' | 'csv'>('md');
  const [nombreCsv, setNombreCsv] = useState('');
  const [contenido, setContenido] = useState('');
  const [preview, setPreview] = useState<PreviewCadencia | null>(null);
  const [resultado, setResultado] = useState<CrearCampanaResultado | null>(null);
  const [cargando, setCargando] = useState(false);

  async function previsualizar() {
    setResultado(null);
    setCargando(true);
    setPreview(await previsualizarCadenciaAction(formato, contenido, nombreCsv));
    setCargando(false);
  }

  async function confirmar() {
    setCargando(true);
    setResultado(
      await crearCampanaConCadenciaAction({ nombreCampana, idSegmento, formato, contenido, nombreCsv, modo }),
    );
    setCargando(false);
  }

  return (
    <div className="capture">
      <label>
        Segmento
        <select value={idSegmento} onChange={(e) => setIdSegmento(Number(e.target.value))}>
          {segmentos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="full">
        Nombre de la campaña
        <input value={nombreCampana} onChange={(e) => setNombreCampana(e.target.value)} placeholder="Tier 1 ISP julio" />
      </label>

      <div className="chips" style={{ marginTop: 12 }}>
        <button type="button" className={`chip ${modo === 'prioritaria' ? 'on' : ''}`} onClick={() => setModo('prioritaria')}>
          Prioritaria
        </button>
        <button type="button" className={`chip ${modo === 'batch' ? 'on' : ''}`} onClick={() => setModo('batch')}>
          Batch
        </button>
        <span className="conector-desc" style={{ margin: 0 }}>
          {modo === 'prioritaria'
            ? 'revisás y personalizás lead por lead antes de mandar'
            : 'el copy sale igual para todo el grupo del día; podés editarlo antes de confirmar'}
        </span>
      </div>

      <div className="cad-import-top" style={{ marginTop: 12 }}>
        <select value={formato} onChange={(e) => setFormato(e.target.value as 'md' | 'csv')} className="cad-formato">
          <option value="md">Markdown</option>
          <option value="csv">CSV</option>
        </select>
        {formato === 'csv' && (
          <input value={nombreCsv} onChange={(e) => setNombreCsv(e.target.value)} placeholder="Nombre de la cadencia (CSV)" />
        )}
      </div>
      <textarea rows={10} value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder={PLACEHOLDER} />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="chip" onClick={previsualizar} disabled={!contenido.trim() || cargando}>
          Previsualizar
        </button>
        {preview?.ok && (
          <button type="button" className="save" onClick={confirmar} disabled={!nombreCampana.trim() || cargando}>
            Crear e inscribir
          </button>
        )}
      </div>

      {preview && !preview.ok && <p className="login-error">{preview.error}</p>}

      {preview?.ok && (
        <div style={{ marginTop: 16 }}>
          <div className="section-label">
            {preview.nombre} · {preview.pasos.length} pasos
          </div>
          <div className="cad-list">
            {preview.pasos.map((p) => (
              <div key={p.orden} className="cad-item" style={{ display: 'block' }}>
                <span className="cad-item-nombre">
                  Día {p.diaOffset} · {p.canal} {p.asunto ? `· ${p.asunto}` : ''}
                </span>
                <br />
                {p.cuerpo && <span className="cad-item-meta">{conVariablesResaltadas(p.cuerpo)}</span>}
                <br />
                <span className="cad-item-meta mono">
                  {p.variables.length > 0 ? `variables: ${p.variables.join(', ')}` : 'sin variables'} ·{' '}
                  {p.firmaApollo ? 'con firma Apollo' : 'sin firma'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultado && !resultado.ok && <p className="login-error">{resultado.error}</p>}

      {resultado?.ok && (
        <div style={{ marginTop: 16 }}>
          <div className="section-label">Campaña #{resultado.idCampana} creada</div>
          <p className="conector-desc">
            {resultado.resultado.inscritas} inscritas · {resultado.resultado.bloqueadas} bloqueadas (sin email, esperan
            contacto) · {resultado.resultado.reemplazos} reemplazaron campaña anterior · {resultado.resultado.saltadas} ya
            estaban.
          </p>
        </div>
      )}
    </div>
  );
}
