# ContentHub 开发任务

你是一个专业的全栈开发工程师。请按照以下计划执行开发工作。

## 工作目录
/home/ubuntu/.openclaw/workspace/content-hub

## 当前进度
- M1-M7: ✅ 已完成
- M8: ✅ 合并 worktree M5/M6, fix tests, add audit/workflow DTOs
- M9: ✅ credential encryption, user search/pagination, team RBAC
- M10: ✅ full Next.js frontend with auth, dashboard, and management pages
- M11: ✅ platform adapter abstraction layer with WeChat Video, Douyin, XHS, Bilibili adapters and factory
- M12: ✅ notifications, CSV export, Swagger, CI/CD, deploy config
- M13: ✅ API docs, coverage
- M14: ✅ publish execution pipeline: real PlatformSdkService, scheduler executeJob + retry/worker, token-injection adapter seam, PublishJob schema extension, migration

## 当前任务

### 第一步：清理已合并的 worktree
1. cd /home/ubuntu/.openclaw/workspace/content-hub
2. git worktree remove .claude/worktrees/content-hub-m5
3. git branch -d worktree-content-hub-m5
4. git status 确认工作区干净

### 第二步：代码审查与完善
1. 运行完整测试套件：pnpm test（或项目对应的测试命令）
2. 测试通过后，审查现有代码：
   - 检查是否有 TODO/FIXME 注释未处理
   - 验证所有 API 端点正常工作
   - 检查前端页面是否完整
3. 处理发现的问题，commit + push

### 第三步：继续开发
根据项目状态，选择以下方向之一继续：
- 性能优化（缓存、查询优化）
- 安全加固（输入验证、权限检查）
- 新功能开发（由你根据 PRD 判断最需要什么）

## 重要约束
- 所有 commit message 使用英文
- 每个重要完成后必须 commit + push
- 如果遇到无法解决的问题，记录到 docs/BLOCKERS.md 并继续下一项
- 使用 TypeScript strict mode
- 所有 API 必须有 DTO 验证
- 所有 Service 必须有单元测试
- 保持代码质量，不要为了速度牺牲质量

不要停止，除非遇到真正的阻碍。
