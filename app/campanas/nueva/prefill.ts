import type { DefinicionSegmento } from '../../db/validation';

// Prefill del segmento desde searchParams (2026-07-14, boton "Promover a campana" de
// /cola): funcion pura y extraida a proposito para poder probarla sin montar React --
// NuevoSegmento no soportaba prefill por searchParams antes de esto, solo reanudar un
// segmento YA guardado (reanudarDesde, via ?segmento=<id>). Este es un caso distinto:
// arranca una definicion NUEVA, sin id, a partir de un estado (y opcionalmente un owner).
export function prefillSegmentoDesdeQuery(query: { estado?: string; owner?: string }): DefinicionSegmento | undefined {
  if (!query.estado) return undefined;
  const condiciones: DefinicionSegmento['condiciones'] = [{ campo: 'estado', op: 'en', valores: [query.estado] }];
  if (query.owner) condiciones.push({ campo: 'owner', op: 'en', valores: [query.owner] });
  return { condiciones };
}
