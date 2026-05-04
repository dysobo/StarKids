# StarKids

StarKids 是一个面向家庭的儿童任务、积分和奖励系统。家长可以创建任务、审核完成记录、配置积分规则和奖励商城；小朋友可以查看任务、提交完成、兑换奖励、养成宠物并解锁成就。

## 功能概览

- 家庭与成员管理：家长/小朋友双角色、家庭邀请码、家庭成员列表。
- 任务系统：日常任务、一次性任务、挑战任务、习惯打卡、自动或手动审核。
- 积分系统：任务积分、周末/生日加成、每日积分上限、积分流水。
- 奖励商城：奖励上架、库存、兑换申请、家长审批或拒绝。
- 宠物系统：宠物创建、互动喂养、成长阶段、装扮解锁。
- 成就系统：内置成就、家庭自定义成就、成就奖励积分。
- 通知系统：任务审核、兑换申请、成就解锁等站内通知。
- 数据分析：近 7/30 天任务、积分、审批率和成员统计。

## 技术栈

- Next.js 15 App Router
- React 19
- TypeScript
- Prisma 7
- SQLite，本地开发默认
- PostgreSQL，Docker/生产部署推荐
- Auth.js / NextAuth v5 Credentials 登录
- Tailwind CSS 4
- Radix UI、Lucide React、Recharts、Framer Motion

## 本地运行

要求：

- Node.js 22+
- npm 10+

```bash
git clone https://github.com/dysobo/StarKids.git
cd StarKids

cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

打开 `http://localhost:3000`。

本地默认使用 SQLite。`.env` 中保留：

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="替换为随机字符串"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
```

生成认证密钥：

```bash
npx auth secret
```

## Docker 部署

项目提供 PostgreSQL + 应用服务的 Docker Compose 配置：

```bash
docker compose up -d
docker compose logs -f
```

生产环境必须覆盖以下变量：

```env
AUTH_SECRET="足够长的随机密钥"
AUTH_URL="https://你的域名"
NEXT_PUBLIC_APP_URL="https://你的域名"
```

默认 compose 文件中的数据库账号和密码只适合本地或内网测试，公开部署前应修改。

## 常用脚本

```bash
npm run dev          # 启动开发服务
npm run build        # 生产构建
npm run start        # 启动生产服务
npm run lint         # 代码检查
npm run db:generate  # 生成 Prisma Client
npm run db:push      # 同步数据库结构
npm run db:seed      # 写入内置模板、成就和装扮
npm run db:studio    # 打开 Prisma Studio
```

测试套件：

```bash
npx tsx tests/test-suite.ts
```

## 权限模型

- `PARENT`：管理家庭、任务、奖励、成就、宠物装扮、积分配置和审核流程。
- `KID`：查看自己的任务、积分、奖励、宠物、成就和通知。
- Server Actions 和 API 路由都需要做角色与家庭归属校验，避免只依赖页面跳转保护。

## 数据库说明

核心模型包括：

- `User`：登录账号。
- `Family`：家庭。
- `FamilyMember`：账号在家庭中的身份和积分余额。
- `Task` / `TaskCompletion`：任务和完成记录。
- `Reward` / `RewardRedemption`：商城奖励和兑换记录。
- `Pet` / `PetOutfit`：宠物和装扮。
- `Achievement` / `AchievementGrant`：成就和解锁记录。
- `Notification`：站内通知。

Prisma schema 位于 `prisma/schema.prisma`。

## 维护建议

- 大版本升级 Next.js、React、Prisma、TypeScript 前先单独开分支。
- 公开部署前替换所有默认密钥、数据库密码和站点 URL。
- 新增 API 或 Server Action 时同步补充角色校验和家庭归属校验。
- 涉及积分、库存、审批状态的逻辑应优先使用事务。
