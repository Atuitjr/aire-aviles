# Avilés · Alertas de datos abiertos

Motor de alertas locales: **fuente → normalizar → clasificar → avisar**.
Primera fuente: calidad del aire de la red del Principado de Asturias (vía Agencia Europea de Medio Ambiente),
con avisos por Telegram (@AireAvilesBot) según el índice europeo de calidad del aire.

**Despliegue en producción (gratis): ver [DEPLOY.md](DEPLOY.md).**

## Estructura

```
packages/
  core/                 Tipos y contratos (SourcePlugin, Rule, Notifier), reglas genéricas, carga de .env
  db/                   Drizzle + libSQL (SQLite en local, Turso en producción)
  sources/aviles-air/   Plugin de la red de calidad del aire de Avilés (CKAN)
apps/
  worker/               Ingesta periódica (cron), evaluación de reglas y envío de avisos
  api/                  Express: /health, /stations, /stations/:id/latest, /stations/:id/history
  web/                  Astro + React: listado de estaciones con sus últimas medidas
```

## Puesta en marcha

Requiere Node 20.12 o superior.

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm run db:push             # crea las tablas en data/aviles.db
```

Primero, explora la fuente para ver los campos y cada cuánto se actualiza:

```bash
npm run probe -w @aviles/source-aviles-air
```

Con eso se completa `mapRecord()` en `packages/sources/aviles-air/src/index.ts`. Después:

```bash
npm run ingest:once         # una pasada de ingesta
npm run dev:worker          # ingesta periódica (INGEST_CRON)
npm run dev:api             # http://localhost:3001
npm run dev:web             # http://localhost:4321
npm run dev:bot             # bot de Telegram (necesita TELEGRAM_BOT_TOKEN en .env)
```

## Bot de Telegram (@AireAvilesBot)

- `apps/bot`: atiende comandos (/start, /suscribir, /ahora, /mis, /baja) y guarda suscripciones.
- `apps/worker/src/notifiers/telegram.ts`: envía las alertas a los suscritos. Si un usuario bloquea el bot, se borran sus suscripciones.

El bot y el worker son procesos separados y comparten la base de datos.

## Añadir una fuente nueva

1. Crea `packages/sources/<nombre>` implementando `SourcePlugin` (`stations()` y `fetch()`).
2. Regístrala en `apps/worker/src/registry.ts` con `addSource()` y sus reglas con `addRule()`.

Lo demás (guardado, deduplicado, reglas, avisos, API) no cambia.

## Pendiente

- [ ] `mapRecord()` del plugin de Avilés (tras ejecutar `probe`)
- [ ] Coordenadas de las estaciones y comprobar el dataset de 2026
- [ ] Revisar los umbrales de `AIR_THRESHOLDS` con la normativa vigente
- [ ] Notificador de Telegram y web push
- [ ] Mapa e histórico en la web
