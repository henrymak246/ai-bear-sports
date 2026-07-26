# Cloudflare Pages 部署指南（AI小熊 · 体育心得分享）

> 站点为纯静态零依赖，部署 = 上传发布包即可，无需任何构建。

## 首次部署（约 5 分钟）

1. **注册/登录** Cloudflare：打开 https://dash.cloudflare.com ，邮箱注册免费账号（无需绑卡、无需域名）
2. 左侧菜单 **Workers 和 Pages** → **创建** → 选择 **Pages** 标签 → **直接上传资产**（Upload assets / 直接上传）
3. 项目名填 `ai-bear-sports`（将决定域名 `ai-bear-sports.pages.dev`，已被占用就换一个）
4. 上传发布包：**桌面 `football-site-pages.zip`** 拖入（或选择 `dist\` 整个文件夹拖入），点 **部署站点**
5. 约 30 秒完成，访问 **https://ai-bear-sports.pages.dev** ✅ 自动 HTTPS，国内可正常访问

## 每天更新（两种方式）

**方式 A · 手动（现在）**
1. 在仓库根目录运行：`python -c "import shutil; shutil.make_archive('deploy-latest', 'zip', 'dist')"`（先用 README 的打包脚本重新生成 dist）
   —— 或叫我一声"重新打包"，我帮你生成新 zip
2. Cloudflare 项目页 → **创建新部署** → 传新 zip，域名不变

**方式 B · git 自动（推荐，后续可升级）**
1. 把本仓库 push 到 GitHub（需要 GitHub 账号）
2. Cloudflare Pages 选 **连接到 Git** 授权该仓库，构建命令留空、输出目录填 `/`
3. 以后每天 `git push` 后自动重新发布，无需手动上传

## 发布包内容（dist/）
```
index.html
stats.js
data/predictions.js
assets/logo.svg          （页头+favicon）
assets/ai-poster.png     （海报）
assets/bets/*.jpg        （票样，已打码）
```
不打包：`.git/`、`docs/`、`test/`、`README.md`、未启用的备选图（`poster.svg`、`ai-poster-alt.png`）。

## 注意事项
- 票样照片**已打码**（票号行两遍高斯+马赛克），原图仅存于本机桌面，不在仓库
- 仓库若将来 push 到公开 GitHub，`assets/bets/` 中的也已是打码版，安全
- 内容为合法竞彩分析+个人记录，符合 Cloudflare 服务条款；.pages.dev 免费额度对本站绰绰有余
