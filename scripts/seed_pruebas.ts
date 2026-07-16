// Siembra pruebas.db con las empresas ficticias y los 4 contactos reales. Idempotente:
// borra lo que sembro antes (prefijo prueba-) y vuelve a sembrar.
//
// La base la crea el esquema REAL, no el journal de migraciones (que solo sabe hacer 31
// de las 50 tablas -- ver el spec):
//   sqlite3 ../isps.db .schema | grep -v "^CREATE TABLE sqlite_sequence" | sqlite3 ../pruebas.db
//
// UNICA divergencia con el esquema real: la vista empresa_categoria lleva una rama extra
// para la categoria 'test' (ver VISTA_CATEGORIA_CON_TEST abajo, con el porque). Este
// script la re-aplica en cada corrida, asi que re-crear la base desde isps.db y volver a
// sembrar deja la divergencia puesta sin que haya que acordarse.
//
// Correr: node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_pruebas.ts
import { eq, like, sql } from 'drizzle-orm';
import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';
import { dbPruebas } from '../app/db/index.ts';
import { empresa, contacto, lineaWhatsapp } from '../app/db/schema.ts';

// Escribe SIEMPRE en dbPruebas explicito, asi que esta marca no elige la base: esta para
// que el Proxy del db no lance si algo del camino lo toca de refilon.
marcarModoPrueba(true);

const EMPRESAS = [
  { id: 'prueba-viajes-andinos', nombre: 'Viajes Andinos', ciudad: 'Bogota' },
  { id: 'prueba-tour-caribe', nombre: 'Tour Caribe', ciudad: 'Medellin' },
  { id: 'prueba-sierra-tours', nombre: 'Sierra Tours', ciudad: 'Cali' },
  { id: 'prueba-ruta-pacifico', nombre: 'Ruta Pacifico', ciudad: 'Cartagena' },
];

// DIVERGENCIA DELIBERADA del esquema real (decision de Sebastian, 2026-07-15).
//
// El spec manda replicar el esquema de isps.db tal cual. Esta vista es la unica excepcion
// y la razon es que 'categoria' es un campo DERIVADO, no una etiqueta: la vista lo calcula
// con un CASE sobre empresa_clasificacion y, sin fila ahi, cae a ELSE 'isp'. Las 4
// empresas sembradas son agencias de viajes inventadas y salian en pantalla como "isp",
// que es sencillamente mentira y se le iba a mostrar al CRO.
//
// La rama extra lee la COLUMNA PLANA empresa.categoria (que en la base real nadie usa para
// segmentar, ver COLUMNA_SEGMENTO en repository.ts) y solo dispara con el valor 'test'.
// En isps.db ninguna fila tiene categoria='test', asi que la vista real nunca devolveria
// 'test' aunque tuviera esta rama: el riesgo de que una consulta funcione aca y se rompa
// en prod se limita a segmentos que filtren por 'test', que solo existen en la demo.
//
// Si algun dia el modo prueba necesita mas que esto, la conversacion correcta es si
// 'categoria' deberia aceptar etiquetas ademas de clasificacion derivada, no seguir
// parchando la vista.
const VISTA_CATEGORIA_CON_TEST = sql`
  CREATE VIEW empresa_categoria AS
      SELECT e.id_empresa, e.nombre_oficial,
          CASE
              WHEN e.categoria             = 'test' THEN 'test'
              WHEN c.alianza_sae_plus      = 1 THEN 'sae_plus'
              WHEN c.es_corporativo_grande = 1 THEN 'telco_grande'
              WHEN c.es_carrier            = 1 THEN 'carrier'
              WHEN c.es_utility_no_isp     = 1 THEN 'utility'
              WHEN c.es_extranjero         = 1 THEN 'extranjero'
              WHEN c.es_no_isp_confirmado  = 1 THEN 'no_isp'
              ELSE 'isp'
          END AS categoria,
          CASE
              WHEN c.id_empresa IS NULL THEN 1
              WHEN (c.alianza_sae_plus + c.es_corporativo_grande + c.es_carrier
                    + c.es_utility_no_isp + c.es_extranjero + c.es_no_isp_confirmado) = 0 THEN 1
              ELSE 0
          END AS atacable
      FROM empresa e
      LEFT JOIN empresa_clasificacion c ON c.id_empresa = e.id_empresa
`;

dbPruebas.run(sql`DROP VIEW IF EXISTS empresa_categoria`);
dbPruebas.run(VISTA_CATEGORIA_CON_TEST);

// Los 4 contactos reales de la prueba. Los correos y WhatsApps son de verdad: en modo
// prueba la BASE esta aislada, los ENVIOS no (Apollo y Evolution mandan de verdad).
const CONTACTOS = [
  { idEmpresa: 'prueba-viajes-andinos', nombre: 'Sebastian', email: 'sacostamolina@outlook.com', telefono: '+12368895214' },
  { idEmpresa: 'prueba-tour-caribe', nombre: 'Isabela', email: 'sdacostam@eafit.edu.co', telefono: '+573215924704' },
  { idEmpresa: 'prueba-sierra-tours', nombre: 'Felipe', email: 'felipe@onepay.la', telefono: '+573112469262' },
  { idEmpresa: 'prueba-ruta-pacifico', nombre: 'Camilo', email: 'sacostamolin@gmail.com', telefono: '+573102186819' },
];

for (const e of EMPRESAS) {
  dbPruebas.delete(contacto).where(eq(contacto.idEmpresa, e.id)).run();
}
dbPruebas.delete(empresa).where(like(empresa.idEmpresa, 'prueba-%')).run();

// created_at/updated_at son NOT NULL en la DB con default datetime('now'), pero el schema
// de Drizzle los declara sin default, asi que inserta NULL explicito y la constraint
// truena. Se pasan a mano.
const AHORA = new Date().toISOString();

for (const e of EMPRESAS) {
  dbPruebas
    .insert(empresa)
    .values({
      idEmpresa: e.id,
      tipoId: 'nit',
      nombreOficial: e.nombre,
      nombreNormalizado: e.nombre.toLowerCase(),
      ciudadPrincipal: e.ciudad,
      esCliente: 0,
      enConversacion: 0,
      estadoComercial: 'lead',
      // 'test' y no 'agencia_viajes': es el valor que dispara la rama de
      // VISTA_CATEGORIA_CON_TEST, para que el Copiloto y la pantalla digan "test" en vez
      // de "isp" (el default de la vista cuando no hay clasificacion).
      categoria: 'test',
      organizacionActivaId: 1,
      createdAt: AHORA,
      updatedAt: AHORA,
    })
    .run();
}

for (const c of CONTACTOS) {
  dbPruebas
    .insert(contacto)
    .values({
      idEmpresa: c.idEmpresa,
      nombre: c.nombre,
      cargo: 'Gerente Comercial',
      email: c.email,
      telefono: c.telefono,
      esPrincipal: 1,
      fuente: 'seed_pruebas',
    })
    .run();
}

// La linea de WhatsApp NO se aisla (decision del spec): apunta a la MISMA instancia real
// de Evolution. Mandar WhatsApp de verdad es el objetivo de la prueba.
dbPruebas.delete(lineaWhatsapp).run();
dbPruebas
  .insert(lineaWhatsapp)
  .values({
    numero: '573105182997',
    tipo: 'personal',
    estado: 'activa',
    techoDiario: 25,
    referenciaProveedor: 'prueba',
  })
  .run();

console.log(`Sembradas ${EMPRESAS.length} empresas y ${CONTACTOS.length} contactos en pruebas.db`);
