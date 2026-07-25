CREATE TABLE `seguimiento_aplazado` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`fecha_incumplida` text NOT NULL,
	`fecha_nueva` text NOT NULL,
	`motivo` text,
	`nota` text,
	`aplazado_por` text,
	`id_organizacion` integer NOT NULL,
	`created_at` text
);
