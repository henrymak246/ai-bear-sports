/* gen_mini_espn.js — 从最新 tools/_live<MMDD>.js 抽取 LEAGUES(场次号→ESPN联赛码)
   与 TEAM(中文队名→ESPN displayName 子串)两个对象字面量,
   生成 miniprogram/utils/espn_matches.js(小程序每日数据表, 防漂移)。
   用法: node tools/gen_mini_espn.js */
const fs = require("fs");
const path = require("path");

const toolsDir = __dirname;
const src = fs.readdirSync(toolsDir)
  .filter(f => /^_live\d+\.js$/.test(f))
  .sort()
  .reverse()[0];
if (!src) { console.error("未找到 tools/_live*.js"); process.exit(1); }
const srcRel = "tools/" + src;
const text = fs.readFileSync(path.join(toolsDir, src), "utf8");

function extractLiteral(name) {
  const m = text.match(new RegExp("const " + name + " = (\\{[\\s\\S]*?\\});"));
  if (!m) throw new Error("未能从 " + srcRel + " 抽取 " + name);
  // 校验为合法对象字面量并取值(键含中文引号, 用 Function 求值最稳)
  return new Function("return (" + m[1] + ");")();
}

const LEAGUES = extractLiteral("LEAGUES");
const TEAM = extractLiteral("TEAM");

const header = "/* 由 gen_mini_espn.js 于 " + new Date().toISOString() + " 从 " + srcRel + " 生成, 勿手改 */\n";
const indent = s => JSON.stringify(s, null, 2).split("\n").join("\n  ");
const out = header + "module.exports = {\n  LEAGUES: " + indent(LEAGUES) + ",\n  TEAM: " + indent(TEAM) + ",\n};\n";

const outDir = path.join(__dirname, "..", "miniprogram", "utils");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "espn_matches.js"), out, "utf8");

console.log("源文件: " + srcRel);
console.log("抽取场次号数: " + Object.keys(LEAGUES).length);
console.log("抽取队名数: " + Object.keys(TEAM).length);
console.log("产物: miniprogram/utils/espn_matches.js");
