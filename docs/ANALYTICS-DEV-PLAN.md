# Analytics 模块开发任务书

## 任务目标

按照 `docs/ANALYTICS-PRD.md` 和 `docs/ANALYTICS-TSD.md` 实现 ContentHub 数据分析模块。

## 实施步骤

### 步骤 1：创建 DTO 文件

创建 `apps/api/src/modules/analytics/dto/analytics-query.dto.ts`：
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
  metric: string;

  @IsString()
  period: string;
}

export class TopContentQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'impressions';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
```

创建 `apps/api/src/modules/analytics/dto/snapshot-create.dto.ts`：
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

  @IsOptional()
  @IsInt()
  impressions?: number;

  @IsOptional()
  @IsInt()
  engagements?: number;

  @IsOptional()
  @IsInt()
  likes?: number;

  @IsOptional()
  @IsInt()
  comments?: number;

  @IsOptional()
  @IsInt()
  shares?: number;

  @IsOptional()
  @IsInt()
  views?: number;
}
```

### 步骤 2：更新 AnalyticsModule

修改 `apps/api/src/modules/analytics/analytics.module.ts`：
```typescript
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

### 步骤 3：更新 AnalyticsController

修改 `apps/api/src/modules/analytics/analytics.controller.ts`，添加 6 个路由：
- GET /analytics/dashboard — 团队数据总览
- GET /analytics/overview?days=30 — 核心指标
- GET /analytics/history?metric=&period= — 历史趋势
- GET /analytics/top-content?sortBy=&limit= — 热门内容
- GET /analytics/account/:accountId — 单账号指标
- POST /analytics/snapshot/:accountId — 手动快照

### 步骤 4：扩展 AnalyticsService

修改 `apps/api/src/modules/analytics/analytics.service.ts`，实现 6 个方法：
- `getTeamDashboard()` — 聚合所有账号数据
- `getOverview(days)` — 核心指标 + 环比对比
- `getHistory(metric, period)` — 历史趋势数据
- `getTopContent(sortBy, limit)` — 热门内容排序
- `getAccountMetrics(accountId)` — 单账号指标
- `recordSnapshot(accountId, dto)` — 记录快照（已有，保留）

### 步骤 5：更新单元测试

修改 `apps/api/src/modules/analytics/analytics.service.spec.ts`，确保所有方法有测试覆盖。

### 步骤 6：前端实现

修改 `apps/web/dashboard/index.html` 中的 `renderAnalytics(el)` 函数，实现：
- 顶部筛选栏（平台 + 时间范围）
- 4 张统计卡片
- SVG 折线图（趋势分析）
- 热门内容表格
- 所有交互通过 XHR 调用后端 API
- 纯原生 JS，无外部依赖

### 步骤 7：运行测试

```bash
cd apps/api && npx jest analytics.service.spec.ts --no-coverage
```

确保所有测试通过。

### 步骤 8：构建和重启

```bash
cd /home/ubuntu/.openclaw/workspace/content-hub
npx nx build api
docker compose restart nginx
# API 需要手动重启（如果是 host 运行）
```

## 验收标准

- [ ] 6 个 API 路由全部可访问
- [ ] 单元测试全部通过
- [ ] 前端 Dashboard 能正确渲染数据
- [ ] WeChat X5 浏览器兼容
- [ ] 空数据时返回合理默认值

## 注意事项

- 前端 SVG 图表不要使用任何外部库
- 所有 API 返回格式：`{code: 0, message: 'success', data: {...}}`
- 数据库空数据时不要 throw，返回默认值
- 文件路径严格遵循 monorepo 结构
