# Docker và CI/CD — MMO Shopping Backend

## Chạy local

Cần Docker Engine và Docker Compose v2 có hỗ trợ `up --wait`.
Chạy các lệnh trong thư mục `MMO_Shopping_BE`. Nếu đã có `.env`, giữ lại
và bổ sung những biến còn thiếu từ file mẫu.

```bash
# Chỉ copy khi chưa có .env
cp .env.example .env
# Backend hot reload + PostgreSQL
docker compose -f docker-compose.dev.yml up -d --build
# Log
docker compose -f docker-compose.dev.yml logs -f app
```

Stack chạy image production (chỉ có dependencies runtime):

```bash
docker compose up -d --build --wait --wait-timeout 180
curl --fail http://localhost:3000/api
curl --fail http://localhost:3000/api/v1/products
# Swagger: http://localhost:3000/api/docs
docker compose logs -f app
docker compose down
```

Hai stack dùng volume database khác nhau nhưng mặc định cùng cổng.
Dừng stack đang chạy trước khi chuyển, hoặc đổi `APP_PORT` / `POSTGRES_PORT`.
PostgreSQL và Adminer chỉ mở cổng trên `127.0.0.1`.
Chạy Adminer: `docker compose --profile tools up -d adminer`, mở
http://localhost:8080. Không dùng `down --volumes` nếu cần giữ dữ liệu.

Compose đọc `.env` để nội suy biến; app nhận cấu hình qua `environment`.
Compose dùng `POSTGRES_*` và luôn kết nối service `db`, không dùng DATABASE_URL
trong `.env`. Chạy Node trực tiếp dùng `DB_*` hoặc `DATABASE_URL`.

## Image và migration

Dockerfile có các stage `dev-deps`, `build`, `prod-deps`, `development`, `runtime`.
Image runtime chạy dưới user `node`, dùng `tini` và kiểm tra HTTP `/api`.
`.dockerignore` loại secrets, dependencies local, tests và build output.
`dotenv` là production dependency vì data source và script seed cần nó.

`RUN_MIGRATIONS=true` chạy migration trước khi start, lỗi migration làm container
thoát. Production dùng `dist/database/data-source.js`; dev dùng ts-node.
Không bật migration đồng thời trên nhiều replica. Khi mở rộng hệ thống, chạy
migration bằng một job riêng trước rollout và đặt `RUN_MIGRATIONS=false` trên app.

```bash
docker compose exec app npm run typeorm:migration:show:prod
docker compose exec app npm run typeorm:migration:run:prod
# Đặt SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME trong .env,
# rồi chạy up -d để container nhận biến mới:
docker compose exec app npm run seed:admin
```

`RUN_SEED_ADMIN=true` cho phép seed ở entrypoint. Chỉ bật khi cần: script seed
cập nhật lại mật khẩu của admin đã tồn tại. Mặc định là `false`.
Script seed hỗ trợ cả `DATABASE_URL` và `DB_*`.

## CI và Playwright

- `ci.yml`: push, pull request, chạy tay hoặc gọi từ CD. Lint, unit tests (coverage), build; sau đó build Docker, kiểm tra Compose, khởi động PostgreSQL mới,
  chạy migration và kiểm tra API, dependency migration, user runtime.
- `playwright.yml`: push/PR vào `main` hoặc `master`, gọi `e2e.yml`.
- `e2e.yml`: reusable và chạy tay; PostgreSQL tạm, migration, seed admin,
  seed CHUNG SUC rồi Playwright API tests. Không tải trình duyệt vì tests dùng HTTP.
- `dependabot.yml`: cập nhật npm, Actions và Docker hằng tuần.

CI dọn volume database tạm sau khi kiểm tra. E2E tự động không cần secrets
hay truy cập database thật. Chạy E2E local cần cấu hình `.env.test` đầy đủ,
bao gồm tài khoản `SEED_ADMIN_*`, và một database dành riêng cho test.

## CD: GHCR và VPS

`cd.yml` chạy khi push `main`, tag `v*.*.*` hoặc chạy tay. Job `verify` gọi
CI; job `verify-e2e` gọi Playwright. Cả hai phải thành công trước khi publish. GHCR nhận tags branch, version, SHA;
VPS deploy image theo digest bất biến. Các lần CD được xếp tuần tự.
Chạy tay trên branch khác có thể deploy VPS nếu đã cấu hình secrets.

Chuẩn bị VPS: Docker Compose v2, thư mục deploy tồn tại, file `.env` từ
`.env.production.example` với secrets thật. Sinh khóa bằng `openssl rand -hex 32`.
Không copy đè `.env` hiện có. Nếu GHCR private, đăng nhập một lần trên VPS
bằng token có quyền `read:packages`, dưới cùng user SSH:

```bash
docker login ghcr.io
```

Thiết lập GitHub environment `production` và secrets:

| Secret | Giá trị |
| --- | --- |
| `DEPLOY_HOST` | Hostname hoặc IPv4 của VPS |
| `DEPLOY_USER` | User SSH có quyền chạy Docker |
| `DEPLOY_SSH_KEY` | Private key dành riêng cho deploy |
| `DEPLOY_KNOWN_HOSTS` | Dòng known_hosts đã xác minh cho VPS |
| `DEPLOY_PATH` | Đường dẫn tuyệt đối đã tạo, ví dụ `/opt/mmo-shopping` (không có khoảng trắng) |

Workflow skip SSH khi không có cấu hình; nếu chỉ cấu hình một phần thì fail.
Workflow copy đúng Compose của release lên VPS, pull app/db, chạy
`up --no-build --wait` và fail nếu app không healthy. Không tự rollback database;
lỗi migration cần được kiểm tra qua logs trước khi xử lý. `.env` và quyền đọc
GHCR được quản lý trên VPS.

Gắn tên miền, cấu hình Nginx và HTTPS cho VPS: xem [VPS_DOMAIN.md](VPS_DOMAIN.md).

Compose mặc định có secrets local để tiện chạy thử. Khi deploy thật phải thay
`POSTGRES_PASSWORD`, `JWT_SECRET`, các encryption keys và callback secret,
đặt `CORS_ORIGIN` đúng frontend và cấu hình reverse proxy/TLS cho cổng app.
Không cần mở cổng PostgreSQL ra Internet.

## Render (tùy chọn)

`render.yaml` tạo service Docker từ source và PostgreSQL. Blueprint đặt
`autoDeployTrigger: off` để lần deploy tiếp theo đi qua kiểm tra CD.
Lần tạo service/Blueprint đầu tiên được Render xử lý riêng.
Điền những biến `sync: false` trong Dashboard.

Đặt secret `RENDER_DEPLOY_HOOK_URL` trong environment `production`.
CD chỉ gọi Render khi ref là `main`, truyền `ref=<SHA đã kiểm tra>`.
Render build Dockerfile từ source của commit đó; nó không kéo image GHCR.
Job này xác nhận yêu cầu deploy được nhận, không chờ Render deploy hoàn tất.
Kiểm tra trạng thái và logs trong Render Dashboard.
Nếu service đã tồn tại, tắt auto deploy trong Dashboard để tránh deploy trước CI.

App và migration chỉ bật tùy chọn SSL khi `DB_SSL=true`; với database bên ngoài,
đặt biến này theo yêu cầu của nhà cung cấp. Render inject PORT ở runtime.

Tham khảo chính thức:
[Render deploy hooks](https://render.com/docs/deploy-hooks),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
