import Link from 'next/link';
import { resumenHome, contarPorEstado, listarCampanas } from './db/repository';
import { cargarPerfil } from './lib/perfil';
import { hoy as hoyDemo } from './lib/reloj';
import { AppShell } from './ui/shell/AppShell';
import { SectionLabel } from './ui/SectionLabel';
import { StatCard } from './ui/home/StatCard';
import { PipelineBar } from './ui/home/PipelineBar';
import { CampaignRow, type CampaignVM } from './ui/home/CampaignRow';
import { OWNER_COLA_SPLIT } from './cola/agenda.ts';
import { cargarColaDeHoy } from './cola/hoy.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function saludo(d: Date, primerNombre: string) {
  return `Buen ${DIAS[d.getDay()]}, ${primerNombre}`;
}

export default async function Dashboard() {
  const perfil = await cargarPerfil();
  // Visitante (solo lectura): ve el resumen de TODA la organizacion (todos los owners),
  // no una cola propia -- por eso owner undefined.
  // CRO (verTodoPipeline, Fase 3): mismo undefined -- ve el resumen de TODA la
  // organizacion (Felipe + Sebastian), sin ganar soloLectura ni perder su propio owner
  // para otras acciones.
  const owner = perfil.soloLectura || perfil.verTodoPipeline ? undefined : perfil.nombre;

  const ahora = new Date();
  // hoy() y no toISOString(): el dia es el de Bogota, y ademas respeta el reloj de demo igual que /cola.
  const hoy = hoyDemo();

  const resumen = resumenHome(owner, hoy, perfil.idOrganizacion);
  // "Toques para hoy" y "Vencidos" del home cuentan la MISMA lista que abre /cola y que el
  // badge del nav (2026-08-03): una sola composicion, tres superficies. Antes el home sumaba
  // sus propias cuatro fuentes a mano y le faltaba contacto_iniciado con seguimiento, asi que
  // ninguno de los tres numeros coincidia. Vencidos = fecha < hoy sobre esa misma lista.
  if (owner === OWNER_COLA_SPLIT) {
    const { filas } = cargarColaDeHoy(hoy, owner, perfil.idOrganizacion);
    resumen.toquesHoy = filas.length;
    resumen.vencidos = filas.filter((f) => f.fecha != null && f.fecha < hoy).length;
  }
  const porEstado = contarPorEstado(undefined, perfil.idOrganizacion);
  const campanas: CampaignVM[] = listarCampanas(perfil.idOrganizacion)
    .filter((c) => c.estado === 'activa' || c.estado === 'pausada')
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      toquesHechos: c.toquesHechos ?? 0,
      // Techo estimado: cada inscrita activa tiene, como mucho, un toque por paso de
      // la cadencia (algunas rinden menos si algun paso se omite por canal faltante,
      // pero eso ya lo refleja toquesHechos contando 'omitida' como resuelto).
      toquesEsperados: (c.inscritas ?? 0) * (c.pasos ?? 0),
    }));

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{saludo(ahora, perfil.primerNombre)}</h2>
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
