// Unico punto de composicion del perfil: sesion + adapter de preferencias -> Perfil.
// Gemelo de datosSidebar() en app/ui/shell/AppShell.tsx. Fase 2: preferencia_usuario ya
// existe, PreferenciasDbAdapter reemplaza al adapter de defaults de Fase 1 -- unico
// import que cambio, construirPerfil() y todos los consumidores de Perfil siguen igual.
import { requireSession } from './session';
import { construirPerfil, type Perfil } from '../core/perfil';
import { PreferenciasDbAdapter } from '../adapters/preferencias-db';

const preferenciasAdapter = new PreferenciasDbAdapter();

export async function cargarPerfil(): Promise<Perfil> {
  const identidad = await requireSession();
  const preferencias = await preferenciasAdapter.leer(identidad.id);
  return construirPerfil(identidad, preferencias);
}

export { preferenciasAdapter };
