import type { ReporteCompleto, ReporteEquipo, Tasa } from '../core/reporte-dia';

// Las dos vistas del reporte. Cada una recibe SU tipo, no un reporte completo con un flag: asi el
// compilador impide que la vista de equipo lea un campo que no le corresponde, en vez de depender de
// que quien la escriba se acuerde.

// null NO se pinta como cero. Cero por ciento de no-show con cero reuniones diria que el dia salio
// perfecto, cuando lo que pasa es que no hubo reuniones. Es la misma regla que sostiene todo este
// sistema: la ausencia de dato no se lee como dato.
function Pct({ valor }: { valor: Tasa }) {
  if (valor === null) return <span className="font-body text-sm text-muted-foreground/60">sin datos</span>;
  return <span className="font-mono text-2xl font-semibold text-foreground">{Math.round(valor * 1000) / 10}%</span>;
}

function Num({ valor, sufijo }: { valor: number | null; sufijo?: string }) {
  if (valor === null) return <span className="font-body text-sm text-muted-foreground/60">sin datos</span>;
  return (
    <span className="font-mono text-2xl font-semibold text-foreground">
      {valor}
      {sufijo ? <span className="ml-1 font-body text-sm font-normal text-muted-foreground">{sufijo}</span> : null}
    </span>
  );
}

function Tarjeta({ titulo, children, pie }: { titulo: string; children: React.ReactNode; pie?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4">
      <span className="font-body text-xs uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {children}
      {pie ? <span className="font-body text-xs text-muted-foreground">{pie}</span> : null}
    </div>
  );
}

function Barras({ datos }: { datos: Record<string, number> }) {
  const entradas = Object.entries(datos);
  const max = Math.max(1, ...entradas.map(([, v]) => v));
  return (
    <div className="flex flex-col gap-2">
      {entradas.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate font-body text-xs text-muted-foreground">{k}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-xs text-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function ReporteCompletoVista({ reporte: r }: { reporte: ReporteCompleto }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Arriba lo que decide el dia. El volumen no es el titular: un dia de 25 llamadas sin reunion
          no vale mas que uno de 5 con dos reuniones. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Reuniones conseguidas">
          <Num valor={r.conversion.reunionesConseguidas} />
        </Tarjeta>
        <Tarjeta titulo="Llamadas por reunión" pie={`sobre ${r.conversion.llamadas} llamadas`}>
          <Num valor={r.conversion.llamadasPorReunion === null ? null : Math.round(r.conversion.llamadasPorReunion * 10) / 10} />
        </Tarjeta>
        <Tarjeta titulo="Connect rate" pie={`${r.llamadas.sinCalificar} llamadas sin calificar, fuera del cálculo`}>
          <Pct valor={r.llamadas.connectRate} />
        </Tarjeta>
        <Tarjeta titulo="No-show rate" pie={`${r.reuniones.propuestas} reuniones propuestas`}>
          <Pct valor={r.reuniones.noShowRate} />
        </Tarjeta>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Toques ejecutados" pie={`${r.actividad.entrantesWhatsapp.mensajes} entrantes, aparte`}>
          <Num valor={r.actividad.toquesEjecutados} />
        </Tarjeta>
        <Tarjeta titulo="Planeados y no salieron" pie={`de ${r.plan.planeados} planeados`}>
          <Num valor={r.plan.noSalieron} />
        </Tarjeta>
        <Tarjeta titulo="Llamadas a cuentas nuevas" pie={`${r.cuentas.aCuentasConHistoria} a cuentas con historia`}>
          <Num valor={r.cuentas.aCuentasNuevas} />
        </Tarjeta>
        <Tarjeta titulo="Toques sin tipo" pie={`${r.mixPorTipo.conTipo} con tipo`}>
          <Num valor={r.mixPorTipo.sinTipo} />
        </Tarjeta>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="mb-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Llamadas</h2>
          <Barras
            datos={{ Conectadas: r.llamadas.conectadas, 'No conectaron': r.llamadas.noConectadas, 'Sin calificar': r.llamadas.sinCalificar }}
          />
        </div>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="mb-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Reuniones</h2>
          <Barras
            datos={{ Propuestas: r.reuniones.propuestas, Ocurridas: r.reuniones.ocurridas, 'No-show': r.reuniones.noShow, 'Sin desenlace': r.reuniones.sinDesenlace }}
          />
        </div>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="mb-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Por dónde salió</h2>
          <Barras datos={{ Texto: r.actividad.porGrupoCanal.texto, Llamada: r.actividad.porGrupoCanal.llamada, Reunión: r.actividad.porGrupoCanal.reunion }} />
        </div>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="mb-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Texto: crudo contra deduplicado</h2>
          <Barras datos={{ Crudo: r.texto.crudos, 'Por día': r.texto.porDia, 'Por conversación': r.texto.porConversacion }} />
        </div>
      </div>
    </div>
  );
}

// Lo unico que ve alguien que no es el dueño de la data. No es el reporte completo con campos
// escondidos: es otro objeto, construido en el servidor, y el tipo lo hace cumplir.
export function ReporteEquipoVista({ reporte: r }: { reporte: ReporteEquipo }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Toques ejecutados">
          <Num valor={r.actividad.toquesEjecutados} />
        </Tarjeta>
        <Tarjeta titulo="Reuniones conseguidas">
          <Num valor={r.conversion.reunionesConseguidas} />
        </Tarjeta>
        <Tarjeta titulo="Llamadas por reunión" pie={`sobre ${r.conversion.llamadas} llamadas`}>
          <Num valor={r.conversion.llamadasPorReunion === null ? null : Math.round(r.conversion.llamadasPorReunion * 10) / 10} />
        </Tarjeta>
        <Tarjeta titulo="Connect rate">
          <Pct valor={r.tasas.connectRate} />
        </Tarjeta>
      </div>
      <p className="font-body text-xs text-muted-foreground">
        Vista de equipo: actividad, conversión a reunión y tasas. El detalle completo lo ve el dueño de la cartera.
      </p>
    </div>
  );
}
