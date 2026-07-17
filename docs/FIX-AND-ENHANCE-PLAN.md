# ContentHub 全面修复与功能完善任务书

## 背景

当前项目有大量功能不可用：4 个模块报错、公众号凭证格式错误、前后端未对齐、账号关联表单不区分平台。

## 任务清单（按顺序执行）

### Phase 1: 核心基础设施修复

#### 任务 1.1：创建统一分页 DTO
创建 `apps/api/src/common/dto/pagination.dto.ts`：
```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
```

#### 任务 1.2：替换所有 Controller 中的 ParseIntPipe
修改以下文件，将 `@Query('skip', ParseIntPipe)` 替换为 `@Query() query: PaginationQueryDto`：
- `apps/api/src/modules/content/content.controller.ts`
- `apps/api/src/modules/workflow/workflow.controller.ts`
- `apps/api/src/modules/scheduler/scheduler.controller.ts`
- `apps/api/src/modules/audit/audit.controller.ts`
- `apps/api/src/modules/media/media.controller.ts`（如果没有分页就不用改）

示例（content.controller.ts）：
```typescript
@Get() findAll(@Query() query: PaginationQueryDto) {
  return this.content.findAll({ skip: query.skip, take: query.take });
}
```

#### 任务 1.3：更新 Service 接口
确保所有 Service 的 `findAll` 方法接收 `{skip, take}` 对象，并在 Controller 中正确传递。

### Phase 2: 公众号凭证修复

#### 任务 2.1：更新已有 SocialAccount 的 Credentials
- 通过 Prisma 更新已有的 SocialAccount（accountId = `gh_45d844e6f5d6`）
- 将 credentials 改为正确的结构化格式：
```json
{
  "type": "wechat_official",
  "appid": "wx8b2d28e4ada363bb",
  "secret": "3d53a68191ed9bfff860629b0885e94e",
  "rawId": "gh_45d844e6f5d6"
}
```

#### 任务 2.2：接入微信公众号 API
在 `packages/platform-sdk/src/` 下创建真实的微信公众号适配器：
```typescript
// packages/platform-sdk/src/wechat-official/index.ts
export interface WechatOfficialConfig {
  appid: string;
  secret: string;
  rawId: string;
}

export class WechatOfficialAdapter {
  constructor(private config: WechatOfficialConfig) {}
  
  // 获取 access_token
  async getAccessToken(): Promise<string> {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.appid}&secret=${this.config.secret}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.access_token) return data.access_token;
    throw new Error(`WeChat API error: ${JSON.stringify(data)}`);
  }
  
  // 获取粉丝数（需要已认证的接口）
  async getFollowerCount(): Promise<number> {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${token}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.total ?? 0;
  }
  
  // 获取素材列表
  async getMaterials(type = 'news', offset = 0, count = 20) { ... }
  
  // 创建草稿
  async createDraft(articles: any[]) { ... }
  
  // 发布草稿
  async publishDraft(mediaId: string) { ... }
}
```

### Phase 3: 账号关联表单重写

#### 任务 3.1：重写 openConnectAccountModal 函数
在 `apps/web/dashboard/index.html` 中重写关联账号弹窗，按平台分组字段：

**微信公众号 / 视频号：**
- AppID（文本）
- AppSecret（密码）
- 原始 ID（文本）

**抖音：**
- Client Key（文本）
- Client Secret（密码）
- 授权回调 URL（文本）

**小红书：**
- App Key（文本）
- App Secret（密码）

**B站：**
- App Key（文本）
- Access Key（文本）
- Secret Key（密码）

**微博：**
- App Key（文本）
- App Secret（密码）

**Twitter/X：**
- Bearer Token（密码）
- API Key（文本）
- API Secret（密码）

**YouTube：**
- Client ID（来自 Google Cloud Console）
- Client Secret
- Channel ID

#### 任务 3.2：重写 submitConnectAccount 函数
- 根据所选平台收集对应字段
- 组合成正确的 credentials JSON
- 后端 DTO 需要更新以接受这些新字段

#### 任务 3.3：更新后端 BindAccountDto
```typescript
export class BindAccountDto {
  @IsString() teamId: string;
  @IsString() platform: Platform;
  @IsString() accountName: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountHandle?: string;
  
  // 微信公众号 / 视频号
  @IsOptional() @IsString() appid?: string;
  @IsOptional() @IsString() secret?: string;
  @IsOptional() @IsString() rawId?: string;
  
  // 抖音
  @IsOptional() @IsString() clientKey?: string;
  @IsOptional() @IsString() clientSecret?: string;
  
  // 小红书 / 微博 / B站 / Twitter / YouTube ...
  
  credentials: Record<string, unknown>; // 自动计算
}
```

在 AccountService.bind() 中，根据 platform 自动组合 credentials 对象。

### Phase 4: 前端 Dashboard 重写

#### 任务 4.1：重写 renderAccounts
- 正确显示各平台账号
- 点击账号名称可展开详情
- 支持按平台筛选
- 显示同步状态

#### 任务 4.2：重写 renderContent
- 确保能正确创建内容（之前报错的表单）
- 创建内容后关联平台账号
- 草稿 → 发布流程

#### 任务 4.3：重写 renderScheduler
- 创建定时发布任务
- 选择关联账号
- 时间选择器（用 input datetime-local）

#### 任务 4.4：重写 renderWorkflow
- 创建工作流
- 审批流程
- 状态跟踪

#### 任务 4.5：重写 renderMedia
- 上传图片/视频（使用 FormData via XHR）
- 图片列表展示
- 删除功能

#### 任务 4.6：重写 renderAnalytics
- 数据需要从 PlatformPost.metrics 和 AnalyticsSnapshot 实时获取
- 接入 SDK 获取真实数据

### Phase 5: 测试与验证

#### 任务 5.1：后端 API 测试
对所有模块进行完整的手动测试：
- Auth（注册/登录/me）
- Teams（创建/列表/更新/删除/成员）
- Accounts（绑定/列表/同步/解绑）
- Content（创建/列表/更新/删除）
- Media（上传/列表/删除）
- Scheduler（创建/列表/取消）
- Workflow（创建/列表/审批/拒绝）
- Analytics（团队总览/历史/热门内容）
- Audit（列表/历史）

#### 任务 5.2：前端 Dashboard 测试
- 每个模块能否正常渲染
- 表单提交是否正常
- 列表展示是否正常
- API 错误是否有友好提示

#### 任务 5.3：微信公众号接入验证
1. 调用微信 API 获取 access_token
2. 存储 token 到 SocialAccount
3. 获取粉丝数
4. 在 Analytics 中显示真实数据

## 关键约束

- 前端纯 HTML + Vanilla JS
- 无外部 JS 库（Chart.js/ECharts）
- 所有请求通过 XMLHttpRequest
- 后端返回 `{code: 0, message: 'success', data: {...}}`
- 用中文注释
- 修改文件时保持原有代码结构
- 先编译（nest build），后重启（kill + nohup）
- 每完成一个 Phase 就运行测试验证

## 验收标准

- [ ] Auth: 注册/登录/me 正常
- [ ] Teams: 创建/列表/更新/删除/成员管理 正常
- [ ] Accounts: 绑定/列表/同步/解绑 正常（含真实微信公众号）
- [ ] Content: 创建/列表/更新/删除 正常
- [ ] Media: 上传/列表/删除 正常
- [ ] Scheduler: 创建/列表/取消 正常
- [ ] Workflow: 创建/列表/审批/拒绝 正常
- [ ] Analytics: 团队总览/历史/热门内容 正常
- [ ] Audit: 列表/历史 正常
- [ ] 前端 Dashboard 所有模块渲染正常
- [ ] 微信公众号能获取真实数据
