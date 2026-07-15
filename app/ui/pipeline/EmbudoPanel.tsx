// Contenedor del tab Embudo: trae los conteos reales del Repository y arma el
// embudo (dominio puro) antes de pintarlo. Los filtros (owner, campana) llegan por
// searchParams -- page.tsx ya los tiene del tab de arriba, aca solo se leen dos keys
// mas (?owner=...&campana=...).
import { requireSession } from '../../lib/session';
import { embudoPipeline, listarOwnersEmpresa, listarCampanas } from '../../db/repository';
import { construirEmbudo } from '../../core/embudo';
import { FunnelCanvas } from './FunnelCanvas';
import { EmbudoFiltros } from './EmbudoFiltros';

export async function EmbudoPanel({ searchParams }: { searchParams?: { owner?: string; campana?: string } }) {
  const usuario = await requireSession();
  const owner = searchParams?.owner;
  const idCampana = searchParams?.campana;

  const conteos = embudoPipeline(usuario.idOrganizacion, { owner, idCampana });
  const embudo = construirEmbudo(conteos);

  const owners = listarOwnersEmpresa(usuario.idOrganizacion);
  const campanas = listarCampanas(usuario.idOrganizacion).map((c) => ({ id: c.id, nombre: c.nombre }));

  return (
    <div>
      <EmbudoFiltros owners={owners} campanas={campanas} />
      <FunnelCanvas embudo={embudo} owner={owner} campana={idCampana} />
    </div>
  );
}
