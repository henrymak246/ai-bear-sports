# 会员注册登录门控 · 设计文档

日期：2026-07-27
状态：已确认（用户逐节通过）

## 背景与目标

站点当前是完全公开的静态站（GitHub Pages）。目标：加会员机制——访客自助注册账号，站长审核通过后才能看到站内全部内容（每日预测/方案/统计/历史记录）。

已确认的边界：

- 放人方式：**自助注册（邮箱+密码）+ 站长审核**，注册后不可立即看内容
- 门控范围：**全站门控**，未审核用户只见登录/注册页与「待审核」页
- 目的：小圈子分享，挡住陌生访问；非银行级安全，但门控须由服务端强制（不能纯前端伪装）
- 接受事实：git 历史中的旧预测数据（7/26、7/27）仍公开，门控只对未来数据生效

非目标（YAGNI）：不做付费/订阅、不做找回密码之外的账号管理页、不做会员名单管理后台（用 Supabase 自带后台）、不做邮箱验证（审核已是门槛）、不做内容分级（全有或全无）。

## 总体方案

方案 A：Supabase（Auth + Postgres + RLS）做后端；GitHub Pages 继续托管静态壳；预测数据迁出公开仓库、由同步脚本上传 Supabase。

## ① 架构与数据流

```
GitHub Pages（公开静态壳）          Supabase 项目（免费档）
index.html / stats.js / assets  →  Auth：邮箱+密码（关闭邮箱验证）
✗ 不含 predictions.js              members(user_id PK, email, approved bool=false, created_at)
浏览器 supabase-js(CDN)：            prediction_days(date text PK, payload jsonb, updated_at)
  登录→查 members.approved→        RLS：anon 不可读；仅 approved 用户可 SELECT prediction_days；
  true→读 prediction_days→渲染       members 仅本人可读自己行
```

- 门控由服务端 RLS 强制：anon key 在策略下读不到数据，看源码/直调 API 均无效
- `prediction_days.payload` 原样存现有 day 对象（matches/plan/analysis/fivePillars/review…），`stats.js` 与渲染逻辑零改动
- `data/predictions.js` 从仓库移除（加入 .gitignore，本地保留为主数据源），改为脚本同步上传
- service_role key 仅存本机 `tools/.env`（gitignore），绝不进仓库/前端

## ② 前端改动（index.html）

启动流程改为异步三态门：

1. 初始化 supabase-js（CDN，UMD 版本，锁主版本号）
2. 查 session：
   - **未登录** → 渲染「🐻 小熊会员门」：登录/注册两表单（邮箱+密码，标签页切换），注册成功提示「已提交，等小熊开门」；沿用现有配色/卡片风格
   - **已登录·未审核**（members.approved=false）→ 「🍯 等小熊开门」页：显示账号邮箱 + 退出按钮
   - **已审核** → SELECT prediction_days 按 date 降序 → 作为 days 走现有全部渲染（包成 `renderApp(days)`，现有渲染代码基本原样搬入）
3. 已登录时右上角显示「退出」小按钮（清 session 后回到门）
4. 移除 `<script src="data/predictions.js">`；错误横幅逻辑保留（数据拉取失败时提示）

渲染拆分：现有 IIFE 内容改为 `function renderApp(days) { … }`，门控代码负责取数后调用；`esc`/`pct`/`planBadge` 等辅助函数随之搬入。不新增框架、不引入构建步骤。

## ③ 每日工作流与同步脚本

- `tools/sync-data.js`：Node 脚本，`require('../data/predictions.js')` → 用 `@supabase/supabase-js` + service_role key 逐日 `upsert`（按 date 覆盖，幂等可重跑）；打印每天同步结果
- `tools/.env`：`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`（gitignore）；`tools/package.json` 声明 supabase-js 依赖（npm install 一次）
- 每日流程：`改 data/predictions.js` → `node test/stats.test.js` → `node tools/sync-data.js` →（壳有改动才 git push）
- 站长自己的账号：注册后在 Supabase 后台 Table Editor 手动置 approved=true（一次性）
- 审核新会员：Supabase 后台 members 表打勾

## ④ 测试与上线

测试：

- `node test/stats.test.js` 照跑（stats.js 不动）
- 手动验证三态：注册新号 → 待审核页 → 后台放行 → 内容出现（红黑/方案/面板/徽标/弹窗齐全）→ 退出 → 重新登录
- 用 anon key 直调 REST API 验证 RLS：未登录/未审核返回空，approved 返回数据

上线顺序：

1. 站长注册 Supabase 账号、建项目（区域选 Singapore 就近）
2. 建 members / prediction_days 两表 + 注册触发器（handle_new_user）+ RLS 策略
3. 本地：index.html 改造 + tools/ 脚本 + predictions.js 移出仓库（git rm --cached + .gitignore）
4. git push 部署壳 → 跑 sync-data 上传数据 → 三态手动验证

回滚预案：`git revert` 壳改动提交 + predictions.js 重新入库，即回到公开站。

## 风险与备注

- Supabase 在海外，国内首屏多一次登录态+数据请求（数百 ms 级，小圈子可接受）
- 免费档限额（50 万行读/月等）对小圈子远够用；项目 90 天无活动会暂停，每日使用即不会触发
- 忘记密码：用 Supabase Auth 自带 reset 邮件即可（免费档 SMTP 有额度限制，必要时后台手动重置）
- actualBets 票样图片仍在公开仓库 assets/ 下——已打码，保持现状；如介意后续再迁

## 提交约定

- `feat: 会员注册登录门控（Supabase Auth+RLS 全站门控）`
- `chore: predictions.js 移出公开仓库（数据迁移 Supabase）`
- `feat: tools/sync-data.js 数据同步脚本`
