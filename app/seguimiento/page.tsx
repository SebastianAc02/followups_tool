// Página de Seguimiento: vista operativa por tanda (rediseño de tandas, paso 6, 2026-08-04).
// El embudo por etapa comercial vive aparte, en /pipeline (lente distinto, no un tab de aca).
// Envuelta por layout.tsx que ya hace requireSession() + AppShell, así que esta página
// solo renderiza el contenido específico de seguimiento.
//
// Por qué se rehizo: agrupar por "Toque uno, Toque dos, Aún no entran, Sin cadencia" solo tenía
// sentido con una cadencia única para todos, y la prueba de que no aplicaba era "Sin cadencia:
// 15" -- quince cuentas que la vista no sabía dónde poner. Ahora cada cuenta cae en EXACTAMENTE
// una tanda (mismo cálculo que Toques y el MCP, tandasTool), y la columna responde dos preguntas
// que la vista vieja no contestaba: quién se está enfriando y qué está esperando del operador.
import { requireSession } from '../lib/session';
import { hoy as hoyDemo } from '../lib/reloj';
import { kpisPipeline } from '../db/repository';
import { SeguimientoShell } from '../ui/seguimiento/SeguimientoShell';
import { KpiRow, type KpiData } from '../ui/seguimiento/KpiRow';
import { TandaColumna } from '../ui/seguimiento/TandaColumna';
import { EnfriandoseCallout } from '../ui/seguimiento/EnfriandoseCallout';
import { DeudaOperadorCallout } from '../ui/seguimiento/DeudaOperadorCallout';
import { ContadoresTandas } from '../ui/ContadoresTandas';
import { cargarTandasDelDia, deudaDelOperador, masViejasEnEstado } from './tandas-datos.ts';
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
  const hoy = hoyDemo();
  const owner = usuario.verTodoPipeline ? undefined : usuario.owner;

  const kpisRaw = kpisPipeline(usuario.idOrganizacion, hoy, owner);
  const kpis: KpiData = {
    enSecuencia: kpisRaw.enSecuencia,
    entrandoHoy: kpisRaw.entrandoHoy,
    toquesHoy: kpisRaw.toquesHoy,
    onHold: kpisRaw.onHold,
    cerradas: kpisRaw.cerradasOptOut,
  };

  // El MISMO cálculo que usa Toques y el MCP (tandasTool): nadie mueve nada a mano. Cada cuenta
  // cae en EXACTAMENTE una tanda, en el orden de prioridad de TANDAS -- 'fuera' ya viene omitida.
  const datosTandas = cargarTandasDelDia(usuario.idOrganizacion, owner);

  return (
    <div className="space-y-6">
      <KpiRow data={kpis} />
      <ContadoresTandas sinVerificarAliado={datosTandas.sinVerificarAliado} sinTamanoConfirmado={datosTandas.sinTamanoConfirmado} />
      <div>
        <EnfriandoseCallout cuentas={masViejasEnEstado(datosTandas)} />
        <DeudaOperadorCallout grupo={deudaDelOperador(datosTandas)} />
      </div>
      <div className="space-y-2">
        {datosTandas.tandas.map((g, i) => (
          <TandaColumna key={g.tanda} grupo={g} defaultExpanded={i === 0} />
        ))}
        {datosTandas.tandas.length === 0 && <p className="px-2 text-sm text-muted">Sin cuentas en pipeline.</p>}
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
