// Detector de duplicados de Notion: cruza los fantasmas `ntn-` (empresas sinteticas sin
// NIT real, creadas cuando el matcher no encontro con quien enlazar) contra empresa_alias.
// Solo lectura -- no fusiona ni re-enlaza nada, saca la lista que Sebastian revisa a mano.
//
// Por que cruzar por alias y no por nombre_normalizado: Wicom es el caso que origino este
// script. "servicios profesionales wicom sas" (nombre real) y "wicom" (fantasma) normalizan
// distinto -- un match por nombre exacto no los encuentra. empresa_alias es la tabla de
// dedup por diseno: ahi es donde el matcher deja el rastro de que dos nombres son la misma
// empresa.
//
// Correr: node --experimental-strip-types scripts/detectar-duplicados-notion.ts

import Database from 'better-sqlite3';

const DB_PATH = process.env.ISPS_DB_PATH ?? '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const db = new Database(DB_PATH, { readonly: true });

type Fila = {
  id_empresa: string;
  fantasma: string;
  nombre_oficial: string;
  pag_fantasma: string | null;
  pag_real: string | null;
  cont_real: number;
  tq_real: number;
  forma: 'FORMA_1_misma_pagina' | 'FORMA_2_dos_paginas';
};

const conPagina = db
  .prepare<[], Fila>(
    `SELECT DISTINCT r.id_empresa, f.id_empresa AS fantasma, f.nombre_oficial,
            f.notion_page_id AS pag_fantasma, r.notion_page_id AS pag_real,
            (SELECT COUNT(*) FROM contacto c WHERE c.id_empresa=r.id_empresa) AS cont_real,
            (SELECT COUNT(*) FROM toque t WHERE t.id_empresa=r.id_empresa) AS tq_real,
            CASE WHEN replace(f.notion_page_id,'-','') = replace(r.notion_page_id,'-','')
                 THEN 'FORMA_1_misma_pagina' ELSE 'FORMA_2_dos_paginas' END AS forma
     FROM empresa f
     JOIN empresa_alias a ON lower(trim(a.alias)) = lower(trim(f.nombre_oficial))
     JOIN empresa r ON r.id_empresa = a.id_empresa
     WHERE f.id_empresa LIKE 'ntn-%' AND a.id_empresa NOT LIKE 'ntn-%'
       AND f.notion_page_id IS NOT NULL
     ORDER BY forma, f.nombre_oficial`,
  )
  .all();

// Forma 4: el fantasma no tiene notion_page_id. No es pagina duplicada, es fila fantasma
// sin pagina -- lo unico que la empareja con la fila real es el alias.
const sinPagina = db
  .prepare<[], Omit<Fila, 'pag_fantasma' | 'pag_real' | 'forma'>>(
    `SELECT DISTINCT r.id_empresa, f.id_empresa AS fantasma, f.nombre_oficial,
            (SELECT COUNT(*) FROM contacto c WHERE c.id_empresa=r.id_empresa) AS cont_real,
            (SELECT COUNT(*) FROM toque t WHERE t.id_empresa=r.id_empresa) AS tq_real
     FROM empresa f
     JOIN empresa_alias a ON lower(trim(a.alias)) = lower(trim(f.nombre_oficial))
     JOIN empresa r ON r.id_empresa = a.id_empresa
     WHERE f.id_empresa LIKE 'ntn-%' AND a.id_empresa NOT LIKE 'ntn-%'
       AND f.notion_page_id IS NULL
     ORDER BY f.nombre_oficial`,
  )
  .all();

const urlNotion = (pageId: string) => `https://www.notion.so/${pageId.replace(/-/g, '')}`;

function imprimirForma(titulo: string, filas: Fila[]) {
  console.log(`\n--- ${titulo}: ${filas.length} caso(s) ---`);
  for (const f of filas) {
    console.log(`  ${f.nombre_oficial}`);
    console.log(`    real:     id_empresa=${f.id_empresa}  contactos=${f.cont_real}  toques=${f.tq_real}`);
    if (f.pag_real) console.log(`              ${urlNotion(f.pag_real)}`);
    console.log(`    fantasma: id_empresa=${f.fantasma}  (0 contactos, 0 toques por definicion)`);
    if (f.pag_fantasma) console.log(`              ${urlNotion(f.pag_fantasma)}`);
  }
}

const forma1 = conPagina.filter((f) => f.forma === 'FORMA_1_misma_pagina');
const forma2 = conPagina.filter((f) => f.forma === 'FORMA_2_dos_paginas');

console.log('='.repeat(68));
console.log(`Fantasmas con match de alias: ${conPagina.length + sinPagina.length}`);
console.log(`  Forma 1 (misma pagina de Notion, sobra la fila): ${forma1.length}`);
console.log(`  Forma 2 (dos paginas, sobra una pagina):         ${forma2.length}`);
console.log(`  Forma 4 (fantasma sin pagina):                   ${sinPagina.length}`);
console.log('='.repeat(68));

imprimirForma('FORMA 1: misma pagina de Notion (nada que borrar en Notion)', forma1);
imprimirForma('FORMA 2: dos paginas de Notion (sobra una pagina, revisar)', forma2);

console.log(`\n--- FORMA 4: fantasma sin notion_page_id: ${sinPagina.length} caso(s) ---`);
for (const f of sinPagina) {
  console.log(`  ${f.nombre_oficial}`);
  console.log(`    real:     id_empresa=${f.id_empresa}  contactos=${f.cont_real}  toques=${f.tq_real}`);
  console.log(`    fantasma: id_empresa=${f.fantasma}  (sin pagina de Notion)`);
}
