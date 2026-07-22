// Toques antes de cerrar (widget borderline del cockpit, resuelto 2026-07-22): cuantos
// toques tuvo una empresa ANTES de la fecha en que llego a 'firma_pago'. Puro: recibe
// fechas ya leidas por el Repository (mismo principio que calcularCicloVenta en
// app/core/tiempoEnEtapa.ts -- nunca Date.now() ni acceso a DB aca adentro).
//
// Decision (ver DataSourceKey.toquesAntesDeCerrarPromedio en widgets.ts): firma_pago es
// la UNICA señal de "cerrado" que existe hoy en produccion (la misma que ya usa
// calcularCicloVenta/cicloVentaPromedio para la metrica 2 del CRO). No hay señal de
// "perdido": ningun toque.resultado tiene un valor tipo 'perdido' y toque.razon_perdida
// esta sin poblar en toda la DB real (verificado contra isps.db, 0 de 251 filas). Por eso
// esta funcion mide solo el lado de "gano" -- el titulo del widget y este comentario lo
// dejan explicito, no se inventa la mitad que falta.
export function contarToquesAntesDeFecha(fechasToque: readonly string[], fechaCierre: string): number {
  return fechasToque.filter((f) => f < fechaCierre).length;
}
