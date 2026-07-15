// Orquestador final del Spec 1 (Fase 2 categoria + Fase 4 completa): recorre el export
// de Notion y aplica, por empresa, las 3 funciones que ya existian con tests pero sin
// corredor: marcarVetoNotion (T7), upsertContactoNotion (T11), enriquecerDesdeNotion (T12).
// Notion sobrescribe donde trae dato; ninguna de las 3 pisa con blanco (ver sus propios
// comentarios en repository.ts). No escribe nada fuera de esas 3 funciones ya auditadas.
//
// Match identico a sync_estados_notion.ts: notion_page_id primero, fallback por nombre
// exacto normalizado; filas fundidas (opera_bajo_id) y matches ambiguos se saltan y se
// reportan, nunca se adivinan.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/enriquecer_desde_notion.ts

import { db, schema } from '../app/db/index.ts';
import { marcarVetoNotion, upsertContactoNotion, enriquecerDesdeNotion, type ContactoNotionInput } from '../app/db/repository.ts';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { vetoCategoria } from '../app/core/reconciliacion/vetoCategoria.ts';
import { construirIndiceEmpresasDb, matchEmpresaNotion, type EmpresaDbMatch } from '../app/core/reconciliacion/matchNotion.ts';

import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';

// Los scripts no pasan por requireSession(), asi que declaran su modo a mano: sin esto
// el primer acceso a la DB lanza (modo-prueba.ts no tiene default a proposito).
marcarModoPrueba(false);

const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';
const ID_ORGANIZACION = 1;

function leerEmpresasDb(): EmpresaDbMatch[] {
  return db.select({
    idEmpresa: schema.empresa.idEmpresa,
    nombreOficial: schema.empresa.nombreOficial,
    notionPageId: schema.empresa.notionPageId,
    operaBajoId: schema.empresa.operaBajoId,
  }).from(schema.empresa).all();
}

function leerAlias() {
  return db.select({ idEmpresa: schema.empresaAlias.idEmpresa, alias: schema.empresaAlias.alias }).from(schema.empresaAlias).all();
}

function contactosDe(notionEmpresa: ReturnType<ReturnType<typeof crearNotionExportAdapter>['leerEmpresas']>[number]): ContactoNotionInput[] {
  const lista: ContactoNotionInput[] = [];
  if (notionEmpresa.contactoPrincipal.trim() !== '') {
    lista.push({
      nombre: notionEmpresa.contactoPrincipal,
      cargo: notionEmpresa.cargo,
      telefono: notionEmpresa.telefono,
      email: notionEmpresa.email,
      esPrincipal: true,
    });
  }
  for (const miembro of notionEmpresa.buyingComittee) {
    lista.push({
      nombre: miembro.nombre,
      cargo: miembro.cargo,
      telefono: miembro.celular,
      email: miembro.correo,
      linkedin: miembro.linkedin || undefined,
      esPrincipal: false,
    });
  }
  return lista;
}

function main() {
  const empresasDb = leerEmpresasDb();
  const indice = construirIndiceEmpresasDb(empresasDb, leerAlias());

  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.nombre.trim().length > 0);

  console.log(`empresas DB activas (sin fundir): ${empresasDb.filter((e) => !e.operaBajoId).length}`);
  console.log(`empresas Notion en el export: ${empresasNotion.length}`);

  let vetosAplicados = 0;
  let contactosAplicados = 0; // empresas con >=1 contacto en la entrada, no filas individuales
  let enriquecidas = 0;
  const sinMatchDb: string[] = [];

  for (const notionEmpresa of empresasNotion) {
    // M (2026-07-15): el helper unico -- page_id como llave eterna, alias resuelto a
    // mano, y razon social solo si es unico candidato (ambiguo = null, nunca adivina).
    const empresaDb = matchEmpresaNotion(indice, { pageId: notionEmpresa.pageId, nombre: notionEmpresa.nombre });
    if (!empresaDb) {
      sinMatchDb.push(notionEmpresa.nombre);
      continue;
    }

    // Fase 2: veto de categoria (union, nunca quita un veto existente).
    const veto = vetoCategoria(notionEmpresa.industria);
    if (veto) {
      marcarVetoNotion(empresaDb.idEmpresa, veto);
      vetosAplicados++;
    }

    // Fase 4: contactos (Contacto Principal + Buying Comittee).
    const contactos = contactosDe(notionEmpresa);
    if (contactos.length > 0) {
      upsertContactoNotion(empresaDb.idEmpresa, contactos);
      contactosAplicados++;
    }

    // Fase 4: campos de empresa + usuarios (no destructivo en blanco, ver enriquecerDesdeNotion).
    enriquecerDesdeNotion(
      empresaDb.idEmpresa,
      {
        pasarela: notionEmpresa.pasarela,
        crm: notionEmpresa.crm,
        owner: notionEmpresa.owner,
        proximoPaso: notionEmpresa.proximoPaso,
        fechaProximoPaso: notionEmpresa.fechaProximoPaso,
        usuariosEstimados: notionEmpresa.usuariosEstimados,
      },
      ID_ORGANIZACION,
    );
    enriquecidas++;
  }

  console.log(`vetos de categoria aplicados: ${vetosAplicados}`);
  console.log(`empresas con contactos aplicados: ${contactosAplicados}`);
  console.log(`empresas pasadas por enriquecerDesdeNotion (no-op si Notion no traia dato nuevo): ${enriquecidas}`);
  console.log(`empresas Notion sin match en la DB (o ambiguo por razon social): ${sinMatchDb.length}`);
  if (sinMatchDb.length > 0) console.log('  ' + sinMatchDb.join('\n  '));
}

main();
