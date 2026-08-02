# ContentHub 项目审查与优化 TODO

> 审查日期：2026-08-02  
> 审查范围：当前工作区（包含尚未提交的本地改动）  
> 优先级：P0 = 上线前必须处理，P1 = 近期迭代，P2 = 持续优化

## 1. 当前基线

- [x] `pnpm build` 可完成，但 API 的 `nest build` 配置了 `noEmitOnError: false`，不能代表类型安全。
- [ ] `pnpm --dir apps/api exec tsc --noEmit --incremental false` 失败：`PlatformSdkController` 调用了不存在的 `PlatformSdkService.validate()`。
- [ ] `pnpm lint` 失败：API 共 52 个 error、787 个 warning；主要 error 是 ESLint 扫描 `*.spec.ts`，而 `tsconfig.json` 又将其排除。
- [ ] API 测试当前为 43/48 suites、508/514 tests 通过；失败集中在 `validate()` 契约漂移，以及 `AccountController` 测试未注入新增的 `PlatformSdkService`。
- [x] Platform SDK 测试 2/2 suites、47/47 tests 通过。
- [ ] Web 没有自动化测试脚本；现有 API “e2e” 使用 Prisma mock，不会验证真实 PostgreSQL、迁移、外键和租户隔离。

## 2. P0：上线前阻断项

### P0-1 建立统一的租户授权边界，修复跨团队越权

**依据**

- 多数接口只有 `JwtAuthGuard`，但没有校验当前用户是否属于目标团队。
- `ContentService.findOne/update/remove`、`SchedulerService`、`MediaService`、`PublishReceiptService` 等主要按全局资源 ID 查询或修改。
- `AccountGroupController` 和 `WalletController` 直接信任请求中的 `teamId`。
- `PlatformSdkController` 没有接收 `CurrentUser`，任意已登录用户可尝试操作其他团队的账号、内容、评论和私信。

**涉及位置**

- `apps/api/src/modules/content/`
- `apps/api/src/modules/scheduler/`
- `apps/api/src/modules/media/`
- `apps/api/src/modules/platform-sdk/`
- `apps/api/src/modules/account/account-group.*`
- `apps/api/src/modules/wallet/`
- `apps/api/src/modules/receipt/`
- `apps/api/src/modules/analytics/`、`health/`、`workflow/`

**TODO**

- [ ] 新增统一的 `TeamAccessService`/guard/decorator，集中完成“用户是否属于团队”和团队角色校验。
- [ ] 所有资源读取和写入都从服务入口接收 `userId`，并按 `resource.id + team membership` 查询，不能只做 controller 层检查。
- [ ] 区分 OWNER/ADMIN/EDITOR/VIEWER 的团队级权限；不要用全局 `User.role` 替代 `Member.role`。
- [ ] 对跨租户资源统一返回 404 或 403，避免通过响应差异枚举资源。
- [ ] 增加双用户、双团队的负向测试，覆盖读取、更新、删除、发布、钱包、媒体和报表接口。

**验收**

- [ ] 用户 A 无法通过猜测 ID 或传入 teamId 读取/修改用户 B 团队的任何资源。
- [ ] 所有 team-scoped controller 都有自动化越权测试。

### P0-2 修复生产环境密钥注入和健康检查

**依据**

- README 声称首次启动会生成 `.env.prod`，但启动脚本没有创建它，也没有使用 `--env-file .env.prod`。
- API 和 worker 在缺少密钥时会各自生成随机值；worker 也没有在 compose 中接收 `JWT_REFRESH_SECRET` 和 `CREDENTIAL_ENCRYPTION_KEY`。这会导致重启后 refresh token 失效，并导致 worker 无法解密 API 写入的账号凭证。
- API 实际健康路由受全局前缀影响，应为 `/api/v1/health`；Dockerfile 和 compose 当前探测 `/health`。

**TODO**

- [ ] 在生产模式下禁止自动生成临时密钥，缺少必需配置时启动即失败。
- [ ] 使用 secrets manager、Docker secrets 或显式 `env_file`，确保 API 与 worker 共用同一组持久密钥。
- [ ] 增加启动时配置 schema 校验，校验密钥长度、URL、端口和枚举值。
- [ ] 将 API healthcheck 改为 `/api/v1/health`，并拆分 liveness 与 readiness；readiness 应验证数据库和必要依赖。
- [ ] 修正文档和三套启动脚本，保证描述与实际行为一致。

**验收**

- [ ] 全新 clone 后按 README 启动，所有容器进入 healthy。
- [ ] API/worker 重启后旧 refresh token 策略符合设计，已有平台凭证仍可解密和发布。

### P0-3 重做媒体上传、存储和分发链路

**依据**

- 普通 `POST /media/upload` 只创建数据库记录，没有可靠地持久化上传内容。
- API/Nginx 没有配置 `/uploads/` 静态分发；生产 compose 也没有 uploads 持久卷或对象存储。
- Multer 允许单文件最大 2 GiB，当前默认内存接收方式容易造成 OOM。
- 视频转码和封面提取在 HTTP 请求内同步执行，阻塞时间长；文件名冲突、类型欺骗和恶意媒体缺少防护。

**TODO**

- [ ] 抽象 `MediaStorage`，生产使用 S3/OSS/MinIO 等对象存储；本地开发使用受控磁盘目录。
- [ ] 采用流式上传，设置符合业务的大小上限，并同时校验扩展名、MIME 和文件 magic bytes。
- [ ] 使用服务端生成的唯一对象键，禁止客户端文件名直接决定落盘路径。
- [ ] 将转码、缩略图和封面提取放入异步任务；限制 ffmpeg 并发、CPU、内存和执行时长。
- [ ] 数据库写入、对象写入失败时执行补偿清理；增加孤儿对象巡检。
- [ ] 配置受鉴权的下载或签名 URL，并为容器补上持久化/对象存储配置。

**验收**

- [ ] 上传后文件可访问，容器重启后仍存在。
- [ ] 超大、伪造类型、恶意文件名和解压炸弹类输入被拒绝，API 进程不会因上传 OOM。

### P0-4 修复钱包权限、首充和并发扣款

**依据**

- 任意 JWT 用户目前都能对任意 `teamId` 调用余额、充值、扣款和流水接口。
- `topUp()` 的 upsert 在钱包不存在时以 `balance: 0` 创建，首次充值金额没有进入余额，但流水记录了正数金额。
- `debit()` 在事务外读取余额，再在事务内无条件 decrement；并发扣款可能透支。
- 价格表只保存在单进程内存中，API/worker/多副本之间会不一致，重启后丢失。

**TODO**

- [ ] 充值、人工扣款和改价限制为明确的管理权限；普通业务扣款只允许由内部服务调用。
- [ ] 修复首次充值 create 分支，并为充值增加幂等键和唯一约束。
- [ ] 使用条件更新、行锁或串行化事务保证“余额充足校验 + 扣款 + 流水”原子完成。
- [ ] 将价格表持久化并加版本；所有实例读取同一来源。
- [ ] 增加 20+ 并发扣款、重复请求、首次充值和事务回滚测试。

**验收**

- [ ] 并发压测后余额不为负，余额变化总和与不可变流水严格一致。

### P0-5 阻断服务端请求伪造（SSRF）和无界外部请求

**依据**

- 发布 payload 可携带 `mediaUrls`，`BaseAdapter.fetchMediaBytes()` 会直接在服务端 `fetch(mediaUrl)`。
- 外部请求普遍没有连接/读取超时、响应体上限、重试边界和目标地址校验。
- Receipt 的 `externalUrl` 在启用真实截图 provider 后也会形成浏览器型 SSRF 入口。

**TODO**

- [ ] 只允许 `https`，解析并阻断 loopback、link-local、RFC1918、云元数据地址、IPv6 内网和 DNS rebinding。
- [ ] 媒体 URL 优先改为平台内已上传的受信 assetId，不直接接受任意 URL。
- [ ] 为所有平台请求配置 AbortSignal 超时、最大响应体、重试次数、指数退避和并发上限。
- [ ] 截图服务运行在隔离网络/沙箱中，限制出站目标和重定向次数。
- [ ] 增加指向 `127.0.0.1`、`169.254.169.254`、内网 DNS、重定向内网及超大响应的安全测试。

### P0-6 恢复可信的构建、类型、lint 和测试门禁

**依据**

- `PlatformSdkController.validate()` 与 service 契约不一致，直接无缓存 typecheck 会失败。
- `nest build` 允许类型错误仍然产出 JS；Turbo 缓存曾回放旧的成功 typecheck。
- API ESLint 配置排除 spec，但 lint 脚本包含 spec，导致 52 个解析错误。
- CI 中名为 “Lint & Typecheck” 的 job 实际只运行 `pnpm typecheck`，没有运行 lint。

**TODO**

- [ ] 统一 `validate`/`validateRaw` API，修复所有调用和测试替身。
- [ ] 修复 controller 测试依赖注入，确保 API 48 个 suites 全部通过。
- [ ] 为 lint 创建包含测试文件的 `tsconfig.eslint.json`，或明确分离 source/test lint 配置。
- [ ] 构建启用 `noEmitOnError`；typecheck 禁止被错误的增量状态/缓存掩盖，并验证 Turbo inputs。
- [ ] CI 显式依次运行 format-check、lint、无缓存 typecheck、unit、integration、web tests 和 build。
- [ ] 将 lint warning 逐批降到 0，再启用 `--max-warnings=0`。

**验收**

- [ ] 在删除 `.turbo`、`dist`、`.next` 和 tsbuildinfo 的干净环境中，所有质量命令稳定通过。

## 3. P1：近期迭代

### P1-1 加固认证、会话和浏览器安全

- [ ] 将 access/refresh token 从 `localStorage` 迁移到 Secure、HttpOnly、SameSite cookie；同时设计 CSRF 防护。
- [ ] refresh token 使用轮换、服务端哈希存储、撤销和复用检测；新增登出全部设备能力。
- [ ] MFA 二维码在本地生成。当前 `quickchart.io` URL 会把完整 `otpauth://`（含 TOTP secret）发送给第三方，应立即移除。
- [ ] 删除携带 `appSecret` 的 OAuth GET authorize 变体，只保留 POST；避免浏览器历史、代理和访问日志泄密。
- [ ] CORS 改为显式 origin/method/header 白名单，并加入 Helmet/CSP/HSTS/Referrer-Policy 等安全头。
- [ ] 正确配置 trusted proxy。当前直接取 `X-Forwarded-For` 第一个值可被伪造并绕过限流。
- [ ] 为登录、MFA、refresh、OAuth callback 配置更严格的独立限流、失败审计和告警。

### P1-2 保证发布流程的幂等性和可恢复性

- [ ] 为一次发布建立稳定的 idempotency key；平台已成功但本地写库失败时，能够查询并对账，避免重发。
- [ ] 平台调用、`PlatformPost`、Content 状态和 Receipt 使用显式状态机/补偿事务，记录每一步尝试。
- [ ] 为 `RUNNING` 任务增加 lease/heartbeat 和超时回收；当前 worker 崩溃后任务可能永久停留在 RUNNING。
- [ ] 区分可重试错误与永久错误，尊重平台 `Retry-After`，加入 dead-letter queue 和人工重放。
- [ ] 不允许普通外部 API 任意触发 `scheduler/:id/execute`；执行入口改为内部 worker 权限。

### P1-3 完善数据模型的引用完整性与索引

- [ ] 为 `Team.ownerId`、`Member.userId`、`Content.teamId/createdBy`、`PublishJob.contentId`、`AuditLog` 等补齐 Prisma relation、外键和明确的 onDelete 策略。
- [ ] 为 `ContentVersion` 增加 `@@unique([contentId, version])`，并用原子递增避免并发产生重复版本。
- [ ] 按真实查询补索引：Content `(teamId, status, createdAt/scheduledAt)`、MediaAsset `(contentId, createdAt)`、PlatformPost `(contentId, platform)`、AuditLog `(userId, createdAt)`/`(entityType, entityId, createdAt)` 等。
- [ ] 用 `EXPLAIN ANALYZE` 和生产规模种子数据验证列表、日历、分析和 worker 扫描，而不是仅凭直觉加索引。
- [ ] 为历史孤儿数据编写一次性检测/修复脚本，再上线约束。

### P1-4 增加真实集成测试和前端回归测试

- [ ] 使用临时 PostgreSQL/Redis（CI service 或 Testcontainers）运行迁移和核心用户旅程；不要 mock Prisma。
- [ ] 增加租户隔离、钱包并发、任务抢占/恢复、OAuth state、媒体存储和发布补偿的集成测试。
- [ ] Web 引入组件测试和 Playwright 关键旅程：登录/MFA、切换团队、创建内容、审批、发布、媒体上传。
- [ ] 在 CI 中验证 `prisma migrate deploy` 可从空库执行，并对 schema drift 失败。
- [ ] 覆盖 API 与 worker 同时启动、共享密钥、容器健康检查的 compose smoke test。

### P1-5 收敛 API 契约与文档漂移

- [ ] 以 OpenAPI 为单一契约，生成前端 client/types，减少 `apps/web/src/lib/types.ts` 与 DTO 手工漂移。
- [ ] 统一分页响应字段；当前 Swagger 文案、README 与实现中的 `{items,total,skip,take}` 等约定不完全一致。
- [ ] 增加 OpenAPI breaking-change 检查，并将生成文件与基线比较。
- [ ] 更新 README 中 Media 鉴权、健康路径、密钥生成和平台支持矩阵。
- [ ] 清理/归档已声称“全部完成、测试全绿”但与当前状态冲突的历史计划文档。

### P1-6 建立可观测性和运维闭环

- [ ] 使用结构化 JSON 日志，加入 requestId、userId、teamId、jobId、platform 和耗时，严禁记录 token/secret/内容隐私数据。
- [ ] 增加 HTTP、DB、worker queue、平台 API、发布成功率、重试、钱包异常和媒体处理指标。
- [ ] 接入 tracing/error reporting，并为发布失败率、RUNNING 超时、队列堆积、解密失败和磁盘/对象存储容量设置告警。
- [ ] 为数据库备份、恢复演练、凭证密钥轮换和对象生命周期建立 runbook。

## 4. P2：持续优化

### P2-1 前端性能和交互可靠性

- [ ] 富文本编辑页面首包接近 300 KiB；对 TipTap、Markdown 预览、媒体库等做 dynamic import 和按需加载。
- [ ] 修复所有 Hook dependency warning，重点检查 dashboard/teams/template 的旧闭包和团队切换后数据串线。
- [ ] API client 增加超时、AbortController、请求取消和统一的可重试策略；避免页面卸载后继续 setState。
- [ ] 通知轮询加入页面可见性判断、退避和去重；长期可迁移到 SSE/WebSocket。
- [ ] 增加 route-level error boundary、空状态、乐观更新回滚和无障碍键盘/焦点测试。

### P2-2 容器、安全基线与交付体积

- [ ] 运行容器改为非 root，使用只读根文件系统、临时目录、资源限制和最小 Linux capabilities。
- [ ] runner 只保留 production dependencies；当前复制完整 builder `node_modules`，镜像体积和攻击面偏大。
- [ ] 数据库账号/密码移出 compose 明文默认值，生产不暴露数据库/Redis 端口。
- [ ] 固定基础镜像 digest并增加镜像/SBOM/依赖漏洞扫描。
- [ ] Nginx 增加 TLS、上传大小、请求超时、安全头和合理缓存；不要全局关闭静态资源缓冲。

### P2-3 代码库维护性

- [ ] 为 service/controller 公共返回值补齐类型，逐步消除 `any`、未使用变量和同步 `require/fs`。
- [ ] 删除或迁移根目录 `_flow_test.js`、运行日志、旧 vanilla dashboard 等临时/遗留入口，避免两套前端长期分叉。
- [ ] 统一格式化、提交前检查和依赖更新节奏；明确 Node/pnpm 版本矩阵。
- [ ] 将超长 service 按领域拆分，并把授权、外部请求、存储、幂等和审计做成可复用基础设施。

## 5. 建议实施顺序

1. 先修复 P0-6，使后续修改有可信质量门禁。
2. 并行完成 P0-1、P0-2、P0-4、P0-5，封住数据越权、密钥、计费和 SSRF 风险。
3. 完成 P0-3，打通可上线的媒体链路。
4. 补齐真实集成测试后，再实施发布可靠性和数据模型迁移。
5. 最后推进前端性能、容器瘦身、可观测性和代码清理。

## 6. 完成定义（Definition of Done）

- [ ] 每项修复包含成功路径、失败路径和跨租户负向测试。
- [ ] 数据库变更包含 migration、回滚/补偿方案和历史数据检查。
- [ ] 安全相关改动有威胁测试，日志中不出现 secret/token。
- [ ] CI 在全新环境运行，不依赖本地 `.turbo`、`.next`、dist 或 tsbuildinfo。
- [ ] README、OpenAPI、部署文件和运行行为保持一致。
