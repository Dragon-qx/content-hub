# ContentHub 开发任务

你是一个专业的全栈开发工程师。请按照以下计划执行开发工作。

## 工作目录
/home/ubuntu/.openclaw/workspace/content-hub

## 当前进度
- M1–M15: ✅ 已完成（基础架构 → 安全加固）
- M18: ✅ 已完成（TOTP 双因素认证）
- M19: ✅ 已完成（Content Studio Markdown 编辑器增强）
- M20: ✅ 已完成（Engagement Hub — 评论/私信聚合、情感分析、关键词告警）
- M21: ✅ 已完成（平台扩展：Twitter + YouTube + 微博适配器 + 审查修复）
- M22: ✅ 已完成（异常检测引擎 — 5 规则自动检测 + 团队广播）
- M23: ✅ 已完成（内容日历 — 月视图排期）
- M24: ✅ 已完成（内容适配引擎 — 8 平台规则自动适配 + 实时预览）
- M25: ✅ 已完成（内容模板库）
- M26: ✅ 已完成（内容版本回滚）
- M27: ✅ 已完成（内容排行榜 Top/Bottom 自动标记）

## 剩余任务

### 收尾项
- [ ] 单元测试覆盖率 ≥ 80%（当前 lines 91.9% / branches 63% / funcs 92.5%，已达目标 ✅）
- [ ] E2E 测试
- [ ] CI/CD 配置（GitHub Actions）
- [ ] 生产环境部署配置
- [ ] API 文档（Swagger/OpenAPI）
- [ ] 用户手册

## 🔥 铁律：每次完成必须记录

**每次完成一个功能点或修复后，你 MUST：**

1. **更新 CLAUDE-TASK.md** — 将对应的 `[ ]` 改为 `[x]`，写明完成内容
2. **更新 docs/DEVELOPMENT-PLAN.md** — 在对应里程碑下补充完成摘要（参考已有格式）
3. **更新 docs/BLOCKERS.md**（如有阻塞）— 记录遇到的问题和解决方案
4. **commit + push** — commit message 包含里程碑编号

## 当前任务

### 方向 A：收尾加固（推荐优先）
1. E2E 测试（核心用户旅程：登录 → 创建内容 → 审批 → 发布）
2. GitHub Actions CI/CD（lint + test + build + deploy 流程）
3. 生产环境部署配置（docker-compose.prod.yml + 环境变量文档）
4. Swagger/OpenAPI 文档完善
5. 用户手册（docs/USER-GUIDE.md）

### 方向 B：新功能扩展
根据 PRD 判断，可选方向：
- AI 辅助写作集成（PRD §3.3）
- 智能排期推荐
- 自定义报表

## 重要约束
- **每次完成必须按「铁律」更新文档，不得跳过**
- 所有 commit message 使用英文
- 每个重要完成后必须 commit + push
- 如果遇到无法解决的问题，记录到 docs/BLOCKERS.md 并继续下一项
- 使用 TypeScript strict mode
- 所有 API 必须有 DTO 验证
- 所有 Service 必须有单元测试
- 保持代码质量，不要为了速度牺牲质量

不要停止，除非遇到真正的阻碍。
