import Link from 'next/link';
import { listarCampanas } from '../db/repository';
import { requireSession } from '../lib/session';

// Parte 4 campanas: hub de campanas. Es la puerta de entrada real (antes era
// /cadencias, que mostraba el constructor viejo). Desde aca: ver campanas
// existentes, armar un segmento nuevo, o crear una campana.
export default async function Campanas() {
  await requireSession();
  const campanas = listarCampanas();

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Inicio
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Campañas
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <Link href="/campanas/segmentos" className="chip">
          Segmentos
        </Link>
        <Link href="/campanas/nueva" className="save">
          Nueva campaña
        </Link>
      </div>

      <div className="section-label">Campañas</div>
      {campanas.length === 0 ? (
        <p className="conector-desc">
          Todavía no hay campañas. <Link href="/campanas/segmentos">Arma un segmento</Link> y después crea la
          primera campaña.
        </p>
      ) : (
        <div className="cad-list">
          {campanas.map((c) => (
            <div key={c.id} className="cad-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span className="cad-item-nombre">{c.nombre}</span>
                <br />
                <span className="cad-item-meta">
                  {c.cadencia} · segmento {c.segmento} · {c.modo}
                </span>
              </div>
              <span className={`pill ${c.estado === 'activa' ? 'hot' : 'warm'}`}>
                {c.estado} · {c.inscritas} activas{c.bloqueadas > 0 ? ` · ${c.bloqueadas} bloqueadas` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
