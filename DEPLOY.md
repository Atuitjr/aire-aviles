# Despliegue (gratis)

Cómo poner el proyecto en marcha sin depender de tu ordenador.

| Pieza | Dónde | Plan |
|---|---|---|
| Base de datos | **Turso** | Free |
| Ingesta horaria + avisos por Telegram | **GitHub Actions**, disparado por **cron-job.org** | Gratis (repositorio público) |
| Bot (comandos `/ahora`, `/suscribir`...) | **Cloudflare Workers** | Free |

```
cron-job.org ──(cada hora)──▶ GitHub Actions ──▶ EEA (descarga)
                                    │
                                    ├──▶ Turso (guarda medidas y episodios)
                                    └──▶ Telegram (avisos a los suscritos)

Usuario de Telegram ──▶ Telegram ──(webhook)──▶ Cloudflare Worker ──▶ Turso
```

Los avisos salen de la ingesta, así que **no dependen del bot**: si el Worker fallara, solo dejarían de responder los comandos.

Los comandos son para **CMD de Windows** (el que usas). En PowerShell, cambia `set X=valor` por `$env:X="valor"`.

---

## 1. Turso (base de datos)

1. Crea una cuenta en https://turso.tech (puedes entrar con GitHub).
2. **Create Database** → nombre `aire-aviles` → elige una ubicación en Europa.
3. En la base de datos, copia la **URL** (empieza por `libsql://`).
4. **Create Token** (lectura y escritura, sin caducidad) → cópialo.
5. Crea las tablas desde tu PC. En una ventana de CMD, en la carpeta del proyecto:

   ```bat
   set DATABASE_URL=libsql://aire-aviles-TUUSUARIO.turso.io
   set DATABASE_AUTH_TOKEN=eyJ...el token...
   npm run db:push
   npm run ingest:once
   ```

   Las variables puestas con `set` mandan sobre el `.env` **solo en esa ventana**. Tu `.env` sigue apuntando a la base de datos local, así que puedes seguir desarrollando sin tocar producción.

   `ingest:once` hace una primera carga para que el bot tenga datos desde el primer momento.

> Cuando cambiemos el esquema en el futuro, habrá que repetir `npm run db:push` con estas variables.

---

## 2. GitHub (código + ingesta)

### 2.1 Subir el código

1. Crea un repositorio **público** vacío en GitHub (sin README ni .gitignore), por ejemplo `aire-aviles`.
2. En la carpeta del proyecto:

   ```bat
   git init
   git add .
   git status
   ```

   **Revisa la lista de `git status`**: no debe aparecer `.env` ni la carpeta `data/`. Si aparecen, para y avísame.

   ```bat
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TUUSUARIO/aire-aviles.git
   git push -u origin main
   ```

### 2.2 Secretos

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**. Crea tres:

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | la URL `libsql://...` de Turso |
| `DATABASE_AUTH_TOKEN` | el token de Turso |
| `TELEGRAM_BOT_TOKEN` | el token del bot (el de tu `.env`) |

### 2.3 Probar la ingesta

**Actions → Ingesta horaria → Run workflow**. Tarda 1-2 minutos. En el log deberías ver algo como:

```
[eea-air] 9000 leídas, 120 nuevas, 0 avisos (35000 ms)
```

Si un job falla, GitHub te manda un email.

---

## 3. cron-job.org (disparo cada hora)

El cron propio de GitHub puede retrasarse horas, así que lo usamos solo como respaldo (cada 3 h). El disparo principal lo hace cron-job.org llamando a la API de GitHub.

### 3.1 Token de GitHub solo para esto

GitHub → tu foto → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:

- **Repository access:** *Only select repositories* → `aire-aviles`
- **Permissions → Repository permissions → Actions:** *Read and write*
- Nada más. Cópialo.

### 3.2 Tarea en cron-job.org

Crea una cuenta en https://cron-job.org → **Create cronjob**:

- **URL:** `https://api.github.com/repos/TUUSUARIO/aire-aviles/actions/workflows/ingest.yml/dispatches`
- **Schedule:** cada hora, en el minuto 10
- **Advanced → Request method:** `POST`
- **Advanced → Headers:**
  - `Authorization: Bearer TU_TOKEN_DE_GITHUB`
  - `Accept: application/vnd.github+json`
  - `X-GitHub-Api-Version: 2022-11-28`
- **Advanced → Request body:** `{"ref":"main"}`

Pulsa **Test run**: la respuesta correcta es **204** y en GitHub → Actions aparece una ejecución nueva.

---

## 4. Cloudflare Workers (bot)

1. Crea una cuenta en https://dash.cloudflare.com (plan Free).
2. Genera un secreto aleatorio para el webhook:

   ```bat
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

   Añádelo a tu `.env` como `WEBHOOK_SECRET=...` (lo usa el paso 5).

3. Inicia sesión y guarda los secretos en Cloudflare (te pedirá cada valor):

   ```bat
   cd apps\bot
   npx wrangler login
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put DATABASE_AUTH_TOKEN
   npx wrangler secret put WEBHOOK_SECRET
   cd ..\..
   ```

   La primera vez, `wrangler` puede preguntarte si quieres crear el Worker: responde que sí.

4. Despliega:

   ```bat
   npm run deploy -w @aviles/bot
   ```

   Al final muestra la URL, del tipo `https://aire-aviles-bot.TUSUBDOMINIO.workers.dev`. Si la abres en el navegador debe decir «Aire Avilés · bot de Telegram».

5. Conecta Telegram con el Worker:

   ```bat
   npm run set-webhook -w @aviles/bot -- https://aire-aviles-bot.TUSUBDOMINIO.workers.dev
   ```

   Debe decir `Webhook configurado: .../telegram` y sin errores.

6. Prueba `/ahora` en Telegram **con tu PC sin el bot arrancado**.

Para ver los logs del Worker en directo: `npm run logs -w @aviles/bot`.

---

## Desarrollo después del despliegue

- Tu `.env` sigue apuntando a `data/aviles.db`: desarrollar en local no toca producción.
- **Ojo con `npm run dev:bot`:** un bot no puede usar webhook y long polling a la vez. Al arrancarlo en local se quita el webhook y el bot de producción deja de responder. Cuando termines, vuelve a ejecutar `npm run set-webhook ...` (paso 4.5).
- Para desplegar cambios del bot: `npm run deploy -w @aviles/bot`.
- La ingesta usa siempre el código de la rama `main`: basta con hacer `git push`.

## Límites de los planes gratuitos

| Servicio | Límite | Uso estimado |
|---|---|---|
| Turso | 500 M filas leídas y 10 M escritas al mes, 5 GB | Una fracción pequeña |
| GitHub Actions | Ilimitado en repos públicos | ~720 ejecuciones al mes |
| Cloudflare Workers | 100.000 peticiones al día, 10 ms de CPU por petición | Cada mensaje del bot es 1 petición |
| cron-job.org | Gratis | 1 tarea |
