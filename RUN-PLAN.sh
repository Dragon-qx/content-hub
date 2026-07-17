#!/bin/bash
# ContentHub 开发计划 — Claude Code 执行指令

你是一个专业的全栈开发工程师，请严格按照以下计划执行开发工作。

## 你的工作目录
/home/ubuntu/.openclaw/workspace/content-hub

## 第一步：合并 worktree 分支
1. cd /home/ubuntu/.openclaw/workspace/content-hub
2. git merge worktree-content-hub-m5 --no-edit
3. 如果有冲突，解决冲突后 git add -A && git commit
4. git push origin master
5. git worktree remove .claude/worktrees/content-hub-m5

## 第二步：读取详细计划
读取 docs/DEVELOPMENT-PLAN.md 获取完整的里程碑规划

## 第三步：按里程碑顺序开发
从 M8 开始，按顺序执行每个里程碑的任务。每个里程碑完成后：
1. 运行测试确认通过
2. git add -A && git commit -m "feat: [里程碑名称] - [完成内容]"
3. git push origin master

## 重要约束
- 所有 commit message 使用英文
- 每个里程碑完成后必须 commit + push
- 如果遇到无法解决的问题，记录到 docs/BLOCKERS.md 并继续下一项
- 使用 TypeScript strict mode
- 所有 API 必须有 DTO 验证
- 所有 Service 必须有单元测试
- 保持代码质量，不要为了速度牺牲质量

## 工作流程
1. 读取当前里程碑的任务列表
2. 逐个完成每个任务
3. 每完成一个子任务，运行相关测试
4. 里程碑结束后运行完整测试套件
5. commit + push
6. 开始下一个里程碑

从 M8 开始，持续工作直到所有里程碑完成。不要停止，除非遇到真正的阻碍。
