-- 0028: la tarea del operador que tiene quieta a una cuenta.
--
-- Jigartel llevaba desde el 22-jul sin moverse porque faltaba conseguir el numero de un gerente.
-- Eso hoy se esconde entre las cuentas que no contestan, y son dos cosas distintas: una espera al
-- prospecto, la otra es deuda propia. La segunda no se destraba con un toque mas.
--
-- TEXTO y no booleano: "esta bloqueada" no sirve sin saber por que. Y la fecha desde cuando es la
-- otra mitad del dato: lo que duele no es que este bloqueada, es que lleve dos semanas asi.
ALTER TABLE `empresa` ADD `tarea_bloqueante` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `tarea_bloqueante_desde` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `tarea_bloqueante_quien` text;
