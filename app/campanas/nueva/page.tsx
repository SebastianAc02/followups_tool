import { listarSegmentos, valoresDistintosCampo } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { AppShell } from '../../ui/shell/AppShell';
import { NuevaCampanaFlujo } from './NuevaCampanaFlujo';

// Parte 3 campanas: crear una campana = elegir un segmento YA revisado (Parte 2) +
// subir el markdown/CSV de la cadencia. El parser corre en el server via action;
// esta pagina solo precarga la lista de segmentos para el selector.
// Fase C (cockpit de campañas): ademas precarga las opciones del wall (mismo patron
// que /campanas/segmentos) para poder armar un segmento nuevo sin salir de esta pantalla.
export default async function NuevaCampana() {
  const sesion = await requireSession();
  const segmentos = listarSegmentos(sesion.idOrganizacion);
  const opciones = {
    estado: valoresDistintosCampo('estado', sesion.idOrganizacion),
    categoria: valoresDistintosCampo('categoria', sesion.idOrganizacion),
    estado_comercial: valoresDistintosCampo('estado_comercial', sesion.idOrganizacion),
    ciudad: valoresDistintosCampo('ciudad', sesion.idOrganizacion),
    departamento: valoresDistintosCampo('departamento', sesion.idOrganizacion),
    owner: valoresDistintosCampo('owner', sesion.idOrganizacion),
    rol: valoresDistintosCampo('rol', sesion.idOrganizacion),
  };

  return (
    <AppShell>
      <NuevaCampanaFlujo segmentosIniciales={segmentos} opciones={opciones} />
    </AppShell>
  );
}
