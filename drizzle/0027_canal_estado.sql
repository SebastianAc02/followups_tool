-- 0027: estado por canal (punto 8 de la propuesta de tandas, 2026-08-04). Una fila por
-- (id_empresa, canal): si ese canal esta vivo, muerto, o nadie lo verifico.
--
-- POR QUE EXISTE, MEDIDO: Intel Go acumulo cuatro toques marcando la misma linea fuera de
-- servicio. Nadie sabia que el numero estaba muerto porque no habia donde escribirlo, asi que la
-- cuenta seguia saliendo en la lista de llamadas y se gastaban toques contra un tono de error.
--
-- LA REGLA DURA, la misma que ya rige `aliado` (migracion 0023): LA AUSENCIA DE DATO NUNCA SE LEE
-- COMO DATO NEGATIVO. Un canal sin fila NO es 'vivo': es 'sin_dato', que la app arma leyendo la
-- ausencia, nunca escribiendola. 'vivo' significa que alguien verifico que el numero funciona;
-- 'sin_dato' que nadie lo verifico. Por eso la columna `estado` solo admite 'vivo' | 'muerto' en
-- escritura (el dominio lo enforza en app/db/canal-estado.ts, mismo criterio que canal/resultado
-- en `toque`: un CHECK en SQLite no se amplia despues sin recrear la tabla).
--
-- fuente y quien NOT NULL: mismo criterio que aliado_fuente/aliado_quien. Un canal marcado muerto
-- sin quien lo dijo es el dato que despues nadie puede auditar.
--
-- Indice unico sobre (id_empresa, canal, id_organizacion): un canal tiene UN estado, no un
-- historial de opiniones simultaneas. Volver a marcar el mismo canal actualiza la fila, no la
-- duplica.
CREATE TABLE `canal_estado` (
	`id_canal_estado` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`canal` text NOT NULL,
	`estado` text NOT NULL,
	`nota` text,
	`fuente` text NOT NULL,
	`quien` text NOT NULL,
	`fecha` text NOT NULL,
	`id_organizacion` integer NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_canal_estado_empresa_canal_org` ON `canal_estado` (`id_empresa`,`canal`,`id_organizacion`);
