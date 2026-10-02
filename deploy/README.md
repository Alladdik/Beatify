# Деплой Beatify на VPS

Усе працює через Docker: PostgreSQL + .NET сервер (з ffmpeg і yt-dlp всередині) + зібраний React-клієнт в одному образі. Для HTTPS є готовий Caddy (сертифікати Let's Encrypt випускаються й оновлюються самі) або приклад конфігу nginx.

> **Простіший шлях:** папка `vps-deploy/` у корені репозиторію ставить усе одним `install.sh` і сама тягне оновлення з GitHub — див. `vps-deploy/README.md`. Нижче — ручний варіант із завантаженням коду з Windows.

## Що в папці

| Файл | Призначення |
|---|---|
| `Dockerfile` | Збірка образу: клієнт (Vite) → сервер (.NET 10) → ffmpeg + yt-dlp. Є `HEALTHCHECK` на `/healthz` |
| `docker-compose.yml` | PostgreSQL + застосунок (+ Caddy за профілем `https`), томи для БД, треків і проєктів Студії |
| `Caddyfile` | HTTPS, HTTP/3, стиснення; не буферизує стрімінг аудіо й WebSocket (SignalR) |
| `.env.example` | Шаблон налаштувань → копіюється в `deploy/.env` |
| `deploy.sh` | **Перший запуск на VPS**: ставить Docker, генерує секрети, запускає (за потреби з доменом) |
| `update.sh` | **Оновлення на VPS**: перезбірка й перезапуск |
| `upload.ps1` | **Завантаження коду з Windows на VPS** однією командою |
| `nginx.conf` | Альтернатива Caddy: reverse proxy + WebSocket для nginx |

## Перший деплой

Потрібен VPS з Ubuntu/Debian (від 2 ГБ RAM для першої збірки), доступ по SSH. Для HTTPS — домен з A-записом на IP сервера й відкриті порти 80 та 443.

```powershell
# 1. З Windows: завантажити код на VPS (без запуску, бо ще немає .env)
.\deploy\upload.ps1 -Server root@ТВІЙ_IP -SkipUpdate
```

```bash
# 2. На VPS: перший запуск
ssh root@ТВІЙ_IP
cd /opt/beatify

bash deploy/deploy.sh                    # без домену → http://ТВІЙ_IP:5000
bash deploy/deploy.sh music.example.com  # з доменом → https://music.example.com
```

> **Зареєструйтесь першим.** Перший акаунт на сервері автоматично стає адміністратором (він додає музику, імпортує зі Spotify/YouTube/SoundCloud). Потім за бажанням закрийте реєстрацію: `ALLOW_REGISTRATION=false` у `deploy/.env` і `bash deploy/update.sh`. Екран входу сам сховає «Створити акаунт».

## Оновлення (кожен наступний раз)

Одна команда з Windows пакує код, заливає, перезбирає й перезапускає:

```powershell
.\deploy\upload.ps1 -Server root@ТВІЙ_IP
```

Або вручну на VPS: `cd /opt/beatify && bash deploy/update.sh`. Дані (база, треки, проєкти) лежать у томах і переживають оновлення. Міграції бази застосовуються самі під час старту.

## Налаштування (`deploy/.env`)

| Змінна | Що робить |
|---|---|
| `POSTGRES_PASSWORD`, `JWT_KEY` | Секрети; `deploy.sh` генерує їх випадково один раз |
| `APP_PORT`, `APP_BIND` | Порт і інтерфейс прямого доступу (з доменом `deploy.sh` ставить `127.0.0.1`, щоб назовні дивився лише Caddy) |
| `DOMAIN`, `COMPOSE_PROFILES=https` | Домен і вмикання Caddy |
| `ALLOW_REGISTRATION` | `false` — закрита реєстрація |
| `CORS_ORIGINS` | Для мобільного/десктопного застосунку, що підключається до цього сервера (через кому). Порожньо — усі |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Необов'язково: ключі для імпорту Spotify |

Після зміни `.env`: `bash deploy/update.sh`.

## Корисні команди

```bash
cd /opt/beatify
C="docker compose -f deploy/docker-compose.yml"

$C logs -f app                 # живі логи сервера
$C ps                          # статус і healthcheck
$C restart app                 # перезапуск без перезбірки
$C down                        # зупинити (дані лишаються)
curl -fsS localhost:5000/healthz

# Бекап бази
$C exec db pg_dump -U beatify beatify > backup_$(date +%F).sql
# Відновлення
$C exec -T db psql -U beatify beatify < backup_2026-01-01.sql

# Бекап завантажених треків і проєктів Студії
docker run --rm -v beatify_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
docker run --rm -v beatify_studio:/data  -v $(pwd):/backup alpine tar czf /backup/studio_$(date +%F).tar.gz  -C /data .
```

## Дані й томи

| Том | Вміст |
|---|---|
| `beatify_pgdata` | PostgreSQL |
| `beatify_uploads` | треки, обкладинки, аватари |
| `beatify_studio` | проєкти Студії (JSON, по папці на користувача) |
| `beatify_caddy_data` | сертифікати HTTPS |

## nginx замість Caddy

Якщо на сервері вже стоїть nginx: залиште `COMPOSE_PROFILES` порожнім, візьміть `nginx.conf` (замініть `server_name`), потім `sudo certbot --nginx -d your-domain.com`. Сервер довіряє заголовкам `X-Forwarded-*`, тож реальні IP й `https` визначаються правильно.

## Якщо щось не так

- **Сайт не відкривається з домену** — перевірте A-запис, відкриті порти 80/443 і `$C logs caddy`.
- **Імпорт з YouTube/SoundCloud не працює** — оновіть образ (`bash deploy/update.sh`): під час збірки підтягується свіжий yt-dlp.
- **Контейнер `app` перезапускається** — `$C logs app`: найчастіше це `Jwt__Key` коротший за 32 символи або недоступна база.
