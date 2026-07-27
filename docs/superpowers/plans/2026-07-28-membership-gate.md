# 会员注册登录门控 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给静态站加会员门：访客邮箱+密码自助注册，站长在 Supabase 后台审核（approved=true）后才能看到全站内容。

**Architecture:** Supabase（Auth + 两表 + RLS 服务端强制）做后端；GitHub Pages 继续托管静态壳；预测数据从公开仓库移出，由 `tools/sync-data.js`（service_role key 仅本机）上传到 `prediction_days` 表；前端 index.html 加三态门（登录/注册 → 待审核 → 内容），现有渲染包成 `renderApp(days)`。

**Tech Stack:** 原生 HTML/CSS/JS + supabase-js@2（CDN UMD）；Node 同步脚本（`@supabase/supabase-js` npm 包）；PostgreSQL RLS。

**项目根目录：** `C:/Users/Administrator/Desktop/足球预测站`

**关键背景（执行者需知）：**
- 规格：`docs/superpowers/specs/2026-07-27-membership-gate-design.md`（先读）
- **部署顺序铁律**：Task 1-3 只做本地提交，**不 push**；Task 4 是部署门（需用户创建 Supabase 项目并给密钥），完成后才 push——否则线上站会对所有人显示"整理中"
- anon key 是公开设计的（RLS 保护数据），可提交进代码；service_role key 只写本机 `tools/.env`（gitignore），绝不提交
- `data/predictions.js` 永远是本地主数据，Task 4 只是把它移出 git 跟踪（`git rm --cached`），文件本身保留
- index.html 渲染逻辑在底部一个 IIFE `<script>` 里（ES5 var 风格、字符串拼 HTML、辅助函数 esc/pct/frac/planBadge）；stats.js 是 UMD 纯函数库，本计划不动
- 测试：`node test/stats.test.js`（不受影响，每任务后跑防手滑）
- git 提交风格：`feat:`/`chore:`/`docs:` 前缀 + 中文

---

### Task 1: Supabase 数据库装配 SQL（supabase/setup.sql）

**Files:**
- Create: `supabase/setup.sql`

一份可直接粘进 Supabase SQL Editor 执行的脚本：members 表 + 注册触发器 + prediction_days 表 + 全部 RLS 策略。

- [ ] **Step 1: 写 SQL 文件**

创建 `supabase/setup.sql`，完整内容：

```sql
-- ============================================
-- AI小熊 · 会员门控 数据库装配（Supabase SQL Editor 一次性执行）
-- 内容：members 表 + 注册触发器 + prediction_days 表 + RLS
-- ============================================

-- 1) members：注册用户档案（approved=站长审核位）
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

-- 本人只能读自己的行（用于前端查 approved）
drop policy if exists "members_select_own" on public.members;
create policy "members_select_own" on public.members
  for select using (auth.uid() = user_id);

-- 2) 注册触发器：auth.users 新用户自动建 members 行（approved=false）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (user_id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) prediction_days：每日预测数据（payload=完整当日对象）
create table if not exists public.prediction_days (
  date text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.prediction_days enable row level security;

-- 仅审核通过的会员可读；anon（未登录）与未审核用户一律读不到
drop policy if exists "days_select_approved" on public.prediction_days;
create policy "days_select_approved" on public.prediction_days
  for select using (
    exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.approved
    )
  );

-- 4) 验证查询（执行后应返回两行 policy 各一条、两表 RLS 均为 enabled）
-- select tablename, rowsecurity from pg_tables where schemaname='public';
-- select policyname, tablename from pg_policies where schemaname='public';
```

说明（执行者理解用，不用写进文件）：members 的子查询在 prediction_days 策略里会叠加 members 自身 RLS——但子查询已限定 `user_id = auth.uid()`，与 members_select_own 兼容；未登录时 `auth.uid()` 为 null，两表都返回空。写表（insert/update）不给任何人策略：前端永远写不进，只有 service_role（绕过 RLS）的同步脚本能写。

> 修订（质量审查后，commit ae5ecf8）：触发器 insert 改为 `coalesce(new.email, '')` + `on conflict (user_id) do nothing`；新增 `revoke execute on function public.handle_new_user() from anon, authenticated;` 与 `revoke truncate on public.members, public.prediction_days from anon, authenticated;`；头部注释补部署提醒。以仓库内 `supabase/setup.sql` 现行版本为准。

- [ ] **Step 2: 静态检查**

通读 SQL：无占位符、policy 名与 drop/create 配对、触发器函数 security definer。用任意在线 SQL 格式化/校验（或本地无 Postgres 则人工复查），不需要连接真实库。

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add supabase/setup.sql
git commit -m "feat: Supabase 会员门控数据库装配 SQL（members+触发器+prediction_days+RLS）"
```

---

### Task 2: 数据同步脚本（tools/）

**Files:**
- Create: `tools/package.json`、`tools/sync-data.js`、`tools/.env.example`
- Modify: `.gitignore`（当前内容仅一行 `dist/`）

- [ ] **Step 1: 写 tools/package.json**

```json
{
  "name": "ai-bear-tools",
  "private": true,
  "version": "1.0.0",
  "description": "AI小熊站点维护工具（数据同步到 Supabase）",
  "dependencies": {
    "@supabase/supabase-js": "^2.0.0"
  }
}
```

- [ ] **Step 2: 写 tools/sync-data.js**

```js
#!/usr/bin/env node
/* tools/sync-data.js — 把本地 data/predictions.js 逐日 upsert 到 Supabase prediction_days 表
   用法: node tools/sync-data.js [--dry-run]
   凭证: tools/.env（gitignore，仅本机）
     SUPABASE_URL=https://xxxx.supabase.co
     SUPABASE_SERVICE_KEY=service_role key（绕过RLS，勿外传勿提交）
*/
'use strict';
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function (line) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.indexOf('=') === -1) return;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  });
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));
  if (!Array.isArray(days) || days.length === 0) throw new Error('predictions.js 为空或不是数组');
  days.forEach(function (d, i) {
    if (!d || typeof d.date !== 'string' || !d.date) throw new Error('第 ' + i + ' 天缺 date 字段');
  });
  const rows = days.map(function (d) {
    return { date: d.date, payload: d, updated_at: new Date().toISOString() };
  });
  console.log('待同步 ' + rows.length + ' 天: ' + rows.map(function (r) { return r.date; }).join(', '));
  if (dryRun) { console.log('[dry-run] 不连接 Supabase，本地校验通过 ✓'); return; }

  const env = loadEnv();
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('缺少凭证：请创建 tools/.env（参照 tools/.env.example）');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key);
  const { error } = await sb.from('prediction_days').upsert(rows, { onConflict: 'date' });
  if (error) { console.error('同步失败: ' + error.message); process.exit(1); }
  console.log('同步完成 ✓ ' + rows.length + ' 天已上传到 prediction_days');
}

main().catch(function (e) { console.error(e && e.message ? e.message : e); process.exit(1); });
```

- [ ] **Step 3: 写 tools/.env.example**

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=在这里填 service_role key（仅本机使用，勿外传勿提交）
```

- [ ] **Step 4: 更新 .gitignore**

把 `.gitignore` 全文改为：

```
dist/
tools/.env
tools/node_modules/
```

- [ ] **Step 5: 安装依赖并 dry-run 验证**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站/tools" && npm install
cd "C:/Users/Administrator/Desktop/足球预测站" && node tools/sync-data.js --dry-run
```

Expected: npm install 成功生成 `tools/node_modules/` 与 `tools/package-lock.json`；dry-run 输出类似 `待同步 3 天: 2026-07-28, 2026-07-27, 2026-07-26` + `[dry-run] 不连接 Supabase，本地校验通过 ✓`

再验证缺凭证时报错友好（此时还没有 tools/.env）：

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && node tools/sync-data.js
```

Expected: 打印待同步天数后输出 `缺少凭证：请创建 tools/.env（参照 tools/.env.example）`，退出码 1

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add tools/package.json tools/package-lock.json tools/sync-data.js tools/.env.example .gitignore
git commit -m "feat: tools/sync-data.js 数据同步脚本（dry-run可校验，凭证gitignore）"
```

确认 `tools/.env` 与 `tools/node_modules/` 不在提交里（`git status --short` 应干净）。

---

### Task 3: index.html 三态会员门 + renderApp 重构

**Files:**
- Modify: `index.html`（CSS 区、header、body 末尾、底部 script 共 6 处）

重构后启动逻辑：dev 模式（URL 带 `?dev`）→ 动态加载本地 `data/predictions.js` 直接渲染（本地预览/测试钩子）；配置占位 → 「小熊整理中」；正常 → supabase 登录态三态门。

- [ ] **Step 1: 移除 predictions.js 脚本标签、引入 supabase-js CDN**

找到（body 底部）：

```html
<script src="data/predictions.js"></script>
<script src="stats.js"></script>
```

替换为：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="stats.js"></script>
```

- [ ] **Step 2: header 加 userBar**

找到：

```html
<header>
  <img src="assets/logo.svg" alt="AI小熊">
  <div>
    <h1>AI小熊 · 体育心得分享 <span class="paw">🐾</span></h1>
    <p class="sub" id="dataInfo">小熊加载中…</p>
  </div>
</header>
```

在 `</div>` 与 `</header>` 之间（即标题 div 之后）插入一行：

```html
  <div id="userBar"></div>
```

- [ ] **Step 3: body 末尾加 gateRoot**

找到：

```html
<div id="planModals"></div>
```

在其后插入：

```html
<div id="gateRoot"></div>
```

- [ ] **Step 4: 加门控 CSS**

找到：

```css
  @media (max-width: 920px) {
    .layout { flex-direction:column; }
    aside { width:100%; position:static; }
  }
```

在其**之前**插入：

```css
  /* ---- 会员门 ---- */
  #gateRoot:empty { display:none; }
  .gate-overlay { position:fixed; inset:0; z-index:60; overflow:auto; padding:24px;
    background:linear-gradient(160deg,#FFF9EE 0%,#FFEFD2 55%,#FFE7BD 100%);
    display:flex; align-items:center; justify-content:center; }
  .gate-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:30px 26px;
    width:100%; max-width:380px; text-align:center; box-shadow:0 12px 36px rgba(169,113,61,.22); }
  .gate-logo { width:64px; height:64px; }
  .gate-card h2 { font-size:19px; color:var(--brown); margin:10px 0 6px; }
  .gate-sub { font-size:12.5px; color:var(--brown-soft); line-height:1.7; margin-bottom:14px; }
  .gate-tabs { display:flex; gap:8px; justify-content:center; margin-bottom:14px; }
  .gate-tab { font-size:13.5px; font-weight:700; color:var(--muted); padding:5px 18px; border-radius:999px; cursor:pointer; border:1px solid var(--line); }
  .gate-tab.active { color:var(--brown); background:var(--amber-bg); border-color:#F5C96B; }
  .gate-card input { width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:14px;
    margin-bottom:10px; background:#FFFDF8; color:#4A3A28; font-family:inherit; }
  .gate-card input:focus { outline:none; border-color:var(--honey); }
  .gate-btn { width:100%; border:none; border-radius:10px; padding:11px 0; font-size:15px; font-weight:800; cursor:pointer;
    background:var(--honey); color:#fff; font-family:inherit; }
  .gate-btn:hover { background:var(--honey-dark); }
  .gate-btn:disabled { opacity:.6; cursor:default; }
  .gate-msg { min-height:20px; font-size:12.5px; color:var(--coral); margin-bottom:8px; }
  .gate-tip { font-size:11.5px; color:var(--muted); margin-top:12px; }
  #userBar { margin-left:auto; display:flex; align-items:center; gap:8px; }
  .ub-mail { font-size:11.5px; color:var(--muted); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ub-out { font-size:12px; font-weight:700; color:var(--honey-dark); text-decoration:none; border:1px solid var(--line); border-radius:999px; padding:3px 10px; background:var(--card); }
  .ub-out:hover { color:var(--coral); }

```

- [ ] **Step 5: 重构底部 script——esc 提升 + 门控 IIFE + renderApp 包装**

底部 script 当前结构（行号近似）：`<script>` 后是 `(function () {` → banner 检查 → `var days = PREDICTION_DAYS;` → 全部渲染函数 → `})();`。做 4 个编辑：

**编辑 A — 开头包装与配置**：把

```js
(function () {
  var banner = document.getElementById('errorBanner');
  if (typeof PREDICTION_DAYS === 'undefined' || !Array.isArray(PREDICTION_DAYS)) {
    banner.hidden = false;
    banner.textContent = '🐻 小熊找不到数据文件 data/predictions.js（或格式有误），检查后刷新试试。';
    document.getElementById('dataInfo').textContent = '数据加载失败';
    return;
  }
  var days = PREDICTION_DAYS;
```

替换为：

```js
// ---- Supabase 配置（Task 4 部署时填入真实值；占位时全站显示"整理中"） ----
var SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
var SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- 会员门：dev 模式 → 本地数据直渲；占位配置 → 整理中；否则走登录三态 ----
(function () {
  var gate = document.getElementById('gateRoot');
  var params = new URLSearchParams(location.search);

  function showGate(html) {
    gate.innerHTML = '<div class="gate-overlay"><div class="gate-card">' + html + '</div></div>';
  }
  function showGateError(t) {
    var banner = document.getElementById('errorBanner');
    banner.hidden = false;
    banner.textContent = '🐻 ' + t;
  }
  function gateLogo() { return '<img src="assets/logo.svg" alt="AI小熊" class="gate-logo">'; }

  // dev 模式：本地预览/测试钩子（?dev），数据文件不上线时此模式自动失效
  if (params.has('dev')) {
    var s = document.createElement('script');
    s.src = 'data/predictions.js';
    s.onload = function () { renderApp(PREDICTION_DAYS); };
    s.onerror = function () { showGateError('dev 模式：本地 data/predictions.js 加载失败'); };
    document.body.appendChild(s);
    return;
  }

  if (!window.supabase || SUPABASE_URL.indexOf('https://YOUR_') === 0) {
    showGate(gateLogo() + '<h2>🐻 小熊搬家整理中</h2><p class="gate-sub">会员系统上线准备中，请稍后再来</p>');
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function renderPending(email) {
    showGate(gateLogo() + '<h2>🍯 等小熊开门</h2>' +
      '<p class="gate-sub">账号 <b>' + esc(email) + '</b> 已注册，站长审核中…<br>通过后刷新即可进入</p>' +
      '<button class="gate-btn" id="gateOut">退出登录</button>');
    document.getElementById('gateOut').onclick = function () {
      sb.auth.signOut().then(function () { location.reload(); });
    };
  }

  function renderUserBar(email) {
    var bar = document.getElementById('userBar');
    bar.innerHTML = '<span class="ub-mail">' + esc(email) + '</span><a href="#!" class="ub-out" id="ubOut">退出</a>';
    document.getElementById('ubOut').onclick = function (e) {
      e.preventDefault();
      sb.auth.signOut().then(function () { location.reload(); });
    };
  }

  function renderAuth() {
    showGate(gateLogo() +
      '<h2>🐻 AI小熊 · 会员门</h2>' +
      '<p class="gate-sub">小圈子分享站，登录且通过审核后可见</p>' +
      '<div class="gate-tabs"><span id="tabLogin" class="gate-tab active">登录</span><span id="tabSignup" class="gate-tab">注册</span></div>' +
      '<input id="gateEmail" type="email" placeholder="邮箱" autocomplete="email">' +
      '<input id="gatePwd" type="password" placeholder="密码（至少6位）">' +
      '<div class="gate-msg" id="gateMsg"></div>' +
      '<button id="gateGo" class="gate-btn">登录</button>' +
      '<p class="gate-tip">没有账号？点上方「注册」，提交后等小熊开门 🍯</p>');
    var mode = 'login';
    var tabL = document.getElementById('tabLogin'), tabS = document.getElementById('tabSignup');
    var btn = document.getElementById('gateGo'), msgEl = document.getElementById('gateMsg');
    function setMode(m) {
      mode = m;
      tabL.className = 'gate-tab' + (m === 'login' ? ' active' : '');
      tabS.className = 'gate-tab' + (m === 'signup' ? ' active' : '');
      btn.textContent = m === 'login' ? '登录' : '注册';
      msgEl.textContent = '';
    }
    tabL.onclick = function () { setMode('login'); };
    tabS.onclick = function () { setMode('signup'); };
    btn.onclick = function () {
      var email = document.getElementById('gateEmail').value.trim();
      var pwd = document.getElementById('gatePwd').value;
      if (!email || pwd.length < 6) { msgEl.textContent = '请填邮箱，密码至少 6 位'; return; }
      btn.disabled = true;
      var done = function () { btn.disabled = false; };
      if (mode === 'login') {
        sb.auth.signInWithPassword({ email: email, password: pwd }).then(function (res) {
          done();
          if (res.error) { msgEl.textContent = '登录失败：' + res.error.message; return; }
          location.reload();
        });
      } else {
        sb.auth.signUp({ email: email, password: pwd }).then(function (res) {
          done();
          if (res.error) { msgEl.textContent = '注册失败：' + res.error.message; return; }
          if (res.data && res.data.session) { renderPending(email); return; }
          msgEl.textContent = '已提交，等小熊开门 🍯 审核通过后登录可见';
        });
      }
    };
  }

  sb.auth.getSession().then(function (res) {
    var session = res && res.data ? res.data.session : null;
    if (!session) { renderAuth(); return; }
    sb.from('members').select('approved').eq('user_id', session.user.id).single()
      .then(function (r2) {
        if (!r2.data || !r2.data.approved) { renderPending(session.user.email || ''); return; }
        renderUserBar(session.user.email || '');
        sb.from('prediction_days').select('payload').order('date', { ascending: false })
          .then(function (r3) {
            if (r3.error || !r3.data || r3.data.length === 0) { showGateError('数据拉取失败，请稍后刷新'); return; }
            renderApp(r3.data.map(function (row) { return row.payload; }));
          });
      })
      .catch(function () { renderPending(session.user.email || ''); });
  }).catch(function () { showGateError('登录状态检查失败，请刷新重试'); });
})();

function renderApp(days) {
  var banner = document.getElementById('errorBanner');
  if (!Array.isArray(days)) {
    banner.hidden = false;
    banner.textContent = '🐻 小熊找不到预测数据，请稍后刷新试试。';
    document.getElementById('dataInfo').textContent = '数据加载失败';
    return;
  }
```

**编辑 B — 删除 renderApp 内重复的 esc**：在 renderApp 体内找到

```js
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

```

删除这三行及后面空行（外层已有同名函数，renderApp 内所有 esc 调用不受影响）。

**编辑 C — 结尾包装**：把文件末尾的

```js
})();
</script>
```

替换为：

```js
}
</script>
```

（即原 IIFE 的 `})();` 变为 `}`，闭合 renderApp。注意：底部 script 里现在依次是 配置常量 → esc → 门控 IIFE → renderApp 函数声明；门控 IIFE 引用 renderApp 靠函数声明提升，合法。）

- [ ] **Step 6: 验证（dev 模式 + 语法检查）**

语法检查（提取 script 块用 node 解析不行——含 DOM，改用以下两法）：

a) 统计标签配对与关键锚点：

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
grep -c "renderApp(" index.html    # 期望 ≥2（定义1 + dev调用1 + 数据回调1）
grep -n "PREDICTION_DAYS" index.html  # 期望只剩 dev 模式那一处 s.onload
grep -n "gateRoot\|userBar\|supabase.min.js" index.html
```

b) 浏览器手动验证（执行者如无法开浏览器，跳过并标注由用户验证）：
- 直接双击打开 `index.html` → 应显示「🐻 小熊搬家整理中」（配置占位）
- 地址栏文件名后加 `?dev` 打开 → 应完整渲染现有全站内容（红黑栏/方案/面板/徽标/弹窗均正常）

c) 单测防手滑：

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js
```

Expected: `stats.test.js 全部通过 ✓`

- [ ] **Step 7: Commit（不 push）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 三态会员门（登录/注册→待审核→内容）+ renderApp 重构 + dev 预览钩子"
```

---

### Task 4: 部署门（需用户配合）——建项目 → 装配 → 翻转数据 → 上线验证

**本任务需要用户提供：** Supabase 项目 URL、anon key、service_role key。拿到之前只做等待，不得 push。

- [ ] **Step 1: 用户创建 Supabase 项目（人工，给用户的话术）**

请用户：
1. 注册 https://supabase.com 账号 → New project → 区域选 **Singapore**，记好数据库密码
2. 项目就绪后，进 **SQL Editor** → 粘贴 `supabase/setup.sql` 全文 → Run（应无报错）
3. **Authentication → Sign In / Providers** → 确认 Email 开启，且 **Confirm email 设为 OFF**（关掉邮箱验证，审核已是门槛）
4. **Project Settings → Data API / API Keys**：复制 Project URL、anon public key、service_role key 给 AI

- [ ] **Step 2: 站长账号预审核（人工/半自动）**

用户在站点注册自己的账号后（或先在 Supabase 后台 Authentication → Add user 建号），到 **Table Editor → members** 把自己那行 `approved` 打勾。也可在 SQL Editor 执行：

```sql
update public.members set approved = true where email = '站长邮箱';
```

- [ ] **Step 3: 填入前端配置**

把 index.html 顶部两个常量改为真实值：

```js
var SUPABASE_URL = 'https://<项目ref>.supabase.co';
var SUPABASE_ANON_KEY = '<anon public key>';
```

- [ ] **Step 4: 配置本机凭证并首次同步**

```bash
cp tools/.env.example tools/.env
# 编辑 tools/.env 填入真实 SUPABASE_URL 与 SUPABASE_SERVICE_KEY
cd "C:/Users/Administrator/Desktop/足球预测站" && node tools/sync-data.js
```

Expected: `同步完成 ✓ N 天已上传到 prediction_days`

在 Supabase Table Editor → prediction_days 应看到逐日数据行。

- [ ] **Step 5: RLS 匿名验证（curl）**

```bash
curl -s "https://<项目ref>.supabase.co/rest/v1/prediction_days?select=date" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
```

Expected: `[]`（空数组 = anon 读不到，RLS 生效）

- [ ] **Step 6: predictions.js 移出 git 跟踪**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git rm --cached data/predictions.js
```

把 `.gitignore` 全文改为：

```
dist/
data/predictions.js
tools/.env
tools/node_modules/
```

同步 dist 发布包（数据文件不再公开分发）：

```bash
cp index.html stats.js dist/
rm -f dist/data/predictions.js
```

- [ ] **Step 7: README 更新**

`README.md` 做两处编辑：

① 「每日工作流（AI 执行）」第 3 条，找：
`3. 提交：\`git add data/predictions.js && git commit -m "data: YYYY-MM-DD 预测/复盘"\``
改为：
`3. 同步：\`node tools/sync-data.js\`（数据在 Supabase，不入 git；页面壳改动才 git commit + push）`

② 文件说明里 `data/predictions.js` 一行，找：
`` - `data/predictions.js` — **每天唯一需要改的文件** ``
改为：
`` - `data/predictions.js` — **每天唯一需要改的文件**（本地主数据，已 gitignore；改完跑 `node tools/sync-data.js` 上传） ``

③ 开头公网地址段落后追加一行：
`- 🔐 会员门控：注册后需站长审核（Supabase members 表 approved 打勾）才可见内容`

- [ ] **Step 8: Commit + push（部署）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html .gitignore README.md
git commit -m "chore: 会员门控上线（predictions.js 移出公开仓库，数据迁移 Supabase）"
git push
```

`git status --short` 确认 `data/predictions.js` 显示为 untracked/不显示（被 ignore），`tools/.env` 不出现。

- [ ] **Step 9: 三态手动验证（线上）**

1. 无痕窗口打开 https://henrymak246.github.io/ai-bear-sports/ → 会员门（登录/注册）
2. 注册新测试号 → 「🍯 等小熊开门」
3. Supabase 后台给测试号 approved 打勾 → 刷新 → 全站内容正常（红黑/方案/面板/徽标/弹窗）
4. 点「退出」→ 回到会员门 → 登录 → 内容出现
5. 站长号登录同样验证一遍

- [ ] **Step 10: 收尾**

更新 `docs/worklog/2026-07-28.md`（新建，记录门控上线过程与每日工作流变更）并提交推送：

```bash
git add docs/worklog/2026-07-28.md
git commit -m "docs: 2026-07-28 工作记录（会员门控上线）"
git push
```

---

## Self-Review 记录

- 规格覆盖：① 架构/两表/RLS/触发器 → Task 1；② 前端三态门/退出/renderApp/移除 predictions.js 引用 → Task 3；③ 同步脚本/.env/工作流/README → Task 2、4；④ 测试与上线顺序/回滚 → Task 4（回滚=revert Task 4 提交）；anon 不可读验证 → Task 4 Step 5。规格「关闭邮箱验证」→ Task 4 Step 1.3
- 占位符：Supabase URL/keys 属用户提供的部署参数，已隔离在 Task 4；Task 3 的占位值即生产开关（占位=整理中），非计划缺陷
- 类型一致：sync-data.js 写 `{date, payload, updated_at}` ↔ setup.sql `prediction_days(date text PK, payload jsonb, updated_at timestamptz)` ↔ 前端 `select('payload').order('date')`；members(user_id, email, approved) ↔ 触发器 insert ↔ 前端 `select('approved').eq('user_id', ...).single()`
- 部署顺序：Task 1-3 仅本地提交；Task 4 Step 8 才 push——中间任何状态上线都只是显示「整理中」，不泄露数据
- 已知限制（接受）：已登录未审核用户可通过不断刷新检查 approved；邮件找回密码用 Supabase 默认邮件通道；git 历史旧数据仍公开（规格已声明接受）
