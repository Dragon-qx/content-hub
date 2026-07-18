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
- [ ] **账号分组** — PRD §3.2 P0 要求按项目/品牌/平台对账号分组，是筛选/统计/报表的基础条件
- [ ] **视频转码 + 封面裁剪** — PRD §3.3 P0，支持多分辨率转码、自动/手动封面裁剪
- [ ] **图片在线裁剪 + 加水印 + 滤镜** — PRD §3.3 P0，在 Media Service 中实现图片处理管线（sharp/jimp）
- [ ] **审批超时处理** — PRD §3.7 要求审批超时自动通过/驳回/升级，当前 workflow 只有创建→审批流程，缺少超时规则引擎

#### 🟡 中优先级（P2，体验提升）

- [ ] **CSV 批量导入账号** — PRD §3.2 P2，支持从 CSV/Excel 批量导入第三方平台账号
- [ ] **智能排期推荐** — PRD §3.4 P2，根据历史数据自动推荐最佳发布时间
- [ ] **发布回执截图留档** — PRD §3.4 P1，发布成功后自动截图留档
- [ ] **余额钱包 / 用量计费** — PRD §4.4，用户余额管理 + 操作计费
- [ ] **AI 回复建议** — PRD §3.6，评论聚合→AI 生成回复草稿
- [ ] **账号转移/交接** — PRD §3.2 P1，支持团队间账号所有权转让
- [ ] **BullMQ 真实集成** — PRD §3.4，当前 Scheduler 用 Prisma 轮询 mock，需替换为真实消息队列
- [ ] **移动端响应式 / PWA** — PRD §4.5，前端页面需做移动端响应式适配

#### 🟢 低优先级（锦上添花）

- [ ] **自定义报表（拖拽生成）** — PRD §3.5 P2，用户拖拽字段生成自定义报表
- [ ] **账号健康度指标阈值告警** — PRD §3.2，健康度低于阈值自动告警

#### 🔧 技术债务 & 质量改进

- [ ] **真实 AI 接入** — ContentAssistant/适配器/异常检测当前全是确定性启发式，需接入真实 LLM（OpenAI/Claude API）
- [ ] **WYSIWYG 编辑器** — PRD §3.3 要求 Markdown + 所见即所得双模式，当前仅 Markdown（可集成 TipTap/Slate）
- [ ] **OAuth callback 硬编码修正** — 当前oauth callback 写死 `https://your-domain.com/callback/...`，需改为环境变量配置
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

不要停止，除非遇到真正的阻碍。
