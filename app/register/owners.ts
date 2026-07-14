// Separado de actions.ts a proposito: ese archivo tiene 'use server' en la cabecera, y
// Next exige que un modulo 'use server' SOLO exporte funciones async -- exportar este
// array ahi tumba la carga del modulo entero (error real, no cosmetico: "A 'use server'
// file can only export async functions, found object"). Este archivo es plano, sin
// directiva, para que tanto el server action como el componente cliente lo importen.
//
// Lista cerrada, no derivada de empresa.owner (ver comentario largo en actions.ts):
// casing EXACTO como vive en empresa.owner -- "Camilo fonseca" con f minuscula es
// correcto, no un typo.
export const OWNERS_ONEPAY = ['Felipe Castro', 'Sebastian Acosta Molina', 'Thomas Schumacher', 'Camilo fonseca'] as const;
