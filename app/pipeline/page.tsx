// Página del Pipeline: vista operativa del funnel global.
// Envuelta por layout.tsx que ya hace requireSession() + AppShell, así que esta página
// solo renderiza el contenido específico del pipeline.
import { requireSession } from '../lib/session';
import { kpisPipeline, pipelineGlobal } from '../db/repository';
import { canalNormalizado } from '../cola/agenda.ts';
import { PipelineShell } from '../ui/pipeline/PipelineShell';
import { KpiRow, type KpiData } from '../ui/pipeline/KpiRow';
import { EtapaGroup, type EtapaGroupData } from '../ui/pipeline/EtapaGroup';
import type { EmpresaRowData } from '../ui/pipeline/EmpresaRow';
import { EmbudoPanel } from '../ui/pipeline/EmbudoPanel';
import { ReportesPanel, type ReporteMockData } from '../ui/pipeline/ReportesPanel';
import { AjustesPanel, type AjustesMockData } from '../ui/pipeline/AjustesPanel';

// Reportes/Ajustes siguen en mock: necesitan la Fase 3 del plan (mas queries de
// reporte + la migracion config_pipeline de la decision D2). Overview ya es real.
const MOCK_REPORTES: ReporteMockData = {
  cuentasPorSecuencia: [
    { secuencia: 'Día 0', total: 41, porcentaje: 100 },
    { secuencia: 'Día 1', total: 38, porcentaje: 93 },
    { secuencia: 'Día 3', total: 27, porcentaje: 66 },
    { secuencia: 'Día 7', total: 54, porcentaje: 132 },
  ],
  mezclaCanales: [
    { canal: 'Llamada', total: 128, porcentaje: 45 },
    { canal: 'WhatsApp', total: 102, porcentaje: 36 },
    { canal: 'Correo', total: 54, porcentaje: 19 },
  ],
  tasaHold: {
    actual: 12,
    promedio7d: 14,
  },
  finalizadasVsOptOut: {
    finalizadas: 156,
    optOut: 43,
  },
};

const MOCK_AJUSTES: AjustesMockData = {
  pausaFestivos: true,
  pausaFinDeSemana: false,
  pausaRespuestaNegativa: true,
  persistenciaFiltros: true,
  notificacionesToques: false,
};

async function PipelineContent({
  tab,
  searchParams,
}: {
  tab?: string;
  searchParams: { owner?: string; campana?: string };
}) {
  if (tab === 'embudo') {
    return <EmbudoPanel searchParams={searchParams} />;
  }
  if (tab === 'reportes') {
    return <ReportesPanel data={MOCK_REPORTES} />;
  }
  if (tab === 'ajustes') {
    return <AjustesPanel initialData={MOCK_AJUSTES} />;
  }

  const usuario = await requireSession();
  const hoy = new Date().toISOString().slice(0, 10);

  const kpisRaw = kpisPipeline(usuario.idOrganizacion, hoy);
  const kpis: KpiData = {
    enSecuencia: kpisRaw.enSecuencia,
    entrandoHoy: kpisRaw.entrandoHoy,
    toquesHoy: kpisRaw.toquesHoy,
    onHold: kpisRaw.onHold,
    cerradas: kpisRaw.cerradasOptOut,
  };

  const filas = pipelineGlobal(usuario.idOrganizacion, hoy);

  // Pedido de Sebastián (2026-07-10): el overview agrupa por NUMERO DE TOQUE (el
  // paso 1-indexed de la cadencia), no por día de calendario ni por etapa del funnel
  // (D1 sigue valiendo para el Home, no aca). "Toque uno" es mas claro para el equipo
  // que "día 0" -- un toque no implica una etapa comercial, solo dice cuantos
  // contactos lleva la empresa en el playbook y por que canal le toca el siguiente.
  // pasoActual null (inscripcion sin paso activo, ej. ya se agotaron los pasos) cae
  // en un grupo aparte en vez de perderse.
  const pasos = [...new Set(filas.map((f) => f.pasoActual))].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  const grupos = pasos
    .map((paso) => {
      const empresasPaso = filas.filter((f) => f.pasoActual === paso);
      if (empresasPaso.length === 0) return null;

      const mezclaCanales = { ll: 0, wa: 0, co: 0 };
      let toquesHoy = 0;
      const empresas: EmpresaRowData[] = empresasPaso.map((f) => {
        const canal = canalNormalizado(f.canal);
        if (canal === 'llamada') mezclaCanales.ll += 1;
        else if (canal === 'whatsapp') mezclaCanales.wa += 1;
        else mezclaCanales.co += 1;
        if (f.esHoy) toquesHoy += 1;

        return {
          id: f.idEmpresa,
          nombre: f.empresa,
          contacto: f.contacto ?? 'Sin contacto activo',
          cargo: f.cargo ?? '',
          pasoActual: `Paso ${f.pasoActual}/${f.totalPasos}`,
          diaSecuencia: f.diaSecuencia ?? 0,
          cadencia: f.campana,
          objetivo: f.objetivo,
          canal,
          esHoy: f.esHoy,
        };
      });

      const data: EtapaGroupData = {
        estado: paso === null ? 'sin-toque' : `toque-${paso}`,
        toque: paso ?? undefined,
        label: paso === null ? 'Fuera de secuencia (pasos agotados)' : undefined,
        total: empresasPaso.length,
        mezclaCanales,
        toquesHoy,
      };

      return { data, empresas };
    })
    .filter((g): g is { data: EtapaGroupData; empresas: EmpresaRowData[] } => g !== null);

  return (
    <div className="space-y-6">
      <KpiRow data={kpis} />
      <div className="space-y-2">
        {grupos.map((g, i) => (
          <EtapaGroup key={g.data.estado} data={g.data} empresas={g.empresas} defaultExpanded={i === 0} />
        ))}
        {grupos.length === 0 && <p className="text-sm text-muted px-2">No hay inscripciones activas todavía.</p>}
      </div>
    </div>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; owner?: string; campana?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab || 'overview';

  return (
    <PipelineShell>
      <PipelineContent tab={tab} searchParams={{ owner: sp.owner, campana: sp.campana }} />
    </PipelineShell>
  );
}
