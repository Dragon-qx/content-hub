# ContentHub 开发任务

你是一个专业的全栈开发工程师。请按照以下计划执行开发工作。

## 工作目录
/home/ubuntu/.openclaw/workspace/content-hub

## 当前进度
- M1–M15: ✅ 已完成（基础架构 → 安全加固）
- M18: ✅ 已完成（TOTP 双因素认证）
- M19: ✅ 已完成（Content Studio Markdown 编辑器增强）
- M20: ✅ 已完成（Engagement Hub — 评论/私信聚合、情感分析、关键词告警）
- M21: ✅ 已完成（平台扩展：Twitter + YouTube + 微博适配器 + 审查修复）
- M22: ✅ 已完成（异常检测引擎 — 5 规则自动检测 + 团队广播）
- M23: ✅ 已完成（内容日历 — 月视图排期）
- M24: ✅ 已完成（内容适配引擎 — 8 平台规则自动适配 + 实时预览）
- M25: ✅ 已完成（内容模板库）
- M26: ✅ 已完成（内容版本回滚）
- M27: ✅ 已完成（内容排行榜 Top/Bottom 自动标记）

## 剩余任务

### 方向 C：SDK 补齐
补齐平台 SDK 互动层缺失的能力：

- [x] **小红书 refreshToken**（M29a） — `XiaoHongShuAdapter` 补齐 `refreshToken()`：`handleCallback` 捕获 `refresh_token`，`refreshToken()` 以 HMAC 签名向 `/api/oauth/v1/token` 发 `grant_type=refresh_token`，`getToken()` 过期时自动回落刷新；+3 单测（捕获 / 旋转 / 无 refresh token 抛错）
- [x] **Controller 暴露评论/私信端点**（M29b） — `PlatformSdkController` 新增：
  - `GET /platform-sdk/comments`（`FetchCommentsQueryDto`）→ `service.fetchComments`
  - `POST /platform-sdk/comments/reply`（`ReplyCommentDto`）→ `service.replyToComment`
  - `GET /platform-sdk/messages`（`FetchMessagesQueryDto`）→ `service.fetchMessages`
  - DTO 全部 `@IsString/@MinLength/@IsEnum(Platform)` 校验；+4 控制器单测
- [x] **私信回复能力**（M29c） — 整条 `replyToMessage` 链路：`PlatformAdapter` 接口新增 `replyToMessage()`；`BaseAdapter` 默认抛错降级（`${platform} does not support replying to private messages`）；`BilibiliAdapter` 原生实现（`web_im/v1/web_im/send_msg`）；`PlatformSdkService.replyToMessage`（`ok/reason` 优雅降级）；`POST /platform-sdk/messages/reply`（`ReplyMessageDto`）；adapter + service + controller 全套单测
- [x] **适配器单元测试补齐**（M29d） — 补齐 `publish()`、`fetchMetrics()`、`refreshToken()` 单测：微信公众号（publish/fetchMetrics + refreshToken 降级抛错）、微信视频号（publish/fetchMetrics/refreshToken）、小红书（publish/fetchMetrics，refreshToken 在 M29a）、抖音（publish/fetchMetrics，refreshToken 已有）

### 收尾项
- [x] 单元测试覆盖率 ≥ 80%（当前 lines 91.9% / branches 63% / funcs 92.5%，376 测试 34 套件 ✅）
- [x] E2E 测试（新增 `journey.e2e-spec.ts`：注册→登录→创建内容→审批→发布核心用户旅程 ✅）
- [x] CI/CD 配置（GitHub Actions `.github/workflows/ci.yml`：lint+typecheck→build→test→e2e→openapi→deploy ✅）
- [x] 生产环境部署配置（`docker-compose.prod.yml` + `Dockerfile.api` + `Dockerfile.web` + `docker-entrypoint.sh` + `nginx.conf` ✅）
- [x] API 文档（Swagger `deepScanRoutes` + `/api/docs-json` + `scripts/export-openapi.ts` + CI OpenAPI artifact ✅）
- [ ] 用户手册（docs/USER-GUIDE.md）

## 🔥 铁律：每次完成必须记录

**每次完成一个功能点或修复后，你 MUST：**

1. **更新 CLAUDE-TASK.md** — 将对应的 `[ ]` 改为 `[x]`，写明完成内容
2. **更新 docs/DEVELOPMENT-PLAN.md** — 在对应里程碑下补充完成摘要（参考已有格式）
3. **更新 docs/BLOCKERS.md**（如有阻塞）— 记录遇到的问题和解决方案
4. **commit + push** — commit message 包含里程碑编号

## 当前任务

### 方向 A（仅剩一项）
- [x] **用户手册**（docs/USER-GUIDE.md ✅）— 覆盖 14 章：产品概述、快速开始、仪表盘、账号管理、内容创作（含 AI 辅助）、审批工作流、发布调度、数据分析、互动管理、媒体库、团队管理、通知中心、个人设置、常见问题

### 方向 B：新功能扩展（按 PRD 审查缺失清单推进）
先做 🔴 高优先级 → 🟡 中优先级 → 🟢 低优先级 → 🔧 技术债

### 方向 B：新功能扩展
根据 PRD 功能缺失清单，以下按优先级排序：

#### 🔴 高优先级（P0/P1，核心缺失）

- [x] **邮件 / Webhook 通知**（M31a ✅）— NotificationService 新增 SMTP 邮件投递（nodemailer）+ Webhook 投递（fetch+指数退避重试）；DTO 增加 email/webhookUrl 字段；ConfigService 集成；.env.example 增加 SMTP_* / WEBHOOK_URL 配置；+2 单测（邮件跳过降级 + webhook 记录创建）；378 测试全绿
- [x] **账号分组**（M31b ✅）— Prisma schema 新增 AccountGroup + SocialAccount.groupId；AccountGroupService CRUD + assignAccount + removeAccount；AccountGroupController (POST/GET/PATCH/DELETE + assign/remove account)；+5 单测；迁移文件 20260718140000_account_groups；383 测试全绿
- [x] **视频转码 + 封面裁剪** — PRD §3.3 P0，支持多分辨率转码、自动/手动封面裁剪（M31e）
  新增 `VideoProcessingService`（fluent-ffmpeg）：
  - `transcode()` — 多分辨率多格式转码（720p/1080p，mp4/webm），H.264+AAC / VP8+Vorbis
  - `extractCover()` — 给定时间戳提取单帧为 JPEG
  - `getMetadata()` — ffprobe 探测 duration / width / height / codec
  API 端点：`POST /media/video/transcode`、`POST /media/video/cover`、`GET /media/video/:id/metadata`
  DTO 校验：`TranscodeVideoDto`（`@IsArray/@ArrayNotEmpty/@IsString` + `@IsEnum`）、`ExtractCoverDto`（`@IsInt/@Min`）
  单元测试 **11 个**（转码 4 + 封面 3 + 元数据 4）；控制器 mock ffmpeg + 412 全绿
- [x] **图片在线裁剪 + 加水印 + 滤镜**（M31c ✅）— `ImageProcessorService`（sharp）：`process()` 管线支持 crop/resize/watermark（SVG overlay）/filter（grayscale/blur/sharpen）/format（jpeg/png/webp with quality）；DTO class-validator + Swagger 装饰器；+3 单测（resize/grayscale/crop）；Prisma 无 schema 变更；MediaService 注入 ImageProcessorService；386 测试全绿
- [x] **审批超时处理**（M31d ✅）— PRD §3.7 审批超时自动通过/驳回/升级：Prisma schema 新增 `timeoutHours`/`timeoutAction`/`escalateTo`/`firstReminderAt` + `[status,createdAt]` 索引；迁移 `20260718150000_workflow_timeout`；`WorkflowTimeoutService`（`processTimeouts` 自动审批/驳回/升级 + `sendReminders` 临期提醒 + `getTimeoutSummary` 分组汇总）；`WorkflowController` 新增 `PATCH /workflow/:id/timeout-config`（`WorkflowTimeoutConfigDto`，ESCALATE 必须带 escalateTo）+ `GET /workflow/timeout-summary`（`TimeoutSummaryQueryDto`）；`WorkflowModule` 接入 `NotificationModule` + `AuditModule`；单元测试 **10**（setConfig 成功/NotFound/BadRequest、processTimeouts 三动作+跳过+错误、sendReminders 发送/跳过、getTimeoutSummary 分组）；31 测试 3 套件全绿

#### 🟡 中优先级（P2，体验提升）

- [x] **CSV 批量导入账号**（M32 ✅）— PRD §3.2 P2：`csv-parser.ts` 纯函数 RFC 4180 解析（引用字段、转义引号、CRLF/LF、ragged 错误收集）+ `credentialsFromRecord()` 多平台凭证列/JSON 列复合；`AccountService.batchImport()`（逐行独立校验绑定、部分成功不抛错）+ `importOne()`（必填/合法平台/already-bound/persist 失败分级）+ `parseImportCsv()`；控制器新增 `POST /accounts/import`（`FileInterceptor` CSV 上传 + 5MB 上限 + `teamId` + 审计）和 `POST /accounts/import/json`（`ImportAccountsDto` class-validator，最多 200 条）；DTO `ImportAccountsDto` / `AccountImportRecord` / `ImportAccountsQueryDto`；单元测试 **26 个**（csv-parser 12 + batchImport 8 + controller 6），438 测试 40 套件全绿
- [x] **智能排期推荐**（M33 ✅）— PRD §3.4 P2：`SchedulingRecommendationService`（确定性启发式）：按 team/可选 accountId 拉取 90 天内 `AnalyticsSnapshot` → 按 `snapshotDate.getDay()` 分桶 → 计算 `engagements/impressions`（钳 0-1）平均参与率 → 排名天档 → `projectSlots` 投影到 `horizonDays` 内最近严格晚于 `now` 的出现时刻（去重，score 归一化，confidence=1-e^{-n/12}）；snapshot=0 时回落 `HEURISTIC_WINDOWS`（行业基准 Sat/Fri/Sun）并报告 `basis:'heuristic'`；`GET /scheduler/recommendations`（`RecommendQueryDto` 校验 teamId/slots(1-10)/horizonDays(1-30)/accountId），单 account 查校验 NotFound/Forbidden 团队归属；控制器注入双服务 + Swagger；单测 **19**（service 13 + controller 6），450 测试 41 套件全绿
- [x] **发布回执截图留档**（M38 ✅）— PRD §3.4 P1：Prisma schema 新增 `PublishReceipt {contentId/platformPostId/accountId/platform/externalId/externalUrl/assetId(`MediaAsset.` 1:1)/receiptHash unique/GeneratedAt}` + receipts 关系挂 Content/PlatformPost/SocialAccount + 迁移 `20260719110000_publish_receipts`(含 platformPostId/assetId/receiptHash unique + contentId 索引 + 外键级联/SetNull)；`ScreenshotProvider` seam + `NoopScreenshotProvider`（无头浏览器未就绪时 fallback，未来可换 Playwright/Puppeteer 实现）；`MediaService.buildReceiptCard`（sharp SVG→PNG 渲染发布元数据标题卡）+ `attachReceiptCard` 持久化至 `/uploads/receipts/{id}.png`（fs 写失败降级 metadata base64 回水 + 仍写 MediaAsset 行）；`PublishReceiptService.generate(input)`（校验必扣字段/基于 `{contentId|platform|externalId|platformPostId}` SHA-256 幂等 hash；idempotent 默认命中已有返回 / false 抛 Conflict；优先调 `screenshot.capture` → fallback 卡写 asset）；`listByContent/get(id)/verify(id)`（哈希重算验证 tamper-evident）；控制器 `POST /receipts`（`GenerateReceiptDto`）+ `GET /receipts?contentId` + `GET /receipts/:id` + `GET /receipts/:id/verify`（`JwtAuthGuard` class-validator enum + Swagger）；`ReceiptModule` 接入 `AppModule`；sharp 作为 dependency 显式安装；mock 增 `publishReceipt` delegate；单测 **15**（service 10：hash 确定性/非法字段/idempotent 命中/二次截图失败/capture 抛错降级｜list/get/verify 通过/tamper verify false — controller 5：generate/list/get/verify 透传），527 测试 48 套件全绿
- [x] **余额钱包 / 用量计费**（M35 ✅）— PRD §4.4：Prisma schema 新增 `Wallet` (teamId unique/balance/holdBalance/currency/CREDIT) + `WalletTransaction` (walletId/type `TransactionType {TOPUP,REFUND,PUBLISH,SCHEDULE,SYNC,MEDIA_PROCESS,AI_ASSIST}`/signed amount/balanceAfter/refId/note + `[walletId,createdAt]` 索引，级联删除) + 迁移 `20260719100000_wallet_billing`（含 CREATE TYPE TransactionType + Wallet/WalletTransaction 表 + 外键）；`Team.wallet` 1:1 关系；`WalletService`：`getOrCreateWallet(teamId)` 幂等 upsert + `balance` (excludes holdBalance) + `topUp(teamId, {amount,note})`（整数正数校验 / `$transaction` upsert balance+写 TOPUP 账行）+ `debit(teamId, type, {refId,note,minBalance})`（price=0 返回 null / NotFound 缺钱包 / Conflict 余额不足 / `$transaction` 原子减 balance+写账行；默认 rate card PUBLISH=10/SCHEDULE=5/SYNC=2/MEDIA_PROCESS=8/AI_ASSIST=3 / TOPUP·REFUND=0）+ `tryDebit(...,lenient)` + `listTransactions(teamId,{skip,take})` + `setPrices/getPrices`（可变价目表）；控制器 `GET /wallet/:teamId/balance` + `POST /wallet/:teamId/top-up`（`TopUpWalletDto`）+ `POST /wallet/:teamId/debit`（`DebitWalletDto`）+ `GET /wallet/:teamId/transactions`（`ListTransactionsQueryDto`）+ `GET/PATCH /wallet/prices`；DTO `@IsInt @IsPositive @MaxLength` + enum 字符串字段 + Swagger；`WalletModule` 接入 `AppModule`；mock 增 `wallet`+`walletTransaction` delegates；unit test **24**（service 17 + controller 7），490 测试 44 套件全绿
- [x] **AI 回复建议**（M37 ✅）— PRD §3.6：`AiReplySuggestionsService`（确定性启发式，无外部 LLM）：`suggest(commentId, {sentiment,score,content,likeCount,replied,...})` → `{signal:{intent,score,topics}, suggestions:[{variant,confidence,text}]×2}`；意图分类 `complaint|praise|question|neutral`（强负+score<-0.25 complaint / 疑问词短评 question / 正 / neutral）；主题抽取 中英关键词映射 quality/service/shipping/refund/delivery/bug/pricing/support 最多 3；主变体 `variantFor`（complaint → empathetic 或 purchaser/high-like professional / praise → grateful / question → helpful / verified → professional / 其他 enrolling）+ `fallbackFor`；`scoreVariant` 基础分 + 主变体提升 + 高互动 complaint 向 professional 倾斜，钳 0.2–0.99；5 类模板 variants empathetic/grateful/enrolling/helpful/professional 中英分支（isChinese 自动识别）；`EngagementService.aiSuggestReplies(commentId)` 查信号并委托；`EngagementModule` 注册 provider；控制器 `GET /engagement/comments/:id/reply-suggestions`（`JwtAuthGuard` + Swagger）；单测 **15**（engine 8：数量/complaint variant/verified-professional/grateful/question-helpful/topics/中文 empathetic/confidence 窗口 × engagement.service 2 + controller 1 proxy），511 测试 46 套件全绿
- [x] **账号转移/交接**（M34 ✅）— PRD §3.2 P1：Prisma schema 新增 `AccountTransfer` 表（accountId/fromTeamId/toTeamId/initiatorId/note/status `TransferStatus` PENDING|ACCEPTED|REJECTED|CANCELLED/decidedById/decidedAt + `[accountId,status]`/`[toTeamId,status]` 索引，级联删除）+ 迁移 `20260719090000_account_transfer_handover`；`AccountTransferService`：`initiate(sourceTeamId, {toTeamId,initiator,note})`（同团队拒绝 / 账号非源 / `assertAdmin` 发起人 / active PENDING 冲突 / owner 等同 ADMIN）→ 创建 PENDING；`decide({transferId,actingUserId,decision})`（NotFound/Conflict 终态 / 目标 team assertAdmin；accept 在 `$transaction` 内原子 PATCH transfer → ACCEPTED 且 PATCH account.teamId=toTeamId + groupId=null，reject 仅标记）；`cancel/ initiator 撤回或源 team admin / get / listForTeam(teamId,{direction,incoming|outgoing|all},status)`；控制器新增 `POST /accounts/:id/transfer`（`InitiateTransferDto`）+ `PATCH /accounts/:id/transfer`（`DecideTransferDto` accept|reject）+ `DELETE /accounts/:id/transfer` + `GET /accounts/transfers`（`ListTransfersQueryDto`），全部 `JwtAuthGuard` + `AuditService` 审计；DTO 含 `@IsString @MinLength(1) @IsIn/@MaxLength(500)` + Swagger；`AccountModule` 注册 provider+export；`test/prisma.mock.ts` 增 `accountTransfer` + `$transaction`；单测 **16**（同 team/缺/非源 team/非 admin/owner 平权/PENDING 冲突/发起成功｜ NotFound/终态/非 admin/accept 事务移动+清 groupId/reject 不动｜ cancel 撤回/终态｜ list 过滤），466 测试 42 套件全绿
- [x] **BullMQ 真实集成（适配层）**（M36 ✅）— PRD §3.4：新增 `QueueService`（`QueueKind='prisma'|'bullmq'` seam）：`publish/schedulePublish` → SchedulerService.schedule；`runPublishTick(now,limit)` 用于 Prisma seam 取 due jobs + 原子 executeJob（单 job 失败不中断 tick）；`runEngagementSyncTick` 聚合 teams/comments/messages；`runAnomalyScanTick` 统计 accounts/anomalies/teamsAlerted；kind=bullmq 预留抛错位（切换 `process.env.QUEUE_KIND=bullmq` 后由真实实现覆盖）；`QueueModule` 导入 Scheduler/Engagement/Analytics modules + 注册 `QUEUE_KIND` provider；`EngagementModule` 新增 export `EngagementService`（修复 DI）；重写 `worker.ts` 全部经 `app.get(QueueService)` 委托 tick，保留原有 POLL/BATCH/ENGAGEMENT/ANOMALY interval 与 SIGINT/SIGTERM 停机；单测 **11**（kind 报告/publish/tick 空/成功/容错/limit/不支持 kind / engagement 聚合 / anomaly 计数），501 测试 45 套件全绿
- [x] **移动端响应式 + PWA**（M40 ✅）：新增 `MobileNav` 底部 Tab 导航 + `ServiceWorkerRegistration` 注册 + `offline` 断网页 + `manifest.json` 独立应用清单 + `sw.js` Service Worker（precache + runtime cache + offline fallback）；改造 `Sidebar` 抽屉式移动导航（backdrop + `translate-x` 动画），`Topbar` 汉堡菜单适配，`globals.css` safe-area 适配 + 触摸目标优化；16 页面 + 12 组件移动响应式适配（grid 移动优先 + 横向滚动 Table + 44px 触摸目标）；Next.js build 18 条路由静态生成成功，类型检查全绿

#### 🟢 低优先级（锦上添花）

- [ ] **自定义报表（拖拽生成）** — PRD §3.5 P2，用户拖拽字段生成自定义报表
- [ ] **账号健康度指标阈值告警** — PRD §3.2，健康度低于阈值自动告警

#### 🔧 技术债务 & 质量改进

- [ ] **真实 AI 接入** — ContentAssistant/适配器/异常检测当前全是确定性启发式，需接入真实 LLM（OpenAI/Claude API）
- [ ] **WYSIWYG 编辑器** — PRD §3.3 要求 Markdown + 所见即所得双模式，当前仅 Markdown（可集成 TipTap/Slate）
- [x] **OAuth callback 硬编码修正**（M39 ✅）：新增 `packages/platform-sdk/src/oauth-callback.ts`：`OAUTH_CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE?.replace(/\/+$/,{}) ?? 'https://your-domain.com'` + `callbackUrlFor(platform) = ${BASE}/callback/${platform.toLowerCase()}` + `encodedCallbackFor`；`AdapterBase.callbackFor(platform)` 受保 helper 复用；所有 8 个适配器（douyin/twitter/weibo/bilibili/wechat-official/wechat-video/youtube/xiaohongshu）均从内联 `https://your-domain.com/callback/{platform}` 改为 `this.callbackFor()`（Twitter/Weibo/YouTube 同时修 query+body 两处）；`.env.example` 增 `OAUTH_CALLBACK_BASE=` 注释；单测 `oauth-callback.spec.ts` 3（默认宿/路径拼接/小写 slug）；`platform-sdk` 包现有适配测试 43 + 新 3 = 46 全绿；API 527 不变
- [ ] **平台 SDK mock→真实调用** — 抖音/小红书/公众号/视频号/微博 publish() 返回占位 URL，逐步接入真实平台 API
- [ ] **数据库迁移 SQL 文件** — 当前仅 Prisma schema，缺少版本化 migration 文件

## 重要约束
- **每次完成必须按「铁律」更新文档，不得跳过**
- 所有 commit message 使用英文
- 每个重要完成后必须 commit + push
- 如果遇到无法解决的问题，记录到 docs/BLOCKERS.md 并继续下一项
- 使用 TypeScript strict mode
- 所有 API 必须有 DTO 验证
- 所有 Service 必须有单元测试
- 保持代码质量，不要为了速度牺牲质量

**测试**: 412 通过 / 38 套件 ✅

不要停止，除非遇到真正的阻碍。
