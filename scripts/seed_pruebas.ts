// Siembra pruebas.db con las empresas ficticias y los 4 contactos reales. Idempotente:
// borra lo que sembro antes (prefijo prueba-) y vuelve a sembrar.
//
// La base la crea el esquema REAL, no el journal de migraciones (que solo sabe hacer 31
// de las 50 tablas -- ver el spec):
//   sqlite3 ../isps.db .schema | grep -v "^CREATE TABLE sqlite_sequence" | sqlite3 ../pruebas.db
//
// Correr: node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_pruebas.ts
import { eq, like } from 'drizzle-orm';
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
      categoria: 'agencia_viajes',
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
