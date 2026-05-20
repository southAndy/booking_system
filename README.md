# Booking Service

NestJS + TypeORM + PostgreSQL 預訂服務後端。

核心特性：
- PostgreSQL `tstzrange` + GiST `EXCLUDE` 約束在 DB 層阻擋時段重疊（雙保險：service 友善訊息 + DB 兜底）
- JWT (access + refresh) 雙 token 認證
- `@Public()` 標記免登入端點，搭配全域 `JwtAuthGuard` 達到 secure-by-default
- `Idempotency-Key` header 防止重複下單（Stripe 慣例）
- zod 驗證 `.env`（fail fast + 型別推導）
- 統一回應 / 錯誤格式、Swagger、Pino logger、Helmet、Throttler

---



## 資料表設計

```Mermaid

erDiagram
    Users ||--o{ Tokens : "has"
    Users ||--o{ Bookings : "places"
    Users ||--o{ Email_verifications : "requests"
    Bookings ||--|{ Booking_items : "contains"
    Courts ||--o{ Court_slots : "provides"
    Court_slots ||--o| Booking_items : "booked as"

    Users {
        string user_id PK
        string name
        string email UK
        string password_hash
        datetime email_verified_at
        string password_reset_token_hash
        datetime password_reset_expires_at
        datetime password_reset_used_at
        datetime created_at
        datetime updated_at
    }

    Tokens {
        string session_id PK
        string user_id FK
        string refresh_token_hash
        string device_info
        datetime expires_at
        boolean revoked
        datetime created_at
        datetime last_used_at
    }

    Email_verifications {
        string verification_id PK
        string user_id FK
        string code_hash
        datetime expires_at
        datetime used_at
        datetime created_at
    }

    Courts {
        string place_id PK
        string name
        string description
    }

    Court_slots {
        string slot_id PK
        string place_id FK
        datetime start_time
        datetime end_time
        string status
    }

    Bookings {
        string booking_id PK
        string user_id FK
        string status
        datetime created_at
        datetime updated_at
    }

    Booking_items {
        string item_id PK
        string booking_id FK
        string slot_id FK
    }
```


## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動 PostgreSQL（macOS Homebrew）

```bash
brew install postgresql@16
brew services start postgresql@16
createdb booking_service
```

### 3. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env，填入 DB_PASSWORD、JWT_ACCESS_SECRET、JWT_REFRESH_SECRET
# secret 至少 32 字元，可用：openssl rand -base64 48
```

### 4. 跑 migration（建表 + GiST 排他約束）

```bash
npm run migration:run
```

驗證：
```bash
psql booking_service -c "\d bookings"
# 應看到 EXCLUDE USING gist 約束 "no_overlap"
```

### 5. 啟動 dev server

```bash
npm run start:dev
```

開啟 [http://localhost:3000/api/docs](http://localhost:3000/api/docs) 查看 Swagger。

---

## 端點總覽

### Auth（公開或 refresh-token）
| Method | Path | 說明 |
|---|---|---|
| POST | `/auth/register` | 註冊 |
| POST | `/auth/login` | 登入（throttled 5/min） |
| POST | `/auth/refresh` | refresh token 換新 access token（Bearer 帶 refresh） |
| POST | `/auth/logout` | 登出（Phase 2 加 blacklist） |

### Users（需登入）
| Method | Path | 說明 |
|---|---|---|
| GET | `/users/me` | 取自己 |
| PATCH | `/users/me` | 更新個資 |
| POST | `/users/me/change-password` | 改密碼 |

### Resources
| Method | Path | 說明 | Auth |
|---|---|---|---|
| GET | `/resources` | 列表（分頁、`q` 搜尋） | public |
| GET | `/resources/:id` | 單筆 | public |
| GET | `/resources/:id/availability?from=&to=` | 該時段是否可訂 | public |
| GET | `/resources/:id/available-slots?date=&duration=` | 當日可訂 slot 列表 | public |
| POST | `/resources` | 建立 | JWT |
| PATCH | `/resources/:id` | 更新（owner only） | JWT |
| DELETE | `/resources/:id` | 軟刪（owner only） | JWT |

### Bookings（皆需登入）
| Method | Path | 說明 |
|---|---|---|
| GET | `/bookings` | 我的列表（分頁、`status` filter） |
| GET | `/bookings/:id` | 單筆（owner only） |
| POST | `/bookings` | 建立預訂（可帶 `Idempotency-Key` header） |
| POST | `/bookings/:id/cancel` | 取消（保留紀錄） |

### Health
- `GET /health` — terminus（檢查 DB 連線）
- `GET /api/docs` — Swagger UI

---

## 端到端驗證（手動 smoke test）

```bash
# 註冊
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"P@ssw0rd1","name":"Andy"}'

# 登入（拿 token）
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"P@ssw0rd1"}' \
  | jq -r '.data.tokens.accessToken')

# 建立 resource
RID=$(curl -s -X POST http://localhost:3000/resources \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Room A"}' | jq -r '.data.id')

# 建立 booking（成功）
curl -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f3a-1' \
  -d "{\"resourceId\":\"$RID\",\"from\":\"2026-12-01T10:00:00Z\",\"to\":\"2026-12-01T11:00:00Z\"}"

# 同時段重訂（預期 409 Conflict）
curl -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"resourceId\":\"$RID\",\"from\":\"2026-12-01T10:30:00Z\",\"to\":\"2026-12-01T11:30:00Z\"}"
```

---

## 下一步（Phase 2）

- Email / webhook 通知
- Refresh-token blacklist（Redis）
- Resource 的營業時段設定（影響 `available-slots`）
- Docker / docker-compose
- CI（GitHub Actions：lint + test + migration check）
- Sentry / OpenTelemetry
