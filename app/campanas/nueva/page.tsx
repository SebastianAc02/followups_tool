import Link from 'next/link';
import { listarSegmentos } from '../../db/repository';
import { requireSession } from '../../lib/session';
import CrearCampana from './CrearCampana';

// Parte 3 campanas: crear una campana = elegir un segmento YA revisado (Parte 2) +
// subir el markdown/CSV de la cadencia. El parser corre en el server via action;
// esta pagina solo precarga la lista de segmentos para el selector.
export default async function NuevaCampana() {
  await requireSession();
  const segmentos = listarSegmentos();

  return (
    <div className="wrap">
      <Link href="/campanas/segmentos" className="back">
        ← Segmentos
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Nueva campaña
      </div>
      <p className="conector-desc">
        Elige el segmento ya revisado, sube la cadencia (Markdown o CSV) y confirma para inscribir.
      </p>

      {segmentos.length === 0 ? (
        <p className="conector-desc">
          Todavía no hay segmentos guardados. <Link href="/campanas/segmentos">Arma uno primero</Link>.
        </p>
      ) : (
        <CrearCampana segmentos={segmentos} />
      )}
    </div>
  );
}
