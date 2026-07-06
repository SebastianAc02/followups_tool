import Link from 'next/link';
import { listarSegmentos, valoresDistintosCampo } from '../../db/repository';
import { requireSession } from '../../lib/session';
import SegmentoBuilder from './SegmentoBuilder';

// Parte 1 campanas: pantalla de segmentacion. El server component precarga los valores
// unicos de los campos de texto (dropdowns) y la lista de segmentos guardados; el
// builder client-side arma condiciones y pide conteo en vivo por server action.
export default async function Segmentos() {
  await requireSession();

  const segmentos = listarSegmentos();
  const opciones = {
    estado: valoresDistintosCampo('estado'),
    categoria: valoresDistintosCampo('categoria'),
    estado_comercial: valoresDistintosCampo('estado_comercial'),
    ciudad: valoresDistintosCampo('ciudad'),
    owner: valoresDistintosCampo('owner'),
  };

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Inicio
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Segmentos
      </div>

      <div className="section-label">Armar un segmento</div>
      <p className="conector-desc">
        Filtra la base como en Apollo: agrega condiciones y mira el conteo en vivo. Los campos numéricos
        (usuarios, prioridad) filtran por rango; el resto por lista de valores.
      </p>
      <SegmentoBuilder opciones={opciones} />

      <div className="section-label" style={{ marginTop: 32 }}>
        Segmentos guardados
      </div>
      {segmentos.length === 0 ? (
        <p className="conector-desc">Todavía no hay segmentos. Arma el primero arriba.</p>
      ) : (
        <div className="cad-list">
          {segmentos.map((s) => (
            <Link key={s.id} href={`/campanas/segmentos/${s.id}/revision`} className="cad-item">
              <span className="cad-item-nombre">{s.nombre}</span>
              {s.descripcionNatural && <span className="cad-item-meta">{s.descripcionNatural}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
