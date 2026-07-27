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
    let v = t.slice(i + 1).trim();
    if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  });
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  process.argv.slice(2).forEach(function (a) {
    if (a !== '--dry-run') console.error('警告：忽略未知参数 ' + a + '（想干跑请用 --dry-run）');
  });
  const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));
  if (!Array.isArray(days) || days.length === 0) throw new Error('predictions.js 为空或不是数组');
  const seen = {};
  days.forEach(function (d, i) {
    if (!d || typeof d.date !== 'string' || !d.date) throw new Error('第 ' + i + ' 天缺 date 字段');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('第 ' + i + ' 天 date 格式应为 YYYY-MM-DD: ' + d.date);
    if (seen[d.date]) throw new Error('date 重复: ' + d.date);
    seen[d.date] = true;
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
