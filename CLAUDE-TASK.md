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

- [ ] **小红书 refreshToken** — `XiaoHongShuAdapter` 缺少 `refreshToken()` 实现，参考 `BilibiliAdapter` 或 `WeiboAdapter` 的写法，补充刷新逻辑 + 单元测试
- [ ] **Controller 暴露评论/私信端点** — `PlatformSdkController` 目前只有 publish/status/metrics/validate，缺少：
  - `GET /platform-sdk/comments` — 获取评论
  - `POST /platform-sdk/comments/reply` — 回复评论
  - `GET /platform-sdk/messages` — 获取私信
  - 需要配套 DTO（`@nestjs/class-validator`）
- [ ] **私信回复能力** — 当前整个 `replyToMessage` 链路（Service + Controller + 适配器）未实现，平台 API 限制：除了 B站 外都没有公开私信回复接口，需要在 BaseAdapter 中声明 `replyToMessage()` 默认降级，B站 适配器原生实现
- [ ] **适配器单元测试补齐** — 微信公众号、微信视频号、小红书、抖音缺少 `publish()`、`fetchMetrics()`、`refreshToken()` 的单元测试

### 收尾项
- [ ] 单元测试覆盖率 ≥ 80%（当前 lines 91.9% / branches 63% / funcs 92.5%，已达目标 ✅）
- [ ] E2E 测试
- [ ] CI/CD 配置（GitHub Actions）
- [ ] 生产环境部署配置
- [ ] API 文档（Swagger/OpenAPI）
- [ ] 用户手册

## 🔥 铁律：每次完成必须记录

**每次完成一个功能点或修复后，你 MUST：**

1. **更新 CLAUDE-TASK.md** — 将对应的 `[ ]` 改为 `[x]`，写明完成内容
2. **更新 docs/DEVELOPMENT-PLAN.md** — 在对应里程碑下补充完成摘要（参考已有格式）
3. **更新 docs/BLOCKERS.md**（如有阻塞）— 记录遇到的问题和解决方案
4. **commit + push** — commit message 包含里程碑编号

## 当前任务

### 方向 A：收尾加固（推荐优先）
1. E2E 测试（核心用户旅程：登录 → 创建内容 → 审批 → 发布）
2. GitHub Actions CI/CD（lint + test + build + deploy 流程）
3. 生产环境部署配置（docker-compose.prod.yml + 环境变量文档）
4. Swagger/OpenAPI 文档完善
5. 用户手册（docs/USER-GUIDE.md）

### 方向 B：新功能扩展
根据 PRD 功能缺失清单，以下按优先级排序：

#### 🔴 高优先级（P0/P1，核心缺失）

- [ ] **邮件 / Webhook 通知** — PRD §3.2 要求站内+邮件+Webhook 三种通知渠道，当前仅站内广播；需增加邮件通知模块（支持 SMTP/SES）和 Webhook 推送
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
