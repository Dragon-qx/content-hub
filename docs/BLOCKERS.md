# ContentHub — Blockers & Known Issues

> 记录开发中遇到的非平凡阻塞及其解法；无阻塞则留空说明。

## 当前阻塞（2026-07-18，方向 C SDK 补齐）

方向 C（SDK 补齐）4 项全部完成，无新增阻塞。但全量 API 测试有 **3 个预存在的失败套件**，与本次 SDK 改动 disjoint（已 `git stash` 验证在同一 commit 的 clean tree 上同样失败），属于历史遗留 TS 编译错，不属于方向 C 范围，记录如下供后续方向 A 处理：

### 1. `analytics.controller.spec.ts` / `analytics.controller.ts` — TS 编译错
- **现象**：`TS2552 Cannot find name 'trending'`、`TS2304 Cannot find name 'anomalies'/'dto'/'listAlerts'/'notified'/'query'`。
- **定位**：`apps/api/src/modules/analytics/analytics.controller.ts` 模板字符串/装饰器内引用了未注入的标识符（疑似上一轮 anomaly 面板改造遗留的半完成编辑）。
- **影响**：控制器文件本身 TS 编译失败，导致该 spec 及 `test/app.e2e-spec.ts` 均无法加载。
- **后续**：方向 A 收尾时修复 controller 中未定义标识符。

### 2. `engagement.controller.spec.ts` — DTO 类型错
- **现象**：`TS2345 Argument of type '{}' is not assignable to parameter of type 'SyncTeamDto'`。
- **定位**：`engagement.dto.ts` 中 `SyncTeamDto` 的构造/类型与 spec 中调用不匹配。
- **影响**：engagement 控制器单测套件加载失败（逻辑本身由 e2e 覆盖）。

### 3. `test/app.e2e-spec.ts` — 加载期 TS 错
- **现象**：e2e 套件 0 测试即失败，通常因 import 链引用了上述 analytics 控制器的编译错文件。
- **影响**：同 #1，修复 #1 后多数情况下自愈。

### 已验证
- 方向 C 新增/修改的 5 个文件（sdk 包 + controller/service/dto + 3 个 spec）**全部通过**：
  - `packages/platform-sdk`：**43 passed**（+15，含 XHS refreshToken、replyToMessage、publish/fetchMetrics 补齐）。
  - `apps/api` platform-sdk 模块：**20 passed**（+8，service + controller）。
  - `packages/platform-sdk` **typecheck 干净**（`tsc --noEmit` exit 0）。
- 失败套件在 `git stash` 后的 clean tree 上**同样失败**，确认非本次引入。

## 已解决（历史）

（此前各里程碑的阻塞与解法见对应 commit message，此处不再展开。）
