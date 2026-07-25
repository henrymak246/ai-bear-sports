# AI小熊 · 足球预测日记

零依赖静态网站：双击 `index.html` 即可查看（无需服务器、无需联网）。Logo：`assets/logo.svg`（AI小熊头像）。

## 文件说明
- `index.html` — 页面（代码，稳定不改）
- `stats.js` — 命中率统计逻辑（改判定规则才动）
- `data/predictions.js` — **每天唯一需要改的文件**
- `test/stats.test.js` — 统计逻辑测试：`node test/stats.test.js`

## 每日工作流（AI 执行）
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）
2. 赛后复盘：只需给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`；命中判定与统计由页面自动完成
3. 提交：`git add data/predictions.js && git commit -m "data: YYYY-MM-DD 预测/复盘"`

## 判定规则
- 方向：预测主/平/客胜与实际一致 = ✅
- 大小球：全中✅，半中（赢/输一半）半✅计0.5，走水不计入
- 比分：命中预测数组任一 = ✅
- `放弃` / 未回填场次的项不计入统计
