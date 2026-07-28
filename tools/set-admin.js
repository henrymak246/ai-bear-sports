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
