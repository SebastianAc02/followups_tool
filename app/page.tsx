import Link from 'next/link';
import { resumenHome, contarPorEstado, listarCampanas } from './db/repository';
import { cargarPerfil } from './lib/perfil';
import { AppShell } from './ui/shell/AppShell';
import { SectionLabel } from './ui/SectionLabel';
import { StatCard } from './ui/home/StatCard';
import { PipelineBar } from './ui/home/PipelineBar';
import { CampaignRow, type CampaignVM } from './ui/home/CampaignRow';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function saludo(d: Date, primerNombre: string) {
  return `Buen ${DIAS[d.getDay()]}, ${primerNombre}`;
}

export default async function Dashboard() {
  const perfil = await cargarPerfil();
  const owner = perfil.nombre;

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
      <div className="mb-8">
        <h2 className="font-heading text-2xl tracking-tight text-ink md:text-3xl">{saludo(ahora, perfil.primerNombre)}</h2>
        <p className="mt-1 text-sm text-muted">Esto es lo que pide tu atención hoy.</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel className="mb-0">Campañas activas</SectionLabel>
        <Link href="/campanas" className="text-xs font-semibold text-accent-soft transition-colors hover:text-accent">
          Abrir módulo →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-line-card bg-card">
        {campanas.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">Sin campañas todavía.</div>
        ) : (
          campanas.map((c, i) => <CampaignRow key={c.id} c={c} primero={i === 0} />)
        )}
      </div>
    </AppShell>
  );
}
