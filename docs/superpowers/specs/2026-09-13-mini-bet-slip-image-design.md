# 小熊微信小程序 · 组串投注参考图(设计文档)

> 2026-09-13 用户拍板: 组串确认后输出一张**与竞彩官方足球计算器(m.sporttery.cn/mjc/jsq/zqspf/)效果一致**的投注参考图, 方便照着下单; **不要品牌条/免责/二维码等一切多余元素**。

## 1. 目标与场景

- 保存登记成功后自动生成投注参考图并预览, 真机长按即可保存/转发, 照着去店里或官方 APP 下单。
- 我的投注页每注卡可随时重新出图。
- 参照物: 官方计算器"过关方式"弹窗(白底卡片, 逐场两行, 底部红字金额/奖金)。

## 2. 技术路线

**Canvas 2D 手绘出图, 零依赖零后端**: 屏外 `<canvas type="2d">` 绘制 → `wx.canvasToTempFilePath` 出 PNG → `wx.previewImage` 全屏预览(原生长按保存/转发)。

- 弃用: painter 等 WXML 截图库(引入第三方依赖, 违背零依赖); 服务端生成(无后端)。
- Canvas 尺寸: 逻辑宽 750(rpx 口径), 像素宽=750×dpr 保清晰; 高按内容动态算(见 §4)。

## 3. 版式(纯官方弹窗效果)

```
┌──────────────────────────┐
│ 过关方式: 2关              │  ← 黑体粗标题
│──────────────────────────│
│ 周日003 塞尔塔 VS 马拉加    │  ← 居中黑字(场次号 主 VS 客)
│   主胜(1.53)              │  ← 居中灰字(选项+赔率)
│──────────────────────────│
│ 周日009 莱红牛 VS 汉堡 [-1] │  ← 让球场标题行尾带让球数(官方列表页记法)
│   让球胜(1.66)             │
│──────────────────────────│
│ 1倍 · 注数 2 注            │
│ 投注金额: 4 元             │  ← 金额/奖金数字用官方红(#E4393C 系)
│ 理论最高奖金: 6.09 元       │
└──────────────────────────┘
```

### 腿行格式(按 leg.kind)

| kind | 标题行 | 选项行 |
|---|---|---|
| jcHad | `周日003 塞尔塔 VS 马拉加` | `主胜(1.53)`(PICK_LABEL 映射 3/1/0→主胜/平/客胜) |
| jcHhad | `周日009 莱红牛 VS 汉堡 [-1]` | `让球胜(1.66)`(pick='让-1 3' → 让球数入标题, 选项名=让球+主胜/平/客胜) |
| bd | `北单342 皇家社会 VS 马竞` | `负(2.15)`; handicap 非 0 时标题行尾带 `[让-1]` |
| ah | `周日011 汉坎 VS 莫尔德` | `亚盘: 莫尔德-0.75 @0.96`(标注亚盘, 官方渠道无此玩法) |

- **复式腿**(pick 含 `/`)与官方一致顿号连排: `让球胜(4.35)、让球平(4.00)`; 各选项赔率——jc 腿从 sp/hhad 三列按索引取, bd 腿从 sp3 三列按 3/1/0 索引取, 缺值退 leg.odds。
- 某腿赔率缺失时选项行省略括号只留选项名, 不显示 "(0)"。

### 金额口径(对齐官方计算器)

- 过关方式 X 关: X=腿数。
- 注数 = 各腿 pick 按 `/` 分割的选项数乘积(与 cart.calc 同口径)。
- 倍数=1倍(小程序单注金额固定 2 元, 无倍数输入)。
- 投注金额 = 注数 × 2 × 1。
- **理论最高奖金 = 各腿最大赔率连乘 × 2 × 1**(复式腿取各选项赔率最大值; 缺赔率腿按 1 计, 不放大)。

## 4. 组件与数据流

### 新模块

- `miniprogram/utils/slip.js`(手写, node/小程序双环境, 纯函数):
  - `slipRows(legs)` → `[{ title, options }]`, 按上表生成每腿两行文本。
  - `slipTotals(legs, unit)` → `{ legs, stakes, amount, maxPayout }`。
  - `slipHeight(rowCount)` → canvas 逻辑高(头 90 + 腿行 116/腿 + 金额区 170)。
- `miniprogram/utils/slipCanvas.js`(小程序侧):
  - `renderSlip({ page, canvasId, dateText, legs, unit })` → Promise<tempFilePath>。
  - 内部: 取 canvas 节点 → 设 width/height=逻辑×dpr → ctx.scale(dpr) → 白底/黑标题/分隔线/居中腿行/红字金额 → `wx.canvasToTempFilePath`。

### 页面改动

- `pages/index/index.{js,wxml}`: 屏外 canvas 节点; `saveCart` 成功后(toast 已登记 后)调 `renderSlip` → `wx.previewImage({urls:[temp]})`; 出图失败仅 `wx.showToast('已登记成功, 出图失败')`, 不影响已落库注单。
- `pages/bets/bets.{js,wxml}`: 注卡加"🖼 投注图"小按钮(bindtap 带 bet 下标) → 同通道出图预览; 屏外 canvas 节点。
- 组串抽屉不加出图按钮(YAGNI)。

### 错误处理

| 场景 | 行为 |
|---|---|
| canvas 节点未就绪/生成异常 | toast 提示, 保存流程不回滚 |
| previewImage fail | toast 提示, tempFile 无泄漏(系统临时目录) |
| 腿缺赔率 | 选项行省略赔率括号; maxPayout 该腿按 1 计 |
| 0 腿调用 | 页面层保证不会发生(保存成功才有腿; 投注页注单必有腿) |

## 5. 测试

- `tools/_smoke_mini_slip.js`(node):
  - slipRows 四类腿型行格式(jcHad/jcHhad 带让球数/bd 带 [让-1]/ah 亚盘行)。
  - 复式腿顿号连排与各选项赔率取值(jc sp 索引 / bd sp3 索引)。
  - slipTotals 对账: 9-13 真实腿(北单342 单选 0@2.15 + 周日003 主胜@1.53)→ 1 注/2 元/最高 6.58 元(2.15×1.53×2=6.58, 与 cart.calc 首选口径区分: 官方取 max, 单选腿两者相同); 复式 pick='3/1' 腿 → 注数×2, max 取两选项大者。
  - 缺赔率腿按 1 计不放大。
- `tools/_mini_verify.js` 加一步: 勾选 2 腿 → 页面调 renderSlip 拿 tempFilePath(断言非空) → previewImage → `mini.screenshot` 截 6_slip.png(模拟器里 previewImage 渲染为全屏查看器) → navigateBack 回退。
- 回归: stats.test / mini_judge / 其余四套冒烟 / check_daily 全绿。

## 6. 验收(真机)

1. 保存登记成功 → 自动弹出投注图预览, 版式与官方计算器弹窗一致。
2. 长按图片可保存到相册/转发。
3. 投注页点 🖼 可对历史注单重出图。
