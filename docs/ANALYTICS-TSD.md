# Analytics（数据分析）模块技术设计书 (TSD)

## 1. 概述

本文档定义 ContentHub 数据分析模块的技术实现方案。基于 NestJS + Prisma + PostgreSQL 技术栈，前端为纯 HTML + Vanilla JS。

## 2. 架构设计

```
┌─────────────────────────────────────────────────┐
│  Frontend (Dashboard)                           │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────┐│
│  │ Overview     │ │ Trend Chart  │ │ Top Posts ││
│  │ Cards        │ │ (SVG)        │ │ Table     ││
│  └──────┬──────┘ └──────┬───────┘ └─────┬─────┘│
│         │ XMLHttpRequest (XHR)           │      │
└─────────┼───────────────────────────────┼──────┘
          │                               │
┌─────────▼───────────────────────────────▼──────┐
│  NestJS API Gateway                            │
│  ┌──────────────────────────────────────────┐  │
│  │ AnalyticsController                      │  │
│  │  GET  /analytics/dashboard               │  │
│  │  GET  /analytics/overview?days=30        │  │
│  │  GET  /analytics/history?metric=&period= │  │
│  │  GET  /analytics/top-content?sortBy=     │  │
│  │  GET  /analytics/account/:accountId      │  │
│  │  POST /analytics/snapshot/:accountId     │  │
│  └─────────────────────┬────────────────────┘  │
│                        │                       │
│  ┌─────────────────────▼────────────────────┐  │
│  │ AnalyticsService (Business Logic)        │  │
│  └─────────────────────┬────────────────────┘  │
│                        │                       │
│  ┌─────────────────────▼────────────────────┐  │
│  │ PrismaService (ORM)                      │  │
│  └─────────────────────┬────────────────────┘  │
└────────────────────────┼───────────────────────┘
                         │
                  ┌──────▼──────┐
                  │ PostgreSQL  │
                  │ Analytics   │
                  │ Snapshot    │
                  └─────────────┘
```

## 3. 后端实现

### 3.1 文件结构

```
apps/api/src/modules/analytics/
├── analytics.module.ts          # 模块注册（已有）
├── analytics.controller.ts      # 控制器（需扩展）
├── analytics.service.ts         # 服务（需扩展）
├── analytics.service.spec.ts    # 单元测试
└── dto/
    ├── analytics-query.dto.ts   # 查询参数校验
    └── snapshot-create.dto.ts   # 快照创建校验
```

### 3.2 AnalyticsModule 更新

**目标**：注册 Controller、Service，导出 Service。

```typescript
// analytics.module.ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
```

### 3.3 DTO 定义

**analytics-query.dto.ts**

```typescript
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}

export class HistoryQueryDto {
  @IsString()
  metric: string; // 'followers' | 'impressions' | 'engagements' | 'likes' | 'comments' | 'shares'

  @IsString()
  period: string; // '7d' | '30d' | '90d'
}

export class TopContentQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'impressions'; // 'impressions' | 'engagements' | 'likes'

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
```

**snapshot-create.dto.ts**

```typescript
import { IsInt, IsOptional, IsDateString } from 'class-validator';

export class SnapshotCreateDto {
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @IsOptional()
  @IsInt()
  followerCount?: number;

  @IsOptional()
  @IsInt()
  followingCount?: number;

  @IsOptional()
  @IsInt()
  postCount?: number;

  // ... 其他指标
}
```

### 3.4 AnalyticsController 更新

在已有 Controller 基础上，新增以下路由：

```typescript
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // 团队数据总览
  @Get('dashboard')
  getTeamDashboard() {
    return this.analytics.getTeamDashboard();
  }

  // 核心指标（含环比对比）
  @Get('overview')
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(query.days);
  }

  // 历史趋势
  @Get('history')
  getHistory(@Query() query: HistoryQueryDto) {
    return this.analytics.getHistory(query.metric, query.period);
  }

  // 热门内容榜
  @Get('top-content')
  getTopContent(@Query() query: TopContentQueryDto) {
    return this.analytics.getTopContent(query.sortBy, query.limit);
  }

  // 单账号指标
  @Get('account/:accountId')
  getAccountMetrics(@Param('accountId') accountId: string) {
    return this.analytics.getAccountMetrics(accountId);
  }

  // 手动触发快照
  @Post('snapshot/:accountId')
  recordSnapshot(
    @Param('accountId') accountId: string,
    @Body() dto: SnapshotCreateDto,
  ) {
    return this.analytics.recordSnapshot(accountId, dto);
  }
}
```

### 3.5 AnalyticsService 实现

核心方法：

```typescript
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. 团队数据总览
  async getTeamDashboard() {
    // 查询所有账号的聚合数据
    const accounts = await this.prisma.socialAccount.findMany({
      include: {
        analytics: {
          orderBy: { snapshotDate: 'desc' },
          take: 1, // 每个账号最新快照
        },
      },
    });

    let totalFollowers = 0;
    const platformMap = new Map<string, number>();

    for (const acc of accounts) {
      totalFollowers += acc.followerCount ?? 0;
      const platform = acc.platform;
      platformMap.set(platform, (platformMap.get(platform) || 0) + (acc.followerCount ?? 0));
    }

    // 计算各平台占比
    const platformBreakdown = Array.from(platformMap.entries()).map(([platform, followers]) => ({
      platform,
      followers,
      percentage: totalFollowers > 0 ? Math.round((followers / totalFollowers) * 100) : 0,
    }));

    // 查询最近活动
    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    });

    return {
      totalFollowers,
      totalFollowing: 0, // 聚合
      totalPosts: await this.prisma.platformPost.count(),
      totalImpressions: 0, // 聚合快照
      totalEngagements: 0, // 聚合快照
      engagementRate: '0.00%', // 计算
      platformBreakdown,
      recentActivity: recentActivity.map(log => ({
        action: log.action,
        userName: log.user?.name || 'Unknown',
        createdAt: log.createdAt,
      })),
    };
  }

  // 2. 核心指标（含环比对比）
  async getOverview(days: number) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    // 查询当前周期和上周期的快照
    const [currentSnapshots, prevSnapshots] = await Promise.all([
      this.prisma.analyticsSnapshot.findMany({
        where: { snapshotDate: { gte: startDate, lte: endDate } },
      }),
      this.prisma.analyticsSnapshot.findMany({
        where: { snapshotDate: { gte: prevStartDate, lte: prevEndDate } },
      }),
    ]);

    // 计算聚合值 + 对比
    // ... 实现略，与 getDashboard 类似
  }

  // 3. 历史趋势
  async getHistory(metric: string, period: string) {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { snapshotDate: { gte: startDate } },
      orderBy: { snapshotDate: 'asc' },
    });

    // 按日期聚合同一指标
    const data = snapshots.map(s => ({
      date: s.snapshotDate.toISOString().split('T')[0],
      value: (s as any)[metric] ?? 0,
    }));

    return { metric, period, data };
  }

  // 4. 热门内容榜
  async getTopContent(sortBy: string, limit: number) {
    const posts = await this.prisma.platformPost.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 100, // 取近 100 条做排序
      include: {
        content: { select: { title: true } },
      },
    });

    // 从 metrics JSON 中提取排序字段，按 sortBy 排序
    const sorted = posts
      .map(p => {
        const metrics = (p.metrics as any) || {};
        return {
          contentId: p.contentId,
          title: p.content?.title || '(untitled)',
          platform: p.platform,
          publishedAt: p.publishedAt,
          impressions: metrics.impressions ?? 0,
          engagements: metrics.likes + metrics.comments + metrics.shares ?? 0,
          likes: metrics.likes ?? 0,
          comments: metrics.comments ?? 0,
          shares: metrics.shares ?? 0,
          engagementRate: metrics.impressions > 0
            ? ((metrics.likes + metrics.comments + metrics.shares) / metrics.impressions * 100).toFixed(2) + '%'
            : '0.00%',
        };
      })
      .sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy])
      .slice(0, limit);

    return { sortBy, items: sorted };
  }
}
```

## 4. 前端实现

### 4.1 文件位置

`apps/web/dashboard/index.html` 中的 `renderAnalytics(el)` 函数

### 4.2 renderAnalytics 重写

```javascript
function renderAnalytics(el) {
  el.innerHTML = '<div class="analytics-page">' +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
    '<select class="form-input" id="analytics-platform" style="width:auto" onChange="loadAnalytics()">' +
    '<option value="">全部平台</option>' +
    '<option value="WECHAT_OFFICIAL">微信公众号</option>' +
    '<option value="WECHAT_VIDEO">微信视频号</option>' +
    '<option value="DOUYIN">抖音</option>' +
    '<option value="XIAOHONGSHU">小红书</option>' +
    '<option value="BILIBILI">B站</option>' +
    '<option value="WEIBO">微博</option>' +
    '</select>' +
    '<select class="form-input" id="analytics-period" style="width:auto" onChange="loadAnalytics()">' +
    '<option value="7d">近 7 天</option>' +
    '<option value="30d" selected>近 30 天</option>' +
    '<option value="90d">近 90 天</option>' +
    '</select>' +
    '</div>' +
    '<div class="stats-grid" id="analytics-stats"></div>' +
    '<div class="card" style="margin-top:16px"><div class="card-body">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
    '<strong>趋势分析</strong>' +
    '<select id="analytics-metric" onchange="loadHistory()" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:4px">' +
    '<option value="followers">粉丝增长</option>' +
    '<option value="impressions">曝光量</option>' +
    '<option value="engagements">互动量</option>' +
    '<option value="likes">点赞</option>' +
    '<option value="comments">评论</option>' +
    '<option value="shares">转发</option>' +
    '</select></div>' +
    '<div id="trend-chart" style="height:200px"></div>' +
    '</div></div>' +
    '<div class="card" style="margin-top:16px"><div class="card-body">' +
    '<strong>热门内容 Top 10</strong>' +
    '<div id="top-content-list" style="margin-top:12px"></div>' +
    '</div></div>' +
    '</div>';

  loadAnalytics();
}
```

### 4.3 loadAnalytics 函数

```javascript
function loadAnalytics() {
  // 1. 加载总览
  api('GET', '/analytics/dashboard', null, function(status, resp) {
    if (status === 200 && resp.data) {
      var d = resp.data;
      document.getElementById('analytics-stats').innerHTML =
        '<div class="stat-card"><div class="stat-label">总粉丝</div><div class="stat-value">' + (d.totalFollowers || 0).toLocaleString() + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">总互动</div><div class="stat-value">' + (d.totalEngagements || 0).toLocaleString() + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">总曝光</div><div class="stat-value">' + (d.totalImpressions || 0).toLocaleString() + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">互动率</div><div class="stat-value">' + (d.engagementRate || '0%') + '</div></div>';
    }
  });

  // 2. 加载趋势
  loadHistory();

  // 3. 加载热门内容
  api('GET', '/analytics/top-content?sortBy=impressions&limit=10', null, function(status, resp) {
    if (status === 200 && resp.data && resp.data.items) {
      var items = resp.data.items;
      var html = '<table><thead><tr><th>标题</th><th>平台</th><th>发布时间</th><th>曝光</th><th>互动</th><th>点赞</th><th>评论</th><th>转发</th><th>互动率</th></tr></thead><tbody>';
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        html += '<tr><td>' + (p.title || '--') + '</td><td>' + p.platform + '</td><td>' + formatTime(p.publishedAt) + '</td><td>' + (p.impressions || 0).toLocaleString() + '</td><td>' + (p.engagements || 0).toLocaleString() + '</td><td>' + (p.likes || 0).toLocaleString() + '</td><td>' + (p.comments || 0).toLocaleString() + '</td><td>' + (p.shares || 0).toLocaleString() + '</td><td>' + p.engagementRate + '</td></tr>';
      }
      html += '</tbody></table>';
      document.getElementById('top-content-list').innerHTML = html;
    }
  });
}
```

### 4.4 SVG 折线图渲染

```javascript
function loadHistory() {
  var metric = document.getElementById('analytics-metric').value || 'followers';
  var period = document.getElementById('analytics-period').value || '30d';
  api('GET', '/analytics/history?metric=' + metric + '&period=' + period, null, function(status, resp) {
    if (status !== 200 || !resp.data || !resp.data.data) return;
    var data = resp.data.data;
    if (!data.length) {
      document.getElementById('trend-chart').innerHTML = '<p style="color:#9ca3af;text-align:center;padding:40px">暂无数据</p>';
      return;
    }
    renderLineChart('trend-chart', data);
  });
}

function renderLineChart(containerId, data) {
  var container = document.getElementById(containerId);
  var w = container.offsetWidth || 600;
  var h = 200;
  var pad = 40;
  var values = data.map(function(d){ return d.value; });
  var max = Math.max.apply(null, values) * 1.1 || 1;
  var min = 0;
  var n = data.length;

  var stepX = (w - pad * 2) / (n - 1 || 1);
  var points = [];
  for (var i = 0; i < n; i++) {
    var x = pad + i * stepX;
    var y = h - pad - ((values[i] - min) / (max - min)) * (h - pad * 2);
    points.push({x: x, y: y, value: values[i], date: data[i].date});
  }

  var pathD = '';
  for (var j = 0; j < points.length; j++) {
    pathD += (j === 0 ? 'M' : 'L') + points[j].x + ',' + points[j].y + ' ';
  }

  var svg = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    // 网格线
    '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (h - pad) + '" stroke="#e5e7eb"/>' +
    '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="#e5e7eb"/>' +
    // 折线
    '<path d="' + pathD + '" fill="none" stroke="#4f46e5" stroke-width="2"/>';

  // 数据点 + tooltip
  for (var k = 0; k < points.length; k++) {
    svg += '<circle cx="' + points[k].x + '" cy="' + points[k].y + '" r="3" fill="#4f46e5"/>';
    // hover 区域
    svg += '<circle cx="' + points[k].x + '" cy="' + points[k].y + '" r="8" fill="transparent" ' +
      'onmouseover="this.parentNode.parentNode.setAttribute(\'title\', \'' + points[k].date + ': ' + points[k].value + '\')" />';
  }
  svg += '</svg>';
  container.innerHTML = svg;
}
```

## 5. 测试计划

### 5.1 后端单元测试

**analytics.service.spec.ts**

```typescript
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [AnalyticsService],
    }).compile();
    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);
  });

  it('should return team dashboard with aggregated data', async () => {
    // mock prisma queries
    const result = await service.getTeamDashboard();
    expect(result).toHaveProperty('totalFollowers');
    expect(result).toHaveProperty('platformBreakdown');
    expect(result.platformBreakdown).toBeInstanceOf(Array);
  });

  it('should return history data grouped by date', async () => {
    const result = await service.getHistory('followers', '30d');
    expect(result.data).toBeInstanceOf(Array);
    expect(result.metric).toBe('followers');
  });

  it('should return top content sorted by sortBy field', async () => {
    const result = await service.getTopContent('impressions', 10);
    expect(result.items).toBeInstanceOf(Array);
    expect(result.items.length).toBeLessThanOrEqual(10);
  });
});
```

### 5.2 前端验证

- 访问 http://152.136.235.55:8001/#analytics
- 确认：4 张统计卡片正确渲染
- 确认：趋势折线图 SVG 渲染
- 确认：热门内容列表展示
- WeChat X5 浏览器打开验证兼容性

## 6. 开发步骤

1. 创建 DTO 文件（analytics-query.dto.ts、snapshot-create.dto.ts）
2. 更新 AnalyticsModule（imports PrismaModule）
3. 更新 AnalyticsController（新增 6 个路由）
4. 扩展 AnalyticsService（实现 6 个方法）
5. 更新 analytics.service.spec.ts（单元测试）
6. 扩展前端 renderAnalytics 实现
7. 在 app.module.ts 中导入 AnalyticsModule
8. 运行测试、构建、部署验证

## 7. 注意事项

1. **空数据处理** — 数据库无数据时返回合理默认值（0 或空数组），不要 throw
2. **性能** — 历史趋势查询可能返回大量数据，需要按日期聚合压缩
3. **前端图表** — 纯 SVG，无外部库，兼容微信 X5
4. **TypeScript 类型** — Prisma Json? 字段需要 as any 断言转换
5. **时区** — snapshotDate 按 UTC 存储，前端显示时按 Asia/Shanghai 转换
