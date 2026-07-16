// El spec del modo prueba fija la frontera: "identidad SIEMPRE real, negocio conmutable".
// auth.ts y organizacion-repository.ts ya la respetan (usan dbReal fijo), pero la frontera
// se trazo por ARCHIVO y no por TABLA: repository.ts conmuta entero, y ahi adentro hay tres
// funciones que leen organizacion_miembro, que es IDENTIDAD.
//
// En modo prueba preguntaban "quien es Sebastian?" a pruebas.db, donde no existe (medido
// 2026-07-15: 1 fila en isps.db, 0 en pruebas.db). Se veia asi: idUsuarioDeOwner devolvia
// null -> "el owner no tiene Gmail" -> el correo caia al fallback de Apollo -> Apollo no
// tiene credencial en pruebas.db -> paso_inscripcion en 'fallo'. El Gmail estaba conectado y
// verificado; nunca se le pregunto.
//
// Estas funciones MEZCLAN: la identidad va a dbReal, el negocio (linea_whatsapp,
// paso_inscripcion) sigue conmutando. Por eso el fix es por tabla, no por funcion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index.ts';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarSoloLectura } from '../lib/read-only.ts';
import { idUsuarioDeOwner } from './repository.ts';

const DDL = sql`
  CREATE TABLE IF NOT EXISTS organizacion_miembro (
    id_organizacion INTEGER NOT NULL,
    id_user TEXT NOT NULL,
    owner_canonico TEXT NOT NULL
  )
`;
dbReal.run(DDL);
dbPruebas.run(DDL);

// La identidad vive SOLO en la real, que es justo el punto del diseño.
dbReal.run(sql`INSERT INTO organizacion_miembro (id_organizacion, id_user, owner_canonico) VALUES (1, 'user-sebastian', 'Sebastian Acosta Molina')`);

test('en modo prueba, el owner se resuelve contra la identidad REAL', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(true);
  assert.equal(
    idUsuarioDeOwner('Sebastian Acosta Molina', 1),
    'user-sebastian',
    'la identidad no conmuta: sin esto el correo cae al fallback de Apollo',
  );
});

test('fuera de modo prueba sigue igual', () => {
  marcarModoPrueba(false);
  assert.equal(idUsuarioDeOwner('Sebastian Acosta Molina', 1), 'user-sebastian');
});

test('un owner que no existe sigue dando null', () => {
  marcarModoPrueba(true);
  assert.equal(idUsuarioDeOwner('Nadie', 1), null);
});

test('el filtro por organizacion se respeta (multi-org)', () => {
  marcarModoPrueba(true);
  assert.equal(idUsuarioDeOwner('Sebastian Acosta Molina', 99), null, 'otra org no lo ve');
});
