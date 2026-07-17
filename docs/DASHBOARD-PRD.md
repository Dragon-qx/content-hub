# ContentHub Dashboard 完整前端需求文档

## 一、项目背景
ContentHub 是一个多平台内容管理与发布平台。后端 API 已部署在 `http://localhost:3000`，Nginx 代理到 `http://localhost:8001`。

当前 Dashboard 是一个占位页面，9 个模块全部显示 "This module is under development"，需要实现真实的业务功能前端。

## 二、技术约束

### 必要约束（微信浏览器兼容）
- **纯静态 HTML 单文件**：`apps/web/dashboard/index.html`
- **所有 CSS 和 JS 内联**，不打包、不构建
- **Nginx 直接服务静态文件**，不经过 Node.js
- **Hash 路由**：`#dashboard`, `#content`, `#media` 等
- **XMLHttpRequest** 替代 `fetch()`（微信 X5 内核兼容）
- **内联 `onclick`** 事件（微信对 `addEventListener` 支持不稳定）

### 响应式
- 桌面端：左侧 240px 侧边栏 + 右侧自适应内容
- 移动端（<=768px）：侧边栏变顶部水平滚动导航

## 三、页面布局

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar (fixed 240px)  │  Main Content Area            │
│                         │                               │
│  C ContentHub           │  Header                       │
│  📊 Dashboard    (active)│  Title    [● API Connected]   │
│  📝 Content             │                               │
│  🖼️ Media              │  Stats Cards (Dashboard only) │
│  📅 Scheduler           │  Content Tables / Forms       │
│  📈 Analytics           │  Modals (create/login/detail) │
│  🔄 Workflow            │                               │
│  👥 Teams               │  Toast                        │
│  🔗 Accounts            │                               │
│  ⚙️ Settings            │                               │
└──────────────────────────────────────────────────────────┘
```

## 四、9 个模块详细需求

---

### 1. Dashboard（首页）

**API:**
- `GET /api/v1/health` — 后端健康状态
- `GET /api/v1/contents?skip=0&take=10` — 内容统计
- `GET /api/v1/audit?skip=0&take=10` — 最近活动

**内容:**
- 4 张统计卡片（Dashboard 顶部）：
  - Total Content: `(content.data.total || 0)`
  - Recent Activities: `(audit.data.total || 0)`  
  - Platforms: `8`（固定）
  - API Status: `health.data.status === 'ok' ? 'OK' : 'Down'`（绿色/红色）
- Recent Activity 列表（从 audit API 加载）：
  - 每行: `{user} {action} {entityType} — {createdAt}`
  - 空数据时显示 "No recent activity"
- 每 30 秒自动刷新
- API 状态绿色/红色标识

---

### 2. Content（内容管理）

**API:**
- `GET /api/v1/contents?skip=0&take=20` — 列表
- `POST /api/v1/contents` — 创建 `{title, body, status}`
- `GET /api/v1/contents/:id` — 详情
- `DELETE /api/v1/contents/:id` — 删除

**内容:**
- **列表页**：表格展示
  - 列: ID | Title | Body | Status | Created At | Actions
  - Actions: Detail 按钮 + Delete 按钮
- **创建**: "New Content" 按钮 → 内联表单（title, body, status）→ POST 提交
- **详情**: Detail 按钮 → 取消/返回
- **删除**: Delete 按钮 → confirm → DELETE → 刷新列表
- 分页: skip/take → Prev / Next 按钮
- 加载状态 + 错误提示

---

### 3. Media（媒体库）

**API:**
- `GET /api/v1/media?skip=0&take=20&contentId=xxx` — 列表（可选 contentId 筛选）
- `POST /api/v1/media/upload` — 上传 `{filename, contentType, data}`

**内容:**
- **列表页**：表格展示
  - 列: ID | Filename | Content Type | Size | Content ID | Created At
  - 空数据显示 "No media found"
- **上传区域**: 拖拽/选择文件 → POST `/api/v1/media/upload`
  - 字段: filename, contentType, size, contentId (关联 content)
- **筛选**: 按 contentId 筛选输入框
- 分页

---

### 4. Scheduler（发布排程）

**API:**
- `GET /api/v1/scheduler?skip=0&take=20` — 列表
- `POST /api/v1/scheduler` — 创建 `{contentId, platform, scheduledAt}`
- `POST /api/v1/scheduler/:id/retry` — 重试失败排程

**内容:**
- **列表页**：表格
  - 列: ID | Content ID | Platform | Scheduled At | Status | Actions
  - Actions: Retry 按钮（点击 POST retry → 刷新）
- **创建排程**: "New Schedule" 按钮 → 表单 → POST
  - 字段: contentId, platform (facebook/twitter/instagram/scheduledAt datetime-local)
- 分页

---

### 5. Analytics（数据分析）

**API:**
- `GET /api/v1/analytics` — **后端未实现**，返回 404

**内容:**
- 显示 "Analytics Coming Soon" 卡片
- 同时展示 **模拟数据** 卡片：
  - Total Views: 142,538
  - Engagement Rate: 4.7%
  - Top Platform: Instagram (38%)
  - Growth: +12.5%
  - 柱状图：CSS 纯绘制的月度柱状图（12 个月）
- 预留 API 接口位置，未来接入真实数据

---

### 6. Workflow（审批流）

**API:**
- `GET /api/v1/workflow?skip=0&take=20` — 列表
- `POST /api/v1/workflow/approval` — 创建审批 `{type, resourceId, description}`
- `POST /api/v1/workflow/:id/approve` — 通过审批
- `POST /api/v1/workflow/:id/reject` — 拒绝审批

**内容:**
- **列表页**：表格
  - 列: ID | Type | Status | Resource ID | Created By | Actions
  - Actions: Approve（绿色）按钮 + Reject（红色）按钮
  - 已完成审批显示 "已通过" / "已拒绝" 徽章
- **创建审批**: "New Approval" 按钮 → 表单 → POST
  - 字段: type (select: content_publish/account_link/resource_delete)
  - resourceId, description
- 分页

---

### 7. Teams（团队管理）

**API:**
- **需要 Auth**: 当前返回 401，需 Bearer token
- `GET /api/v1/teams?skip=0&take=20` — 列表
- `POST /api/v1/teams` — 创建 `{name, description}`
- `GET /api/v1/teams/:id/members` — 团队成员
- `POST /api/v1/teams/:id/members` — 添加成员 `{userId, role}`

**内容:**
- **未登录状态**：
  - 显示 "需要先登录" 提示
  - 弹出登录表单（email + password）
  - `POST /api/v1/auth/login` → `{token}` → 存储到 `localStorage.setItem('ch_token', token)`
- **登录后**：
  - 列表: 表格展示团队（ID | Name | Description | Actions）
  - Actions: Add Member 按钮 → POST members
  - 分页
- 所有请求带 `Authorization: Bearer <token>` header

---

### 8. Accounts（平台账号）

**API:**
- **需要 Auth**: 当前返回 401，需 Bearer token
- `GET /api/v1/accounts` — 列表
- `POST /api/v1/accounts` — 连接账号 `{platform, accessToken, refreshToken}`
- `DELETE /api/v1/accounts/:id` — 删除

**内容:**
- **未登录状态**：同 Teams，显示登录表单
- **登录后**：
  - 列表: 表格展示已连接平台
    - 列: ID | Platform | Status | Connected At | Actions
    - Actions: Delete 按钮
  - **连接账号**: "Connect Account" 按钮 → 表单
    - 字段: platform (select: facebook/twitter/instagram/linkedin/tiktok/youtube)
    - accessToken, refreshToken
  - 分页

---

### 9. Settings（设置）

**API:**
- `GET /api/v1/users/me` — 用户当前信息（需要 Auth）
- `POST /api/v1/auth/login` — 登录（同上）

**内容:**
- **用户信息卡片**（需要登录）：
  - "请先登录" 或显示 user ID / email / name
- **通知偏好设置**：
  - Email notifications toggle
  - Push notifications toggle
  - Weekly report toggle
  - 保存到 `localStorage`
- **主题切换**：
  - Light / Dark 切换
  - 使用 CSS 变量实现
- **API Token 管理**：
  - 显示当前存储的 token
  - Logout 按钮（清除 localStorage）
  - "Copy Token" 按钮

---

## 五、API 响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [...],
    "total": 42,
    "skip": 0,
    "take": 20
  }
}
```

### 错误响应
```json
{
  "code": -1,
  "message": "Unauthorized",
  "statusCode": 401
}
```

### 通用 HTTP 处理
- `200` → 解析 JSON，检查 `code === 0`
- `401` → 显示 "需要登录"，弹出登录模态
- `404` → 显示 "资源不存在"
- `500` → 显示 "服务器错误，请稍后重试"
- Network error / Timeout → 显示 "网络连接失败"

---

## 六、关键实现规范

### 1. 路由
```javascript
window.onhashchange = function() {
  var key = location.hash.substring(1);
  if (NAV[key]) go(key);
};
```

### 2. HTTP 请求（WeChat-compatible）
```javascript
function api(path, method, data, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, '/api/v1' + path, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  var token = localStorage.getItem('ch_token');
  if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  xhr.timeout = 15000;
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var resp = JSON.parse(xhr.responseText);
          callback(null, resp.data || resp);
        } catch(e) { callback(e, null); }
      } else if (xhr.status === 401) {
        callback({status: 401}, null);
      } else {
        callback({status: xhr.status}, null);
      }
    }
  };
  xhr.onerror = function() = > callback({network: true}, null);
  xhr.ontimeout = function() { callback({timeout: true}, null); };
  xhr.send(data ? JSON.stringify(data) : null);
}
```

### 3. 事件绑定（WeChat X5 兼容）
```html
<button onclick="go('content')">Content</button>
<button onclick="createContent()">New Content</button>
<button onclick="deleteContent('123')">Delete</button>
```

### 4. 状态管理
```javascript
var cache = {};        // API 响应缓存
var active = 'dashboard';  // 当前页面
var token = localStorage.getItem('ch_token');
```

### 5. Toast
```javascript
function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type || '');
  setTimeout(function() { el.className = 'toast'; }, 2500);
}
```

### 6. Modal
```javascript
function showModal(title, body, onConfirm) {
  var modal = document.getElementById('modal-overlay');
  modal.querySelector('.modal-title').textContent = title;
  modal.querySelector('.modal-body').innerHTML = body;
  modal.style.display = 'block';
  // Confirm/Cancel button handlers
}
```

---

## 七、文件位置
```
apps/web/dashboard/
├── index.html          # 主文件
└── README.md           # 本需求文档
```

## 八、验收标准

- [ ] 访问 `http://localhost:8001` 正常加载 Dashboard
- [ ] 9 个导航按钮全部可点击切换（hash 路由变化）
- [ ] Dashboard 4 张卡片显示正确数据
- [ ] Content 列表展示 + 创建表单 + 删除功能
- [ ] Media 列表展示 + 上传表单
- [ ] Scheduler 列表展示 + 创建表单 + 重试按钮
- [ ] Analytics Coming Soon + 模拟数据（柱状图）
- [ ] Workflow 列表 + 创建审批 + 通过/拒绝按钮
- [ ] Teams 显示登录 → 登录后列表+创建+成员管理
- [ ] Accounts 显示登录 → 登录后列表+连接+删除
- [ ] Settings 用户信息 + 主题切换 + Token 管理
- [ ] 微信浏览器中所有按钮点击正常，无 "addEventListener is not a function" 错误
- [ ] 所有 API 请求通过 XHR 正确发起，响应正确处理
- [ ] 分页、加载状态、错误提示完整
