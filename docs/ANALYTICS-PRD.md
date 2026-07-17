# Analytics（数据分析）模块 PRD

## 1. 概述

ContentHub 数据分析模块，为已关联的社交账号提供核心指标看板、趋势分析和内容表现分析。

## 2. 用户故事

1. 作为运营人员，我想查看某个社交账号的核心指标总览（粉丝数、互动量、曝光量等）
2. 作为运营人员，我想看历史趋势图（粉丝增长、互动率变化）
3. 作为运营人员，我想对比不同时间段的数据表现
4. 作为管理者，我想看团队整体数据看板（聚合所有账号）
5. 作为内容运营，我想看哪些内容表现最好（Top Posts）

## 3. 功能清单

### 3.1 账号核心指标看板（Account Overview）

- 显示当前账号：头像、名称、平台
- 粉丝数 / 关注数 / 内容数
- 总曝光量 / 总互动量
- 互动率 = (点赞 + 评论 + 转发) / 曝光量
- 与上一周期对比（+/-%）

### 3.2 趋势分析（Trend Analysis）

- 时间范围选择：7天 / 30天 / 90天
- 可切换指标：粉丝增长、曝光量、互动量、点赞、评论、转发
- 折线图展示趋势
- 数据点 tooltip 展示具体数值

### 3.3 内容表现榜（Top Performing Content）

- 列表展示近期内容
- 按曝光量 / 互动量 / 点赞数排序
- 显示：标题、发布时间、曝光、互动、互动率

### 3.4 团队数据总览（Team Dashboard）

- 聚合所有关联账号的总粉丝数
- 各平台占比（饼图）
- 团队内容发布频率
- 最近活动记录（来自 AuditLog）

### 3.5 数据快照（Snapshot）定时采集

- Cron Job 定时拉取社交账号最新指标
- 写入 AnalyticsSnapshot 表
- 为趋势分析提供时间序列数据

## 4. 数据模型

已有：`AnalyticsSnapshot`

```
analyticsSnapshot {
  id
  accountId       → SocialAccount
  snapshotDate    // 快照时间点
  followerCount   // 粉丝数
  followingCount  // 关注数
  postCount       // 内容数
  impressions     // 曝光量
  engagements     // 互动量
  likes           // 点赞
  comments        // 评论
  shares          // 转发
  views           // 播放量/阅读
  extra           // JSON 扩展
  createdAt
}
```

## 5. API 设计

### 5.1 GET /api/v1/analytics/dashboard

团队数据总览（聚合所有账号）

```typescript
{
  code: 0,
  message: 'success',
  data: {
    totalFollowers: number,        // 总粉丝
    totalFollowing: number,        // 总关注
    totalPosts: number,            // 总内容数
    totalImpressions: number,      // 总曝光
    totalEngagements: number,      // 总互动
    engagementRate: string,        // "4.2%"
    platformBreakdown: [           // 各平台占比
      { platform: 'WECHAT_OFFICIAL', followers: 12000, percentage: 60 },
      { platform: 'DOUYIN', followers: 8000, percentage: 40 }
    ],
    recentActivity: []             // 最近 AuditLog
  }
}
```

### 5.2 GET /api/v1/analytics/overview?days=30

某时间范围的核心指标

```typescript
{
  code: 0,
  message: 'success',
  data: {
    period: { start: Date, end: Date },
    followers: { value: number, change: string },   // change: "+5.2%"
    following: { value: number, change: string },
    posts: { value: number, change: string },
    impressions: { value: number, change: string },
    engagements: { value: number, change: string },
    engagementRate: string
  }
}
```

### 5.3 GET /api/v1/analytics/history?metric=followers&period=30d

历史趋势数据

```typescript
{
  code: 0,
  message: 'success',
  data: {
    metric: 'followers',
    period: '30d',
    data: [
      { date: '2026-06-15', value: 10000 },
      { date: '2026-06-16', value: 10050 },
      // ...
    ]
  }
}
```

### 5.4 GET /api/v1/analytics/top-content?sortBy=impressions&limit=10

热门内容榜

```typescript
{
  code: 0,
  message: 'success',
  data: {
    sortBy: 'impressions',
    items: [
      {
        contentId: string,
        title: string,
        platform: Platform,
        publishedAt: Date,
        impressions: number,
        engagements: number,
        likes: number,
        comments: number,
        shares: number,
        engagementRate: string
      }
    ]
  }
}
```

### 5.5 GET /api/v1/analytics/account/:accountId

单账号核心指标

```typescript
{
  code: 0,
  message: 'success',
  data: {
    accountId: string,
    accountName: string,
    platform: Platform,
    followerCount: number,
    followingCount: number,
    postCount: number,
    impressions: number,
    engagements: number,
    engagementRate: string,
    lastSyncedAt: Date
  }
}
```

### 5.6 POST /api/v1/analytics/snapshot/:accountId

手动触发快照采集

```typescript
{
  code: 0,
  message: 'success',
  data: { ...snapshot }
}
```

## 6. 前端界面设计

导航入口：📈 数据分析

### 页面布局（从上到下）

1. **顶部选择栏** — 平台筛选 + 时间范围选择（7d/30d/90d）
2. **核心指标卡片** — 4 张卡片：总粉丝、总互动、曝光量、互动率
3. **趋势图表** — 折线图，可切换指标（CSS/SVG 绘制，无外部依赖）
4. **平台分布** — 横向条形图展示各平台占比
5. **热门内容榜** — 表格，展示 Top 10 内容

### 交互说明

- 点击不同时间范围 → 触发新的 API 请求 → 更新卡片 + 图表
- 点击不同平台 → 过滤数据
- 点击趋势图指标切换 → 重新渲染折线图
- 全部使用 XMLHttpRequest，WeChat X5 兼容

## 7. 验收标准

- [ ] 能查看团队总览数据（聚合所有账号）
- [ ] 能切换 7d/30d/90d 查看不同时间段
- [ ] 趋势折线图正确渲染
- [ ] 热门内容榜正确排序
- [ ] 无外部 JS 依赖，纯原生实现图表
- [ ] WeChat X5 浏览器兼容

## 8. 技术约束

1. 无 Chart.js/ECharts 等图表库 — 纯 CSS + SVG 或 Canvas 绘制
2. 数据来自两个来源：
   - AnalyticsSnapshot 表（历史趋势、粉丝增长）
   - PlatformPost.metrics（内容表现数据）
3. PlatformPost.metrics 字段为 Json? 类型，结构：
   ```json
   {
     "impressions": 1200,
     "likes": 85,
     "comments": 12,
     "shares": 5
   }
   ```
