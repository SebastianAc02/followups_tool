// Contenedor del tab Embudo: trae los conteos reales del Repository y arma el
// embudo (dominio puro) antes de pintarlo.
import { requireSession } from '../../lib/session';
import { embudoPipeline } from '../../db/repository';
import { construirEmbudo } from '../../core/embudo';
import { FunnelCanvas } from './FunnelCanvas';

export async function EmbudoPanel() {
  const usuario = await requireSession();
  const conteos = embudoPipeline(usuario.idOrganizacion);
  const embudo = construirEmbudo(conteos);
  return <FunnelCanvas embudo={embudo} />;
}
