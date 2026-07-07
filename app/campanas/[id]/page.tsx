import { notFound } from 'next/navigation';
import { campanaResumen, metricasHub } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { AppShell } from '../../ui/shell/AppShell';
import { Pill } from '../../ui/Pill';
import { Stat } from '../../ui/Stat';
import { CampanaSubNav } from './CampanaSubNav';

const ESTADO_TONE = {
  activa: 'hot',
  pausada: 'warm',
  borrador: 'cold',
  finalizada: 'cold',
} as const;

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  borrador: 'Borrador',
  finalizada: 'Finalizada',
};

// Task 10.1 (Fase 10): Resumen del panel de control de una campana. Estado, metricas
// filtradas por ESTA campana (metricasHub(idCampana), extension aditiva del Task 1.1)
// y errores recientes. sync_cambios (schema.ts:81-90) no tiene ninguna columna que
// relacione una fila con una campana -- entidad/idRegistro son genericos de sync
// DB->Notion, no de campanas. Inventar esa relacion seria data no respaldada por el
// schema, asi que esta vista muestra un placeholder en vez de una consulta falsa.
export default async function CampanaResumenPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaResumen(idCampana);
  if (!camp) notFound();

  const metricas = metricasHub(idCampana);
  const tasaPct = Math.round(metricas.tasaRespuesta * 100);
  const tone = ESTADO_TONE[camp.estado as keyof typeof ESTADO_TONE] ?? 'cold';
  const label = ESTADO_LABEL[camp.estado] ?? camp.estado;

  const items = [
    { href: `/campanas/${idCampana}`, label: 'Resumen' },
    { href: `/cadencias/${camp.idCadencia}`, label: 'Cadencia' },
    { href: `/campanas/${idCampana}/reglas`, label: 'Reglas' },
    { href: `/campanas/${idCampana}/destinatarios`, label: 'Destinatarios' },
    { href: `/campanas/${idCampana}/lanzar`, label: 'Lanzar' },
  ];

  return (
    <AppShell>
      <CampanaSubNav items={items} />

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="mb-2 font-serif text-3xl leading-tight tracking-tight text-ink">{camp.nombre}</h2>
          <p className="text-sm text-muted">
            {camp.cadencia} · {camp.segmento}
          </p>
        </div>
        <Pill tone={tone} dot>
          {label}
        </Pill>
      </div>

      <div className="mb-8 flex gap-8 rounded-2xl border border-line bg-card p-5">
        <Stat value={metricas.toquesSemana.toLocaleString('es-CO')} label="toques esta semana" />
        <Stat value={`${tasaPct}%`} label="tasa de respuesta" tone="done" />
        <Stat value={metricas.empresasEnSecuencia} label="en secuencia" />
        <Stat
          value={metricas.bloqueadasEsperandoRegla}
          label="bloqueadas"
          tone={metricas.bloqueadasEsperandoRegla > 0 ? 'overdue' : 'neutral'}
        />
      </div>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="mb-3 font-serif text-lg text-ink">Errores e incidentes recientes</h3>
        <p className="text-sm text-muted">
          Sin errores registrados. El log de sincronización (sync_cambios) no guarda una relación
          directa con la campaña todavía, así que esta sección se activa cuando el schema la incluya.
        </p>
      </div>
    </AppShell>
  );
}
