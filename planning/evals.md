# Evals y pruebas

## Pruebas de software (mapeadas a la spec)

- Cola: dada una DB con cuentas y fechas, la cola del día trae solo las vencidas/para hoy, ordenadas.
- Registro: tocar un resultado guarda el toque y avanza a la siguiente ficha en menos de 1s.
- Próximo follow-up: al elegir fecha se muestra el conteo de ese día.
- Contador: registrar un toque incrementa el conteo del día.
- Outbox idempotente: re-correr el relay sobre las mismas filas no crea duplicados en Notion (mockear NotionAdapter).
- Outbox ante falla: si el relay se cae a media tarea, las filas no terminadas quedan pendientes y se reintentan.

## Eval de la IA (aparte, obligatoria)

La extracción de la nota de voz es probabilística, necesita su propio chequeo.

- Dataset "gold": 15-20 notas de voz reales con los campos correctos escritos a mano.
- Métrica: % de campos extraídos correctamente. Umbral mínimo para confiar: definir (ej. 90%).
- Casos adversariales: audios confusos, datos faltantes, nombres raros. La IA no debe inventar.
- Regresión: re-correr el set cada vez que cambie el prompt de extracción.
- Rúbrica humana: en la revisión (D4), marcar cada borrador como correcto/corregido para
  alimentar el dataset gold con el tiempo.

## Dogfood

Usar la herramienta en una jornada real de llamadas antes de declararla lista.
