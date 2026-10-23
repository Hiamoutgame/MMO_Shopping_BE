# Gắn tên miền vào MMO Shopping trên VPS

Hướng dẫn này gắn **một tên miền** vào dự án đang chạy bằng Docker Compose:

```
Internet
   │  https://mmo-shopping.vn
   ▼
 Nginx (VPS, cổng 80/443 + TLS)
   ├── /            → file tĩnh của FE (React + Vite, thư mục dist/)
   └── /api/…       → reverse proxy → 127.0.0.1:3000 (container NestJS)
                                         │
                                         └── PostgreSQL (container "db", chỉ nội bộ)
```

Vì FE đã gọi API bằng đường dẫn tương đối (`VITE_API_BASE_URL=/api/v1` trong
`MMO_Shopping_FE/.env`, mặc định trong `src/common/apis/httpClient.ts`), chỉ cần
**một tên miền** là đủ. Khi đó trình duyệt gọi cùng origin nên không phát sinh CORS.
Chỉ cần subdomain riêng cho API nếu sau này có app mobile / bên thứ ba gọi API
(xem [Phương án 2](#phương-án-2-tách-subdomain-cho-api)).

---

## 0. Chuẩn bị trước khi bắt đầu

| Cần có | Ghi chú |
| --- | --- |
| VPS Ubuntu 22.04/24.04 | 2 GB RAM trở lên; đã SSH được bằng key |
| Tên miền đã mua | ví dụ `mmo-shopping.vn` |
| Quyền sửa DNS | bản ghi A trỏ về IP VPS |
| IP công khai của VPS | `curl -4 ifconfig.me` |

Quy ước trong tài liệu: tên miền `mmo-shopping.vn`, IPv4 `203.0.113.10`.
Thay bằng giá trị thật của bạn.

---

## 1. Trỏ DNS về VPS (làm trước tiên)

Tại trang quản trị DNS của nhà cung cấp tên miền, thêm:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `203.0.113.10` | 300 |
| A | `www` | `203.0.113.10` | 300 |

- TTL để 300 (5 phút) lúc mới thiết lập để đổi lại nhanh.
- Nếu tài khoản đã có bản ghi A/AAAA cũ cho `@` hoặc `www` thì sửa, đừng thêm trùng.
- Chỉ thêm AAAA nếu VPS thật sự có IPv6 và đã mở firewall IPv6.

Kiểm tra (đợi vài phút, chạy lặp lại đến khi ra đúng IP):

```bash
dig +short mmo-shopping.vn
dig +short www.mmo-shopping.vn
```

> DNS chưa trỏ đúng thì bước xin chứng chỉ TLS ở mục 6 sẽ thất bại.

---

## 2. Chuẩn bị VPS

### 2.1. Tạo user thường + khóa SSH (nếu chưa có)

```bash
# chạy bằng root
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
# từ máy local, kiểm tra đăng nhập được rồi mới siết SSH:
#   ssh deploy@203.0.113.10
```

### 2.2. Firewall (chỉ mở 22/80/443)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# (sau khi cài Nginx có thể dùng: sudo ufw allow 'Nginx Full')
sudo ufw enable
sudo ufw status
```

Không mở ra Internet các cổng `3000` (app), `5432` (PostgreSQL), `8080` (Adminer).
Nginx trên cùng máy vẫn gọi được `127.0.0.1:3000` vì lưu lượng loopback không bị
ufw chặn.

### 2.3. Cài Docker + Docker Compose v2

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# logout/login lại để nhận group docker
docker compose version
```

---

## 3. Deploy backend (Docker Compose)

```bash
sudo mkdir -p /opt/mmo-shopping
sudo chown deploy:deploy /opt/mmo-shopping
```

Đưa source backend lên VPS. Cách gọn nhất nếu repo private là dùng Git + deploy key:

```bash
cd /opt/mmo-shopping
git clone git@github.com:<org>/<repo>.git .
# hoặc chỉ copy thư mục MMO_Shopping_BE lên rồi cd vào đó
cd MMO_Shopping_BE
```

Tạo file cấu hình production:

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 32   # chạy 4 lần, mỗi lần cho một secret bên dưới
nano .env
```

Các biến **bắt buộc sửa**:

```dotenv
POSTGRES_PASSWORD=<mật khẩu mạnh>
JWT_SECRET=<openssl rand -hex 32>
INVENTORY_ENCRYPTION_KEY=<openssl rand -hex 32>
PAYMENT_CALLBACK_SECRET=<openssl rand -hex 32>
INTEGRATION_ENCRYPTION_KEY=<openssl rand -hex 32>

# Tên miền frontend — dùng cho CORS nếu sau này FE gọi URL tuyệt đối
CORS_ORIGIN=https://mmo-shopping.vn

# Production nên tắt Swagger (hoặc đặt SWAGGER_PATH khó đoán + bảo vệ)
SWAGGER_ENABLED=false

APP_PORT=3000
RUN_MIGRATIONS=true
```

> `.env` do compose tự đọc để nội suy biến và được truyền vào container; file này
> đã nằm trong `.gitignore`. Không commit, không copy đè khi deploy lại.

Chạy stack:

```bash
cd /opt/mmo-shopping/MMO_Shopping_BE
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
docker compose logs -f app
```

Kiểm tra trước khi qua Nginx:

```bash
curl --fail http://127.0.0.1:3000/api
curl --fail http://127.0.0.1:3000/api/v1/products
```

Nếu `docker compose ps` báo app `unhealthy`, xem logs: thường do migration lỗi
hoặc thiếu biến trong `.env`.

> Tùy chọn tăng bảo mật: trong `docker-compose.yml`, đổi cổng app thành
> `'127.0.0.1:${APP_PORT:-3000}:3000'` để container chỉ nghe trên loopback, không
> lộ cổng 3000 kể cả khi firewall bị cấu hình sai.

---

## 4. Build frontend và copy lên web root

FE là SPA tĩnh, build xong chỉ cần copy `dist/` lên VPS. Build trên máy local
nhanh hơn, nhưng build trên VPS thì tái lập được dễ hơn.

```bash
# FE nằm cùng repo với BE: /opt/mmo-shopping/MMO_Shopping_FE
# Nếu là repo riêng thì clone/scp vào đây trước.
cd /opt/mmo-shopping/MMO_Shopping_FE
npm ci
cat > .env.production <<'EOF'
VITE_API_BASE_URL=/api/v1
EOF
npm run build          # tsc -b && vite build -> ./dist
```

Copy sang thư mục web root của Nginx:

```bash
sudo mkdir -p /var/www/mmo-shopping /var/www/certbot
sudo rsync -a --delete dist/ /var/www/mmo-shopping/
sudo chown -R www-data:www-data /var/www/mmo-shopping
```

Lưu ý:

- Dùng Node 22 LTS để build (Vite 8 cần Node >= 20.19/22.12). Kiểm tra: `node -v`.
- `VITE_API_BASE_URL` phải là **đường dẫn tương đối** `/api/v1` ở production.
  Nếu đặt `http://localhost:3000/api/v1` thì trình duyệt của người dùng sẽ gọi
  vào máy họ và hỏng. Biến Vite được nhúng lúc **build**, nên đổi biến phải build lại.
- Không dùng `cp -r dist/*` khi thư mục đích còn file cũ — dùng `rsync --delete`.
- `/var/www/certbot` dùng cho ACME challenge nếu chọn cách xin cert bằng webroot.

---

## 5. Cấu hình Nginx

```bash
sudo apt update && sudo apt install -y nginx
```

Copy file cấu hình mẫu trong repo backend (thư mục `deploy/nginx/` nằm ở gốc
`MMO_Shopping_BE`):

```bash
cd /opt/mmo-shopping/MMO_Shopping_BE
sudo cp deploy/nginx/mmo-shopping.http.conf /etc/nginx/sites-available/mmo-shopping.conf
sudo ln -sfn /etc/nginx/sites-available/mmo-shopping.conf /etc/nginx/sites-enabled/mmo-shopping.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

Mở file và thay `mmo-shopping.vn` bằng tên miền thật (cả `server_name`):

```bash
sudo nano /etc/nginx/sites-available/mmo-shopping.conf
sudo nginx -t && sudo systemctl reload nginx
```

Kiểm tra HTTP trước khi bật HTTPS:

```bash
curl -I http://mmo-shopping.vn
curl -s http://mmo-shopping.vn/api/v1/products | head -c 300
```

Nếu 502 → backend chưa chạy hoặc sai cổng. Nếu 404 ở `/api/...` → sai
`proxy_pass`/prefix. Nếu trang trắng → sai web root hoặc bản build.

---

## 6. Bật HTTPS (Let's Encrypt)

### Cách A — Certbot tự sửa cấu hình Nginx (khuyến nghị)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mmo-shopping.vn -d www.mmo-shopping.vn
```

Certbot sẽ tự thêm khối `listen 443 ssl`, chứng chỉ và redirect HTTP → HTTPS.
Chọn "Redirect" khi được hỏi.

### Cách B — Xin cert bằng webroot rồi dùng cấu hình đầy đủ trong repo

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d mmo-shopping.vn -d www.mmo-shopping.vn --email ban@example.com --agree-tos
cd /opt/mmo-shopping/MMO_Shopping_BE
sudo cp deploy/nginx/mmo-shopping.conf /etc/nginx/sites-available/mmo-shopping.conf
sudo nginx -t && sudo systemctl reload nginx
```

(File `deploy/nginx/mmo-shopping.conf` đã bao gồm redirect, TLS, cache static và
proxy `/api/`; nhớ thay tên miền trong `server_name` và đường dẫn cert. HSTS đang
được comment sẵn — chỉ bật sau khi `certbot renew --dry-run` chạy OK.)

### Kiểm tra và gia hạn

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot   # timer tự gia hạn 2 lần/ngày
curl -I https://mmo-shopping.vn
```

### Nếu dùng Cloudflare

- Bật proxy (đám mây cam) **sau khi** đã xin được cert, hoặc đặt SSL/TLS mode là
  **Full (strict)** và dùng Cloudflare Origin Certificate thay Let's Encrypt.
- Đừng để mode "Flexible": Nginx vẫn phục vụ HTTP, dễ lặp redirect và mất bảo mật.
- Khi đang xin cert bằng HTTP-01, tạm để DNS only (xám) cho chắc.

---

## 7. Chốt cấu hình backend theo tên miền

Sau khi có HTTPS, đảm bảo `.env` backend đúng:

```dotenv
CORS_ORIGIN=https://mmo-shopping.vn
```

Nếu FE và API cùng domain (mặc định), CORS gần như không dùng tới, nhưng vẫn nên
đặt đúng để tránh mở `*` trong production. Áp dụng thay đổi:

```bash
cd /opt/mmo-shopping/MMO_Shopping_BE
docker compose up -d          # recreate container với .env mới
docker compose logs --tail=100 app
```

Kiểm tra CORS (chỉ cần khi FE gọi domain khác):

```bash
curl -i -H 'Origin: https://mmo-shopping.vn' https://mmo-shopping.vn/api/v1/products | grep -i access-control
```

---

## 8. Checklist nghiệm thu

```bash
# 1. DNS
dig +short mmo-shopping.vn

# 2. TLS hợp lệ, redirect đúng
curl -I http://mmo-shopping.vn          # 301 -> https
curl -I https://mmo-shopping.vn         # 200, certificate OK

# 3. API sống sau proxy
curl -s https://mmo-shopping.vn/api/v1/products | head -c 300
curl -s -o /dev/null -w '%{http_code}\n' https://mmo-shopping.vn/api

# 4. SPA route sâu vẫn trả index.html (không 404)
curl -s -o /dev/null -w '%{http_code}\n' https://mmo-shopping.vn/login

# 5. Static asset có cache header
curl -I https://mmo-shopping.vn/assets/<file>.js | grep -i cache-control

# 6. Container
cd /opt/mmo-shopping/MMO_Shopping_BE && docker compose ps
```

Mở trình duyệt: đăng nhập, mở DevTools → Network, xác nhận request API đi tới
`https://mmo-shopping.vn/api/v1/...` và trả 200.

---

## 9. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `502 Bad Gateway` | Container app chết / sai cổng upstream | `docker compose ps`, `docker compose logs app`; kiểm tra `proxy_pass 127.0.0.1:3000` |
| `504 Gateway Timeout` | Query DB chậm, migration treo | Xem log app + `docker compose logs db`; tăng `proxy_read_timeout` |
| Trang trắng, `index.html` tải được | Asset 404 do build cũ/thiếu file | Build lại, `rsync -a --delete`, hard-refresh |
| `/api/...` trả 404 | Thiếu dấu `/` hoặc sai location | Dùng `location /api/` + `proxy_pass http://127.0.0.1:3000` (không có `/` cuối) |
| Lỗi CORS | `CORS_ORIGIN` chưa đúng domain hoặc FE gọi URL tuyệt đối | Sửa `.env`, `docker compose up -d`, build lại FE với `/api/v1` |
| Certbot báo `challenge failed` | DNS chưa trỏ đúng, cổng 80 bị chặn, Cloudflare proxy | `dig`, `ufw status`, tạm DNS only |
| `mixed content` | FE build với `http://…` | Build lại FE với `VITE_API_BASE_URL=/api/v1` |
| 502 sau khi reboot | Container không tự chạy | Compose đã đặt `restart: unless-stopped`; kiểm tra `systemctl status docker` |
| 401 với token cũ | Secret JWT đổi khi deploy | Đăng nhập lại (hành vi đúng) |

Xem log nhanh:

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
cd /opt/mmo-shopping/MMO_Shopping_BE && docker compose logs -f --tail=200 app
```

---

## 10. Vận hành sau khi có tên miền

```bash
# Cập nhật code backend
cd /opt/mmo-shopping/MMO_Shopping_BE
git pull
docker compose up -d --build --wait

# Cập nhật frontend
cd /opt/mmo-shopping/MMO_Shopping_FE
git pull && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/mmo-shopping/

# Backup database (nên đặt cron hằng ngày)
cd /opt/mmo-shopping/MMO_Shopping_BE
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > backup-$(date +%F).sql.gz
```

Repo đã có sẵn CD qua SSH (`.github/workflows/cd.yml`, mô tả trong
[`DOCKER.md`](DOCKER.md)): điền các secret
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`,
`DEPLOY_PATH` là có thể deploy backend tự động. Workflow này **chỉ deploy
backend**, frontend vẫn phải build + rsync như trên. Tên miền không ảnh hưởng
tới CD, chỉ ảnh hưởng `CORS_ORIGIN` và `server_name`.

---

## Phương án 2: tách subdomain cho API

Dùng khi cần app mobile / tích hợp bên ngoài gọi API trực tiếp.

DNS thêm:

| Type | Name | Value |
| --- | --- | --- |
| A | `app` | `203.0.113.10` |
| A | `api` | `203.0.113.10` |

- `app.mmo-shopping.vn`: như mục 5 nhưng **bỏ** `location /api/`.
- `api.mmo-shopping.vn`: server block riêng proxy toàn bộ `/` về backend.
- Build FE với `VITE_API_BASE_URL=https://api.mmo-shopping.vn/api/v1`.
- Bắt buộc đặt `CORS_ORIGIN=https://app.mmo-shopping.vn` trong `.env` backend.
- Xin cert riêng cho từng tên: `sudo certbot --nginx -d app.mmo-shopping.vn -d api.mmo-shopping.vn`.

Vì `main.ts` dùng `enableCors({ origin: process.env.CORS_ORIGIN })`, chỉ đặt được
**một** origin. Nếu cần nhiều origin, phải sửa code (danh sách tách bằng dấu phẩy)
hoặc giữ nguyên mô hình một domain như mục 5.

---

## Phương án 3: Cloudflare Tunnel (không cần mở cổng 80/443)

Phù hợp khi VPS không có IP công khai, bị NAT, hoặc muốn Cloudflare lo TLS/WAF.
Nginx vẫn chạy cục bộ như mục 5 (cổng 80), còn Cloudflare Tunnel nối vào nó.

```bash
# 1. Cài cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o /tmp/cloudflared.deb && sudo dpkg -i /tmp/cloudflared.deb

# 2. Đăng nhập và tạo tunnel (làm theo link hiện ra)
cloudflared tunnel login
cloudflared tunnel create mmo-shopping

# 3. Trỏ DNS về tunnel (Cloudflare tự tạo bản ghi CNAME)
cloudflared tunnel route dns mmo-shopping mmo-shopping.vn

# 4. Cấu hình ingress: ~/.cloudflared/config.yml
#    tunnel: <TUNNEL_ID>
#    credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
#    ingress:
#      - hostname: mmo-shopping.vn
#        service: http://127.0.0.1:80
#      - service: http_status:404

# 5. Chạy dưới dạng service (config phải nằm ở /etc/cloudflared/)
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Khi dùng cách này: bỏ qua bước certbot (mục 6), **không cần** mở 80/443 trên ufw,
và trong Cloudflare đặt SSL/TLS mode = **Full** (Nginx phục vụ HTTP ở cổng 80).
Lưu ý `CORS_ORIGIN` vẫn là `https://mmo-shopping.vn` vì trình duyệt thấy HTTPS.

---

## Tóm tắt trình tự

1. Trỏ DNS (`@`, `www`) về IP VPS, chờ propagate.
2. VPS: user, ufw (22/80/443), Docker.
3. Backend: `.env` từ `.env.production.example` + secrets thật → `docker compose up -d --build`.
4. Frontend: build với `VITE_API_BASE_URL=/api/v1` → `/var/www/mmo-shopping`.
5. Nginx: `deploy/nginx/mmo-shopping.http.conf` → `nginx -t` → reload.
6. `certbot --nginx -d mmo-shopping.vn -d www.mmo-shopping.vn` → HTTPS.
7. `CORS_ORIGIN=https://mmo-shopping.vn` → `docker compose up -d`.
8. Chạy checklist mục 8.
