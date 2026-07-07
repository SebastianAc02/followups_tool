import Link from 'next/link';
import { resumenHome, contarPorEstado, listarCampanas } from './db/repository';
import { requireSession } from './lib/session';
import { AppShell } from './ui/shell/AppShell';
import { SectionLabel } from './ui/SectionLabel';
import { StatCard } from './ui/home/StatCard';
import { PipelineBar } from './ui/home/PipelineBar';
import { CampaignRow, type CampaignVM } from './ui/home/CampaignRow';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function saludo(d: Date, nombre: string) {
  const primerNombre = nombre.trim().split(/\s+/)[0] || nombre;
  return `Buen ${DIAS[d.getDay()]}, ${primerNombre}`;
}

export default async function Dashboard() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);

  const resumen = resumenHome(owner, hoy);
  const porEstado = contarPorEstado();
  const campanas: CampaignVM[] = listarCampanas()
    .filter((c) => c.estado === 'activa' || c.estado === 'pausada')
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      inscritas: c.inscritas ?? 0,
      objetivo: (c.inscritas ?? 0) + (c.bloqueadas ?? 0),
    }));

  return (
    <AppShell>
      <div className="mb-[26px]">
        <div className="text-[24px] font-bold tracking-[-0.01em] text-ink">{saludo(ahora, owner)}</div>
        <div className="mt-[3px] text-[13.5px] text-muted">Esto es lo que pide tu atención hoy.</div>
      </div>

      {/* Stats */}
      <div className="mb-[34px] grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <StatCard label="Toques para hoy" valor={resumen.toquesHoy} sub={`${resumen.toquesHoy} en cola`} />
        <StatCard
          label="Vencidos"
          valor={resumen.vencidos}
          sub={resumen.vencidos > 0 ? 'Requieren acción' : 'Al día'}
          tone="overdue"
          subTone="overdue"
        />
        <StatCard label="Deals calientes" valor={resumen.dealsCalientes} sub="Cerca del cierre" tone="accent" />
        <StatCard label="Cuentas activas" valor={resumen.cuentasActivas} sub="En el funnel" tone="neutral" />
      </div>

      {/* Pipeline */}
      <PipelineBar porEstado={porEstado} />

      {/* Campañas */}
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel className="mb-0">Campañas activas</SectionLabel>
        <Link href="/campanas" className="text-[12.5px] font-semibold text-accent-soft">
          Abrir módulo →
        </Link>
      </div>
      <div className="overflow-hidden rounded-[15px] border border-line-card bg-card">
        {campanas.length === 0 ? (
          <div className="px-5 py-[15px] text-[13px] text-muted">Sin campañas todavía.</div>
        ) : (
          campanas.map((c, i) => <CampaignRow key={c.id} c={c} primero={i === 0} />)
        )}
      </div>
    </AppShell>
  );
}
