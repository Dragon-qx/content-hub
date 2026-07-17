# ContentHub Media & Content 模块修复清单

## 问题总览

### ✅ 已修复
1. `MediaController.upload()` 用 `@Body('contentId')` 替换 `@Query('contentId')`
2. `MediaController.findAll()` 增加 `type` 查询参数
3. `ContentService.create()` 无 `teamId` 时返回 400 而非 500

### 🔧 待修复（前端字段映射）

#### 媒体列表（Media）
前端期望字段 | 后端实际字段 | 状态
`m.name` | `m.url`（存储的是路径，非文件名）| ❌ 需前端取 `m.url.split('/').pop()`
`m.filename` | 不存在 | ❌ 同上用 `url` 解析
`m.size` | `m.fileSize` | ❌
`m.mime` | `m.mimeType` | ❌
`m.type` | `m.type`（值为 `IMAGE/VIDEO/AUDIO`）| ⚠️ 值格式不同

#### 媒体创建
前端表单选择值 | 后端期望 | 状态
`image` | `IMAGE` | ❌ 前端应传 `type="IMAGE"`
`video` | `VIDEO` | ❌
`document` | `AUDIO` | ❌ 后端没有 DOCUMENT 类型

#### 媒体详情弹窗
前端期望 | 后端状态
`m.name` | ❌ 需用 `url` 解析文件名
`m.filename` | ❌ 同上
`m.size` | ❌ `fileSize`
`m.uploadedAt` | ❌ `createdAt`

#### 内容状态筛选
前端发送 `?status=draft` | 后端期望 `DRAFT` | ❌ 前端应发 `?status=DRAFT`

### 🔧 待修复（后端逻辑）
1. **媒体搜索** `q` 参数：前端发 `?q=xxx` 但后端 MediaService.findAll 不支持搜索
2. **Content 创建缺少 teamId 传递**：前端 `submitCreateContent()` 没有传 `teamId` 字段
   - 需要改成第一个团队选择器或弹窗中选择团队
3. **Media 类型过滤（type 参数）**：前端传 `image/video/document`，后端需要处理大小写映射

### 🔧 待修复（前端显示）
1. `loadMedia()` 类型过滤值 `image/video/document` 应映射为 `IMAGE/VIDEO/AUDIO`
2. `loadContents()` 状态过滤值 `draft/published/archived` 应映射为 `DRAFT/PUBLISHED/ARCHIVED`  
3. `openMediaDetail()` 字段引用需改为后端实际字段
4. `loadMedia()` 缩略图应使用 `m.url` 而非仅显示图标
5. `renderContent()` 创建内容表单中缺少团队选择器

## 验收标准
- [ ] 媒体类型选择 `image/video/document` 后列表正确过滤
- [ ] 内容状态选择 `draft/published/archived` 后列表正确过滤
- [ ] 媒体列表显示文件名（从 `url` 解析）+ 文件大小
- [ ] 媒体详情显示后端实际字段：`fileSize`、`mimeType`、`createdAt`（解析 `url` 为文件名）
- [ ] 创建内容后内容列表刷新，状态正确
- [ ] 上传媒体时可关联内容（contentId 正确保存）

## 工作方式
1. 先修复前端字段映射（最简单、影响最大）
2. 再修复前后端枚举值映射（大小写）
3. 最后添加后端搜索功能
4. 每完成一部分就编译重启测试

## 关键文件
- 前端：`apps/web/dashboard/index.html`
- Media 后端：`apps/api/src/modules/media/media.controller.ts`, `media.service.ts`
- Content 后端：`apps/api/src/modules/content/content.controller.ts`, `content.service.ts`
