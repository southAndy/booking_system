See @AGENTS.md for project commands, architecture, invariants, and conventions.

## Commit conventions

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>
```

### Type（必填）
- `feat`：新功能
- `fix`：修 bug
- `refactor`：重構（不改變行為）
- `perf`：效能優化
- `test`：測試相關
- `docs`：文件
- `chore`：雜項（依賴更新、設定檔等）
- `build`：建置流程、套件管理
- `ci`：CI 設定
- `style`：格式調整（不影響邏輯）

### Subject 規則
- 英文、小寫開頭、動詞起手（add / fix / remove / update...）
- 50 字以內
- 結尾不加句號

### Body 規則（可選）
- 解釋「為什麼」而非「做了什麼」
- 每行 72 字以內
- 與 subject 之間空一行
- 涉及 booking overlap、idempotency、auth guard 等核心不變量時，**必須**在 body 說明影響範圍

### 範例

```
feat: add idempotency key support

POST /bookings 接受 Idempotency-Key header，避免網路重試造成重複預訂。
新增 partial unique index uq_bookings_idempotency 在 (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL — 需同步維護 migration 與 service 邏輯。
```

```
fix(auth): correct refresh token expiry calculation
```

```
refactor(config): extract env validation to zod schema
```

### Co-author 簽名

Claude 代為 commit 時，訊息結尾固定加上：

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

### 操作守則
- **絕不**主動 commit，除非使用者明確要求
- **絕不**使用 `--no-verify` 繞過 hook（除非使用者明確要求）
- **絕不**使用 `--amend` 修改既有 commit（除非使用者明確要求）
- 一個 commit 只做一件邏輯上的事，避免混雜不相關改動
