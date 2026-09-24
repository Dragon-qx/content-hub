# TODO / Known Issues

> 更新: 2026-08-29 | 来源: 深度审计（5 路并行代码核查 + 逐文件源码审读 + 迁移核对）
>
> 审计结论：**功能真实实现，非空壳**（28K 行源码、579 真实单测、29 模型 schema、16 迁移）。
> 但发现若干真实缺陷与未完成项，按下述优先级逐个修复。

## 优先级说明

P0 = 必修（会直接导致功能不可用/安全风险） · P1 = 应修（功能异常或中等风险） · P2 = 待办（完善/优化）

---

## P0 — 必修

### 1. 迁移漂移：RefreshToken / CustomReport 两张表无迁移

**审计发现（2026-08-29）**：
- `apps/api/prisma/schema.prisma:34` 定义 `RefreshToken`、`:622` 定义 `CustomReport`
- 生产代码真实查询：`refresh-token.service.ts:75,101,113,125,133`（`prisma.refreshToken.*`）、`analytics/report/report.service.ts:247-284`（`prisma.customReport.*`）
- 但 `apps/api/prisma/migrations/` 下 16 个迁移**均未 CREATE TABLE** 这两张表（grep 0 命中）

**后果**：全新环境 `prisma migrate deploy` 后，刷新令牌（登录续期）与自定义报表（拖拽报表保存/加载）功能直接报"表不存在"。

**修复**：新增迁移补齐两张表，字段与 schema.prisma 完全一致；验证 `prisma migrate deploy` 后 `_prisma_migrations` 与 schema 一致。

---

### 2. 平台 SDK 协议级缺陷（8 个适配器中 6 个真实凭据下不可用）

所有适配器都是**真实 HTTP 请求**（无假数据），但协议细节有误，真实凭据下无法完成流程。测试全部 mock `global.fetch`，故未暴露。详见各子项：

#### 2a. Twitter — 假 PKCE（OAuth 必然失败）
- `packages/platform-sdk/src/adapters/twitter.ts:45` `const challenge = 'challenge'`、`:66` `code_verifier: 'verifier'` —— 占位符，`S256('verifier') ≠ 'challenge'`，真实 API 必返回 `invalid_grant`
- 修复：实现真实 PKCE（随机 64 字节 verifier → base64url(SHA-256) challenge），getAuthUrl 生成并持有，handleCallback 提交正确 code_verifier

#### 2b. YouTube — publish 必然抛异常
- `packages/platform-sdk/src/adapters/youtube.ts:115` 对 resumable 初始化响应做 `JSON.parse`，但真实响应为 **200 空 body** + `Location` 头（上传 URL）
- 且缺失真正的二进制分块上传步骤（代码注释自认只建了 "the scaffold"）
- 修复：读 Location 头 → 二进制上传 → 轮询处理状态 → 解析最终响应取 videoId

#### 2c. 微博 — OAuth 编码错误 + 不支持的 refresh
- `packages/platform-sdk/src/adapters/weibo.ts:43-50` 用 JSON body 调 `https://api.weibo.com/oauth2/access_token`，该端点要求 `application/x-www-form-urlencoded`
- `:63-84` `refreshToken()` 用 `grant_type=refresh_token`，微博 OAuth2 不支持（access token 长期有效）
- 修复：form-urlencoded 编码；refresh 按微博真实机制处理

#### 2d. 视频号 — OAuth 流与 API 家族错配
- `packages/platform-sdk/src/adapters/wechat-video.ts:35,40` OAuth 是**网站扫码登录流**（`open.weixin.qq.com/connect/qrconnect` + `api.weixin.qq.com/sns/oauth2/access_token`），获取的 token 无法授权视频号发布
- `:77,91,120` 发布/评论却调**微信小店（电商）** `channels/ec/*` 端点
- 修复：改用视频号官方 creator/creator-open API 端点族（需官方文档与账号体系）

#### 2e. 小红书 — 签名方案自认近似
- `packages/platform-sdk/src/adapters/xiaohongshu.ts:20-23` 代码注释自认：官方用规范请求签名（排序参数 + 特定构造），此处只是镜像 shape（`X-Signature: HMAC-SHA256(body)` 头）
- 端点域 `customer.xiaohongshu.com` 非官方开放平台 `open.xiaohongshu.com`
- 修复：按官方文档修正签名构造与端点（需官方 API 文档）

#### 2f. B 站 — 非官方 OAuth + 内部 web 端点
- `packages/platform-sdk/src/adapters/bilibili.ts:40,52` OAuth 端点非官方开放平台流（官方为 `open.bilibili.com` app_key/app_secret）
- `:71` 发布用 `member.bilibili.com/x/web/archive/post/add` 内部端点，需 WBI 签名/cookie 而非 Bearer token
- 修复：改用官方开放平台流程（需官方文档）

---

## P1 — 应修

### 3. TeamAccessGuard 未全模块推广（安全）
- 目前仅 `content`、`platform-sdk`、`wallet` 三个 controller 强制团队归属（`apps/api/src/modules/common/team-access/`）
- 其余 10 个模块（account / account-group / scheduler / media / receipt / analytics / engagement / workflow / health / audit）仍只靠 `JwtAuthGuard`，信任调用方传入的 `teamId` → 越权风险
- 修复：为每个模块加 `TeamAccessGuard` + service 层 `assertUserInTeam` / `assertResourceInTeam`

### 4. 发布管道缺幂等键 / 死信队列
- `scheduler.service.ts` 已有 lease / heartbeat / stale recovery，但无幂等键、无 DLQ
- `POST /scheduler/:id/execute`（`scheduler.controller.ts:104`）仍是开放的直接触发端点
- 修复：幂等键去重、失败进死信队列、execute 端点加权限约束

### 5. 开发兜底密钥无生产启动校验
- `jwt.strategy.ts:21` / `auth.module.ts:25` `?? 'change-me-in-production'`、`crypto.service.ts:20` `?? 'dev-only-insecure-key'`
- docker entrypoint 已校验（生产拒绝自动生成），但应用自身在非 docker 启动时无校验
- 修复：`NODE_ENV=production` 且密钥缺失时应用启动失败

### 6. 无 /auth/logout 端点
- `refresh-token.service.ts:165` `revokeAllUserTokens` 已实现但无路由可达
- 修复：AuthController 补 `POST /auth/logout`，前端登出调用该端点

---

## P2 — 待办

### 7. 媒体存储仍为本地磁盘（无对象存储抽象）
- `media.service.ts:215` `fs.writeFile` 本地盘、`main.ts:16` `useStaticAssets('/uploads')`
- 无 S3/OSS/MinIO 后端、无签名 URL / 认证下载
- 修复：引入对象存储抽象

### 8. 日志非结构化 JSON
- `main.ts:111` 只有 request-id 中间件，日志非 JSON、无 `userId/teamId/jobId` 上下文
- 修复：JSON 日志 + trace 上下文传播

### 9. ImageProcessorService 死代码（sharp 管线未接线）
- `image-processor.service.ts`（crop/resize/watermark/filters 完整实现）未注册进 `media.module.ts:72` providers，无对应端点
- 修复：注册 provider + 补图像处理端点

### 10. 前端小瑕疵
- `apps/web/src/lib/api.ts:308-325` `qrCodeUrl()` 恒返回 null（QR 码未实现，现以文本显示 TOTP 密钥）
- `apps/web/src/app/(app)/workflow/page.tsx:40-42` 操作错误被静默吞掉
- `WysiwygEditor.tsx:27-50` markdown→HTML 是手写简化版（有损）
- 个别 i18n key 复用导致按钮文案语义偏差

### 11. 代码卫生
- `content.service.ts:456-466` `transitionStatus` 忽略 `userId` 参数
- `content.controller.ts:90-93` calendar 端点未按 team 隔离
- `account.service.ts:296-300` 非微信平台"实时同步"为显式优雅降级（`success:false`）
- 审计发现时 `media.service.ts:97` `mapTypeParam` 把 `'document'` 映射到 `MediaType.AUDIO`

---

## 已确认完成（此前 TODO 遗留，已核对修复）

- ✅ SSRF 加固 — `adapter-base.ts:128` validateUrl（仅 https、DNS 解析拒绝私网/回环/元数据 IP、防 DNS rebinding）
- ✅ 生产密钥强制（docker）— `deploy/entrypoint.sh:28` 生产缺失密钥拒绝启动
- ✅ CI lint + postgres — `.github/workflows/ci.yml` 恢复 lint-typecheck job，test/e2e 挂 postgres:16
- ✅ noEmitOnError — `tsconfig.build.json:4` 已为 true

## 审计另发现但判定非缺陷（记录备查）

- `queue.service.ts:95-99` BullMQ seam 显式 throw —— 有意的可拔插预留位，非 stub
- `receipt.service.ts:42-49` NoopScreenshotProvider 默认 —— 有意的截图 seam，注入 Playwright 即可
- `base.adapter.ts:285-307` 不支持的互动操作抛错 —— 有意的降级路径
- 各适配器 mock fetch 的测试 —— 无集成验证是漏洞（见 P0-2），但单元覆盖 URL/签名构造是有效的
