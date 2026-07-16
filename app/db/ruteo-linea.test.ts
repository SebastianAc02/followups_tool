// A que base pertenece un webhook entrante de WhatsApp.
//
// El webhook de Evolution entra SIN sesion: no trae la cookie de modo prueba, asi que
// requireSession nunca corre y esModoPrueba() da false. Resultado hasta el 2026-07-15:
// TODO mensaje entrante se guardaba en isps.db, incluso el de una linea de prueba, y el
// boton "Ya me escribio, verificar" (que si tiene sesion) lo buscaba en pruebas.db. Uno
// escribia a la izquierda y el otro leia a la derecha: nunca se encontraban. Medido: 101
// mensajes en isps.db, 0 en pruebas.db.
//
// La salida es que el DATO decida, no una cookie: el payload trae la instancia
// ('wa-12368895214'), y esa linea existe en una base o en la otra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index.ts';
import { esLineaDePruebas } from './ruteo-linea.ts';

const DDL = sql`
  CREATE TABLE IF NOT EXISTS linea_whatsapp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    tipo TEXT NOT NULL,
    id_usuario TEXT,
    referencia_proveedor TEXT,
    estado TEXT NOT NULL DEFAULT 'calentando',
    techo_diario INTEGER NOT NULL DEFAULT 25,
    fecha_creacion TEXT
  )
`;
dbReal.run(DDL);
dbPruebas.run(DDL);

dbPruebas.run(sql`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor) VALUES ('12368895214', 'personal', 'wa-12368895214')`);
dbReal.run(sql`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor) VALUES ('573001112233', 'personal', 'wa-573001112233')`);
// El caso ambiguo, que existe de verdad hoy: la instancia legacy 'prueba' esta en LAS DOS.
dbPruebas.run(sql`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor) VALUES ('573105182997', 'personal', 'prueba')`);
dbReal.run(sql`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor) VALUES ('573105182997', 'personal', 'prueba')`);

test('una linea que solo existe en pruebas.db es de prueba', () => {
  assert.equal(esLineaDePruebas('wa-12368895214'), true);
});

test('una linea que solo existe en la real NO es de prueba', () => {
  assert.equal(esLineaDePruebas('wa-573001112233'), false);
});

// La regla NO es simetrica y esa asimetria es la decision de diseño. Mandar un mensaje de
// prueba a la base real ensucia datos: molesto, recuperable. Mandar la respuesta de un ISP
// real a pruebas.db deja su cadencia REAL sin cortar y le seguimos escribiendo a quien ya
// contesto -- el daño exacto que el sistema existe para evitar. Ante la duda, gana la real.
test('si la instancia existe en LAS DOS, gana la real (ante la duda, no aislar)', () => {
  assert.equal(esLineaDePruebas('prueba'), false, 'la ambiguedad nunca debe robarle un reply a la base real');
});

test('una instancia que no existe en ningun lado no es de prueba (default real)', () => {
  assert.equal(esLineaDePruebas('wa-nunca-vista'), false);
});

test('sin instancia (payload raro) no es de prueba', () => {
  assert.equal(esLineaDePruebas(''), false);
});
