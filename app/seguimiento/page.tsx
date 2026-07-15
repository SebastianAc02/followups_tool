// Página de Seguimiento: vista operativa por toque (numero de contacto en la cadencia).
// El embudo por etapa comercial vive aparte, en /pipeline (lente distinto, no un tab de aca).
// Envuelta por layout.tsx que ya hace requireSession() + AppShell, así que esta página
// solo renderiza el contenido específico de seguimiento.
import { requireSession } from '../lib/session';
import { kpisPipeline, pipelineGlobal, pipelineSinCadencia, empresasConRespuestaPendiente } from '../db/repository';
import { canalNormalizado } from '../cola/agenda.ts';
import { SeguimientoShell } from '../ui/seguimiento/SeguimientoShell';
import { KpiRow, type KpiData } from '../ui/seguimiento/KpiRow';
import { EtapaGroup, type EtapaGroupData } from '../ui/seguimiento/EtapaGroup';
import type { EmpresaRowData } from '../ui/seguimiento/EmpresaRow';
import { ReportesPanel, type ReporteMockData } from '../ui/seguimiento/ReportesPanel';
import { AjustesPanel, type AjustesMockData } from '../ui/seguimiento/AjustesPanel';

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

async function SeguimientoContent({ tab }: { tab?: string }) {
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

  // Franja "Sin cadencia" (2026-07-14): los toques manuales pendientes que no estan en
  // ninguna cadencia activa. Van en su propia franja al final, separados de los "Toque N"
  // cadenceados, para que Seguimiento muestre todo lo pendiente y no solo lo del motor.
  // Franja "Respondieron" (2026-07-14): empresas con una respuesta sin ver. Separada de
  // los grupos "Toque N" a propósito -- pipelineGlobal solo trae inscripcion.estado =
  // 'activa', y una empresa recién pausada por respuesta cae fuera de esos grupos. No se
  // toca pipelineGlobal: una respuesta es "bandeja de revisión pendiente", no "progreso
  // de cadencia", son conceptos distintos aunque ambos vivan en /seguimiento.
  const respondieron = empresasConRespuestaPendiente(usuario.idOrganizacion);
  const grupoRespondieron = (() => {
    if (respondieron.length === 0) return null;
    const empresas: EmpresaRowData[] = respondieron.map((f) => ({
      id: f.idEmpresa,
      nombre: f.empresa,
      contacto: f.contacto ?? 'Sin contacto activo',
      cargo: f.cargo ?? '',
      pasoActual: 'Respondió',
      diaSecuencia: 0,
      cadencia: 'Nueva respuesta',
      objetivo: null,
      canal: canalNormalizado(f.canal),
      respondio: true,
    }));

    const data: EtapaGroupData = {
      estado: 'respondieron',
      label: 'Respondieron',
      total: respondieron.length,
    };

    return { data, empresas };
  })();

  const filasSinCadencia = pipelineSinCadencia(usuario.idOrganizacion, hoy);
  const grupoSinCadencia = (() => {
    if (filasSinCadencia.length === 0) return null;
    const mezclaCanales = { ll: 0, wa: 0, co: 0 };
    let toquesHoy = 0;
    const empresas: EmpresaRowData[] = filasSinCadencia.map((f) => {
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
        pasoActual: 'Toque manual',
        diaSecuencia: 0,
        cadencia: 'Sin cadencia',
        objetivo: null,
        canal,
        esHoy: f.esHoy,
      };
    });

    const data: EtapaGroupData = {
      estado: 'sin-cadencia',
      label: 'Sin cadencia',
      total: filasSinCadencia.length,
      mezclaCanales,
      toquesHoy,
    };

    return { data, empresas };
  })();

  const todosLosGrupos = [
    ...(grupoRespondieron ? [grupoRespondieron] : []),
    ...grupos,
    ...(grupoSinCadencia ? [grupoSinCadencia] : []),
  ];

  return (
    <div className="space-y-6">
      <KpiRow data={kpis} />
      <div className="space-y-2">
        {todosLosGrupos.map((g, i) => (
          <EtapaGroup key={g.data.estado} data={g.data} empresas={g.empresas} defaultExpanded={i === 0} />
        ))}
        {todosLosGrupos.length === 0 && (
          <p className="text-sm text-muted px-2">No hay inscripciones activas ni toques manuales pendientes.</p>
        )}
      </div>
    </div>
  );
}

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab || 'overview';

  return (
    <SeguimientoShell>
      <SeguimientoContent tab={tab} />
    </SeguimientoShell>
  );
}
