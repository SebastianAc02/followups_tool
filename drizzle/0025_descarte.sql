-- 0025: por que una cuenta no entra a la lista, y cuando vuelve. Ver MOTIVOS_DESCARTE en
-- app/db/validation.ts.
--
-- SEPARADA DE razon_perdida A PROPOSITO. Una cuenta puede rechazar sin estar perdida: "ya es
-- cliente" y "congelada hasta octubre" la sacan de la lista de hoy sin que el deal se haya caido.
-- Escribirlas en razon_perdida las contaria como perdidas en el embudo, que mide otra cosa.
--
-- fecha_retorno es la que cambia el trabajo: hoy ese dato vive en prosa dentro del proximo paso
-- ("no antes de octubre"), asi que la cuenta sale de la lista a mano y vuelve solo si alguien se
-- acuerda. Como fecha real vuelve sola, y el vencimiento se evalua AL LEER: no hay barrido
-- nocturno que alguien tenga que acordarse de correr, y ninguna fila se reescribe el dia del
-- retorno.
--
-- Las 1.965 filas quedan en NULL, que significa "nadie dijo que esta cuenta este descartada". Es
-- el mismo criterio que aliado: la ausencia no es un dato negativo, es la falta de uno.
ALTER TABLE `empresa` ADD `motivo_descarte` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `motivo_descarte_nota` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `descarte_fecha` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `descarte_quien` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `fecha_retorno` text;
