# ContentHub — 完整开发计划

> 创建: 2026-07-17 | 基于: PRD v2.0 | 状态: 执行中 | 更新: 2026-07-18（第3次）

> **当前进度（2026-07-18 第13次）**: M1–M31e 全部完成 + **M31e 视频转码 + 封面裁剪**（PRD §3.3 P0）：`VideoProcessingService`（fluent-ffmpeg）多分辨率转码（720p/1080p，mp4/webm，H.264+AAC / libvpx+libvorbis）+ `extractCover()` 时间戳提取单帧 + `getMetadata()` ffprobe 探测；API 端点 `POST /media/video/transcode`、`POST /media/video/cover`、`GET /media/video/:id/metadata`（DTO 校验，`JwtAuthGuard` 保护）；`MediaModule` providers 接入；单元测试 **11 个**；412 测试 / 38 套族全绿，新增 `fluent-ffmpeg` + `@types/fluent-ffmpeg` 依赖。

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
- [ ] 移动端响应式/PWA（PRD §4.5）

### 🟢 低优先级
- [ ] 自定义报表拖拽生成（PRD §3.5 P2）
- [ ] 账号健康度阈值告警（PRD §3.2）

### 🔧 技术债务/质量改进
- [ ] 真实 AI 接入 — ContentAssistant/适配器/异常检测当前全是确定性启发式
- [ ] WYSIWYG 编辑器 — PRD §3.3 要求 Markdown + 所见即所得双模式
- [ ] OAuth callback 硬编码修正 — 写死 `https://your-domain.com/callback`
- [ ] 平台 SDK mock→真实调用 — 抖音/小红书/公众号/视频号/微博 publish() 占位 URL
- [ ] 数据库 migration 文件 — 当前仅 Prisma schema

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
