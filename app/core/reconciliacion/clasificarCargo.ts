// Core puro (hexagonal): clasifica el texto libre de "Cargo" (Contacto Principal
// y Buying Comittee del export Notion, T11) en cargo_categoria de `contacto`.
// Matching por keyword, orden explicito de mas-especifico a menos-especifico
// (p. ej. "subgerente" antes que "gerente"/"comercial", que tambien matchearian
// "Subgerente Comercial"). No es scoring, es la primera regla que aplique.
// Lista en RUNTIME y no solo union de tipos, por la misma razon que ESTADOS_NOTION
// (mapeoEstados.ts): quien reciba un rol de afuera -- el MCP arma segmentos con JSON
// libre -- tiene que poder validarlo antes de consultar, y un union se borra al compilar.
// Verificada contra produccion el 2026-07-28: los 402 contactos con cargo_categoria
// caen todos en estos 10 valores, sin residuo de cargas viejas.
export const CARGO_CATEGORIAS = [
  'dueno',
  'gerente',
  'rep_legal',
  'tecnico',
  'financiero',
  'operativo',
  'comercial',
  'rep_legal_suplente',
  'subgerente',
  'desconocido',
] as const;

export type CargoCategoria = (typeof CARGO_CATEGORIAS)[number];

const REGLAS: { categoria: CargoCategoria; keywords: string[] }[] = [
  { categoria: 'dueno', keywords: ['dueño', 'dueno', 'ceo', 'propietario', 'fundador'] },
  { categoria: 'rep_legal_suplente', keywords: ['representante legal suplente', 'rep legal suplente'] },
  { categoria: 'rep_legal', keywords: ['representante legal', 'rep legal', 'legal'] },
  { categoria: 'subgerente', keywords: ['subgerente'] },
  { categoria: 'gerente', keywords: ['gerente'] },
  { categoria: 'financiero', keywords: ['cartera', 'recaudo', 'cobro', 'financiero', 'contab'] },
  { categoria: 'comercial', keywords: ['comercial', 'ventas'] },
  { categoria: 'tecnico', keywords: ['técnico', 'tecnico', 'soporte', 'nap', 'red', 'sistemas'] },
  { categoria: 'operativo', keywords: ['operativo', 'operaciones'] },
];

export function clasificarCargo(cargo: string): CargoCategoria {
  const texto = cargo.trim().toLowerCase();
  if (texto === '') return 'desconocido';

  for (const regla of REGLAS) {
    if (regla.keywords.some((kw) => texto.includes(kw))) return regla.categoria;
  }
  return 'desconocido';
}
