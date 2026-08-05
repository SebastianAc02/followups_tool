// Capa de datos de Pantalla 2 (Seguimiento), paso 6 de la propuesta de tandas.
//
// El agrupamiento por tanda y el orden por días en el estado YA salen resueltos de tandasTool
// (app/mcp/tools.ts): la prioridad de columnas es TANDAS y cada columna ya viene ordenada de más
// viejo a más nuevo. Nada de eso se reimplementa ni se reordena acá -- ver la nota junto a
// diasEnEstado en app/core/tandas.ts sobre por qué ese cálculo vive una sola vez, no en cada
// pantalla que lo muestra.
//
// Lo que SÍ es lógica nueva de esta pantalla son las dos respuestas explícitas que la vieja
// ("Toque uno, Toque dos, Aún no entran, Sin cadencia") no daba: quién se está enfriando de
// verdad, cruzando TODAS las tandas por días en el estado en vez de dejarlo implícito en el
// orden de una sola columna; y cuánta deuda propia hay acumulada en bloqueado_por_tarea, aparte
// y visible, no escondida entre "las que no contestan".
import { tandasTool } from "../mcp/tools";

export type TandasDelDia = ReturnType<typeof tandasTool>;
export type GrupoTanda = TandasDelDia["tandas"][number];
export type CuentaTanda = GrupoTanda["cuentas"][number];

export function cargarTandasDelDia(idOrganizacion: number, owner: string | undefined): TandasDelDia {
  return tandasTool({ idOrganizacion, owner });
}

// La tanda de deuda propia, aparte: null si hoy no hay ninguna (no se pinta un callout vacío).
export function deudaDelOperador(datos: TandasDelDia): GrupoTanda | null {
  return datos.tandas.find((g) => g.tanda === "bloqueado_por_tarea" && g.total > 0) ?? null;
}

// Las N cuentas más viejas en su estado, cruzando TODAS las tandas (no solo la de arriba de cada
// columna): responde "quién se está enfriando" de verdad, no solo "quién está primero en su
// columna". 'esperar' queda afuera -- ya se tocó hoy o el canal está muerto, eso es una pausa,
// no un enfriamiento. Los null (tiempo desconocido) nunca entran: no se puede decir que algo se
// enfría si no se sabe desde cuándo está quieto (ver el comentario de diasEnEstado en
// core/tandas.ts -- null es tiempo DESCONOCIDO, no cero).
export function masViejasEnEstado(datos: TandasDelDia, n = 5): CuentaTanda[] {
  const todas = datos.tandas.filter((g) => g.tanda !== "esperar").flatMap((g) => g.cuentas);
  return todas
    .filter((c): c is CuentaTanda & { diasEnEstado: number } => c.diasEnEstado != null)
    .sort((a, b) => b.diasEnEstado - a.diasEnEstado)
    .slice(0, n);
}
