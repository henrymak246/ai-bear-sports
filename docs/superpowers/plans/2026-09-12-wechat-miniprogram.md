# 小熊微信小程序 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自用微信小程序——手机看当日竞彩/北单310/亚洲让球推荐,一键点选组串登记投注,前台 5 分钟轮询 ESPN 实时比分,完场自动结算盈亏。

**Architecture:** 原生小程序(WXML/WXSS/JS,零构建)+ Supabase 直连(推荐只读 prediction_days / 读写 bets)+ ESPN scoreboard 直连(前台轮询)。无自建后端。设计文档: `docs/superpowers/specs/2026-09-12-wechat-miniprogram-design.md`。

**Tech Stack:** 微信小程序原生框架 / Supabase REST / ESPN scoreboard API(免 key)/ Node(生成脚本与判定单测)。

**仓库约定:** 站点仓库根= `C:/Users/Administrator/Desktop/足球预测站`。小程序代码在 `miniprogram/` 子目录。判定逻辑必须与站点 `stats.js` 同源(由生成脚本抽取,不手抄)。每日新对手映射由 `tools/gen_mini_espn.js` 从当天 `tools/_live<MMDD>.js` 重新生成,防漂移。

**多 agent 并行波次:** Wave1 = T1+T2+T3(相互独立,接口契约见 §接口契约); Wave2 = T4(依赖 T3 骨架与 T2/T3 的 utils 接口); Wave3 = T5+T6(依赖 T4); Wave4 = T7 集成验收。

---

## 接口契约(Wave1 各 agent 严格遵守,先定死再并行)

### `miniprogram/utils/config.js`(gitignore, 不入库)
```js
module.exports = {
  SUPABASE_URL: 'https://<project>.supabase.co', // 从 tools/.env 的 SUPABASE_URL 复制
  ANON_KEY: '<anon key>',                         // tools/.env 的 SUPABASE_ANON_KEY(无则看 supabase/ 目录 sql 注释)
  SERVICE_KEY: '<service key>',                   // tools/.env 的 SUPABASE_SERVICE_KEY(仅 bets 表读写用)
};
```
模板 `miniprogram/utils/config.example.js` 入库(键名同上,值为空串)。**config.js 必须加进 .gitignore。**

### `miniprogram/utils/api.js`(Task 3 交付)
```js
// 全部返回 Promise。失败 reject(Error),调用方自行降级。
api.fetchTodayPayload()      // GET prediction_days 最新一天 payload → 对象 {date, matches, plan, max7, hc7, asian7, score3, beidan310?, zucai310?}
api.fetchPayloadByDate(date) // 同上但指定 'YYYY-MM-DD'
api.saveBet(bet)             // POST bets 表, bet 字段见 spec §4.3; → 返回插入行
api.fetchBets()              // GET bets?order=created_at.desc → 数组
api.updateBet(id, patch)     // PATCH bets?id=eq.<id> → 更新行
```
实现要点: `wx.request` 封装; header: `apikey` + `Authorization: Bearer <key>`; 读用 ANON_KEY, 写/读 bets 用 SERVICE_KEY; ` Prefer: return=representation` 拿插入行。

### `miniprogram/utils/espn.js`(Task 2 交付, 数据由生成脚本产出)
```js
espn.LEAGUE_MAP    // { '英超':'eng.1', '意甲':'ita.1', '德甲':'ger.1', '西甲':'esp.1', '法甲':'fra.1', '日职':'jpn.1', '韩职':null(死链人工), '沙职':'ksa.1', '挪超':'nor.1', '葡超':'por.1', '荷甲':'ned.1', '德乙':'ger.2', '法乙':'fra.2', '英冠':'eng.2', '瑞超':'swe.1', '巴甲':'bra.1', '芬超':'fin.1', '荷乙':'ned.2' }
espn.TEAM_MAP      // 当日: { '利物浦':'Liverpool', ... } (由 tools/gen_mini_espn.js 从 tools/_live<MMDD>.js 抽取; 每日重生成)
espn.DATES()       // [今日 YYYYMMDD, 次日 YYYYMMDD] (北京时间口径)
espn.fetchBoard(leagueCode, yyyymmdd) // Promise → [{home, away, hs, as, st}] (st=ESPN status.type.name)
espn.findScore(boards, homeCn, awayCn) // 按 TEAM_MAP 子串匹配(不区分大小写) → {hs, as, st} | null
```

### `miniprogram/utils/judge.js`(Task 1 交付, 由 tools/gen_mini_judge.js 从 stats.js 抽取)
```js
judge.parseScore('2-1')        // → {home:2, away:1} | null
judge.judgeDirection('主胜','2-1')  // → 1|0|null (null=无比分)
judge.judgeOverUnder('大2.5','2-1') // → 1|0|null (支持 "大2.75" 线位表达与走水半档, 与 stats.js 同口径)
judge.judgeScore(['2-1','1-0'],'2-1') // → 1|0|null
judge.judgeBd310('3/1', '-1', '2-0')  // 北单让球310: 主队比分+handicap 后定 3/1/0, 多选命中其一 → 'hit'|'miss'|'push'|null
judge.judgeAh('美因茨-0.5', '2-1')    // 亚盘: 从 pick 解析让球方与盘口数(负=让/正=受让) → 'win'|'winHalf'|'push'|'loseHalf'|'lose'|null
judge.ahFactor('winHalf')    // 亚盘结算系数: win=1, winHalf=0.5, push=0(退还), loseHalf=-0.5, lose=-1 (用于奖金折算)
```

### bets 表(spec §4.3)
`supabase/bets.sql` 建表; 字段: id uuid pk default gen_random_uuid(), created_at timestamptz default now(), bet_date text, source text('jc'|'bd'|'ah'), legs jsonb, stakes int, unit numeric default 2, amount numeric, expect_payout numeric, status text default 'pending', actual_payout numeric default 0, profit numeric default 0, settled_at timestamptz, note text。**不开 RLS**(仅 service key 可达)。另建索引 `create index on bets (bet_date, status)`。

### 页面/工具文件结构
```
miniprogram/
  app.json / app.js / app.wxss / project.config.json(appid 占位 "touristappid", 用户注册后替换)
  pages/index/index.{js,wxml,wxss,json}   // 推荐页(三Tab+场卡+组串)
  pages/bets/bets.{js,wxml,wxss,json}     // 我的投注(列表+统计+结算)
  utils/{config.js(gitignore), config.example.js, api.js, espn.js, espn_matches.js(每日生成), judge.js, settle.js, fmt.js}
tools/gen_mini_judge.js / tools/gen_mini_espn.js
test/mini_judge.test.js
```

---

### Task 0(前置 · 用户手工, 不派 agent)

- [ ] 注册个人小程序拿 AppID; 装微信开发者工具; 工具内导入 `miniprogram/` 目录, AppID 填进 `project.config.json`(未注册前用 `touristappid` 测试号亦可预览)
- [ ] 把 `tools/.env` 的三个键值抄进 `miniprogram/utils/config.js`(照 config.example.js)
- [ ] Supabase SQL 编辑器执行 `supabase/bets.sql`
- [ ] 开发者工具勾选「不校验合法域名」(开发版自用)

---

### Task 1: 判定模块(TDD)

**Files:**
- Create: `tools/gen_mini_judge.js`
- Create: `miniprogram/utils/judge.js`(生成产物,首次可手写后由生成脚本覆盖校验)
- Test: `test/mini_judge.test.js`

- [ ] **Step 1: 写失败测试** `test/mini_judge.test.js`(node assert, 复用站点 test/stats.test.js 的关键用例):

```js
const J = require('../miniprogram/utils/judge.js');
const assert = require('assert');
// parseScore
assert.deepStrictEqual(J.parseScore('2-1'), {home:2, away:1});
assert.strictEqual(J.parseScore(''), null);
// direction
assert.strictEqual(J.judgeDirection('主胜','2-1'), 1);
assert.strictEqual(J.judgeDirection('主胜','1-2'), 0);
assert.strictEqual(J.judgeDirection('客胜','1-1'), 0);
assert.strictEqual(J.judgeDirection('平','0-0'), 1);
assert.strictEqual(J.judgeDirection('主胜',null), null);
// overUnder 线位表达(含走水/半档): 大2.75=大2.5/3
assert.strictEqual(J.judgeOverUnder('大2.5','2-1'), 1);
assert.strictEqual(J.judgeOverUnder('大2.5','1-1'), 0);
assert.strictEqual(J.judgeOverUnder('小3','2-1'), null); // 走水口径按站点 stats.js 实际语义, 以 stats.js 同函数输出为准
// score
assert.strictEqual(J.judgeScore(['2-1','1-0'],'2-1'), 1);
assert.strictEqual(J.judgeScore(['2-1'],'0-0'), 0);
// 北单让球310
assert.strictEqual(J.judgeBd310('3','0','2-1'), 'hit');        // 让0 主胜
assert.strictEqual(J.judgeBd310('3','-1','1-0'), 'miss');       // 让-1 后 0-0=平, 单3黑
assert.strictEqual(J.judgeBd310('3/1','-1','1-0'), 'hit');      // 让-1 平=让球平红
assert.strictEqual(J.judgeBd310('0/1','+1','0-1'), 'hit');      // 让+1: 客赢1球→让后平=1红
assert.strictEqual(J.judgeBd310('3','0',null), null);
assert.strictEqual(J.judgeBd310('3','0','2-1','push'), 'push'); // 人工 push 优先(第4参=人工result)
// 亚盘
assert.strictEqual(J.judgeAh('美因茨-0.5','2-1'), 'win');
assert.strictEqual(J.judgeAh('美因茨-0.5','1-1'), 'lose');
assert.strictEqual(J.judgeAh('巴竞技-0.25','3-3'), 'loseHalf'); // 让0/0.5 平局输半
assert.strictEqual(J.judgeAh('富勒姆+1.25','1-0'), 'winHalf');  // 受让1/1.5 输1球=赢半
assert.strictEqual(J.judgeAh('桑德兰+1','0-1'), 'push');
assert.strictEqual(J.judgeAh('波尔图-1.5','0-2'), 'win');
assert.strictEqual(J.judgeAh('美因茨-0.5',null), null);
assert.strictEqual(J.ahFactor('win'), 1);
assert.strictEqual(J.ahFactor('loseHalf'), -0.5);
console.log('mini_judge 全部通过 ✓');
```

judgeAh 解析规则: pick 尾部数字为盘口(`-0.5`=主队让0.5, `+1.25`=主队受让1/1.5); 半球拆分(-0.25=0/-0.5 两半, 输半=一半输一半走水)。与站点亚盘口径(澳门盘)一致。

- [ ] **Step 2: 跑测试确认失败** `node test/mini_judge.test.js` → 模块不存在报错
- [ ] **Step 3: 实现** `tools/gen_mini_judge.js`: 读站点 `stats.js` 源码, 正则抽取 `parseScore/judgeDirection/judgeOverUnder/judgeScore` 函数体原样拼接进 `miniprogram/utils/judge.js`(附 `judgeBd310/judgeAh/ahFactor` 手写实现), 末尾 `module.exports = {...}`; 跑 `node tools/gen_mini_judge.js` 生成。
- [ ] **Step 4: 测试全绿** `node test/mini_judge.test.js` → "全部通过 ✓"; 回归站点测试 `node test/stats.test.js` 不挂。
- [ ] **Step 5: Commit** `git add tools/gen_mini_judge.js miniprogram/utils/judge.js test/mini_judge.test.js && git commit -m "小程序: judge 判定模块(stats.js 同源生成+北单310/亚盘判定)"`

---

### Task 2: ESPN 数据模块 + API 封装

**Files:**
- Create: `tools/gen_mini_espn.js`
- Create: `miniprogram/utils/espn.js` + `miniprogram/utils/espn_matches.js`(生成产物)
- Create: `miniprogram/utils/api.js` + `miniprogram/utils/config.example.js`
- Modify: `.gitignore`(加 `miniprogram/utils/config.js`)

- [ ] **Step 1:** `gen_mini_espn.js`: 定位最新 `tools/_live<MMDD>.js`(fs 按文件名倒序), 正则抽取其 `LEAGUES`/`TEAM` 两个对象字面量, 合并静态 `LEAGUE_MAP`(接口契约)生成 `miniprogram/utils/espn_matches.js`(`module.exports = { LEAGUES, TEAM }`)。跑一遍验证产物含 9-12 的 27 场映射。
- [ ] **Step 2:** `miniprogram/utils/espn.js`: 按接口契约实现 `LEAGUE_MAP/DATES/fetchBoard/findScore`。`fetchBoard` 用 wx.request GET `https://site.api.espn.com/apis/site/v2/sports/soccer/<lg>/scoreboard?dates=<d>`, 解析 events→{home,away,hs,as,st}(取 `competitions[0].competitors` 的 homeAway 与 `status.type.name`)。`findScore` 按 TEAM_MAP 子串不区分大小写匹配。Node 兼容: 文件末尾 `if (typeof module!=='undefined') module.exports=...`, 内部 request 抽象成可注入 fetcher(node 下用全局 fetch), 便于冒烟。
- [ ] **Step 3:** `api.js` 按接口契约实现五个方法; `config.example.js` 入库; `.gitignore` 加 `miniprogram/utils/config.js`。冒烟脚本 `tools/_smoke_mini_api.js`(node, 注入 fetcher=全局 fetch): fetchTodayPayload 返回含 matches 数组; fetchBets 返回数组(200 或 401 都打印状态, 不断言——config.js 未配时跳过)。
- [ ] **Step 4:** 跑 `node tools/gen_mini_espn.js && node tools/_smoke_mini_api.js`, 输出正常。
- [ ] **Step 5:** Commit `小程序: espn 数据模块(gen_mini_espn 每日生成)+api 封装(Supabase REST)`

---

### Task 3: 小程序骨架 + 推荐页三 Tab

**Files:**
- Create: `miniprogram/app.json` / `app.js` / `app.wxss` / `project.config.json` / `sitemap.json`(空)
- Create: `miniprogram/pages/index/index.{js,wxml,wxss,json}`
- Create: `miniprogram/utils/fmt.js`

- [ ] **Step 1:** app.json: pages=[pages/index/index, pages/bets/bets], tabBar 两项(推荐/我的投注, 文字+emoji 即可, 不引图片资源), window 配色用小熊棕(#8B5A2B 系, 参照站点 index.html `:root` 变量)。app.js 只放全局缓存键。app.wxss 定义通用卡片/徽章样式。
- [ ] **Step 2:** index 页数据流: `onShow` → `api.fetchTodayPayload()`(失败读 wx.getStorage('payloadCache') 缓存并横幅提示) → 渲染。顶部三 Tab: 🎫竞彩 / 🀄北单 / 🌏亚盘。竞彩 Tab: 逐场卡片(开赛时间/主客队/方向徽章+dirTag/★信心/SP+让球SP/总进球/比分预测/ℹ️note 折叠)。北单 Tab: plan 里 market='bd' 块文本卡 + beidan310.legs 逐腿(北单号 bdNum/让球 handicap/pick/SP3/判定列——判定用 `judge.judgeBd310` 对 finalScore 实时算)。亚盘 Tab: matches 里 ahPick 非空的场(让球观点★/大小观点★/盘口 ah+ouOdds 水位)。全部空态文案"等小熊补充🐾"。
- [ ] **Step 3:** 场卡右上角预留比分槽位(`<text class="live-score">{{m.liveScore || m.time}}</text>`, Task 5 填充), 左下勾选框(组串模式, Task 6 填充)——**本任务只留槽位与数据结构, 不做交互**。
- [ ] **Step 4:** fmt.js: `fmtStars(n)='★'.repeat(n)` / `fmtSp(arr)` / `fmtTime(t)`('00:30+1' 原样)。冒烟 `tools/_smoke_mini_page.js`(node): 用 vm 模拟 wx 全局最小集, 断言 index.js 的 data 分组函数(竞彩场数/北单腿数/亚盘场数)对 9-12 真实 payload 输出正确个数(竞彩 29/北单 8/亚盘 6)。
- [ ] **Step 5:** Commit `小程序: 骨架+推荐页三Tab(竞彩/北单/亚盘)`

---

### Task 4: 比分轮询(场卡实时比分)

**Files:**
- Modify: `miniprogram/pages/index/index.js` + `index.wxml`
- Create: `miniprogram/utils/scorePoller.js`

- [ ] **Step 1:** scorePoller.js: `createScorePoller({ matches, onUpdate })` → { start(), stop(), tick() }; tick=按当日涉及的联赛去重逐联赛 `espn.fetchBoard`(串行, 防限流), 合并两日 DATES, 对每场 `espn.findScore` → 回写 `{liveScore:'2-1', liveSt:'STATUS_FULL_TIME'|'STATUS_IN_PLAY'|...}`; ESPN 死链联赛(LEAGUE_MAP 值为 null)回退读 payload.finalScore 标"(人工)"; 单联赛失败仅缺该联赛。
- [ ] **Step 2:** index.js: onShow 启动轮询 setInterval 300s+立即 tick; onHide/onUnload stop; onUpdate 里 setData 只更新变化场(diff 比较减少渲染)。
- [ ] **Step 3:** wxml 场卡比分槽位: 完场=绿色"完场 2-1", 进行中=红色"⚽ 1-0 67'", 未开赛=开赛时间灰字, 人工回填场=灰字"(人工) 2-1"。
- [ ] **Step 4:** 冒烟: `_smoke_mini_page.js` 加断言——mock fetcher 注入 9-12 ESPN 真实响应片段(tools 下存 `_titan_0912.json` 同目录新存 `_espn_sample_0912.json`), 轮询 tick 后 29 场中 27 场有 liveScore 或状态, 2 场韩职标"(人工)"。
- [ ] **Step 5:** Commit `小程序: 比分前台轮询(5分钟+onShow即拉)`

---

### Task 5: 组串 + 投注保存

**Files:**
- Modify: `miniprogram/pages/index/index.{js,wxml,wxss}`
- Create: `miniprogram/utils/cart.js`

- [ ] **Step 1:** cart.js: `calc(legs)` → { stakes, expectPayout }。复式注数=各腿 pick 选项数(按 '/' 分割)乘积; 单关(source 单腿)=1; 理论奖金=各腿首选 SP(parseFloat(odds 首段))连乘×2元。竞彩场腿来源=sp(3/1/0)或 hhad(让球); 北单腿=sp3+handicap; 亚盘腿=ahPick+水位(odds=1+水位小数?亚盘赔率口径=1+水位/1?——澳门水位即赔率小数部分, odds=水位值如 0.86→赔率 1.86)。
- [ ] **Step 2:** 组串模式: 推荐页底部「🎯 组串」按钮进入勾选态; 场卡勾选框可选中(竞彩场选方向 3/1/0 或让球, 北单腿整腿选中, 亚盘场选 ahPick); 底部抽屉: 腿清单+注数+理论奖金+金额输入(默认 2 元/注)+来源自动判定(全北单腿=bd/全亚盘=ah/其余=jc)+「保存登记」→ `api.saveBet` → toast「已登记」清空勾选; 失败存草稿 wx.setStorage('betDraft') 下次进页提示重试。
- [ ] **Step 3:** 冒烟: cart.calc 断言——9-12 北单 8 腿(2单6双)注数=64, 理论奖金≈291 元(与 _bd_settle.js 口径对账); 竞彩 3 单关腿注数=1 串 3 关=1 注。
- [ ] **Step 4:** Commit `小程序: 组串登记+注数/理论奖金计算`

---

### Task 6: 我的投注页 + 自动结算

**Files:**
- Create: `miniprogram/pages/bets/bets.{js,wxml,wxss,json}`
- Create: `miniprogram/utils/settle.js`

- [ ] **Step 1:** settle.js: `settleLeg(leg, score)` 按 source 分派 judge(竞彩=judgeDirection 或让球判定; 北单=judgeBd310; 亚盘=judgeAh); `settleBet(bet, scoreOf)` — 全腿完场→逐腿结果→串: 断腿=miss(actual_payout=0); 全红=hit, 奖金= legs 的命中 SP 连乘×unit(竞彩/北单); 亚盘串=逐腿 ahFactor 折算(win=odds 全胜, winHalf=半赢, push=该腿按 1 计, loseHalf=输一半, lose=断); 写回 {status, actual_payout, profit, settled_at, legs(带 result)}。
- [ ] **Step 2:** bets 页: onShow → `api.fetchBets()` → 顶部统计卡(总投入/总回收/净盈亏/命中率=hit+0.5half/已结算) → 列表卡片(日期/来源徽章/腿明细逐行带命中标记/注数/金额/状态/盈亏)。pending 且全腿完场→自动 settle+`api.updateBet` 写回; pending 但缺比分→「刷新比分」按钮手动拉一轮 ESPN。
- [ ] **Step 3:** 冒烟: settle 断言——虚拟北单串(全红/断1腿/含push腿)三种情形奖金与状态正确。
- [ ] **Step 4:** Commit `小程序: 我的投注页+完场自动结算`

---

### Task 7: 集成验收(主会话执行, 不派 agent)

- [ ] 全部测试: `node test/stats.test.js && node test/mini_judge.test.js && node tools/_smoke_mini_page.js && node tools/_smoke_mini_api.js && node tools/_smoke_ne.js` 全绿
- [ ] 站点回归: `node tools/check_daily.js`(当日门禁)不受影响
- [ ] Commit+push(走代理 `git -c http.proxy=http://127.0.0.1:10809 push`)
- [ ] 用户真机验收清单(spec §8)逐条过; AGENTS.md 项目8 加「项目8.1 小程序」条目(路径/前置/每日 gen_mini_espn 重生成步骤)

---

## 自检记录(写计划时已跑)

- Spec 覆盖: §2 架构→T2/T3; §3 页面→T3/T4/T5/T6; §4.1 推荐→T3; §4.2 比分→T4; §4.3 bets 表→T0/T1; §5 结算→T6; §6 视觉→T3; §7 错误处理→T3(缓存降级)/T5(草稿); §8 验收→T7。无缺口。
- 接口契约一致性: api/espn/judge/settle/cart 五模块的方法名与返回结构在 T3-T6 的引用与 T1/T2 定义一致; judgeAh 的 pick 解析规则与站点 ahPick 数据形态("美因茨-0.5"/"巴拉纳竞技-0.25")一致。
- YAGNI: 不做推送/多用户/上架适配/历史页(小程序只读当日+我的投注历史)。
