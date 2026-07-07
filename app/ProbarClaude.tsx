'use client';

import { useState } from 'react';

// Sandbox temporal para probar Claude via el gateway dario, con streaming en vivo
// y acceso a internet (el modelo pide buscar, el servidor corre la busqueda). Doble
// de sandbox para prototipar prompts de segmentacion antes de construirla en serio.
const PROMPT_DEFAULT =
  'Busca en internet: que es WispHub y cual es el URL de su documentacion. Responde corto y en espanol, sin emojis.';

type Estado = {
  modelo: string;
  texto: string;
  busquedas: string[];
  ms: number | null;
  error: string | null;
};

const VACIO: Estado = { modelo: '', texto: '', busquedas: [], ms: null, error: null };

export default function ProbarClaude() {
  const [abierto, setAbierto] = useState(false);
  const [prompt, setPrompt] = useState(PROMPT_DEFAULT);
  const [cargando, setCargando] = useState(false);
  const [st, setSt] = useState<Estado | null>(null);

  async function enviar() {
    setCargando(true);
    setSt(VACIO);
    try {
      const res = await fetch('/api/probar-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.body) throw new Error('sin cuerpo');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      // NDJSON: acumulamos y procesamos linea por linea. La ultima puede venir
      // partida, por eso queda en el buffer para el siguiente chunk.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lineas = buf.split('\n');
        buf = lineas.pop() ?? '';
        for (const l of lineas) {
          if (!l.trim()) continue;
          aplicar(JSON.parse(l));
        }
      }
    } catch {
      setSt((prev) => ({ ...(prev ?? VACIO), error: 'Error de conexion con el servidor.' }));
    } finally {
      setCargando(false);
    }
  }

  function aplicar(ev: { tipo: string; modelo?: string; texto?: string; query?: string; ms?: number; error?: string }) {
    setSt((prev) => {
      const s = prev ?? VACIO;
      switch (ev.tipo) {
        case 'inicio':   return { ...s, modelo: ev.modelo ?? '' };
        case 'texto':    return { ...s, texto: s.texto + (ev.texto ?? '') };
        case 'busqueda': return { ...s, busquedas: [...s.busquedas, ev.query ?? ''] };
        case 'fin':      return { ...s, ms: ev.ms ?? null };
        case 'error':    return { ...s, error: ev.error ?? 'Error' };
        default:         return s;
      }
    });
  }

  if (!abierto) {
    return (
      <button type="button" className="ia-toggle" onClick={() => setAbierto(true)}>
        Probar Claude
      </button>
    );
  }

  return (
    <div className="ia-panel">
      <div className="ia-panel-head">
        <span className="section-label">Probar Claude</span>
        <button type="button" className="ia-cerrar" onClick={() => setAbierto(false)}>
          cerrar
        </button>
      </div>

      <textarea
        className="ia-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Escribe algo para mandarle a Claude..."
      />

      <button type="button" className="ia-enviar" onClick={enviar} disabled={cargando}>
        {cargando ? 'Respondiendo...' : 'Enviar al gateway'}
      </button>

      {st && (
        <div className={`ia-resultado ${st.error ? 'error' : 'ok'}`}>
          <div className="ia-meta mono">
            {st.error ? 'ERROR' : cargando ? 'EN VIVO' : 'OK'}
            {st.modelo && ` · ${st.modelo}`}
            {st.ms != null && ` · ${st.ms} ms`}
          </div>

          {st.busquedas.length > 0 && (
            <div className="ia-busquedas">
              {st.busquedas.map((q, i) => (
                <span key={i} className="ia-busqueda mono">buscó: {q}</span>
              ))}
            </div>
          )}

          <div className="ia-texto">
            {st.error ?? st.texto}
            {cargando && !st.error && <span className="ia-caret">▋</span>}
          </div>
        </div>
      )}
    </div>
  );
}
