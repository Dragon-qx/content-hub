# ContentHub — 技术方案（TSD）

> 版本: 1.0 | 创建: 2026-07-15 | Owner: Master

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                         │
│              (React + TypeScript + Tailwind + ShadCN)            │
├──────────────────────────────────────────────────────────────────┤
│                       API Gateway Gateway                       │
│                  (Auth, Rate Limit, Routing)                     │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┤
│Account│Content│Publish│Analytics│Engage│ Notif│ Admin│ Platform    │
│Module │Module │Module │Module   │Module│Module│Module│ Adapter Layer│
├──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────────────┤
│                          Message Queue (BullMQ)                  │
├──────────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  Redis   │  S3 Storage  │  Elasticsearch           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 项目结构

```
content-hub/
├── apps/
│   ├── api/                    # NestJS 后端
│   │   ├── src/
│   │   │   ├── modules/        # 业务模块
│   │   │   │   ├── account/
│   │   │   │   ├── auth/
│   │   │   │   ├── content/
│   │   │   │   ├── publish/
│   │   │   │   ├── analytics/
│   │   │   │   ├── notification/
│   │   │   │   ├── user/
│   │   │   │   └── platform/   # 平台适配层
│   │   │   ├── common/          # 公共工具
│   │   │   ├── config/          # 配置管理
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── test/
│   │
│   └── web/                    # Next.js 前端
│       ├── src/
│       │   ├── app/            # 页面路由
│       │   ├── components/     # UI 组件
│       │   ├── hooks/          # 自定义 hooks
│       │   ├── lib/            # 工具库
│       │   └── types/          # 类型定义
│       └── public/
│
├── packages/
│   ├── shared-types/           # 共享类型定义
│   ├── platform-sdk/           # 平台 SDK 统一接口
│   └── eslint-config/          # 共享 ESLint 配置
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── docker-compose.yml
│
├── docs/
├── scripts/
├── .github/
│   └── workflows/
├── package.json                # Workspace root
├── turbo.json                  # Turborepo config
└── README.md
```

---

## 3. 数据库设计

### 3.1 核心表结构

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String
  passwordHash  String
  avatarUrl     String?
  role          UserRole  @default(OWNER)
  teamId        String?
  team          Team?     @relation(fields: [teamId], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
  isActive      Boolean   @default(true)
  mfaEnabled    Boolean   @default(false)
  mfaSecret     String?
  posts         Post[]
  auditLogs     AuditLog[]
}

model Team {
  id          String   @id @default(cuid())
  name        String
  ownerId     String
  members     Member[]
  accounts    SocialAccount[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Member {
  id        String     @id @default(cuid())
  teamId    String
  team      Team       @relation(fields: [teamId], references: [id])
  userId    String
  role      MemberRole @default(EDITOR)
  joinedAt  DateTime   @default(now())
}

model SocialAccount {
  id              String          @id @default(cuid())
  teamId          String
  team            Team            @relation(fields: [teamId], references: [id])
  platform        Platform
  accountId       String          // 平台唯一标识
  accountName     String
  accountHandle   String?
  credentials     Json            // 平台 OAuth/cookie 加密存储
  status          AccountStatus   @default(ACTIVE)
  followerCount   Int?
  followingCount  Int?
  postCount       Int?
  lastSyncedAt    DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  socialPosts     SocialPost[]
  analytics       AnalyticsSnapshot[]

  @@unique([platform, accountId])
}

model Content {
  id            String         @id @default(cuid())
  teamId        String
  title         String
  body          String?        // Markdown
  contentType   ContentType
  status        ContentStatus  @default(DRAFT)
  scheduledAt   DateTime?
  publishedAt   DateTime?
  createdBy     String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  mediaAssets   MediaAsset[]
  platformPosts PlatformPost[]
  tags          ContentTag[]
  workflow      Workflow[]
}

model MediaAsset {
  id          String   @id @default(cuid())
  contentId   String
  content     Content  @relation(fields: [contentId], references: [id])
  type        MediaType
  url         String
  thumbnailUrl String?
  width       Int?
  height      Int?
  duration    Int?      // 视频时长（秒）
  fileSize    Int       // 字节
  createdAt   DateTime  @default(now())
}

model PlatformPost {
  id              String        @id @default(cuid())
  contentId       String
  content         Content       @relation(fields: [contentId], references: [id])
  platform        Platform
  externalId      String?       // 平台侧内容 ID
  externalUrl     String?
  status          PublishStatus @default(PENDING)
  publishedAt     DateTime?
  retryCount      Int           @default(0)
  lastError       String?
  metrics         Json?         // 最新指标快照
  createdAt       DateTime      @default(now())
}

model PublishJob {
  id            String        @id @default(cuid())
  contentId     String
  status        JobStatus     @default(QUEUED)
  scheduledAt   DateTime
  startedAt     DateTime?
  completedAt   DateTime?
  error         String?
  retryCount    Int           @default(0)
  createdAt     DateTime      @default(now())
}

model AnalyticsSnapshot {
  id              String          @id @default(cuid())
  accountId       String
  account         SocialAccount   @relatiom(fields: [accountId], references: [id])
  snapshotDate    DateTime
  followerCount   Int?
  followingCount  Int?
  postCount       Int?
  impressions     Int?
  engagements     Int?
  likes           Int?
  comments        Int?
  shares          Int?
  views           Int?
  extra           Json?
  createdAt       DateTime        @default(now())

  @@unique([accountId, snapshotDate])
}

// Enums
enum UserRole {
  OWNER
  ADMIN
  EDITOR
  VIEWER
}

enum MemberRole {
  ADMIN
  EDITOR
  VIEWER
}

enum Platform {
  WECHAT_OFFICIAL
  WECHAT_VIDEO
  DOUYIN
  XIAOHONGSHU
  BILIBILI
  WEIBO
  TWITTER
  YOUTUBE
}

enum AccountStatus {
  ACTIVE
  EXPIRED
  SUSPENDED
  REVOKED
}

enum ContentType {
  TEXT
  IMAGE
  VIDEO
  CAROUSEL
  THREAD
  ARTICLE
}

enum ContentStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  ARCHIVED
}

enum PublishStatus {
  PENDING
  QUEUED
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELLED
}

enum JobStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
  RETRYING
}

enum MediaType {
  IMAGE
  VIDEO
  AUDIO
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  action      String
  entityType  String
  entityId    String?
  metadata    Json?
  ipAddress   String?
  createdAt   DateTime @default(now())
}

model ContentTag {
  id        String   @id @default(cuid())
  contentId String
  content   Content  @relation(fields: [contentId], references: [id])
  name      String
  createdAt DateTime @default(now())
}

model Workflow {
  id          String   @id @default(cuid())
  contentId   String
  content     Content  @relation(fields: [contentId], references: [id])
  approverId  String
  status      String   @default(PENDING) // PENDING / APPROVED / REJECTED
  comment     String?
  createdAt   DateTime @default(now())
}
```

---

## 4. API 设计规范

### 4.1 RESTful 规范

| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/v1/accounts            | 账号列表 |
| POST   | /api/v1/accounts            | 绑定账号 |
| GET    | /api/v1/accounts/:id        | 账号详情 |
| DELETE | /api/v1/accounts/:id        | 解绑账号 |
| GET    | /api/v1/contents            | 内容列表 |
| POST   | /api/v1/contents            | 创建内容 |
| GET    | /api/v1/contents/:id        | 内容详情 |
| PUT    | /api/v1/contents/:id        | 编辑内容 |
| DELETE | /api/v1/contents/:id        | 删除内容 |
| POST   | /api/v1/contents/:id/publish | 触发发布 |
| GET    | /api/v1/analytics/overview  | 数据概览 |
| GET    | /api/v1/analytics/accounts/:id | 单账号数据 |
| GET    | /api/v1/analytics/contents/:id | 单内容数据 |

### 4.2 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.3 错误响应

```json
{
  "code": 40001,
  "message": "参数错误",
  "details": [
    { "field": "title", "message": "标题不能为空" }
  ]
}
```

---

## 5. 平台适配层设计

```typescript
// packages/platform-sdk/src/types.ts

export interface PlatformAdapter {
  platform: Platform;
  
  // 认证
  getAuthUrl(state: string): string;
  handleCallback(code: string): Promise<Credentials>;
  refreshToken(refreshToken: string): Promise<Credentials>;
  
  // 内容发布
  publish(post: PublishRequest): Promise<PublishResult>;
  
  // 数据抓取
  fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
  
  // 互动管理
  fetchComments(accountId: string, postId: string): Promise<Comment[]>;
  replyToComment(accountId: string, commentId: string, content: string): Promise<void>;
}

export interface PublishRequest {
  content: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  extra?: Record<string, any>; // 平台特定参数
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
  publishedAt: Date;
}

export interface MetricsResult {
  impressions: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  followerCount: number;
}
```

---

## 6. 关键流程

### 6.1 发布流程

```
内容创建 → 审批（可选）→ 入发布队列 → 平台适配 → 调用平台 API
    ↓           ↓              ↓              ↓             ↓
 保存草稿  审批通知      BullMQ Job    格式转换    结果回写
                                              ↓
                                    失败 → 指数退避重试
                                    成功 → 截图留档 + 通知
```

### 6.2 数据采集流程

```
定时 Cron → 遍历活跃账号 → 调用平台 API → 写入快照表 → 异常检测
                                      ↓
                              API 限制 → 自适应限流
```

---

## 7. 安全设计

| 层面 | 措施 |
|------|------|
| 认证 | JWT + Refresh Token，短期 token 15min |
| 授权 | RBAC + 资源级权限（账号 / 团队隔离） |
| 传输 | 全站 TLS 1.3，HSTS |
| 存储 | 密码 argon2，API Key AES-256-GCM 加密 |
| 审计 | 全操作日志，保留 180 天 |
| 限流 | Redis 滑动窗口，按用户 + 接口维度 |
| 防护 | Helmet、CORS、CSRF Token、参数校验 |

---

## 8. 部署方案

### 8.1 Docker Compose（生产环境）

```yaml
version: "3.9"
services:
  api:
    build: ./apps/api
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/contenthub
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis

  web:
    build: ./apps/web
    environment:
      API_URL: http://api:3000

  worker:
    build: ./apps/api
    command: npm run worker
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  pgdata:
  redisdata:
```

---

## 9. 测试策略

| 类型 | 工具 | 覆盖范围 |
|------|------|----------|
| 单元测试 | Jest | 工具函数、业务逻辑 |
| 集成测试 | Supertest + Jest | API 端到端 |
| E2E | Playwright | 核心用户流程 |
| 负载测试 | k6 | API 性能基线 |

---

## 10. 开发里程碑

| 阶段 | 内容 | 预估 |
|------|------|------|
| M0 | 项目脚手架 + CI/CD | 1 天 |
| M1 | 用户 + 团队 + 账号绑定 | 3 天 |
| M2 | 内容创建 + 编辑 + 媒体 | 3 天 |
| M3 | 发布调度 + 平台适配 | 5 天 |
| M4 | 数据看板 | 4 天 |
| M5 | 审批流 + 操作日志 | 2 天 |
| M6 | 集成测试 + Bug 修复 | 3 天 |
| **总计** | | **~21 天** |

---

## 11. 开放风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 平台 API 政策变更 | 高 | 抽象适配层，快速适配 |
| 数据合规性 | 中 | 用户数据加密、权限隔离 |
| 发布稳定性 | 中 | 队列 + 重试 + 死信队列 |
| 平台限流 | 中 | 自适应限流 + 队列缓冲 |
| API 成本 | 低 | 缓存 + 增量抓取 |

---

_文档结束_
