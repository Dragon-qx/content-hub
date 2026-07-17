# ContentHub API Reference

> Runtime prefix: `/api/v1`. Swagger UI is served at `/api/docs` when the API is running.
> Unless noted otherwise, endpoints require `Authorization: Bearer <jwt>`.

---

## 1. Authentication

### Register
`POST /api/v1/auth/register`
```json
{ "email": "a@b.com", "password": "password123", "name": "Alice" }
```
→ `201` `{ accessToken, refreshToken }`

### Login
`POST /api/v1/auth/login`
```json
{ "email": "a@b.com", "password": "password123" }
```
→ `201` either `{ accessToken, refreshToken }` (no MFA) or
`{ mfaRequired: true, mfaToken }` when the account has two-factor
authentication enabled. The `mfaToken` is short-lived (5 min) and redeemed
via `/auth/mfa/login`.

### MFA login (second step)
`POST /api/v1/auth/mfa/login`
```json
{ "mfaToken": "<mfaToken from /auth/login>", "code": "123456" }
```
→ `201` `{ accessToken, refreshToken }` · `401` if the token expired or the
code is wrong.

### MFA management (all require a valid session)
| Method | Path                 | Notes                                            |
| ------ | -------------------- | ------------------------------------------------ |
| POST   | `/auth/mfa/setup`    | Begin setup — returns `secret` + `otpauthUrl`    |
| POST   | `/auth/mfa/verify`   | Confirm with a code — enables MFA                |
| POST   | `/auth/mfa/disable`  | Disable MFA and clear the stored secret          |
| GET    | `/auth/mfa/status`   | `{ mfaEnabled }`                                 |

Setup flow: call `/setup`, show the `otpauthUrl` as a QR (or the raw `secret`)
to the user, then call `/verify` with the code their app generates. MFA only
activates on a successful `/verify`.

### Refresh
`POST /api/v1/auth/refresh`
```json
{ "refreshToken": "<refreshToken>" }
```
→ `201` `{ accessToken, refreshToken }` · `401` if invalid.

---

## 2. Users

| Method | Path           | Notes                                  |
| ------ | -------------- | -------------------------------------- |
| GET    | `/users/me`    | Current user profile (no secrets)      |
| PUT    | `/users/me`    | Update name / password                 |
| GET    | `/users`       | OWNER/ADMIN only; `?skip&take&search`  |
| DELETE | `/users/:id`   | Soft-delete (sets `isActive=false`)     |

---

## 3. Teams

| Method | Path                          | Notes                          |
| ------ | ----------------------------- | ------------------------------ |
| POST   | `/teams`                      | Body: `{ name, description? }`. Owner becomes ADMIN member |
| GET    | `/teams`                      | Teams the caller belongs to    |
| PUT    | `/teams/:id`                  | Owner or team ADMIN            |
| DELETE | `/teams/:id`                  | Owner only                     |
| GET    | `/teams/:id/members`          | List members                   |
| POST   | `/teams/:id/members`          | Add member `{ userId, role }`  |
| DELETE | `/teams/:id/members/:memberId`| Remove member                  |

---

## 4. Accounts (platform bindings)

Social-account credentials are encrypted at rest (AES-256-GCM) before being
written; they are decrypted only when a real sync against the platform runs.

| Method | Path               | Notes                                              |
| ------ | ------------------ | -------------------------------------------------- |
| GET    | `/accounts`        | `?teamId=` scopes to a team, else caller's teams  |
| GET    | `/accounts/:id`    | Single account (no credentials)                    |
| POST   | `/accounts`        | Bind. `BindAccountDto` carries platform fields     |
| PATCH  | `/accounts/:id`    | Update name / handle / re-encrypt credentials      |
| POST   | `/accounts/:id/sync`| Trigger a live sync (WeChat Official supported)    |
| DELETE | `/accounts/:id`    | Unbind                                             |

### Bind account example (WeChat Official)
```json
{
  "teamId": "team-1",
  "platform": "WECHAT_OFFICIAL",
  "accountId": "gh_xxx",
  "accountName": "My Official Account",
  "appid": "wx123",
  "secret": "shhh"
}
```

---

## 5. Content

| Method | Path               | Notes                                   |
| ------ | ------------------ | --------------------------------------- |
| POST   | `/contents`        | Creates `DRAFT` with `version=1` + first `ContentVersion` |
| GET    | `/contents`        | `?status&teamId&createdBy&search&skip&take` |
| GET    | `/contents/:id`    | Includes tags, posts, workflow, versions |
| PUT    | `/contents/:id`    | Partial update                          |
| DELETE | `/contents/:id`    | Hard delete                             |

---

## 6. Media

| Method | Path            | Notes                                  |
| ------ | --------------- | -------------------------------------- |
| POST   | `/media/upload` | multipart `file`, optional `contentId` |
| GET    | `/media`        | `?contentId&type&q&skip&take`          |
| GET    | `/media/:id`    | Single asset                           |
| DELETE | `/media/:id`    | Remove                                 |

`type` accepts `image` / `video` / `document` (mapped to IMAGE / VIDEO / AUDIO).

---

## 7. Workflow (approvals)

| Method | Path                       | Notes                                |
| ------ | -------------------------- | ------------------------------------ |
| POST   | `/workflow/approval`       | `{ contentId?, approverId, summary? }` → `PENDING` |
| POST   | `/workflow/:id/approve`    | `{ approverId, comment? }`           |
| POST   | `/workflow/:id/reject`     | `{ approverId, comment? }`           |
| GET    | `/workflow`                | `?status&contentId&approverId&skip&take` |
| GET    | `/workflow/:id`            | Single item                          |

Only a `PENDING` workflow can be transitioned; others return `400`.

---

## 8. Scheduler (publish jobs)

| Method | Path                 | Notes                                          |
| ------ | -------------------- | ---------------------------------------------- |
| POST   | `/scheduler`         | `{ contentId, platform, scheduledAt }`         |
| GET    | `/scheduler`         | `?status&contentId&skip&take`                  |
| GET    | `/scheduler/:id`     | Single job                                     |
| POST   | `/scheduler/:id/retry`| Reset to `QUEUED`, bumps `retryCount`          |
| DELETE | `/scheduler/:id`     | Cancel                                         |

`POST /scheduler` validates that `contentId` exists and `scheduledAt` parses.

---

## 9. Analytics

| Method | Path                                  | Notes                                  |
| ------ | ------------------------------------- | -------------------------------------- |
| GET    | `/analytics/dashboard`                | Aggregated followers, engagement, recent activity |
| GET    | `/analytics/overview?days=30`         | Per-metric values + period-over-period change |
| GET    | `/analytics/history?metric&period`    | Trend points (`7d`/`30d`/`90d`)        |
| GET    | `/analytics/history/export?metric&period` | CSV download (`text/csv`)          |
| GET    | `/analytics/top-content?sortBy&limit` | Leaderboard by impressions/engagement/likes |
| POST   | `/analytics/snapshot/:accountId`      | Record a manual metrics snapshot       |

---

## 10. Notifications

| Method | Path                          | Notes                                   |
| ------ | ----------------------------- | --------------------------------------- |
| POST   | `/notifications`              | Create (`userId, title, body, type?, channel?, metadata?`) |
| GET    | `/notifications`              | `?skip&take&unreadOnly`; includes `unreadCount` |
| PATCH  | `/notifications/:id/read`     | Mark one as read                        |
| PATCH  | `/notifications/read-all`     | Mark all as read                        |

Internal broadcasters use `NotificationService.broadcastToTeam()` to fan out a
notification to every member (and the owner) of a team.

---

## 11. Audit

| Method | Path                                | Notes                      |
| ------ | ----------------------------------- | -------------------------- |
| POST   | `/audit`                            | `{ action, userId, resourceType, resourceId, details?, ipAddress? }`. Throws `400` if the acting user is unknown |
| GET    | `/audit`                            | `?userId&action&resourceType&resourceId&skip&take` |
| GET    | `/audit/:resourceType/:resourceId`   | Full history for a resource |

---

## 12. Platform SDK (publish federation)

| Method | Path                      | Notes                                  |
| ------ | ------------------------- | -------------------------------------- |
| POST   | `/platform-sdk/publish`   | `{ contentId, platform }`               |
| POST   | `/platform-sdk/validate`  | `{ platform, credentials }`             |

The SDK layer is backed by `PlatformAdapterFactory`, which returns an adapter
for WECHAT_OFFICIAL, WECHAT_VIDEO, DOUYIN, XIAOHONGSHU, and BILIBILI.

---

## Error handling

Validation failures return NestJS `400` with per-field messages:
```json
{ "statusCode": 400, "message": ["email must be an email"] }
```

Domain errors map to HTTP status codes (`404 NotFound`, `401 Unauthorized`,
`409 Conflict`, `400 BadRequest`, `403 Forbidden`).
