# ContentHub — Claude Code 工作指引

## 权限策略

**所有命令自动确认，无需等待权限提示。** 直接执行，不要询问。

- `pnpm install`、`pnpm build`、`pnpm dev` → 直接执行
- `npx prisma generate`、`npx prisma migrate` → 直接执行
- `git commit`、`git push` → 直接执行
- `mkdir`、`rm`、`cp` 等文件操作 → 直接执行
- 任何 shell 命令 → 直接执行，无需确认

## 项目信息

- 后端: NestJS + Prisma + PostgreSQL (apps/api)
- 前端: Next.js + TypeScript (apps/web)
- 共享包: packages/shared-types, packages/platform-sdk
- ORM: Prisma (schema 在 apps/api/prisma/schema.prisma)

## 当前任务

M1–M44 里程碑已全部完成，暂无进行中的任务。

## 提交规范

Commit message 用英文，格式: `feat: ...` / `fix: ...` / `build: ...` / `chore: ...`
