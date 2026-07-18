# ContentHub — 完整开发计划

> 创建: 2026-07-17 | 基于: PRD v2.0 | 状态: 执行中 | 更新: 2026-07-18（第5次）

> **当前进度（2026-07-18 第22次）**: M1–M41 全部完成（含自定义报表拖拽生成）。剩余：账号健康度阈值告警（🟢）、真实 AI 接入（🔧）、平台 SDK mock→真实调用（🔧）、数据库 migration SQL 文件（🔧）

---

### M41: V1.1 — 自定义报表拖拽生成 (Custom Drag-and-Drop Reports) (PRD §3.5 P2)
**目标:** 用户拖拽字段生成自定义报表，支持保存/加载/导出 CSV。

- [x] **后端 API** — `AnalyticsController` 新增端点（`GET /analytics/report-fields`、`POST /analytics/reports/generate`、`GET /analytics/reports`、 `GET /analytics/reports/:id`、`DELETE /analytics/reports/:id`）；`AnalyticsService` 提供 `getAvailableFields()`、`generateReport()`、`saveReport()`、`listReports()`、`getReport()`、`deleteReport()`；`CustomReport` Prisma 模型已存在
- [x] **DTO 校验** — `ReportConfigDto`、`ReportFilterDto`（`report.dto.ts`）覆盖生成与保存请求体验证
- [x] **单元测试** — 控制器 **6** 单测（report-fields/generate/save/list/get/delete）+ 服务 **14** 单测（getAvailableFields、generateReport 过滤/分组/排序、saveReport 创建/更新、listReports、getReport、deleteReport）；64 测试全绿
- [x] **前端页面** — `apps/web/src/app/(app)/reports/page.tsx`：
  - 左侧：可拖拽字段列表（HTML5 DnD），按 category 分组（account/content/engagement/time/dimension）
  - 中间：报表画布（已选字段排序/删除、Group by、Sort by/direction、Filters 增删改）
  - 右侧：报表预览（表格展示生成结果）
  - 顶部：Generate/Save/Load/Export CSV 按钮
  - 响应式：`grid-cols-1 md:grid-cols-3`，移动端垂直堆叠
- [x] **导航集成** — `Sidebar.tsx` 新增「Reports」入口（📋）；`MobileNav.tsx` 替换低频「Settings」为「Reports」
- [x] **类型检查** — API + Web typecheck 全绿；543 测试 / 48 套件（含 64 analytics 测试）

---

### M30b: V1.1 — WYSIWYG 编辑器集成 (WYSIWYG Editor Integration) (PRD §3.3)
**目标:** 在内容编辑页面集成 TipTap 富文本编辑器，与已有 Markdown 编辑器实现双模式切换，补齐 PRD §3.3 缺失能力。

- [x] **WYSIWYG 编辑器组件** — `apps/web/src/components/WysiwygEditor.tsx`：基于 TipTap (`@tiptap/react`)，包含 B/H1/H2/H3/bullet/ordered/quote/code/link 工具栏，HTML↔Markdown 双向转换（turndown），拖拽上传图片，媒体库插入；`value/onChange` 受控接口与 MarkdownEditor 完全对齐
- [x] **`package.json` 依赖** — `@tiptap/react` / `@tiptap/starter-kit` / `@tiptap/extension-image` / `@tiptap/extension-link` / `turndown`（dependencies）+ `@types/turndown`（devDependencies）
- [x] **编辑页集成** — `apps/web/src/app/(app)/contents/[id]/page.tsx`：编辑器工具栏新增「切换编辑器」按钮（Rich text ↔ Markdown），共享同一个 `body` 状态，表单操作（save/version/rollback）完全不受影响；默认 Markdown 模式保持向后兼容
- [x] **新建内容集成** — `apps/web/src/app/(app)/content/page.tsx`：新建表单默认 WYSIWYG 编辑器，Template 表单同样支持模式切换
- [x] **typecheck** — 修复 TipTap v3 `setContent` API 签名变更 + turndown 类型声明缺失，`pnpm typecheck` 全绿

---

> **此前（第20次）**: M1–M38 +

> **此前较早**: （PRD §3.4 P1）：Prisma schema 新增 `PublishReceipt {contentId/platformPostId/accountId/platform/externalId/externalUrl/assetId(`MediaAsset.` 1:1 unique)/receiptHash unique/metadata}` + receipts 关系挂 `Content`/`PlatformPost`/`SocialAccount`；迁移 `20260719110000_publish_receipts`（平台/资产/哈希三元 UNIQUE + contentId index + 外键级联/SetNull）；`ScreenshotProvider` seam（抽象类）+ `NoopScreenshotProvider` 默认（无头浏览器未就绪抛 fallback 位；未来可换 Playwright/Puppeteer 注入 `SCREENSHOT_PROVIDER`）；`MediaService.buildReceiptCard`（sharp SVG→PNG，渲染发布元数据卡：标题/平台/内容 ID/外部 ID+URL/时间 ISO）+ `attachReceiptCard` 写 `/uploads/receipts/{id}.png`（fs 失败降级 → metadata base64 回水，仍落 MediaAsset 行）；`PublishReceiptService.generate` 三阶段：① 字段校验 + 算 input 元组 SHA-256 幂等 hash（idempotent 默认命中返回 / `idempotent:false` 二次抛 Conflict）② `screenshot.capture` + 失败警告降级 ③ `buildReceiptCard`+`attachReceiptCard` 写 MediaAsset，落 PublishReceipt 行并标 `assetId`（优先 screenshot.assetId）；`listByContent`/`get(id)`/`verify(id)`（哈希重算验证 tamper-evident）；控制器 `POST /receipts?GenerateReceiptDto`（纯 `@IsEnum(Platform)`+`@IsString`）/`GET /receipts?contentId`+`GET /:id`+`GET /:id/verify`（全部 `JwtAuthGuard`+Swagger）；`ReceiptModule` 接入 `AppModule`；sharp 作为 api `dependency` 显式安装；`test/prisma.mock.ts` 增 `publishReceipt` delegate；单测 **15**（service 10 + controller 5），sharp 渲染在测试环境可执行，527 测试 / 48 全绿，typecheck 全绿。

> **此前（第19次）**: M1–M37 全部完成 + **M37 AI 回复建议**（PRD §3.6）：`AiReplySuggestionsService`（确定性启发式，无外部 LLM，与 ContentAssistant / scheduling-recommend 同风格）：`suggest(commentId, signal)` → `{signal:{intent,score,topics}, suggestions:[{variant,confidence,text}]×2}`；意图分类 `complaint|praise|question|neutral`（强负+score<-0.25 complaint / 疑问词短评 question / 正 / neutral）；主题抽取 中英关键词映射 quality/service/shipping/refund/delivery/bug/pricing/support 最多 3；主变体 `variantFor`（complaint → empathetic 或 purchaser/high-like professional / praise → grateful / question → helpful / verified → professional / 其他 enrolling）+ `fallbackFor`；`scoreVariant` 基础分 + 主变体提升 + 高互动 complaint 向 professional 倾斜，钳 0.2–0.99；5 类模板 variants empathetic/grateful/enrolling/helpful/professional 中英分支（isChinese 自动识别）；`EngagementService.aiSuggestReplies(commentId)` 查信号并委托；`EngagementModule` 注册 provider；控制器 `GET /engagement/comments/:id/reply-suggestions`（`JwtAuthGuard` + Swagger）；单测 **15**（engine 8 + engagement.service 2 + controller 1 proxy），511 测试 / 46 套件全绿，typecheck 全绿。

> **此前（第18次）**: M1–M36 全部完成 + **M36 BullMQ 适配层**（PRD §3.4）：新增 `QueueService`（`QueueKind='prisma'|'bullmq'` 可拔插 seam，`prisma` 为默认不引 Redis）：`publish/schedulePublish()`（委托 SchedulerService.schedule 立落 PublishJob 行）/ `runPublishTick(now, limit)`（自 `getDueJobs` + 逐 job 原子 `executeJob`，单 job 失败计入 failed 不中断 tick，返回 `{processed, succeeded, failed}`）/ `runEngagementSyncTick()`（调 engagement.syncAllTeams 聚合 teams/comments/messages）/ `runAnomalyScanTick()`（调 analytics.scanAllAndAlert 统计 accounts/anomalies/teamsAlerted）；kind=bullmq 显式 throw 预留位；`QueueModule` 聚合 imports（SchedulerModule + EngagementModule + AnalyticsModule）+ 注册 `QUEUE_KIND` provider；`EngagementModule` 新增 export `EngagementService`（修复 worker/Queue 跨模块 DI）；重写 `src/worker.ts`：全部由 `app.get(QueueService)` 经 seam 委托 tick，poll/SIGINT/SIGTERM/batch/interval 语义完全不变（仅把直调 service 改成 queue.*Tick）；单测 `queue.service.spec.ts` **11**（kind 报告/publish alias/tick 空/成功全跑/容错部分失败/limit/不支持 kind 抛 /engagement 聚合与 0 /anomaly 计数），501 测试 / 45 套件全绿，typecheck 全绿。

> **此前（第17次）**: M1–M35 全部完成 + **M35 余额钱包 / 用量计费**（PRD §4.4）：Prisma schema 新增 `Wallet {teamId(unique), balance, holdBalance, currency}` + `WalletTransaction {walletId, type TransactionType, amount(signed), balanceAfter, refId, note}` + enum `TransactionType { TOPUP, REFUND, PUBLISH, SCHEDULE, SYNC, MEDIA_PROCESS, AI_ASSIST }` + `WalletTransaction.[walletId,createdAt]` 索引 + `Team.wallet` 1:1；迁移 `20260719100000_wallet_billing`（含 CREATE TYPE + 两表 + 外键级联）；`WalletService`：`getOrCreateWallet`（findUnique + 懒创建）/ `balance`（balance - holdBalance = available）/ `topUp(teamId,{amount,note})`（@IsPositive 校验 + `$transaction` upsert increment+写 TOPUP 账行）/ `debit(teamId,type,{refId,note,minBalance})`（price=0 返回 null · `prisma.wallet.findUnique` 缺则 NotFound · 余额-价格<minFloor 则 Conflict · `$transaction` decrement balance+写账行）/ `tryDebit(...,lenient)` · `listTransactions(teamId,{skip,take})` 降序分页 · `setPrices/getPrices` 可变 rate card（PUBLISH=10 SCHEDULE=5 SYNC=2 MEDIA_PROCESS=8 AI_ASSIST=3 TOPUP·REFUND=0）；控制器 `GET /wallet/:teamId/balance` + `POST /wallet/:teamId/top-up` + `POST /wallet/:teamId/debit` + `GET /wallet/:teamId/transactions` + `GET/PATCH /wallet/prices`（`JwtAuthGuard` + DTO 校验 + Swagger）；DTO `@IsInt @IsPositive @IsString @MaxLength`；`WalletModule` 接入 `AppModule`；mock 增 `wallet`/`walletTransaction`；单测 **24**（service 17：getOrCreate 命中/创建/balance 缺失/含 hold · topUp 非法金额/upsert ledger · debit free/缺钱包/余额不足/原子扣 · tryDebit 宽容/严格 · listTransactions 缺钱包/分页 · price table 读写 — controller 7 · 均为 mock+stub），490 测试 / 44 套件全绿。

> **此前（第16次）**: M1–M34 全部完成 + **M34 账号转移/交接**（PRD §3.2 P1）：Prisma schema 新增 `AccountTransfer` 表（id/accountId/fromTeamId/toTeamId/initiatorId/note/status `TransferStatus` PENDING|ACCEPTED|REJECTED|CANCELLED/decidedById/decidedAt + `[accountId,status]` & `[toTeamId,status]` 索引、级联删除）+ 迁移 `20260719090000_account_transfer_handover`（含 `CREATE TYPE TransferStatus`）；`AccountTransferService` 二阶段交接：`initiate(sourceTeamId, {accountId,toTeamId,initiatorUserId,note})` 校验同-team 拒绝 / 账号归属 / `assertAdmin`（owner 等同 admin 权限）/ 同 account 活跃 PENDING 冲突 → 创建 PENDING；`decide({transferId,actingUserId,decision})` 校验终态（NotFound/Conflict）/ 目标 team `assertAdmin` → accept 在 `prisma.$transaction` 内原子 写 transfer ACCEPTED + 改 `account.teamId` + `groupId=null`（组是 team 域的），reject 仅标记 REJECTED；`cancel`/`get`/`listForTeam(teamId,{direction:'incoming'|'outgoing'|'all',status})`；控制器 `POST /accounts/:id/transfer`（`InitiateTransferDto` toTeamId + note）+ `PATCH /accounts/:id/transfer`（`DecideTransferDto` accept|reject）+ `DELETE /accounts/:id/transfer` + `GET /accounts/transfers?teamId&direction&status`（`ListTransfersQueryDto`）；全部 `JwtAuthGuard` + `AuditService` `@ApiParam/@ApiBody/@Swagger`；DTO `@IsString @MinLength(1) @IsIn @MaxLength(500)`；`AccountModule` 注册 provider+export；`test/prisma.mock.ts` 增 `accountTransfer` + `$transaction`；单测 **16**（initiate 同 team/缺/非源 team/非 admin/owner 平权/PENDING 冲突/成功｜ decide NotFound/终态冲突/非 admin/accept 事务移动+清 groupId/reject 不动｜ cancel 撤回/终态｜ list 过滤），typecheck 全绿，466 测试 / 42 套件全绿。

> **此前（第15次）**: M1–M33 全部完成 + **M33 智能排期推荐**（PRD §3.4 P2）：`SchedulingRecommendationService`（纯确定性启发式，按 team±accountId 取 90 天 `AnalyticsSnapshot` → 按 day-of-week 分桶计算平均 engagement 率 → `projectSlots` 投影到 `horizonDays` 内严格晚于 `now` 的最近时刻，score 归一化 + confidence=1-e^{-n/12}，按 score 降序返回 top N）；snapshot=0 时回落 `HEURISTIC_WINDOWS` 行业基准并标 `basis:'heuristic'`；单 account 路径校验 `NotFound` / `Forbidden` 团队归属；`GET /scheduler/recommendations`（`RecommendQueryDto` 校验 teamId/slots 1-10/horizonDays 1-30/accountId）；`SchedulerModule` 注入 + export 双服务；控制器 Swagger 注解；单测 **19**（service 13：heuristic 兜底/上下限/归属校验/历史路径 rate clamp/置信度/去重/projection + controller 6），450 测试 / 41 套件全绿，typecheck 全绿。

> **此前（第14次）**: M1–M32 全部完成 + **M32 CSV 批量导入账号**（PRD §3.2 P2）：`csv-parser.ts` 纯函数 RFC 4180 解析器（引用字段/转义双引号/CRLF/LF/ragged 行错误收集）+ `credentialsFromRecord()` 按平台抽取凭证列并覆写 JSON `credentials` 列；`AccountService.batchImport()`（每行独立校验绑定，部分成功不抛错，返回 `BatchImportSummary {total,succeeded,failed,results[]}`）+ `importOne()`（必填/合法平台/already-bound/persist 失败分级）+ `parseImportCsv()`；控制器新增 `POST /accounts/import`（`FileInterceptor('file')` CSV 上传 + 5 MB 上限 + `teamId` + `AuditService` 审计）和 `POST /accounts/import/json`（`ImportAccountsDto` class-validator，`@ArrayMaxSize(200)` 批上限）；DTO `ImportAccountsDto` / `AccountImportRecord` / `ImportAccountsQueryDto`（`@IsEnum(Platform)` + `@MinLength` + `@ArrayNotEmpty/@ArrayMaxSize`）；单元测试 **26 个**（csv-parser 12 + batchImport 8 + controller 6），438 测试 / 40 套件全绿，typecheck 全绿。

> **此前（第13次）**: M1–M31e 全部完成 + **M31e 视频转码 + 封面裁剪**（PRD §3.3 P0）：`VideoProcessingService`（fluent-ffmpeg）多分辨率转码（720p/1080p，mp4/webm，H.264+AAC / libvpx+libvorbis）+ `extractCover()` 时间戳提取单帧 + `getMetadata()` ffprobe 探测；API 端点 `POST /media/video/transcode`、`POST /media/video/cover`、`GET /media/video/:id/metadata`（DTO 校验，`JwtAuthGuard` 保护）；`MediaModule` providers 接入；单元测试 **11 个**；412 测试 / 38 套族全绿，新增 `fluent-ffmpeg` + `@types/fluent-ffmpeg` 依赖。

> **此前（第12次）**: M1–M31d 全部完成 + **M31d 审批超时处理**（PRD §3.7 P0）：Prisma schema 新增 `timeoutHours Int? @default(48)` / `timeoutAction String?`（APPROVE|REJECT|ESCALATE）/ `escalateTo String?` / `firstReminderAt DateTime?` + `@@index([status,createdAt])`；迁移 `20260718150000_workflow_timeout`；`WorkflowTimeoutService`（`processTimeouts()` 扫描到期 PENDING 工作流执行自动动作 + `sendReminders()` 临期 24h 提醒 + `getTimeoutSummary()` 分组汇总）；`WorkflowController` 新增 `PATCH /workflow/:id/timeout-config`（`WorkflowTimeoutConfigDto` + DTO 验证，ESCALATE 必须带 escalateTo）+ `GET /workflow/timeout-summary`（`TimeoutSummaryQueryDto`）；`WorkflowModule` 接入 `NotificationModule` + `AuditModule`；单元测试 **10**（setConfig 成功/NotFound/BadRequest + processTimeouts 三动作/跳过/错误 + sendReminders 发送/跳过 + getTimeoutSummary 分组）；31 tests / 3 suites 全绿，typecheck 全绿。

> **此前（第11次）**: M1–M28 全部完成 + **M29 SDK 补齐**（方向 C 互动层缺失能力）：M29a 小红书 `XiaoHongShuAdapter.refreshToken()`（HMAC 签名 `grant_type=refresh_token`，`getToken()` 过期自动回落；+3 单测）；M29b `PlatformSdkController` 新增 `GET /comments` `POST /comments/reply` `GET /messages`（`FetchCommentsQueryDto/ReplyCommentDto/FetchMessagesQueryDto`，`@IsEnum(Platform)` 校验；+4 控制器单测）；M29c 整条 `replyToMessage` 链路（`PlatformAdapter` 接口新增 → `BaseAdapter` 默认抛错降级 → `BilibiliAdapter` web_im 原生实现 → `PlatformSdkService.replyToMessage` ok/reason → `POST /messages/reply` + `ReplyMessageDto`；全套单测）；M29d 补齐微信公众号/视频号/小红书/抖音 `publish()/fetchMetrics()/refreshToken()` 单测（+12）。平台-sdk 包 **43 passed**（+15），API platform-sdk 模块 **20 passed**（+8），sdk typecheck 全绿。

> **此前（第10次）**: M1–M28 全部完成 + **M28 AI 内容助手**（PRD §3.3 V1.1 AI 辅助写作）：后端 `ContentAssistantService` 纯函数引擎（`optimizeTitles` zh/en 模板策略 + `extractTags` 停用词频排名 + `auditContent` 质量启发式 + 平台限制投射 + 评分评级 + `generateVariants` short/long/formal/social 改写）；`ContentAssistantController`（`POST /assistant/{titles,tags,audit/variants}`，`JwtAuthGuard`）；`ContentAssistantModule` 接入 `AppModule`；单元测试 **33**（服务 26 + 控制器 7）；前端 `ContentAssistant` 四 tab 面板（防抖重投射 + "Use" 应用按钮）挂载编辑器与独立 `/assistant` 草稿工作区、Sidebar 导航入口、共享类型。测试 **367 通过 / 33 API 套件**（+33），API + web typecheck（4 包）与 web build（19 路由）全绿。

> **此前（第9次）**: M1–M27 全部完成。剩余收尾：E2E 测试、CI/CD、生产部署配置、Swagger 文档、用户手册。
>
> **测试**: 334 通过 / 31 API 套件。

> **此前（第6次）**: M1–M24 全部完成 + **M25 内容模板库**（PRD §3.3 P1 内容模板 · 可复用模板库）：后端新增 `ContentTemplate` Prisma 模型（teamId / title / body / contentType / tags[] / createdBy，关联 `Team.templates`）+ 迁移 `20260718080000_content_templates`；`ContentTemplateModule`（`ContentTemplateService` + `ContentTemplateController`）提供 `POST/GET/PUT/DELETE /templates`（`JwtAuthGuard` + `AuditService` 全操作审计，team 级隔离，自由文本搜索，分页）及 `POST /templates/:id/apply`（返回 `TemplateDraftSeed` 供 `ContentService.create` 复用，跨 team 拒绝）；DTO 校验全覆盖（`class-validator`）；单元测试 **13**（创建/默认值/空 team 拒绝、team 分页列表、搜索 OR、findOne/NotFound、update 部分字段、delete + NotFound、apply 标题覆写与跨 team 拒绝）；`test/prisma.mock.ts` 新增 `contentTemplate` delegate；前端 `TemplatePicker` 组件（防抖搜索 + 加载 + 应用）、`/content` 页 Templates 管理面板（CRUD + "New from template" 种子创建表单）、`/contents/[id]` 编辑器内 "Load template" 种子；`lib/types.ts` 新增 `ContentTemplate / TemplateDraftSeed`。测试 **323 通过 / 31 API 套件**（+13），API + web typecheck 与 build 全绿。
>
> **本轮新增（审查修复 + 平台扩展）**: (1) **审查发现修复** — 调度 `handleFailure` 增加指数退避（`RETRY_BACKOFF_BASE_MS * 2^attempt`，上限 60s），避免轮询器对故障平台紧循环重试；`worker.ts` 移除过时的 `GRACE_MS` 注释；OAuth `@Post(':platform/authorize')` 从 `@Query()` 改为 `@Body()`（前端发送 JSON body，原绑定导致 @MinLength 校验必然 400）；`Media` 上传页改为走共享 api client（统一 401 处理 + 刷新重试）；前端 `api.ts` 新增 refresh token 持久化 + 401 自动刷新一次重试链路（登录/注册/mfaLogin 均持久化 refreshToken，logout 清除）；`decryptCredentials` 解密失败回退时补 debug 日志；治理 `/engagement` 页面无操作的 setter 死代码。(2) **Twitter 适配器** — `TwitterAdapter`（OAuth2 PKCE 授权 / X API v2 发布 / 粉丝指标，评论/私信回退 BaseAdapter 默认抛错）+ 工厂注册 + 5 单元测试。(3) **YouTube 适配器** — `YouTubeAdapter`（OAuth2 授权 / 视频元数据创建 / 频道指标 subs+views / 评论 fetch+reply，私信回退默认抛错）+ 工厂注册 + 7 单元测试。

---

### M30c: V1.1 — 账号健康度指标阈值告警 (Account Health Threshold Alerting) (PRD §3.2)
**目标:** アカウント健康度スコアを算出し、チームしきい値以下に対して自動通知。全計算は導出（derived）で、既存の `SocialAccount.lastSyncedAt` ・ `PublishJob(status=FAILED)` ・ `User.credentials` から算出し、スキーマ変更は不要。

- [x] **`HealthService`（`apps/api/src/modules/health/health.service.ts`）** — 純粋ヘルス評価ロジック：
  - `evaluateAccount(accountId)` → `AccountHealth`（`HEALTHY|WARNING|CRITICAL` + スコア 0-100 + signals）
  - `evaluateTeam(teamId)` → `TeamHealthSummary`（全アカウント + `totals` 集計）
  - `runTeamCheck(teamId, notify)` → チーム全体チェック +  Broadcast
  - `computeScore(signals)` → 警告10点・深刻25点減点しクランプ（純粋関数）
  - `scoreToLevel(score, config)` → スコアclassListify。`config` は環境変数 or プロセス内オーバーライド
  - `get/setThresholdConfig(teamId?)` / `setTeamThresholdConfig` → `HEALTH_CRITICAL_THRESHOLD` (default 40) / `HEALTH_WARNING_THRESHOLD` (default 65) + in-memory override
  - `listActiveAlerts(teamId)` / `checkThresholdAlerts(teamId, notify)` → しきい値スイープ + Broadcast 一次性通知（`notified` を返却）
  - `evaluate(account, now)` → 純粋コア（clock injectable）
  - 信号: `TOKEN_EXPIRED` / `TOKEN_EXPIRES_SOON` / `API_LIMIT_HIGH` / `STALE_DATA` / `RECENT_PUBLISH_FAILURES` / `CONSECUTIVE_FAILURES` / `ACCOUNT_INACTIVE`

- [x] **`HealthModule`（`apps/api/src/modules/health/health.module.ts`）— `NotificationModule` 依存**
- [x] **`HealthController`（`apps/api/src/modules/health/health.controller.ts`）** — `JwtAuthGuard` 保護エンドポイント:
  - `GET health-monitor/accounts/:id` → 単一アカウント評価
  - `GET health-monitor/teams/:teamId` → チームサマリー
  - `POST health-monitor/teams/:teamId/run` → チーム実行 + Broadcast
  - `GET health-monitor/teams/:teamId/alerts` → しきい値アラート（dry-run）
  - `POST health-monitor/teams/:teamId/threshold-check` → しきい値スイープ + Broadcast
  - `PATCH health-monitor/teams/:teamId/threshold-config` → しきい値上書き

- [x] **DTO — `dto/health.dto.ts`** — `@IsString @MinLength(1)` / `@IsInt @Min(0) @Max(100)` バリデーション＋ Swagger
- [x] **`QueueService.runThresholdScanTick()`** — `teams` ループ → `HealthService.checkThresholdAlerts(teamId, true)` → `{teams, alerts, teamsNotified}` 返却。失敗チームはログのみ続行
- [x] **`worker.ts` — `THRESHOLD_SCAN_INTERVAL_MS` (30min) — スロットル。開始ログに `threshold scan every ~ms`、tick で `X alert(s), Y team(s) notified` 出力**
- [x] **`queue.service.spec.ts` — `runThresholdScanTick` 2 テスト（0 返却 / チーム横断 counting）**
- [x] **`.env.example` — `WORKER_HEALTH_SCAN_INTERVAL_MS=1800000` 追加**
- [x] **ユニットテスト — 17 passing**（`HealthService` 12 + `QueueService` 2 new + 3 pre-existing threshold tests in `app.e2e-spec.ts`)

### M28: V1.1 — AI 内容助手 (Content Assistant) (PRD §3.3 V1.1)
**目标:** 为作者提供确定性、无依赖的 AI 写作辅助：标题优化、关键词提取、内容审核、多平台文案改写——与异常检测引擎/内容适配引擎相同的纯函数形态（后续可替换为真实 LLM 而不动 DTO/控制器）。

- [x] **纯函数引擎** — `ContentAssistantService`：四操作
  - `optimizeTitles`：zh/en 语言检测 + 策略模板（how-to/list/question/guide/journey/time-box/myth/curiosity），确定性种子生成 N（3..8）并按种子循环取 `count`（1..10）个不重复变体；
  - `extractTags`：英文小写词频（长度≥3，去停用词）+ CJK 连续词组整词（2-5 字）与长串 bigram，合并排序取 top N（1..20）；
  - `auditContent`：跨切质量启发式（EMPTY_BODY/BODY_TOO_SHORT/BODY_TOO_LONG/ALL_CAPS/EXCESSIVE_PUNCTUATION/WALL_OF_TEXT，中/英消息）+ 按 `PLATFORM_ORDER` 规范顺序的平台限制投射（正文截断/图片丢弃/视频丢弃/时长下限），返回 0-100 评分与 good/needs-work/poor 评级，及 findings 列表；
  - `generateVariants`：按风格改写 short（首句截断）/long（追加 CTA）/formal（去 emoji/标签 + 前言）/social（emoji + 话题标签），支持 `all` 返回全部四风格
- [x] **API 端点** — `POST /assistant/{titles,tags,audit/variants}`（`:id` 路由无冲突），`JwtAuthGuard` 保护，控制器透传 DTO
- [x] **模块注册** — `ContentAssistantModule`（controller + provider + export）接入 `AppModule`
- [x] **单元测试** — **33**（服务 26：标题数量/钳制/中英模板/确定性/策略/空回退、标签频序/英文停用词/空/上限/去 markdown、审核空扣分/清洁 good/平台截断/全大写/重复标点/子集顺序/丢图、变体全风格/单风格/short 截断/社交标签/语言检测；控制器 7：守卫 + 四端点透传）
- [x] **前端面板** — `ContentAssistant` 四 tab 组件（titles/tags/audit/variants），300ms 防抖重投射 + "Use this" 应用按钮（标题/正文回写编辑器；标签为建议展示），错误/加载态
- [x] **编辑器集成** — `/contents/[id]` 编辑态挂载于 AdaptationPreview 下方，含 markdown 图片/视频计数
- [x] **独立工作区** — `/assistant` 草稿页（标题/正文/类型 + 助手面板），Sidebar "✨ AI assistant" 入口（Content 与 Calendar 之间）
- [x] **前端类型** — `TitleVariant/TitleOptimizeResult/TagExtractResult/AuditSeverity/AuditFinding/PlatformAudit/ContentAuditResult/VariantStyle/CopyVariant/VariantGenerateResult/VARIANT_STYLE_LABELS/AUDIT_GRADE_LABELS/AUDIT_GRADE_TONE` 纳入 `lib/types.ts`

### M31e: V1.1 — 视频转码 + 封面裁剪 (Video Transcoding + Cover Extraction) (PRD §3.3 P0)
**目标:** 视频转码管线 + 封面帧提取 + 元数据探测，补齐 PRD §3.3 P0 核心缺失

- [x] **`VideoProcessingService`（`apps/api/src/modules/media/video-processing.service.ts`）**——`fluent-ffmpeg` 封装：
  - `transcode(inputPath, {resolutions, format})` → 多分辨率多格式；H.264+AAC（mp4）/ libvpx+libvorbis（webm）；输出 `{basename}_transcoded/` 目录
  - `extractCover(videoPath, timeSeconds)` → `seekInput().frames(1)` 提取帧到 `{basename}_cover.jpg`
  - `getMetadata(videoPath)` → `ffprobe` 探测 duration/width/height/codec；视频流缺失时回退 0/空
  - 私有 `assertFileExists` → `NotFoundException`
  - 错误 → `BadRequestException`（ffmpeg 错误友好透传）
- [x] **API 端点** — `MediaController` 新增三路，`JwtAuthGuard` 保护：
  - `POST /media/video/transcode`（multipart: file + `TranscodeVideoDto` body）→ 异步转码，返回 `outputDir`
  - `POST /media/video/cover`（multipart: file + `ExtractCoverDto` body）→ 返回 `coverPath`
  - `GET /media/video/:id/metadata` → `findOne(id)` + 构造视频路径 + `getMetadata`
- [x] **DTO 校验** — `TranscodeVideoDto`（`@IsOptional @IsArray @ArrayNotEmpty @IsString(each) @Transform` + `@IsEnum(TRANSCODE_FORMATS)`）、`ExtractCoverDto`（`@IsInt @Min(0) timeSeconds`），Swagger 注解
- [x] **`MediaModule`** — providers 新增 `VideoProcessingService`，exports 同步
- [x] **单元测试** — `video-processing.service.spec.ts` **11 个**（转码 2+1+1 / 封面 1+1+1 / 元数据 2+1+1）；`media.controller.spec.ts` 注入 mock + findOne 返回 url
- [x] **依赖** — 安装 `fluent-ffmpeg` `@types/fluent-ffmpeg`
- [x] **测试** — 412 通过 / 38 套件 ✅（+11 视频单测，+1 控制器）
- [x] **typecheck** — 仅 `workflow-timeout.service.ts` 预存错（disjoint，已记入 BLOCKERS）

### M32: V1.1 — CSV 批量导入账号 (Batch Account Import) (PRD §3.2 P2)
**目标:** 以 CSV 或 JSON 批量导入第三方平台账号，补齐 PRD §3.2 P2 缺失能力。

- [x] **CSV 解析器** — `csv-parser.ts` 纯函数（无外部依赖）RFC 4180：支持引用字段、转义双引号、CRLF/LF、ragged 行列数不一致收集为错误记录而不中断；`headers` → `rows: Record<string,string>[]` → `errors: CsvRowError[]`
- [x] **凭证复合** — `credentialsFromRecord(platform, rec)`：从 `appid/secret, clientKey/clientSecret, appKey/appSecret, accessKey, bearerToken, apiKey, clientId, callbackUrl` 等通用凭证列中抽取非空值，再合并一个可选 JSON `credentials` 列（解析失败静默忽略）
- [x] **服务层** — `AccountService`：
  - `importOne(teamId, row)`: 必填字段检查 / `Platform` 枚举校验 / already-bound 去重 / `composeCredentials` + `crypto.encrypt` 持久化；失败返回 `{error}` 而不抛错
  - `batchImport(teamId, rows)`: 逐行调用 `importOne`，聚合成 `BatchImportSummary { total, succeeded, failed, results: ImportRowResult[] }`，允许部分成功
  - `parseImportCsv(csv)`: 包一层 `parseCsv` + `credentialsFromRecord`，输出 `{rows, parseErrors}`
- [x] **API 端点** — `AccountController` 新增双入口：
  - `POST /accounts/import`（`FileInterceptor('file')` CSV 上传 + 5 MB 上限 + `teamId` + `AuditService` 审计）
  - `POST /accounts/import/json`（`ImportAccountsDto` 校验 body + `@ArrayMaxSize(200)` 批上限 + 审计）
- [x] **DTO** — `ImportAccountsDto` / `AccountImportRecord` / `ImportAccountsQueryDto`（`@IsString @MinLength(1) @IsEnum(Platform) @IsArray @ArrayNotEmpty @ArrayMaxSize(200) @IsObject` 全覆盖，Swapper 注解）
- [x] **单元测试** — `csv-parser.spec.ts` **12**（引用/转义/CRLF/ragged/空行/空输入/凭证列+JSON 列/malformed 静默）+ `account.service.spec.ts` **8** 增量（parseImportCsv / batchImport 全路径/无效平台/空值/already-bound/persist 失败/空输入）+ `account-import.controller.spec.ts` **6**（无文件无 teamId/超 5MB/解析+审计/错误前置/JSON 透传）= **26**
- [x] **测试** — 438 通过 / 40 套件 ✅（+26），typecheck 全绿

### M38: V1.1 — 发布回执截图留档 (Publish Receipt + Screenshot Archiving) (PRD §3.4 P1)
**目标:** 发布成功后可生成服务器端防篡改回执 + 留档素材（截图 seam + 卡图 fallback），补齐 PRD §3.4 P1 缺失能力。

- [x] **Prisma schema** — `PublishReceipt { contentId, platformPostId (unique), accountId, platform, externalId, externalUrl, assetId (MediaAsset 1:1 @unique), receiptHash (@unique), metadata }`；`Content.receipts` / `PlatformPost.receipt` / `SocialAccount.receipts` / `MediaAsset.receipt` 关系；迁移 `20260719110000_publish_receipts`(三元 UNIQUE + index + 外键 SetNull/Cascade)
- [x] **`MediaService.buildReceiptCard`** — sharp SVG→PNG 标题卡（蓝底 + 平台 / 内容 ID / 外部 ID+URL / ISO 时间）+ `attachReceiptCard`: 写 `/uploads/receipts/{id}.png` (fs 失败降级 metadata base64 回水)，落 MediaAsset (type=IMAGE)
- [x] **Screenshot seam** — `ScreenshotProvider` 抽象类 + `NoopScreenshotProvider` 默认；future 接入 Playwright/Puppeteer
- [x] **`PublishReceiptService`** — `{generate, listByContent, get, verify}`；generate 三阶段：① 字段校验 + input 元组 SHA-256 哈希 → 幂等命中返回 / `idempotent:false` 二次 throw Conflict ② `screenshot.capture(externalUrl,...)`(+ 失败降级日志) ③ `buildReceiptCard` + `attachReceiptCard` 落 MediaAsset + store PublishReceipt（assetId 优先 screenshot.assetId）；`verify(id)` 重算哈希判 tamper-evident
- [x] **API** — `JwtAuthGuard`：`POST /receipts`(`GenerateReceiptDto`) + `GET /receipts?contentId` + `GET /:id` + `GET /:id/verify`；class-validator enum+string + Swagger
- [x] **模块 + dep** — `ReceiptModule` 接入 `AppModule`；sharp 显式 api dependency；mock 增 `publishReceipt` delegate
- [x] **测试** — `receipt.service.spec.ts` **10**（哈希确定性/illegal 字段/idempotent/二次/截图失败降级/capture 抛错降级/list/get/verify tamper）+ `receipt.controller.spec.ts` **5**（generate/list/get/verify 透传）= **15**
- [x] **测试** — 527 通过 / 48 套 ✅（+15），typecheck 全绿

### M37: V1.1 — AI 回复建议 (AI Reply Suggestions) (PRD §3.6)
**目标:** 为评论收件箱生成草稿回复，补齐 PRD §3.6 缺失能力。无外部 LLM，确定性启发式。

- [x] **`AiReplySuggestionsService`（`apps/api/src/modules/engagement/ai-reply-suggestions.service.ts`）** —纯函数引擎：
  - `suggest(commentId, {sentiment, score, content, likeCount, replied, isVerified?, isPurchaser?})` → `{signal:{intent, score, topics}, suggestions:[{variant,confidence,text}]×2}`
  - `classifyIntent`：`complaint`（NEGATIVE && score < -0.25）· `question`（短评语含 吗?呢 等疑问词）· `praise`（POSITIVE）· `neutral`
  - `extractTopics`：中英 keyword→topic map，最多 3（quality/service/shipping/refund/delivery/bug/pricing/support）
  - `variantFor`·`fallbackFor`：5 类 tone（empathetic / grateful / enrolling / helpful / professional），complaint→empathetic 或 purchaser+/high-like→professional；praise→grateful；question→helpful；verified→professional；否则 enrolling
  - `scoreVariant`：基础分 + 主变体 +0.3 + 高互动 complaint 倾向 professional；钳 0.2–0.99
  - `render`×5 中英文分支，按 isChinese 自动选模板，并引用评论 firstSentence
- [x] **`EngagementService.aiSuggestReplies`** —新增编排方法：查 comment 行、组装 signal、委托 service
- [x] **`EngagementModule` + `EngagementController` — GET /engagement/comments/:id/reply-suggestions**（`JwtAuthGuard` + Swagger）
- [x] **单元测试** — `ai-reply-suggestions.service.spec.ts` **8**（数量/complaint 变体/verified-professional/grateful/question-helpful/topics/中文 empathetic/confidence 窗口）+ `engagement.service.spec.ts` **2**（未找到/信号代写）+ `engagement.controller.spec.ts` **1 proxy**（含 controller 新端点）= **11**；总 engagement 43 含其它
- [x] **测试** — 511 通过 / 46 套件 ✅（+10），typecheck 全绿

### M36: V1.1 — BullMQ 适配层 (Queue Seam) (PRD §3.4)
**目标:** 把 worker 的 poll 调度抽成可拔插的 Queue seam，为真实 BullMQ/Redis 接入预留位，同时让 dispatch 逻辑可单元测试。

- [x] **`QueueService`（`apps/api/src/modules/queue/queue.service.ts`）** — `QueueKind='prisma'|'bullmq'` seam：
  - `publish(contentId, platform, scheduledAt)` / `schedulePublish(payload)` → 委托 SchedulerService.schedule 立落 PublishJob 行
  - `runPublishTick(now, limit)`：自 `scheduler.getDueJobs` 取 due jobs + 逐 job 原子 `scheduler.executeJob`（单 job 失败计入 failed 不中断 tick），返回 `{processed, succeeded, failed}`；kind=bullmq 显式 throw 预留位
  - `runEngagementSyncTick()`：调 `engagement.syncAllTeams` 聚合 `{teams, comments, messages}`
  - `runAnomalyScanTick()`：调 `analytics.scanAllAndAlert` 统计 `{accounts, anomalies, teamsAlerted}`
- [x] **`QueueModule`** — imports SchedulerModule + EngagementModule + AnalyticsModule；providers QueueService + `QUEUE_KIND` provider（默认 `process.env.QUEUE_KIND ?? 'prisma'`）；exports QueueService
- [x] **`EngagementModule`** — 新增 `exports: [EngagementService]`（修复 worker/Queue 跨模块 DI）
- [x] **`src/worker.ts`** — 重写：全部由 `app.get(QueueService)` 经 seam 委托 tick；保留 POLL_INTERVAL_MS / BATCH_SIZE / ENGAGEMENT_SYNC_INTERVAL_MS / ANOMALY_SCAN_INTERVAL_MS 与 SIGINT/SIGTERM 优雅停机；新增 `toMs` 防负 setTimeout clamp
- [x] **单元测试** — `queue.service.spec.ts` **11**（kind 报告/publish alias/tick 空/成功全跑/容错部分失败/limit/不支持 kind 抛 /engagement 聚合与 0 /anomaly 计数）
- [x] **测试** — 501 通过 / 45 套件 ✅（+11），typecheck 全绿

### M35: V1.1 — 余额钱包 / 用量计费 (Credit Wallet / Usage Billing) (PRD §4.4)
**目标:** 团队级信用钱包 + 操作级用量计费，补齐 PRD §4.4 缺失能力。

- [x] **Prisma schema** — `Wallet { teamId(unique), balance, holdBalance, currency CREDIT }` + `WalletTransaction { walletId, type TransactionType, amount(signed 正=充值/负=消费), balanceAfter, refId, note }` + enum `TransactionType { TOPUP, REFUND, PUBLISH, SCHEDULE, SYNC, MEDIA_PROCESS, AI_ASSIST }`；`WalletTransaction.[walletId, createdAt]` 索引；`Team.wallet` 1:1；迁移 `20260719100000_wallet_billing`
- [x] **`WalletService`（`apps/api/src/modules/wallet/wallet.service.ts`）** — 全 `prisma.$transaction` 原子化：
  - `getOrCreateWallet(teamId)`：findUnique，缺失则 create(balance=0) 幂等
  - `balance(teamId)`：返 {balance, holdBalance, available=balance-hold, currency}；缺钱包返 0
  - `topUp(teamId,{amount,note})`：校验整数正数；`$transaction`内 `wallet.upsert(increment amount)` + 写 TOPUP 账行(balanceAfter=新余额)；审计一致
  - `debit(teamId,type,{refId,note,minBalance=0})`：查 price 表（PUBLISH=10/SCHEDULE=5/SYNC=2/MEDIA_PROCESS=8/AI_ASSIST=3/TOPUP·REFUND=0）；price=0 返回 null；缺钱包 → NotFound；`balance-price<minFloor` → Conflict（余额不足，拦截操作扣费）；否则 `$transaction` decrement balance + 写账行 amount=-price
  - `tryDebit(...,lenient?)`：宽容模式余额不足返回 false，粗暴错误透传
  - `listTransactions(teamId,{skip,take})`；`setPrices/getPrices` 可变 rate card
- [x] **API 端点** — `WalletController`：`GET /wallet/:teamId/balance` + `POST /wallet/:teamId/top-up`（`TopUpWalletDto`）+ `POST /wallet/:teamId/debit`（`DebitWalletDto` 枚举字符串）+ `GET /wallet/:teamId/transactions` + `GET/PATCH /wallet/prices`（`JwtAuthGuard` + class-validator + Swagger）
- [x] **模块** — `WalletModule` (controller + provider + export) 接入 `AppModule`；`test/prisma.mock.ts` 增 `wallet`/`walletTransaction` delegates
- [x] **单元测试** — `wallet.service.spec.ts` **17**（getOrCreate 命中/创建 · balance 缺钱包/含hold · topUp 非法金额/upsert-ledger · debit free/缺钱包/不足/原子扣 · tryDebit 宽容/严格 · listTransactions 缺钱包/分页 · price table 读写）+ `wallet.controller.spec.ts` **7**（balance/top-up/debit 解析类型/零扣费/未知类型 NotFound/分页/setPrices）= **24**
- [x] **测试** — 490 通过 / 44 套件 ✅（+24），typecheck 全绿

### M34: V1.1 — 账号转移/交接 (Account Transfer / Handover) (PRD §3.2 P1)
**目标:** 两阶段团队间账号所有权转让，补齐 PRD §3.2 P1 缺失能力。

- [x] **Prisma schema** — `AccountTransfer { accountId, fromTeamId, toTeamId, initiatorId, note, status TransferStatus, decidedById?, decidedAt? }` + enum `TransferStatus { PENDING, ACCEPTED, REJECTED, CANCELLED }` + `@@index([accountId, status])` / `@@index([toTeamId, status])`；`SocialAccount.transfers` 关系；迁移 `20260719090000_account_transfer_handover`（含 CREATE TYPE + 两个索引 + 外键级联删除）
- [x] **`AccountTransferService`** — `initiate(sourceTeamId,{accountId,toTeamId,initiatorUserId,note})` 校验同 team/源 team/admin/活跃 PENDING 冲突 → 创建 PENDING；`decide({transferId,actingUserId,decision})` NotFound/终态/目标 team `assertAdmin`，accept 在 `$transaction` 内原子写 ACCEPTED + `account.teamId`/`groupId=null`；`cancel`（发起人或源 admin）/ `get` / `listForTeam(teamId,{direction:'incoming'|'outgoing'|'all',status})` / `activeTransferFor`；私有 `assertAdmin`（member ADMIN 或 team owner）
- [x] **API 端点** — `POST /accounts/:id/transfer`（`InitiateTransferDto {toTeamId,note?}`）+ `PATCH /accounts/:id/transfer`（`DecideTransferDto {decision:'accept'|'reject'}`）+ `DELETE /accounts/:id/transfer` + `GET /accounts/transfers?teamId&direction&status`（`ListTransfersQueryDto`），全部 `JwtAuthGuard` + `AuditService` 审计 + Swagger
- [x] **DTO** — `@IsString @MinLength(1) toTeamId` / `@IsIn accept|reject` / `@IsIn incoming|outgoing|all` / `@MaxLength(500) note`
- [x] **模块** — `AccountModule` providers+exports 增 `AccountTransferService`；`test/prisma.mock.ts` 增 `accountTransfer` + `$transaction`
- [x] **单元测试** — `account-transfer.service.spec.ts` **16** + `account-import.controller.spec.ts` provider 更新
- [x] **测试** — 466 通过 / 42 套件 ✅（+54），typecheck 全绿

### M33: V1.1 — 智能排期推荐 (Smart Scheduling Recommendation) (PRD §3.4 P2)
**目标:** 根据历史参与率数据为团队推荐最佳发布时间档，补齐 PRD §3.4 P2 缺失能力。

- [x] **`SchedulingRecommendationService`（`apps/api/src/modules/scheduler/scheduling-recommendation.service.ts`）** ——纯确定性启发式：
  - `recommend(teamId, {accountId, slots, horizonDays, now})`：按 team（或可选 account）拉最近 90 天 `AnalyticsSnapshot` → 按 `snapshotDate.getDay()` 分桶 → 计算 per-bucket 平均 engagement 率（`engagements/impressions`，钳 0-1）→ 排名天档 → `projectSlots` 投影到 `horizonDays` 内严格晚于 `now` 的最近 `dayOfWeek+hour` 出现时刻（ISO key 去重）；score 归一化 0-1，`confidence = 1 − e^{-n/12}`；snapshot=0 时回落 `HEURISTIC_WINDOWS` 行业基准 `(Sat 10, Fri 19, Sun 20, …)` 并标 `basis:'heuristic'`
  - `projectSlots(ranked, horizonDays, now)`：纯 helper，对 `nextOccurrence` 投影 + score 排序 + 去重
  - 单 account 路径先查 `socialAccount.findUnique`：不存在 → `NotFoundException`，跨 team → `ForbiddenException`
  - `nextOccurrence(dayOfWeek, hour, now, horizonDays)` 纯函数：从 now 下一分钟起逐日找下一个匹配窗口，超出 horizon 返回 null
- [x] **API 端点** — `SchedulerController.getRecommendations`（`GET /scheduler/recommendations`，`JwtAuthGuard` + `Swagger`，委托给 service 透传 slots/horizonDays/accountId）
- [x] **DTO 校验** — `RecommendQueryDto`（`@IsOptional @IsString @MinLength(1)` teamId/accountId、`@IsInt @Min(1) @Max(10)` slots、`@IsInt @Min(1) @Max(30)` horizonDays，Swagger）
- [x] **`SchedulerModule`** — providers 增 `SchedulingRecommendationService` 并 export 双服务
- [x] **单元测试** — `scheduling-recommendation.service.spec.ts` **13**（heuristic 兜底/上下限/归属 NotFound/Forbidden/成功 scope/历史路径 rate >1 clamp/置信度 >0/空 impressions 回落/projection 严格晚于 now 在 horizon 内/去重/projection helper）+ `scheduler.controller.spec.ts` **6** 增量（含推荐透传）= **19**
- [x] **测试** — 450 通过 / 41 套件 ✅（+19），typecheck 全绿

### M30: V1.1 — 审批超时处理 (Approval Timeout Handling) (PRD §3.7 P0)
**目标:** 审批超时自动通过/驳回/升级，补齐 PRD §3.7 要求的核心缺失功能。

- [x] **M29a 小红书 refreshToken** — `XiaoHongShuAdapter`：`handleCallback` 捕获 `refresh_token`（可选字段，兼容旧响应）；新增 `refreshToken()` 以 `createHmac('sha256', appSecret)` 签名向 `/api/oauth/v1/token` 发 `grant_type=refresh_token` 旋转 access/refresh；`getToken()` 在缓存 token 过期时自动回落 `refreshToken()`；+3 单测（捕获 refresh_token / 旋转 + HMAC 签名校验 / 无 refresh token 抛错）
- [x] **M29b Controller 评论/私信端点** — `PlatformSdkController` 新增 `GET /comments`（`FetchCommentsQueryDto`）→ `service.fetchComments`；`POST /comments/reply`（`ReplyCommentDto`）→ `service.replyToComment`；`GET /messages`（`FetchMessagesQueryDto`）→ `service.fetchMessages`。DTO 全部 `@IsString/@MinLength(1)/@IsEnum(Platform)` + Swagger 注解；+4 控制器单测（透传 accountId/platform/postExternalId/commentId/content）
- [x] **M29c 私信回复整条链路** — `PlatformAdapter` 接口新增 `replyToMessage(accountId, messageId, content): Promise<void>`；`BaseAdapter.replyToMessage` 默认抛 `${platform} does not support replying to private messages`；`BilibiliAdapter.replyToMessage` 原生实现 `web_im/v1/web_im/send_msg`（msg_type=1 纯文本）；`PlatformSdkService.replyToMessage`（解析账号→构造适配器→try/catch 返回 `ReplyOutcome { ok, reason }` 优雅降级）；`POST /messages/reply` + `ReplyMessageDto`；adapter（Bilibili 原生 + 降级）+ service（ok + degrade）+ controller 全套单测（+5）
- [x] **M29d 适配器单元测试补齐** — 补齐 `publish()/fetchMetrics()/refreshToken()` 单测（M29d：WechatOfficial publish/fetchMetrics + refreshToken 降级抛错、WechatVideo publish/fetchMetrics/refreshToken、XHS publish/fetchMetrics（refreshToken 在 M29a）、Douyin publish/fetchMetrics（refreshToken 已有）；共 +12）

### M31d: V1.1 — 审批超时处理 (Approval Timeout Handling) (PRD §3.7 P0)
**目标:** 审批超时自动通过/驳回/升级，补齐 PRD §3.7 要求的核心缺失功能

- [x] **Prisma schema 扩展** — `Workflow` 新增 `timeoutHours Int? @default(48)` / `timeoutAction String?`（APPROVE|REJECT|ESCALATE）/ `escalateTo String?` / `firstReminderAt DateTime?` + `@@index([status,createdAt])`；迁移 `20260718150000_workflow_timeout`
- [x] **WorkflowTimeoutService** — `processTimeouts()` 扫描到期 PENDING 工作流执行自动动作（APPROVE→状态改 APPROVED / REJECT→状态改 REJECTED / ESCALATE→重新指派给 escalateTo 用户）；`sendReminders()` 临期 24h 提醒（首次提醒标记 `firstReminderAt` 防重复）；`getTimeoutSummary()` 分组汇总（overdue/approaching/ok）；所有动作写 `AuditLog` + `broadcastToTeam` 通知
- [x] **API 端点** — `PATCH /workflow/:id/timeout-config`（`WorkflowTimeoutConfigDto`，`@IsIn(['APPROVE','REJECT','ESCALATE'])` 校验，ESCALATE 必须带 escalateTo）；`GET /workflow/timeout-summary`（`TimeoutSummaryQueryDto`，`@IsInt @Min(1)` windowHours）
- [x] **模块接线** — `WorkflowModule` 接入 `NotificationModule` + `AuditModule`；`WorkflowController` 注入 `WorkflowTimeoutService`
- [x] **单元测试** — **10**（setConfig 成功/NotFound/BadRequest + processTimeouts 三动作/跳过未到期/错误记录 + sendReminders 发送/跳过 + getTimeoutSummary 分组）；31 tests / 3 suites 全绿
- [x] **typecheck** — `pnpm --filter=@content-hub/api typecheck` 全绿

## 一、项目现状评估

### 1.1 已有基础
- ✅ 项目脚手架（monorepo: pnpm + Turborepo）
- ✅ 后端框架（NestJS + Prisma + PostgreSQL）
- ✅ 前端框架（Next.js + TailwindCSS）
- ✅ 10 个后端模块骨架（Controller + Service + DTO）
- ✅ 基础测试框架（Jest + @nestjs/testing）
- ✅ 数据库迁移文件
- ✅ Docker + Nginx 配置

### 1.2 缺失/不完善
- ❌ 大部分 Service 只有基础 CRUD，缺少核心业务逻辑
- ✅ 前端全部核心页面（内容/账号/审批/发布/数据/媒体/团队/通知/审计/设置/仪表盘）+ Engagement Hub + OAuth 绑定
- ✅ Content Studio：Markdown 编辑器（Write/Preview 双栏、格式工具栏、XSS 安全预览）、图片拖拽上传、媒体库选取
- ✅ 审批流（Workflow）和审计日志（Audit）（已合并到 master）
- ✅ 发布调度（Scheduler）：Prisma 轮询 worker + 指数退避重试 + 条件 markRunning 防双发
- ✅ 平台 SDK 8 个适配器（WECHAT_OFFICIAL / WECHAT_VIDEO / DOUYIN / XIAOHONGSHU / BILIBILI / WEIBO / TWITTER / YOUTUBE）+ 工厂
- ✅ 前端路由、布局、API 客户端（含 refresh token 自动刷新、401 登出）
- ✅ Engagement Hub：评论/私信摄入、回复、统计、模板、关键词告警、定时轮询
- ⚠️ BullMQ 未集成（Prisma 轮询 worker 替代）
- ⚠️ CI/CD 配置（GitHub Actions）、用户手册待补

### 1.3 分支状况
- `master`: 主分支，M1–M20 + V1.1 平台扩展 + 审查修复均已合并
- 无悬空 worktree / 特性分支

---

## 二、里程碑规划

### M8: 合并 worktree 分支 + 完善基础（当前阶段）
**目标：** 合并 worktree 的 M5/M6 代码，完善项目基础

- [ ] 合并 worktree-content-hub-m5 分支到 master
- [ ] 解决可能的冲突
- [ ] 确保所有测试通过
- [ ] 完善错误处理和日志

### M9: 核心业务逻辑补全
**目标：** 补全各模块核心业务逻辑

- [ ] Auth: 完善 JWT + Refresh Token + argon2 密码哈希
- [ ] User: 完善 CRUD + 软删除 + 用户搜索
- [ ] Team: 完善成员管理 + RBAC 权限
- [ ] Account: 完善多平台绑定 + 凭证加密存储
- [ ] Content: 完善富文本内容 + 版本管理 + 标签系统
- [ ] Media: 完善文件上传 + 图片处理 + 视频管理
- [ ] Workflow: 完善审批流引擎 + 多级审批
- [ ] Scheduler: 集成 BullMQ + 定时发布 + 失败重试
- [ ] Analytics: 完善数据看板 + 趋势分析 + 异常检测
- [ ] Audit: 完善操作日志 + 资源追踪

### M10: 前端开发
**目标：** 完整的前端功能页面

- [ ] 项目结构优化（路由、布局、状态管理）
- [ ] 认证页面（登录/注册/密码重置）
- [ ] 仪表盘（数据概览、快速操作）
- [ ] 账号管理（绑定/分组/健康度）
- [ ] 内容编辑器（富文本/Markdown/媒体管理）
- [ ] 审批中心（待审批/已审批/审批详情）
- [ ] 发布管理（定时发布/发布队列/历史）
- [ ] 数据看板（趋势图/对比分析/排行）
- [ ] 团队管理（成员/角色/权限）
- [ ] 个人设置（通知/安全/API Key）

### M11: 平台 SDK 扩展
**目标：** 支持更多社交平台

- [ ] 微信公众号 SDK 完善
- [ ] 微信视频号 SDK
- [ ] 抖音开放平台 SDK
- [ ] 小红书专业号 SDK
- [ ] Bilibili SDK
- [ ] 平台适配器抽象层

### M12: 高级功能
**目标：** V1.1 功能

- [x] 评论聚合（互动管理）— 纳入 M20 Engagement Hub
- [x] 通知系统（站内 + 团队广播）— 纳入 M12 通知中心
- [x] 数据导出（CSV）— 纳入 M12
- [ ] AI 辅助写作集成
- [ ] 智能排期推荐
- [ ] 自定义报表

---

## 已完成的收尾项（M30）

- [x] **CI/CD** — GitHub Actions `.github/workflows/ci.yml`（lint+typecheck→build→test→e2e→openapi→deploy）
- [x] **生产部署** — `docker-compose.prod.yml`（db+redis+api+web+nginx）+ `Dockerfile.api` + `Dockerfile.web` + `docker-entrypoint.sh`
- [x] **E2E 测试** — `apps/api/test/journey.e2e-spec.ts`（注册→登录→创建内容→审批→发布核心用户旅程）
- [x] **Swagger/OpenAPI** — `deepScanRoutes` + `/api/docs-json` + `scripts/export-openapi.ts` + CI OpenAPI artifact + 增强的 Swagger 描述
- [x] **测试覆盖** — 376 测试 / 34 套件全部通过

---

## 缺失功能清单（2026-07-18 PRD 审查）

> 全面 PRD Review 后识别的缺失项，按优先级排序。对齐 `CLAUDE-TASK.md` 方向 B。

### 🔴 高优先级（P0/P1，核心缺失）
- [ ] 邮件/Webhook 通知（PRD §3.2）— 当前仅站内广播，缺 SMTP/SES + Webhook
- [ ] 账号分组（PRD §3.2 P0）— 按项目/品牌/平台分组
- [ ] 视频转码 + 封面裁剪（PRD §3.3 P0）
- [ ] 图片在线裁剪 + 加水印 + 滤镜（PRD §3.3 P0）
- [x] 审批超时处理（PRD §3.7）— 超时自动通过/驳回/升级 ✅ M31d

### 🟡 中优先级（P2，体验提升）
- [ ] CSV 批量导入账号（PRD §3.2 P2）
- [ ] 智能排期推荐（PRD §3.4 P2）
- [ ] 发布回执截图留档（PRD §3.4 P1）
- [ ] 余额钱包/用量计费（PRD §4.4）
- [ ] AI 回复建议（PRD §3.6）
- [ ] 账号转移/交接（PRD §3.2 P1）
- [ ] BullMQ 真实集成（PRD §3.4）— 替代当前 Prisma 轮询 mock
- [x] 移动端响应式/PWA（PRD §4.5）— M40: MobileNav + ServiceWorkerRegistration + manifest.json + sw.js + offline page；Sidebar 抽屉式 + Topbar 汉堡菜单；16 页面 + 12 组件移动响应式适配

### 🟢 低优先级
- [ ] 自定义报表拖拽生成（PRD §3.5 P2）
- [ ] 账号健康度阈值告警（PRD §3.2）

### 🔧 技术债务/质量改进
- [ ] 真实 AI 接入 — ContentAssistant/适配器/异常检测当前全是确定性启发式
- [x] WYSIWYG 编辑器（M30b ✅）— TipTap 富文本编辑器 + Markdown 双模式切换，集成到编辑页和新建内容页
- [x] OAuth callback 硬编码修正（M39）— oauth-callback.ts 共享 resolver（OAUTH_CALLBACK_BASE env → per-platform redirect_uri，`AdapterBase.callbackFor(platform)` helper）；7 个适配器全部改用；spec 3 默认宿/路径拼接/小写 slug
- [ ] 平台 SDK mock→真实调用 — 抖音/小红书/公众号/视频号/微博 publish() 占位 URL
- [ ] 数据库 migration 文件 — 当前仅 Prisma schema

### M40: V1.1 — 移动端响应式 + PWA (Mobile Responsive + PWA) (PRD §4.5)
**代码提交**: `baa4958` `3446c48`
**目标:** 让 ContentHub 前端在手机/平板/桌面全场景可用，PWA 可安装 + 离线缓存。
**目标:** 让 ContentHub 前端在手机/平板/桌面全场景可用，PWA 可安装 + 离线缓存。

- [x] **MobileNav** — `apps/web/src/components/MobileNav.tsx`：底部 5 入口 Tab 导航（Home/Content/Media/Schedule/More），`md:hidden` 仅在移动端显示，含 safe-area-inset-bottom 适配
- [x] **Topbar** — 添加汉堡菜单按钮（`md:hidden`）+ 用户信息文字截断（`truncate max-w-[120px] md:max-w-none`）+ 缩小高度（`h-14 md:h-16`）
- [x] **Sidebar** — 移动抽屉式：backdrop 遮罩 + `translate-x` 动画过渡 + 关闭按钮；md+ 保持原侧边栏行为
- [x] **Layout 状态管理** — `(app)/layout.tsx` 控制 sidebar 开关 + 内容区 `pb-20 md:pb-8` 为底部 Tab 留白
- [x] **globals.css** — safe-area-inset-bottom + `overscroll-beh-y: contain` + 触摸设备优化（min-height 36px + 文本大小调整）
- [x] **manifest.json** — PWA 独立应用清单（standalone / theme_color / icons）
- [x] **sw.js** — Service Worker：precache（offline + icons + manifest）+ runtime cache navigations + GET caching + offline fallback
- [x] **ServiceWorkerRegistration.tsx** — 客户端 SW 注册（load 事件后）
- [x] **offline/page.tsx** — 断网提示页（重试按钮 + 自动重连说明）
- [x] **16 页面移动响应式** — dashboard/analytics/assistant/audit/content/calendar/dashboard/engagement/media/notifications/scheduler/settings/teams/workflow/contents/[id]：grid-cols 移动优先、Table 包裹 `overflow-x-auto`、Select `w-full sm:max-w-[180px]`/`max-w-xs`、按钮 `min-h-[44px]` 触摸目标
- [x] **12 组件移动响应式** — Sidebar/Topbar/LoginForm/Table/MarkdownEditor/MediaLibrary/TemplatePicker/AdaptationPreview/TrendChart/MobileNav/ServiceWorkerRegistration：响应式 padding/文字/触摸目标
- [x] **测试** — Next.js build 18 条路由静态生成成功，typecheck 全绿

### M41: V1.1 — WYSIWYG 编辑器 (PRD §3.3)
**代码提交**: `7133b70`
**目标:** TipTap 富文本编辑器，与 Markdown 双向切换。

- [x] **WysiwygEditor 组件** — 工具栏（B/H1/H2/H3/bullet/ordered/quote/code/link）+ 拖拽上传图片 + HTML↔Markdown 双向转换（turndown.js）
- [x] **集成到内容页面** — `content/page.tsx` + `contents/[id]/page.tsx` Markdown/WYSIWYG 切换
- [x] **`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-image` + `@tiptap/extension-link` + `turndown`** — 依赖已安装
- [x] **Typecheck + build** — web `tsc --noEmit` 全绿，Next.js build 18 条路由成功

### M20: V1.1 — Engagement Hub（互动管理）
**目标：** 统一评论收件箱 + 情感分析 + 快捷回复（PRD §3.6）

- [x] Prisma schema: EngagementComment + Sentiment enum + CommentTemplate + migration
- [x] PlatformSdkService seam: `fetchComments()` / `replyToComment()` with graceful unsupported-adapter degradation
- [x] EngagementModule: service (ingest/list/reply/stats/sentiment heuristic) + JwtAuthGuard-protected controller + DTO validation + unit specs
- [x] 前端 /engagement 页面：收件箱（平台/情感/未回复筛选 + 分页）、回复编辑器、快捷回复模板、统计卡片
- [x] 评论轮询调度：`EngagementService.syncTeam`/`syncAllTeams` + worker 定时摄入 tick（复用 Prisma-polling worker 模式，ENGAGEMENT_SYNC_INTERVAL_MS 默认 10 分钟），前端 `Sync now` 按钮
- [x] 舆情监控关键词告警：`SentimentKeyword` 模型（team 级关注词）+ 蕴含关键词/强负面（score ≤ -0.5）评论自动 `broadcastToTeam` 通知；`GET/POST/DELETE /engagement/keywords` + DTO 校验；前端关键词管理面板
- [x] 私信聚合：`Message` type + `fetchMessages` adapter seam（BaseAdapter 默认抛错降级，Bilibili 原生实现）+ `PlatformSdkService.fetchMessages`；`EngagementMessage` Prisma 模型（unique [accountId,externalId]，含 conversationId/sentByMe）+ 定时摄入 tick；`GET /engagement/messages` + `POST /engagement/messages/ingest` + DTO；前端 Messages tab

### M21: V1.1 — 平台扩展（8 适配器完整覆盖）+ 代码审查修复
**目标：** 补齐 Platform 枚举中声明但未实现的适配器，并在此轮代码审查中修复发现的问题

- [x] **Twitter 适配器** — `TwitterAdapter`（OAuth2 PKCE 授权 / X API v2 `2/tweets` 发布 / 用户指标 followers_count；评论/私信回退 BaseAdapter 默认抛错降级）+ 工厂注册 + 5 单元测试
- [x] **YouTube 适配器** — `YouTubeAdapter`（OAuth2 授权 / 视频元数据创建 / 频道指标 subs+views / `commentThreads` fetch + `comments` reply；私信回退默认抛错）+ 工厂注册 + 7 单元测试
- [x] **调度重试退避** — `handleFailure` 增加指数退避 `RETRY_BACKOFF_BASE_MS * 2^attempt`（上限 60s），避免轮询器对故障平台紧循环重试；新增测试验证重试任务 scheduledAt 推进到未来
- [x] **OAuth POST 参数绑定** — `@Post(':platform/authorize')` 从 `@Query()` 改为 `@Body()`，修复前端 JSON body 发送时 @MinLength 校验必然 400 的 bug
- [x] **前端 token 刷新** — `api.ts` 新增 refresh token 持久化 + 401 自动刷新一次后重试链路（含 multipart upload 路径）；`auth.tsx` 登录/注册/mfaLogin 持久化 refreshToken，logout 清除
- [x] **Media 上传统一客户端** — /media 页改为走共享 `api.upload`，享用统一 401 处理与刷新重试
- [x] **SDK 凭据解密告警** — `decryptCredentials` 解密失败回退时补 debug 日志
- [x] **worker.ts 过时注释** — 移除不存在的 `GRACE_MS` 引用，改为准确描述条件 markRunning 防双发
- [x] **治理** — 清理 `/engagement` 页面无操作 setter 死代码

### M22: V1.1 — 异常检测引擎 (Analytics Anomaly Detection) (PRD §3.5 P1)
**目标：** 5 类指标异常自动检测 + 团队通知广播，复用现有 AnalyticsSnapshot 时序、NotificationService.broadcastToTeam 与 worker 轮询骨架

- [x] **纯函数检测器** — `anomaly.detector.ts`：5 规则（突降 >50% vs 7 日均值、突增 >200%、连续 3 周期下滑、单周期断崖 >80%、粉丝单日掉粉 >5%），依赖无关、独立单元测试 16 个
- [x] **AnalyticsService 编排** — `detectAccountAnomalies`（快照→日度时序→检测器）、`scanAccountAndAlert`（签名去重 + broadcastToTeam）、`scanAllAndAlert`（遍历活跃账号）、`listAlerts`
- [x] **AnomalyAlert Prisma 模型 + 迁移** — 记录 `(accountId, teamId, signature, count)`，`@@index` 于 `[accountId,createdAt]`/`[teamId,createdAt]`；签名去重避免持续异常刷屏
- [x] **API 端点** — `GET /analytics/anomalies/:accountId`、`POST /analytics/anomalies/scan`（单账号/全量 + notify 开关）、`GET /analytics/anomaly-alerts`（审计/列表）；DTO 校验（`class-validator`）+ `JwtAuthGuard`
- [x] **worker 慢周期轮询** — `ANOMALY_SCAN_INTERVAL_MS`（默认 6h），复用 engagement sync 模式；索引列失败仅 record 不中断
- [x] **前端 Analytics 异常面板** — Scan 按钮（PageHeader + 面板内 Refresh）+ `Badge` 严重度（danger/warning）+ `ANOMALY_TYPE_LABELS` 中文类型；类型 `Anomaly`/`AnomalyType`/`AnomalySeverity` 纳入 `lib/types`；演示用 `notify: false` 预览

### M23: V1.1 — 内容日历 (Content Calendar) (PRD §3.3 P1)
**目标:** 月视图排期日历，聚合已排期内容与发布任务，补全 Content Studio 的"日历/列表视图排期"能力

- [x] **Prisma 模型复用** — 直接利用现有 `Content.scheduledAt` + `PublishJob.scheduledAt`，无需迁移
- [x] **ContentService.calendar 编排** — 聚合 `SCHEDULED/PUBLISHING` 内容 + `QUEUED/RETRYING` PublishJob，按 UTC 日历日分组为完整月份网格；PublishJob 仅存 `contentId`（无 Content 关系），故单独批量查 Content 解析标题
- [x] **DTO 校验** — `CalendarQueryDto`（`@IsInt @Min(2000) @Max(2100)` year / `@IsInt @Min(1) @Max(12)` month）
- [x] **API 端点** — `GET /contents/calendar?year=&month=`（置于 `:id` 路由之前，避免 "calendar" 被当 id 捕获）
- [x] **单元测试** — 3 服务单测（网格分组 + 事件归日、月份窗口查询条件、闰年 2 月 29 天）+ 1 控制器单测（year/month 透传）
- [x] **前端月视图** — `apps/web/src/app/(app)/content/calendar/page.tsx`：6×7 月网格（前后月淡显、今日圈选、选中 ring 高亮、事件 chip + 计数 badge）、月份前后翻瓣 + "Today" 按钮、选中日详情 Table（标题链接到内容详情/作业置为纯文本、类型/平台/状态/时间列）
- [x] **导航接入** — Sidebar 新增 📅 Calendar 入口（位于 Content 与 Media 之间）
- [x] **前端类型** — `CalendarEvent` / `CalendarDay` / `CalendarResponse` / `CALENDAR_EVENT_TONE` 纳入 `lib/types`

### M24: V1.1 — 内容适配引擎 (Content Adaptation) (PRD §3.4 P1)
**目标:** 发布管线按各平台规则自动适配正文/媒体，并提供实时「适配预览」让作者发布前知晓截断与裁剪情况

- [x] **规则目录** — `platform-rules.ts`：8 平台 `PLATFORM_RULES`（maxLength / imageMax / videoMax / minDurationSec / 中文 hints）+ `PLATFORM_ORDER` 规范顺序（PRD 给出的微信/抖音/小红书/B站 + V1.1 微博/Twitter/YouTube/微信视频号补齐）
- [x] **纯函数引擎** — `AdaptationService.adapt()` 按规范顺序投射：正文超限自动截断（预留 `…` 严格在上限内）、图片/视频按上限裁剪（`min(count, max)`，超出计数并 warning）、短视频_DURATION 低于 minDuration 标 warning（不影响 fits 仅提示）；`adaptForPublish()` 管线便利方法，未知平台返回 `null` 让调用方原样通过
- [x] **API 端点** — `POST /adaptation/preview`（实时投射）+ `GET /adaptation/rules`（规则目录）+ `JwtAuthGuard`；DTO `PreviewAdaptationDto`（`@IsInt @Min` 校验 body/contentType/imageCount/videoCount/videoDurationSec/platforms）+ `PlatformRulesQueryDto`
- [x] **发布管线接入** — `PlatformSdkService.publish()` 在调 `adapter.publish()` 前 `adaptForPublish(account.platform, body)`，截断后 publish 并 `logger.warn` 提示作者；`PlatformSdkModule` 导入 `AdaptationModule`
- [x] **全局模块** — `AdaptationModule` 标 `@Global()`（与 `PrismaModule` 同模式），解决 `EngagementModule/SchedulerModule` 直接注入 `PlatformSdkService` 时的 DI 解析
- [x] **单元测试** — 25 个（规范目录全平台 + 投射顺序 + 截断 + 媒体裁剪 + DURATION + 组合 fit/warnings/hints + `adaptForPublish` 管线便利方法 + `getRules`）
- [x] **管线集成断言** — `platform-sdk.service.spec` 注入真实 `AdaptationService`，新增 over-limit 截断用例（30000→≤20000 字草稿 content）
- [x] **前端预览组件** — `AdaptationPreview.tsx`：防抖 `POST /adaptation/preview`，按平台卡片（✓/✗ Badge、正文字数、图片/视频裁剪、⚠ 警告 + hints），顶部 Badge 汇总 N/M 适配；挂载 `contents/[id]` 编辑器下方（正文取编辑态/展示态，图片数由 Markdown `![]()` 引用计数）
- [x] **前端类型** — `PlatformAdaptation` / `AdaptationResult` / `PlatformRule` 纳入 `lib/types`

### M13: 测试 + 部署 + 文档
**目标：** 生产就绪

- [x] 单元测试覆盖率 ≥ 80%（lines 91.9% / funcs 92.5%，已达目标）
- [ ] E2E 测试
- [ ] CI/CD 配置（GitHub Actions）
- [ ] 生产环境部署配置
- [ ] API 文档（Swagger/OpenAPI）
- [ ] 用户手册

---

## 三、技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | NestJS 10 |
| ORM | Prisma 5 |
| 数据库 | PostgreSQL 15 |
| 消息队列 | BullMQ + Redis |
| 认证 | JWT + argon2 |
| 前端框架 | Next.js 14 |
| 样式 | TailwindCSS |
| 状态管理 | Zustand |
| API 客户端 | TanStack Query |
| 测试 | Jest + Supertest |
| 部署 | Docker + Nginx |

---

## 四、开发规范

### 4.1 代码规范
- TypeScript strict mode
- ESLint + Prettier
- 所有 API 必须有 DTO 验证
- 所有 Service 必须有单元测试
- 数据库操作必须通过 Prisma

### 4.2 Git 规范
- Commit: `feat:` / `fix:` / `build:` / `chore:` / `test:`
- 每完成一个里程碑 commit + push
- 分支策略: master + feature branches

### 4.3 测试规范
- 单元测试: 所有 Service 方法
- 集成测试: 关键 API 流程
- E2E 测试: 核心用户旅程
- Mock Prisma 进行单元测试

---

## 五、验收标准

### 功能验收
- [x] 用户注册登录完整流程 (M9)
- [x] 团队创建和成员邀请 (M9)
- [x] 多平台账号绑定（≥8 平台） (M9/M11/M21)
- [x] 内容创建编辑和版本管理 (M9/M19/M26)
- [x] 审批流程完整流转 (M8)
- [x] 定时发布和批量发布 (M9)
- [x] 数据看板展示核心指标 (M9)
- [x] 操作日志完整记录 (M8)
- [x] 前端管理面板，含全部核心页面 (M10)
- [x] 站内通知 + 团队广播 (M12)
- [x] 双因素认证 TOTP (M18)
- [x] Engagement Hub — 互动管理：统一评论收件箱 + 情感分析 + 快捷回复 (M20)
- [x] 内容排行榜 Top/Bottom 自动标记 (M27)
- [x] 内容版本回滚 (M26)
- [x] 内容模板库 (M25)
- [x] 内容适配引擎 (M24)
- [x] 内容日历 (M23)
- [x] 异常检测引擎 (M22)

### 技术验收
- [x] 所有测试通过 (213 API + 10 SDK)
- [x] 构建无错误
- [ ] API 响应时间 < 200ms (待生产压测)
- [x] 测试覆盖率 ≥ 80% (lines 91.9%, branches 63%, funcs 92.5%) — 2026-07-18 达标

---

_文档结束_
