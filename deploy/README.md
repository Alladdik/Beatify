# Деплой Beatify на VPS

Усе працює через Docker: PostgreSQL + .NET сервер (з ffmpeg і yt-dlp всередині) + зібраний React-клієнт. Nginx на VPS проксіює трафік і дає HTTPS.

## Що в папці

| Файл | Призначення |
|---|---|
| `Dockerfile` | Збірка образу: клієнт (Vite) + сервер (.NET 10) + ffmpeg + yt-dlp |
| `docker-compose.yml` | PostgreSQL + застосунок, томи для БД і завантажених треків |
| `.env.example` | Шаблон секретів → скопіюй у `deploy/.env` |
| `deploy.sh` | **Перший запуск на VPS** (ставить Docker, генерує секрети, запускає) |
| `update.sh` | **Оновлення на VPS** (перезбірка + перезапуск) |
| `upload.ps1` | **Завантаження коду з Windows на VPS** одною командою |
| `nginx.conf` | Приклад конфігу nginx (reverse proxy + WebSocket для SignalR) |

## Перший деплой

```powershell
# 1. На Windows — завантаж код на VPS (без оновлення, бо ще нема .env):
.\deploy\upload.ps1 -Server root@ТВІЙ_IP -SkipUpdate
```

```bash
# 2. На VPS — перший запуск (Docker + секрети + старт):
ssh root@ТВІЙ_IP
cd /opt/beatify
bash deploy/deploy.sh
# Сайт доступний на http://ТВІЙ_IP:5000
```

```bash
# 3. (Опційно) nginx + домен + HTTPS:
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/beatify   # заміни server_name!
sudo ln -s /etc/nginx/sites-available/beatify /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

## Оновлення (кожен наступний раз)

Одна команда з Windows — пакує код, заливає, перезбирає і перезапускає:

```powershell
.\deploy\upload.ps1 -Server root@ТВІЙ_IP
```

Або вручну на VPS:

```bash
cd /opt/beatify && bash deploy/update.sh
```

## Корисні команди на VPS

```bash
cd /opt/beatify

# Логи сервера (живі)
docker compose -f deploy/docker-compose.yml logs -f app

# Статус контейнерів
docker compose -f deploy/docker-compose.yml ps

# Перезапуск без перезбірки
docker compose -f deploy/docker-compose.yml restart app

# Повна зупинка / запуск
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

# Бекап бази даних
docker compose -f deploy/docker-compose.yml exec db pg_dump -U beatify beatify > backup_$(date +%F).sql

# Бекап завантажених треків (том uploads)
docker run --rm -v beatify_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
```

## Дані

- **База даних** — Docker-том `beatify_pgdata` (переживає перезбірки й оновлення)
- **Треки/обкладинки** — Docker-том `beatify_uploads`
- **Секрети** — `deploy/.env` (не комітиться в git, генерується `deploy.sh`)
