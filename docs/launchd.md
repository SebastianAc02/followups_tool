# Worker en launchd (macOS)

El worker (`npm run worker`) drena el outbox hacia Notion (V3.7) con catch-up-first: al
arrancar corre un ciclo inmediato antes de programar la espera de 5 minutos. Para que
sobreviva a reinicios del laptop, se registra como un `launchd` agent que arranca al iniciar
sesión — NO se instala todavía, esto es solo la referencia para cuando se decida activarlo.

## Plist

Guardar como `~/Library/LaunchAgents/la.onepay.followups-worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>la.onepay.followups-worker</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>worker</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/followups-worker.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/followups-worker-error.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>FOLLOWUPS_CRYPTO_KEY</key>
    <string>REEMPLAZAR_CON_LA_LLAVE_REAL</string>
  </dict>
</dict>
</plist>
```

Notas:

- `ProgramArguments` usa `npm run worker`, que ya trae el flag de `--experimental-loader`
  necesario para resolver los imports sin extension (mismo mecanismo que los tests).
  Verificar la ruta real de `npm` con `which npm` — puede variar según nvm/Homebrew.
- `KeepAlive: true` reinicia el proceso si muere; el catch-up-first en `main()` se encarga de
  procesar lo atrasado en cada reinicio, así que no hace falta lógica extra para esto.
- `FOLLOWUPS_CRYPTO_KEY` tiene que llegar por `EnvironmentVariables` en el plist -- launchd no
  hereda el `.env.local` de un shell interactivo. Sin esta variable, `getKey()` (V3.2) revienta
  con un error claro apenas el worker intenta cifrar o descifrar algo.

## Comandos

```bash
launchctl load ~/Library/LaunchAgents/la.onepay.followups-worker.plist
launchctl unload ~/Library/LaunchAgents/la.onepay.followups-worker.plist
launchctl list | grep followups-worker
tail -f /tmp/followups-worker.log
```

## Verificación de salud

El heartbeat vive en la tabla `conector` (columnas `ultima_corrida`, `ultimo_resultado` por
`proveedor`), visible en la pantalla de conectores (V3.8) sin mirar logs.
