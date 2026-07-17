# ContentHub — 完整开发计划

> 创建: 2026-07-17 | 基于: PRD v2.0 | 状态: 执行中 | 更新: 2026-07-18（第2次）

> **当前进度（2026-07-18 第2次）**: M1–M20 全部完成 + **V1.1 平台扩展完成**（TWITTER + YOUTUBE）+ **代码审查修复**（调度重试退避、OAuth POST 参数绑定、前端 token 刷新、SDK 凭据解密告警）。8 个平台适配器全部实现（WECHAT_OFFICIAL / WECHAT_VIDEO / DOUYIN / XIAOHONGSHU / BILIBILI / WEIBO / TWITTER / YOUTUBE）。测试 **257 通过 / 28 API 套件** + **SDK 28 通过**，e2e **21 通过**，API + 前端 + SDK 构建全部通过。
>
> **本轮新增（审查修复 + 平台扩展）**: (1) **审查发现修复** — 调度 `handleFailure` 增加指数退避（`RETRY_BACKOFF_BASE_MS * 2^attempt`，上限 60s），避免轮询器对故障平台紧循环重试；`worker.ts` 移除过时的 `GRACE_MS` 注释；OAuth `@Post(':platform/authorize')` 从 `@Query()` 改为 `@Body()`（前端发送 JSON body，原绑定导致 @MinLength 校验必然 400）；`Media` 上传页改为走共享 api client（统一 401 处理 + 刷新重试）；前端 `api.ts` 新增 refresh token 持久化 + 401 自动刷新一次重试链路（登录/注册/mfaLogin 均持久化 refreshToken，logout 清除）；`decryptCredentials` 解密失败回退时补 debug 日志；治理 `/engagement` 页面无操作的 setter 死代码。(2) **Twitter 适配器** — `TwitterAdapter`（OAuth2 PKCE 授权 / X API v2 发布 / 粉丝指标，评论/私信回退 BaseAdapter 默认抛错）+ 工厂注册 + 5 单元测试。(3) **YouTube 适配器** — `YouTubeAdapter`（OAuth2 授权 / 视频元数据创建 / 频道指标 subs+views / 评论 fetch+reply，私信回退默认抛错）+ 工厂注册 + 7 单元测试。

---

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
- [ ] AI 辅助写作集成
- [ ] 智能排期推荐
- [ ] 自定义报表
- [x] 通知系统（站内 + 团队广播）
- [x] 数据导出（CSV）

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

### M13: 测试 + 部署 + 文档
**目标：** 生产就绪

- [ ] 单元测试覆盖率 ≥ 80%
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
- [x] 多平台账号绑定（≥3 平台） (M9/M11)
- [x] 内容创建编辑和版本管理 (M9) — M19 完善：Markdown 编辑器 + 工具栏 + 安全预览 + 图片拖拽上传 + 媒体库
- [x] 审批流程完整流转 (M8)
- [x] 定时发布和批量发布 (M9)
- [x] 数据看板展示核心指标 (M9)
- [x] 操作日志完整记录 (M8)
- [x] 前端管理面板，含全部核心页面 (M10)
- [x] 站内通知 + 团队广播 (M12)
- [x] 双因素认证 TOTP (M18)
- [x] Engagement Hub — 互动管理：统一评论收件箱 + 情感分析 + 快捷回复 (M20)

### 技术验收
- [x] 所有测试通过 (213 API + 10 SDK)
- [x] 构建无错误
- [ ] API 响应时间 < 200ms (待生产压测)
- [x] 测试覆盖率 ≥ 80% (lines 91.9%, branches 63%, funcs 92.5%)

---

_文档结束_
