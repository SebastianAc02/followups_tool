'use server';

import { requireSession } from '../lib/session';
import { empresasDeEtapa, type EmpresaEnEtapa } from '../db/repository';

// Lista de empresas de una etapa del embudo, para el panel que se abre al clickear
// una banda o tarjeta de resultado. Scoped a la organizacion de quien pregunta, mismo
// patron que el resto de las server actions del cockpit.
export async function empresasDeEtapaAction(
  estado: string,
  owner?: string,
  idCampana?: string,
): Promise<EmpresaEnEtapa[]> {
  const usuario = await requireSession();
  return empresasDeEtapa(estado, usuario.idOrganizacion, { owner, idCampana });
}
