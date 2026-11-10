const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

// 深夜快车跨日口径: 预测日(实际开球日 10-24)对应的竞彩标签仍在前一日快照(cq_1023.json)。
// 回归目标: cq_<比赛日>.json 不存在时, _ah_moves 必须回退读取前一日快照而不是 ENOENT。
// 2026-10-24 上午追加周六001-021后, 当日总场数=30; 新场在首个盘口快照后允许暂不足2点, 只要求凌晨11场仍覆盖。
// ⚠️ 环境依赖(2026-10-27 踩通): 本测试固定跑 2026-10-24, 但盘路快照由 relay 只保留近 2 天 ——
//     10-23~10-25 窗口快照被清理后, 该日分析恒报「快照不足」。遇此按环境缺失跳过(非回归失败)。
const root = path.join(__dirname, '..');
const r = spawnSync(process.execPath, ['tools/_ah_moves.js', '2026-10-24'], {
  cwd: root,
  encoding: 'utf8',
});

if (r.status !== 0 && /快照不足/.test(r.stderr || '')) {
  console.log('ah_moves.test.js 跳过: 10-23~10-25 历史盘口快照已被 relay 清理(保留近2天), 回归待快照窗口内重跑');
  process.exit(0);
}
assert.strictEqual(r.status, 0, `盘路分析应成功退出\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
const m = r.stdout.match(/分析 (\d+)\/30 场/);
assert.ok(m, `应识别 10-24 的 30 场\nstdout:\n${r.stdout}`);
assert.ok(Number(m[1]) >= 11, `跨日回退至少应覆盖凌晨 11 场\nstdout:\n${r.stdout}`);
console.log('ah_moves.test.js 全部通过 ✓');
