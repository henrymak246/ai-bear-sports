# 站长后台管理面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 站长在网站内完成会员审核/撤销与数据状态查看（零数据库操作），注册流程加邮箱确认（四态门）。

**Architecture:** `members.is_admin` 列 + security definer RPC（函数体内鉴权，members 表保持无前端写路径）；前端复用现有门控 IIFE：管理员登录后用户条出现「🛠 管理」按钮，点开覆盖层面板（三区块：待审核/会员管理/数据状态）。规格：`docs/superpowers/specs/2026-07-28-admin-panel-design.md`。

**Tech Stack:** 原生 HTML/CSS/JS + supabase-js@2（CDN UMD 已在页面引入）；PostgreSQL（Supabase SQL Editor 执行）；Node（tools/set-admin.js 复用 tools/node_modules 里的 @supabase/supabase-js）。

- **部署顺序铁律**：`supabase/admin.sql` 必须由用户在 SQL Editor 执行成功之后，前端才能 push——否则 `members` 没有 `is_admin` 列，`select('approved, is_admin')` 报错导致所有已审核用户被误判进「等开门」。Task 1-3 只本地 commit，Task 4 才 push
- `is_admin` 列无前端写路径：RPC 只动 approved 列；赋权只走本机 `tools/set-admin.js`（service key）

---

### Task 1: 数据库迁移脚本 supabase/admin.sql + 赋权脚本 tools/set-admin.js

**Files:**
- Create: `supabase/admin.sql`
- Create: `tools/set-admin.js`
- Modify: `supabase/setup.sql`（头部注释加一行迁移指引）

- [ ] **Step 1: 创建 `supabase/admin.sql`**

完整内容：

```sql
-- ============================================
-- AI小熊 · 站长后台 数据库迁移（Supabase SQL Editor 一次性执行）
-- 前置：setup.sql 已执行。本脚本：members.is_admin + is_admin() + 管理员读策略 + 4 个管理 RPC
-- 设计要点：members 表保持无任何前端写策略；写操作只走 security definer RPC（函数体内鉴权）
-- ============================================

-- 1) members 加管理员标记（无前端写路径，只能 service key 改）
alter table public.members add column if not exists is_admin boolean not null default false;

-- 2) is_admin()：RLS 策略与 RPC 共用判定。security definer 绕 RLS——
--    策略里直接子查询 members 会无限递归（经典陷阱），必须走函数
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists(select 1 from public.members where user_id = auth.uid() and is_admin);
$$;
-- 注意：is_admin() 保持默认 PUBLIC execute（策略表达式需对 anon/authenticated 可调用；
-- 只返回布尔、不泄露数据，可安全暴露）

-- 3) 管理员可读 members 全部行（与 members_select_own 是 OR 叠加：普通会员仍只能读自己）
drop policy if exists "members_select_admin" on public.members;
create policy "members_select_admin" on public.members
  for select using (public.is_admin());

-- 4) list_members()：全部会员（仅管理员）
create or replace function public.list_members()
returns table(user_id uuid, email text, approved boolean, is_admin boolean, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  return query select m.user_id, m.email, m.approved, m.is_admin, m.created_at
    from public.members m order by m.created_at desc;
end;
$$;

-- 5) approve_member(target)：通过审核（仅管理员）
create or replace function public.approve_member(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  update public.members set approved = true where user_id = target;
end;
$$;

-- 6) revoke_member(target)：撤销审核（仅管理员；不能撤自己，防锁死）
create or replace function public.revoke_member(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  if target = auth.uid() then raise exception 'cannot revoke yourself'; end if;
  update public.members set approved = false where user_id = target;
end;
$$;

-- 7) list_days()：数据同步状态（matches = 当日 payload.matches 数组长度，缺失/非数组计 0）
create or replace function public.list_days()
returns table(date text, updated_at timestamptz, matches int)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  return query select d.date, d.updated_at,
    case when jsonb_typeof(d.payload->'matches') = 'array'
         then jsonb_array_length(d.payload->'matches') else 0 end as matches
    from public.prediction_days d order by d.date desc;
end;
$$;

-- 8) 授权：anon 一律不可调；authenticated 可调但非管理员被函数体首行拦截
revoke execute on function public.list_members() from anon, authenticated;
revoke execute on function public.approve_member(uuid) from anon, authenticated;
revoke execute on function public.revoke_member(uuid) from anon, authenticated;
revoke execute on function public.list_days() from anon, authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.approve_member(uuid) to authenticated;
grant execute on function public.revoke_member(uuid) to authenticated;
grant execute on function public.list_days() to authenticated;

-- 9) 站长赋权不在此执行（由本机 tools/set-admin.js 用 service key 完成）：
-- update public.members set is_admin = true, approved = true where email = '站长邮箱';
```

- [ ] **Step 2: 创建 `tools/set-admin.js`**

完整内容（风格对齐 sync-data.js 的 .env 读取与去引号）：

```js
/* tools/set-admin.js — 站长赋权：把指定邮箱的 members 行置 is_admin + approved（service key，仅本机）
   用法: node tools/set-admin.js <email>
   凭证读 tools/.env（SUPABASE_URL / SUPABASE_SERVICE_KEY），绝不提交 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(__dirname, '.env');
  const out = {};
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
  return out;
}

(async () => {
  const email = (process.argv[2] || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('用法: node tools/set-admin.js <email>');
    process.exit(1);
  }
  const env = loadEnv();
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY（tools/.env）');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key);
  const { data, error } = await sb.from('members')
    .update({ is_admin: true, approved: true })
    .eq('email', email)
    .select();
  if (error) { console.error('赋权失败:', error.message); process.exit(1); }
  if (!data || data.length === 0) {
    console.error('找不到该邮箱的 members 行（请先在网站上注册）:', email);
    process.exit(1);
  }
  console.log('已赋权 ✓', email, '→ is_admin + approved');
})();
```

- [ ] **Step 3: setup.sql 头部注释加迁移指引**

`supabase/setup.sql` 第 5 行后（`-- 执行后记得：…` 那行之后）追加一行：

```sql
-- 增量迁移：站长后台（is_admin + 管理 RPC）见同目录 admin.sql（在 setup.sql 之后执行）
```

- [ ] **Step 4: 静态校验**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
node --check tools/set-admin.js && echo JS语法OK
grep -c "raise exception" supabase/admin.sql
```

Expected: `JS语法OK`；grep 输出 `5`（4 个 RPC 各 1 次 + revoke 自撤保护 1 次）

- [ ] **Step 5: Commit（不 push）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add supabase/admin.sql tools/set-admin.js supabase/setup.sql
git commit -m "feat: 站长后台 DB 迁移（is_admin+4个管理RPC）+ set-admin 赋权脚本"
```

---

### Task 2: 前端四态门（注册加邮箱确认态）

**Files:**
- Modify: `index.html`（门控 IIFE 内，renderPending 函数后加 renderEmailSent；renderAuth 的 signup/login 分支）

- [ ] **Step 1: 加 renderEmailSent 函数**

在 `index.html` 的 `renderPending` 函数结束（`}` 闭合，现第 338 行）之后插入：

```js
  function renderEmailSent(email) {
    showGate(gateLogo() + '<h2>📧 去邮箱点确认链接</h2>' +
      '<p class="gate-sub">验证邮件已发送到 <b>' + esc(email) + '</b><br>' +
      '点开邮件里的链接即可回到本站（可能在垃圾箱）</p>');
  }
```

- [ ] **Step 2: signup 成功分支改为四态**

现第 388-393 行 signup 的 `.then` 体：

```js
        sb.auth.signUp({ email: email, password: pwd }).then(function (res) {
          done();
          if (res.error) { msgEl.textContent = '注册失败：' + res.error.message; return; }
          if (res.data && res.data.session) { renderPending(email); return; }
          msgEl.textContent = '已提交，等小熊开门 🍯 审核通过后登录可见';
        });
```

改为（Confirm email 开→无 session→📧 态；关→有 session→维持原等开门，两种后台设置都兼容）：

```js
        sb.auth.signUp({ email: email, password: pwd }).then(function (res) {
          done();
          if (res.error) { msgEl.textContent = '注册失败：' + res.error.message; return; }
          if (res.data && res.data.session) { renderPending(email); return; }
          renderEmailSent(email);
        });
```

- [ ] **Step 3: login 失败加"邮箱未验证"友好提示**

现第 384 行：

```js
          if (res.error) { msgEl.textContent = '登录失败：' + res.error.message; return; }
```

改为：

```js
          if (res.error) {
            msgEl.textContent = /email not confirmed/i.test(res.error.message)
              ? '邮箱还未验证：请先到邮箱点确认链接（可能在垃圾箱）'
              : '登录失败：' + res.error.message;
            return;
          }
```

- [ ] **Step 4: 回归测试**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js
```

Expected: `stats.test.js 全部通过 ✓`（本次未动统计逻辑，应保持全绿）

- [ ] **Step 5: Commit（不 push）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 注册四态门（邮箱确认态 + 未验证登录友好提示）"
```

---

### Task 3: 前端管理面板（🛠 按钮 + 三区块覆盖层）

**Files:**
- Modify: `index.html`（CSS 区加 .adm-* 样式；body 加 #admRoot；renderUserBar 加 isAdmin 参数；members select 加 is_admin；门控 IIFE 加面板函数）

- [ ] **Step 1: CSS 追加（现 .gate-tip 样式即第 231 行之后）**

```css
  .adm-overlay { position:fixed; inset:0; z-index:60; overflow:auto; padding:24px; background:rgba(74,58,40,.45); display:flex; align-items:flex-start; justify-content:center; }
  .adm-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:22px 20px; max-width:520px; width:100%; margin:auto; position:relative; box-shadow:0 20px 50px rgba(74,58,40,.28); }
  .adm-card h2 { font-size:17px; color:var(--brown); margin:0 30px 4px 0; }
  .adm-sec { margin-top:14px; }
  .adm-sec-title { font-size:13.5px; font-weight:800; color:var(--brown); margin-bottom:6px; }
  .adm-row { display:flex; align-items:center; gap:8px; padding:7px 10px; border:1px solid var(--line); border-radius:10px; margin-bottom:6px; font-size:12.5px; color:var(--brown-soft); }
  .adm-row .am { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .adm-btn { border:none; border-radius:8px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; background:var(--honey); color:#fff; font-family:inherit; }
  .adm-btn.revoke { background:var(--coral); }
  .adm-btn:disabled { opacity:.6; cursor:default; }
  .adm-empty { font-size:12px; color:var(--muted); padding:4px 2px; }
  .adm-msg { min-height:18px; font-size:12px; color:var(--coral); margin-top:8px; }
  .adm-close { position:absolute; top:10px; right:14px; font-size:22px; line-height:1; cursor:pointer; color:var(--muted); background:none; border:none; font-family:inherit; }
  .adm-close:hover { color:var(--coral); }
```

- [ ] **Step 2: body 加面板挂载点**

现第 281 行 `<div id="gateRoot"></div>` 之后加一行：

```html
<div id="admRoot"></div>
```

- [ ] **Step 3: renderUserBar 加 isAdmin 参数（现第 340-347 行整函数替换）**

```js
  function renderUserBar(email, isAdmin) {
    var bar = document.getElementById('userBar');
    bar.innerHTML = '<span class="ub-mail">' + esc(email) + '</span>' +
      (isAdmin ? '<a href="#!" class="ub-out" id="ubAdmin">🛠 管理</a>' : '') +
      '<a href="#!" class="ub-out" id="ubOut">退出</a>';
    if (isAdmin) {
      document.getElementById('ubAdmin').onclick = function (e) { e.preventDefault(); openAdmin(); };
    }
    document.getElementById('ubOut').onclick = function (e) {
      e.preventDefault();
      sb.auth.signOut().then(function () { location.reload(); });
    };
  }
```

- [ ] **Step 4: 面板函数（插在 renderUserBar 之后、renderAuth 之前）**

```js
  function openAdmin() {
    var root = document.getElementById('admRoot');
    root.innerHTML = '<div class="adm-overlay" id="admMask"><div class="adm-card">' +
      '<button type="button" class="adm-close" id="admClose">×</button>' +
      '<h2>🛠 站长后台</h2>' +
      '<div class="adm-sec"><div class="adm-sec-title">🔔 待审核</div><div id="admPending"><div class="adm-empty">加载中…</div></div></div>' +
      '<div class="adm-sec"><div class="adm-sec-title">👥 会员管理</div><div id="admApproved"><div class="adm-empty">加载中…</div></div></div>' +
      '<div class="adm-sec"><div class="adm-sec-title">📦 数据状态</div><div id="admDays"><div class="adm-empty">加载中…</div></div></div>' +
      '<div class="adm-msg" id="admMsg"></div>' +
      '</div></div>';
    document.getElementById('admClose').onclick = closeAdmin;
    document.getElementById('admMask').onclick = function (e) { if (e.target === this) closeAdmin(); };
    loadAdmin();
  }
  function closeAdmin() { document.getElementById('admRoot').innerHTML = ''; }
  function admErr(t) {
    var el = document.getElementById('admMsg');
    if (el) el.textContent = t;
  }
  function memberRow(m, actionHtml) {
    return '<div class="adm-row"><span class="am">' + esc(m.email) + (m.is_admin ? ' 👑' : '') + '</span>' + actionHtml + '</div>';
  }
  function loadAdmin() {
    Promise.all([sb.rpc('list_members'), sb.rpc('list_days')]).then(function (rs) {
      var rm = rs[0], rd = rs[1];
      if (rm.error) { admErr('会员列表加载失败：' + rm.error.message); return; }
      var members = rm.data || [];
      var pending = members.filter(function (m) { return !m.approved; });
      var approved = members.filter(function (m) { return m.approved; });
      document.getElementById('admPending').innerHTML = pending.length === 0
        ? '<div class="adm-empty">没有待审核的账号</div>'
        : pending.map(function (m) {
            return memberRow(m, '<button type="button" class="adm-btn" data-approve="' + m.user_id + '">通过</button>');
          }).join('');
      document.getElementById('admApproved').innerHTML = approved.length === 0
        ? '<div class="adm-empty">暂无会员</div>'
        : approved.map(function (m) {
            return memberRow(m, m.is_admin ? '' : '<button type="button" class="adm-btn revoke" data-revoke="' + m.user_id + '">撤销</button>');
          }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('[data-approve]'), function (b) {
        b.onclick = function () {
          b.disabled = true;
          sb.rpc('approve_member', { target: b.getAttribute('data-approve') }).then(function (r) {
            if (r.error) { admErr('通过失败：' + r.error.message); b.disabled = false; return; }
            loadAdmin();
          });
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-revoke]'), function (b) {
        b.onclick = function () {
          if (!window.confirm('确定撤销该会员的访问资格？')) return;
          b.disabled = true;
          sb.rpc('revoke_member', { target: b.getAttribute('data-revoke') }).then(function (r) {
            if (r.error) { admErr('撤销失败：' + r.error.message); b.disabled = false; return; }
            loadAdmin();
          });
        };
      });
      if (rd.error) { document.getElementById('admDays').innerHTML = '<div class="adm-empty">数据状态加载失败</div>'; return; }
      var days = rd.data || [];
      document.getElementById('admDays').innerHTML = days.length === 0
        ? '<div class="adm-empty">暂无数据</div>'
        : days.map(function (d) {
            return '<div class="adm-row"><span class="am">' + esc(d.date) + ' · ' + d.matches + ' 场</span>' +
              '<span>' + esc(new Date(d.updated_at).toLocaleString('zh-CN', { hour12: false })) + '</span></div>';
          }).join('');
    }).catch(function () { admErr('网络异常，请稍后重试'); });
  }
```

- [ ] **Step 5: members 查询加 is_admin + 传参（现第 401-404 行）**

现：

```js
    sb.from('members').select('approved').eq('user_id', session.user.id).single()
      .then(function (r2) {
        if (!r2.data || !r2.data.approved) { renderPending(session.user.email || ''); return; }
        renderUserBar(session.user.email || '');
```

改为：

```js
    sb.from('members').select('approved, is_admin').eq('user_id', session.user.id).single()
      .then(function (r2) {
        if (!r2.data || !r2.data.approved) { renderPending(session.user.email || ''); return; }
        renderUserBar(session.user.email || '', !!r2.data.is_admin);
```

- [ ] **Step 6: 回归测试 + 静态检查**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js
grep -n "admRoot\|openAdmin\|list_members\|is_admin" index.html | head -8
```

Expected: 测试全绿；grep 能看到 admRoot 挂载点、openAdmin 定义与调用、is_admin 查询

- [ ] **Step 7: Commit（不 push）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 站长后台面板（🛠按钮+待审核/会员管理/数据状态三区块）"
```

---

### Task 4: 部署门（用户执行 SQL → 开关邮箱确认 → 赋权 → 验证 → push）

**本任务需用户配合（SQL Editor 与 Auth 设置）。部署顺序铁律：admin.sql 执行成功前不得 push。**

- [ ] **Step 1: 用户执行 admin.sql（人工）**

Supabase SQL Editor → 粘贴 `supabase/admin.sql` 全文 → Run。应无报错；末段验证查询可自选执行：

```sql
select proname from pg_proc where proname in ('is_admin','list_members','approve_member','revoke_member','list_days');
-- 应返回 5 行
```

- [ ] **Step 2: 用户开邮箱确认（人工）**

- Authentication → Sign In / Providers → Email → **Confirm email 打开**
- Authentication → URL Configuration → Site URL 填 `https://henrymak246.github.io/ai-bear-sports/`，Redirect URLs 加同一条

- [ ] **Step 3: AI 负向验证（无 JWT 调 RPC 必须被拒）**

```bash
curl -s -X POST "https://gzpuxgkpblpbpdpfvpof.supabase.co/rest/v1/rpc/approve_member" \
  -H "apikey: sb_publishable_QVvDcCQFfcTvVpVFmeqEQA_N1xNjGZW" \
  -H "Authorization: Bearer sb_publishable_QVvDcCQFfcTvVpVFmeqEQA_N1xNjGZW" \
  -H "Content-Type: application/json" \
  -d '{"target":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"code":"42501",...,"message":"permission denied for function approve_member"}`（anon 无 execute 权限）

- [ ] **Step 4: 用户注册站长号（人工）**

用户在网站上注册自己的账号 → 收到验证邮件 → 点链接确认（members 行由触发器自动创建）→ 把邮箱告诉 AI

- [ ] **Step 5: AI 赋权站长**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && node tools/set-admin.js <站长邮箱>
```

Expected: `已赋权 ✓ <站长邮箱> → is_admin + approved`

- [ ] **Step 6: 回归 + 同步 dist + push（需用户确认后执行）**

Task 1-3 已全部 commit，此步无新改动可提交，直接回归 + push：

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
node test/stats.test.js
cp index.html dist/
git push
```

- [ ] **Step 7: 用户端到端验证（线上，人工）**

1. 无痕窗口注册新测试号 → 看到「📧 去邮箱点确认链接」→ 邮件点链接 → 跳回站点 → 「🍯 等小熊开门」
2. 站长号登录 → 用户条有「🛠 管理」→ 打开面板：待审核里看到测试号 → 点「通过」→ 测试号刷新能进站
3. 面板点「撤销」→ 确认 → 测试号刷新回到等开门
4. 数据状态区块显示 7/26 起逐日（日期/场次数/更新时间）
5. 普通会员（测试号再次通过后）登录 → 用户条**没有**🛠 按钮

- [ ] **Step 8: 收尾工作记录**

更新 `docs/worklog/2026-07-28.md` 追加站长后台上线段落并 commit + push：

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add docs/worklog/2026-07-28.md
git commit -m "docs: 工作记录追加站长后台上线"
git push
```

---

## Self-Review 记录

- 规格覆盖：is_admin 列/辅助函数/读策略/4 RPC/授权 → Task 1；四态门/未验证提示 → Task 2；🛠按钮/三区块面板/二次确认/👑标记/错误红字 → Task 3；Confirm email+Site URL/赋权/负向验证/E2E → Task 4；品牌邮箱延期项无需任务
- 部署顺序：铁律写进头部与 Task 4（admin.sql 先于 push，防 is_admin 列不存在导致全员误判等开门）；Task 1-3 仅本地 commit
- 类型一致：RPC 参数名 `target` ↔ 前端 `sb.rpc('approve_member', { target: ... })`；list_days 返回 `matches` ↔ 前端 `d.matches`；members select `is_admin` ↔ `r2.data.is_admin`
- 递归陷阱：策略用 `public.is_admin()`（security definer）而非子查询；is_admin() 保持 PUBLIC execute 且只返回布尔
