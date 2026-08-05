// Renderer por tipo (kpi/tendencia/barras/histograma/lista). Recibe el widget del
// catalogo + su metrica ya resuelta.
//
// Rediseno (2026-08-05, pedido de Sebastian: "el dashboard se ve algo raro y feo"). Dos
// decisiones de fondo, ver justificacion larga junto a cada una:
//   1) jerarquia por TIPO, no por posicion. kpi/tendencia son la cifra que domina (numero
//      grande); barras es contenido de acompanamiento (fila chica). No se reordena nada
//      -- Cockpit.tsx ya dejo escrito por que (decision de Sebastian 2026-07-22: el orden
//      del tablero es sagrado, regruparlo por categoria fue el bug que se corrigio esa
//      vez). La jerarquia sale de tamano/peso tipografico en el lugar donde ya esta cada
//      tarjeta, nunca de moverla.
//   2) sin_datos deja de compararse en peso con un numero real. Antes "sin datos" salia en
//      font-mono text-2xl font-bold -- casi el mismo peso que el numero real de al lado
//      (text-4xl font-bold), asi que un vistazo rapido no distinguia "no hay dato" de "el
//      dato es chico". Ahora el marco de la tarjeta cambia (borde punteado, fondo apagado)
//      y el contenido cae a un glifo chico sin negrita: la ausencia de dato tiene que
//      leerse como ausencia, no como un numero mas (CLAUDE.md regla del sistema completo).
import type { Widget as WidgetDef } from '../../core/panel/widgets';
import type { MetricaValor } from '../../core/panel/metricas';
import { cx } from '../../ui/cx';

const SPAN_CLASE: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-2 md:col-span-4',
};

function formatoNumero(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('es-CO') : n.toFixed(1);
}

// Marca universal de "esto no es un dato": tres puntos chicos, sin negrita, muy por debajo
// del peso de cualquier numero real -- para que nadie lo confunda con un cero o un valor
// chico en un vistazo rapido. El borde punteado de la tarjeta (mas abajo, en Widget) repite
// la misma idea a nivel de marco, asi el patron "punteado = todavia no existe" se repite en
// toda la pantalla (los chips de filtro de Cockpit.tsx usan el mismo lenguaje).
function Vacio() {
  return (
    <div className="flex flex-1 items-center gap-2.5 py-1">
      <span aria-hidden="true" className="font-mono text-base leading-none tracking-[0.5em] text-muted-foreground/30">
        &middot;&middot;&middot;
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/45">sin datos</span>
    </div>
  );
}

function Cuerpo({ widget, metrica }: { widget: WidgetDef; metrica: MetricaValor }) {
  if (metrica.estado === 'sin_datos') return <Vacio />;

  switch (widget.tipo) {
    case 'kpi':
    case 'tendencia':
      // Cifra que domina: unico salto de tamano real del rediseno (text-4xl -> 4xl/5xl
      // responsivo). El resto de la jerarquia la hace el contraste con barras (filas en
      // text-xs) y con Vacio (glifo chico) -- no hacia falta mas para que el ojo sepa
      // donde caer primero.
      return (
        <div className="font-mono text-4xl font-bold leading-none tracking-tight text-foreground sm:text-5xl">
          {typeof metrica.valor === 'number' ? formatoNumero(metrica.valor) : '—'}
        </div>
      );
    case 'barras': {
      const filas = typeof metrica.valor === 'object' && !Array.isArray(metrica.valor) ? Object.entries(metrica.valor) : [];

      if (filas.length === 0) {
        // Objeto vacio 'ok' (ver metricas.ts: conversionStage/tiempoPromedioPorEtapa
        // pueden calcularse y dar {} de verdad) NO es sin_datos -- la fuente SI respondio,
        // el rango no tuvo movimientos. Mensaje propio, sin el borde punteado de Vacio: ese
        // borde es para "no hay fuente", no para "la fuente dijo cero filas".
        return <div className="py-1 font-mono text-xs text-muted-foreground/50">sin movimientos en el rango</div>;
      }

      const max = Math.max(1, ...filas.map(([, v]) => v));
      return (
        <ul className="flex flex-col gap-2.5">
          {filas.map(([label, valor]) => {
            // La fila con el valor mas alto se pinta en tono pleno; el resto en tono
            // apagado. Es la proporcion la que manda la lectura (pedido explicito: "las
            // barras hoy se pintan pobres"), no un color fijo por categoria -- asi funciona
            // igual sin importar que widget de barras sea o que etiquetas traiga.
            const esTope = max > 0 && valor === max;
            return (
              <li key={label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3">
                <span title={label} className={cx('truncate text-xs', esTope ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {label}
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-border/60">
                  <span
                    className={cx('block h-full rounded-full', esTope ? 'bg-primary' : 'bg-primary/40')}
                    style={{ width: `${Math.max(4, (valor / max) * 100)}%` }}
                  />
                </span>
                <span className={cx('mono min-w-[1.5rem] text-right text-xs', esTope ? 'text-foreground' : 'text-muted-foreground')}>
                  {valor}
                </span>
              </li>
            );
          })}
        </ul>
      );
    }
    case 'histograma':
    case 'lista':
      return (
        <div className="font-mono text-xs text-muted-foreground">
          {Array.isArray(metrica.valor) ? `${metrica.valor.length} filas` : 'sin datos'}
        </div>
      );
    default:
      return null;
  }
}

export function Widget({
  widget,
  metrica,
  span,
  onQuitar,
}: {
  widget: WidgetDef;
  metrica: MetricaValor;
  span?: number;
  onQuitar?: () => void;
}) {
  const vacio = metrica.estado === 'sin_datos';
  // Hero = numero suelto (kpi/tendencia) con dato real. Recibe mas aire (p-6 en vez de
  // p-5): el padding extra es la segunda senal de jerarquia, ademas del tamano de fuente
  // en Cuerpo -- una tarjeta con mas respiracion alrededor de un numero grande se lee como
  // mas importante sin necesitar un color ni un borde especial.
  const hero = !vacio && (widget.tipo === 'kpi' || widget.tipo === 'tendencia');

  return (
    <div
      className={cx(
        SPAN_CLASE[span ?? widget.spanDefault] ?? 'col-span-1',
        'relative flex flex-col gap-2.5 rounded-2xl border bg-card transition-colors',
        hero ? 'p-6' : 'p-5',
        vacio
          ? 'border-dashed border-border/70 bg-card/60'
          : 'border-border hover:border-primary',
      )}
    >
      {onQuitar ? (
        <button
          type="button"
          onClick={onQuitar}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Quitar ${widget.titulo}`}
          className="absolute right-3 top-3 z-10 text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      ) : null}
      <div
        className={cx(
          'min-h-6 font-mono text-xs font-semibold uppercase leading-snug tracking-wide',
          vacio ? 'text-muted-foreground/60' : 'text-muted-foreground',
        )}
      >
        {widget.titulo}
      </div>
      <Cuerpo widget={widget} metrica={metrica} />
    </div>
  );
}
