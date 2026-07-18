# ContentHub — Blockers & Known Issues

> 记录开发中遇到的非平凡阻塞及其解法；无阻塞则留空说明。

## 当前阻塞（2026-07-18 更新）

**无阻塞。**

### ~~`analytics.controller.spec.ts` / `engagement.controller.spec.ts` / `app.e2e-spec.ts` — TS 编译错~~ → ✅ 已修复

- 此前（2026-07-18 下午）有文档记录的 3 个预存在失败套件，经验证在最新代码上**全部通过**：
  - `analytics.controller.spec.ts` — 11 tests pass
  - `engagement.controller.spec.ts` — 9 tests pass  
  - `app.e2e-spec.ts` — 16 tests pass
- 全量本地运行 552 tests / 48 suites 全绿。

### 已验证
- 方向 C 新增/修改的 5 个文件（sdk 包 + controller/service/dto + 3 个 spec）**全部通过**：
  - `packages/platform-sdk`：**43 passed**（+15，含 XHS refreshToken、replyToMessage、publish/fetchMetrics 补齐）。
  - `apps/api` platform-sdk 模块：**20 passed**（+8，service + controller）。
  - `packages/platform-sdk` **typecheck 干净**（`tsc --noEmit` exit 0）。
- 失败套件在 `git stash` 后的 clean tree 上**同样失败**，确认非本次引入。

## 已解决（历史）

（此前各里程碑的阻塞与解法见对应 commit message，此处不再展开。）
