import Link from 'next/link';
import { listarSegmentos, valoresDistintosCampo } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { NuevaCampanaFlujo } from './NuevaCampanaFlujo';

// Parte 3 campanas: crear una campana = elegir un segmento YA revisado (Parte 2) +
// subir el markdown/CSV de la cadencia. El parser corre en el server via action;
// esta pagina solo precarga la lista de segmentos para el selector.
// Fase C (cockpit de campañas): ademas precarga las opciones del wall (mismo patron
// que /campanas/segmentos) para poder armar un segmento nuevo sin salir de esta pantalla.
export default async function NuevaCampana() {
  await requireSession();
  const segmentos = listarSegmentos();
  const opciones = {
    estado: valoresDistintosCampo('estado'),
    categoria: valoresDistintosCampo('categoria'),
    estado_comercial: valoresDistintosCampo('estado_comercial'),
    ciudad: valoresDistintosCampo('ciudad'),
    departamento: valoresDistintosCampo('departamento'),
    owner: valoresDistintosCampo('owner'),
    rol: valoresDistintosCampo('rol'),
  };

  return (
    <div className="wrap">
      <Link href="/campanas/segmentos" className="back">
        ← Segmentos
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Nueva campaña
      </div>
      <p className="conector-desc" style={{ marginBottom: 24 }}>
        Elige el segmento ya revisado o arma uno nuevo, sube la cadencia (Markdown o CSV) y confirma para inscribir.
      </p>

      <NuevaCampanaFlujo segmentosIniciales={segmentos} opciones={opciones} />
    </div>
  );
}
