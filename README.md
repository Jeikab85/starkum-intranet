# Intranet Starkum

Intranet privada de Starkum Holdings en **velknoxiq.com**: negocios de ecommerce, proveedores, facturas escaneadas con lectura automática, documentos de la LLC y la SAS, declaraciones por período, tarjetas, lotes y hoja de escaneo.

Es un solo Cloudflare Worker sin dependencias en tiempo de ejecución:

| Pieza | Dónde |
| --- | --- |
| Servidor y API | `src/server.js` |
| Aplicación (pantallas) | `src/app.js` y `src/app.html` |
| Base de datos (tablas) | `src/schema.sql` — se crean solas al arrancar |
| Empaquetado | `build.mjs` → `dist/worker.js` |

Servicios de Cloudflare que usa: D1 (`DB`), R2 (`FILES`, bucket `intranet-files`), Workers AI (`AI`), Email Service (`EMAIL`) y un cron diario (13:07 UTC) para el correo de recordatorios.

## Publicar

Cada cambio que llega a la rama `main` se publica solo en velknoxiq.com con Cloudflare Workers Builds:

- Comando de compilación: `npm ci && npm run build`
- Comando de publicación: `npx wrangler deploy`

La configuración de producción está en `wrangler.toml`. Las variables secretas (por ejemplo `ANTHROPIC_API_KEY`, si se usa) se guardan en el panel de Cloudflare y no en este repositorio.

## Probar en local

```
npm ci
npm run dev
```

Usa `wrangler.dev.toml`: base de datos local y `DEV=1`, que imprime los códigos de acceso en la consola y simula la lectura con IA.
