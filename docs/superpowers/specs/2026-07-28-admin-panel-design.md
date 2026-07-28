# 站长后台管理面板 · 设计（2026-07-28）

## 背景

会员门控已上线（Supabase Auth + members.approved 人工审核）。痛点：站长审核会员要进 Supabase 后台操作数据库。目标：站长在网站内完成全部维护，零数据库操作。

## 需求（用户已确认）

| 项 | 决策 |
|---|---|
| 功能范围 | 会员审核 + 会员管理（撤销）+ 数据状态查看 |
| 入口形态 | 主站 `index.html` 内：管理员登录后用户条出现「🛠 管理」按钮 → 覆盖层面板 |
| 写权限实现 | `members.is_admin` 列 + security definer RPC 函数（members 表保持无任何前端可写策略） |
| 注册邮箱确认 | 开启 Supabase Confirm email；注册流程变四态（注册→📧邮件确认→🍯等审核→内容） |
| 品牌发件邮箱 | **延期**（域名 `ai-bear-sports.com` 已查可注册，但注册审批需时间；先用 Supabase 默认发件人） |

## 架构

```
浏览器（index.html，anon key + 用户 JWT）
  ├─ 普通会员：三态门 → renderApp（现状不动）
  └─ 管理员：三态门 → renderApp + 用户条「🛠 管理」→ 面板
        ├─ rpc list_members() ─┐
        ├─ rpc list_days()     ├─ security definer 函数，体内 is_admin() 鉴权
        ├─ rpc approve_member()│   非管理员调用 → raise exception
        └─ rpc revoke_member()─┘
```

- 管理员判定下沉数据库层：即使有人改前端 JS 强制显示面板，RPC 调用只会得到权限错误，任何数据读不到改不了
- `is_admin` 列无任何前端可达写路径（RPC 只动 approved 列），只能本机 service key 改
- 站长赋权 bootstrap：用户注册站长号后，由本机 service key 执行 `update members set is_admin = true, approved = true`（approved 一并置真，否则站长自己看不了内容；用户零 DB 操作）

## DB 变更（`supabase/admin.sql`，SQL Editor 一次执行）

1. **加列**：`alter table public.members add column if not exists is_admin boolean not null default false;`
2. **辅助函数 `is_admin()`**：security definer，返回当前调用者是否管理员。**必须用它做 RLS 判定**——策略里直接子查询 members 会触发 RLS 无限递归（经典陷阱，规格明确禁止）
3. **RLS 策略 `members_select_admin`**：`for select using (is_admin())`，与现有 `members_select_own` 是 OR 叠加（admin 读全部，普通会员读自己）
4. **四个 RPC**（全部 `security definer set search_path = public`，函数体首行 `if not is_admin() then raise exception 'permission denied'; end if;`）：
   - `list_members()` returns table(user_id uuid, email text, approved boolean, is_admin boolean, created_at timestamptz)，按 created_at 倒序
   - `approve_member(target uuid)`：`update members set approved = true where user_id = target`
   - `revoke_member(target uuid)`：`update members set approved = false where user_id = target`；**保护：target = auth.uid() 时 raise exception（防自撤锁死）**
   - `list_days()` returns table(date text, updated_at timestamptz, matches int)；matches 取 `payload->'matches'` 数组长度（非数组或缺失计 0），按 date 倒序
5. **函数授权**：`revoke execute ... from anon, authenticated;` 后 `grant execute ... to authenticated;`（未登录不可调；authenticated 中非 admin 由函数体内 raise 拦截）

## 前端（index.html，复用现有样式体系）

- 登录后查 members 行的 select 增加 `is_admin` 字段；为 true → `renderUserBar` 追加「🛠 管理」按钮
- 管理面板覆盖层（与 gate-overlay / 方案详解弹窗同风格），三区块：
  1. 🔔 **待审核**：approved=false 的邮箱列表 + 「通过」按钮（无「拒绝」——不通过放着即可，本来就看不了内容）
  2. 👥 **会员管理**：已通过列表 + 「撤销」按钮（`confirm()` 二次确认）；is_admin 行带 👑 标记且无撤销按钮
  3. 📦 **数据状态**：list_days 逐日一行（日期 / 更新时间 / 场次数），一眼看出哪天没同步
- 交互：面板打开时并行调 `list_members()` + `list_days()` → 渲染；点按钮 → 对应 RPC → 成功后重新拉列表局部刷新
- **邮箱确认流程**：
  - 注册成功 → 新状态「📧 验证邮件已发到 xxx，点完链接再回来」（不进等开门）
  - 确认链接跳回站点 → supabase-js `detectSessionInUrl`（默认开）自动取 session → 走正常逻辑（未审核→等开门，已审核→内容）
  - 未确认邮箱尝试登录 → supabase 报 "Email not confirmed" → gate-msg 显示「请先到邮箱点确认链接」

## Supabase 后台（用户操作清单，约 2 分钟）

1. Authentication → Sign In / Providers → Email → **Confirm email 打开**
2. Authentication → URL Configuration → **Site URL** 填 `https://henrymak246.github.io/ai-bear-sports/`；Redirect URLs 加同一条
3. SQL Editor 执行 `supabase/admin.sql`
4. 注册站长号（走新邮件确认流程）→ 告知邮箱 → 本机 service key 赋 is_admin

## 错误处理

- RPC 报错（网络/权限）→ 面板内红字提示，主站内容区不受影响
- list_days 空 → 显示「暂无数据」
- 免费版默认发件额度约每小时 3-4 封：批量测试注册会触顶，必要时后台临时关 Confirm email

## 测试

- `node test/stats.test.js` 回归（不动统计逻辑，应保持全绿）
- 部署后 curl 负向验证：无 JWT / 非管理员 JWT 调 `approve_member` 均应报错
- 人工端到端：注册测试号 → 邮件确认 → 等开门 → 面板通过 → 测试号进站 → 撤销 → 测试号回等开门；面板数据状态区块显示 7/26–7/28 三天

## 品牌发件邮箱（延期项，不做本期实现）

- 路径备忘：`ai-bear-sports.com`（2026-07-28 经 1.1.1.1 查 NXDOMAIN，可注册）→ 域名实名审批 → Resend 免费档 SMTP（100 封/天，SPF/DKIM 三条 DNS 记录）→ Supabase Auth SMTP Settings 填 `noreply@ai-bear-sports.com`
- 切换只改 Supabase 配置，代码零改动

## 明确不做（YAGNI）

- 不做注册域名白名单
- 不做删除账号（撤销即禁用；真删 auth 用户需 service 权限，留人工）
- 不做 Edge Function
- 待审核列表不做「拒绝」按钮
