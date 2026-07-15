// Aplica los 21 pares/grupos que Sebastian aprobo a mano el 2026-07-14 (ver
// planning/dedup-candidatos.md, seccion "Decision de Sebastian"). Corre fundirEmpresas
// (T4) contra la DB real -- idempotente, correr dos veces no duplica nada.
//
// Para "Fibermat" y "SPECTRA": el sintetico en la DB trae un nombre viejo/typo
// (Fibermax, Espectra) de un pull anterior de Notion; se usa el nombre ACTUAL del
// export vivo (Fibermat, SPECTRA) como nombre_oficial, no el nombre stale del
// duplicado que se esta absorbiendo.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/aplicar_fusiones_aprobadas.ts

import { fundirEmpresas } from '../app/db/repository.ts';
const APROBADOS: { idSobrevive: string; idsAbsorbidos: string[]; nombreNotion: string }[] = [
  { idSobrevive: '901715847', idsAbsorbidos: ['ntn-8119deb48bf9', 'ntn-1e376ceb9dfb'], nombreNotion: 'CELSIA INTERNET S.A.S.' },
  { idSobrevive: '901403469', idsAbsorbidos: ['ntn-8ea10df5716e'], nombreNotion: 'WINS SOLUCIONES SAS' },
  { idSobrevive: '901734417', idsAbsorbidos: ['9990000123'], nombreNotion: 'KGB TELECOMUNICACIONES' },
  { idSobrevive: '901421445', idsAbsorbidos: ['9990000084'], nombreNotion: 'Telecomplus' },
  { idSobrevive: '900482761', idsAbsorbidos: ['9990000164'], nombreNotion: 'S3WIRELESS COLOMBIA S.A' },
  { idSobrevive: '900014381', idsAbsorbidos: ['9990000002'], nombreNotion: 'Cablenet SAS' },
  { idSobrevive: '901132952', idsAbsorbidos: ['9990000043'], nombreNotion: 'Intel Go' },
  { idSobrevive: '900780620', idsAbsorbidos: ['ntn-0d6b7fe647a4'], nombreNotion: 'Servicios Informáticos del Choco (SIC)' },
  { idSobrevive: '901174053', idsAbsorbidos: ['ntn-73a5b38a0a21'], nombreNotion: 'Global IP' },
  { idSobrevive: '901734607', idsAbsorbidos: ['ntn-0de334ef3e49'], nombreNotion: 'Hola - Hola Telecomunicaciones' },
  { idSobrevive: '800179562', idsAbsorbidos: ['9990000130'], nombreNotion: 'Legon' },
  { idSobrevive: '805006014', idsAbsorbidos: ['ntn-3e3b995fe19c'], nombreNotion: 'DIRECTV' },
  { idSobrevive: '901118187', idsAbsorbidos: ['ntn-4157c57ed48a'], nombreNotion: 'Conexión Digital - One ISP' },
  { idSobrevive: '900806620', idsAbsorbidos: ['9990000117'], nombreNotion: 'Mundo Mas' },
  { idSobrevive: '900511109', idsAbsorbidos: ['9990000088'], nombreNotion: 'Click Conectividad' },
  { idSobrevive: '901009357', idsAbsorbidos: ['9990000159'], nombreNotion: 'IPCom' },
  { idSobrevive: '900734423', idsAbsorbidos: ['9990000152'], nombreNotion: 'CALLTOPBX S.A.S. VIVERCOM' },
  { idSobrevive: '901279098', idsAbsorbidos: ['ntn-9aeb2696d2f8'], nombreNotion: 'ENTERNET' },
  { idSobrevive: '901714003', idsAbsorbidos: ['ntn-ffac89d56571'], nombreNotion: 'Fibermat' },
  { idSobrevive: '900770495', idsAbsorbidos: ['9990000037'], nombreNotion: 'SPECTRA' },
  { idSobrevive: '901423454', idsAbsorbidos: ['ntn-677cb0cc1b6d'], nombreNotion: 'Hola - Red Net' },
];

for (const par of APROBADOS) {
  fundirEmpresas(par.idSobrevive, par.idsAbsorbidos, par.nombreNotion);
  console.log(`fundido: ${par.idSobrevive} <- [${par.idsAbsorbidos.join(', ')}] -> "${par.nombreNotion}"`);
}

console.log(`${APROBADOS.length} grupos aplicados.`);
