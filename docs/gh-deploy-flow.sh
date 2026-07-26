#!/bin/bash
# GitHub 设备授权轮询 → 建库 → 推送 → 开 Pages（v2：ASCII描述/推送重试/真实错误检查）
set -u
DEVICE_CODE=$(cat /c/tmp/gh_device_code.txt)
TOKEN=""
for i in $(seq 1 140); do
  RESP=$(curl -s --max-time 30 -X POST https://github.com/login/oauth/access_token \
    -H "Accept: application/json" \
    -d "client_id=178c6fc778ccc68e1d6a&device_code=$DEVICE_CODE&grant_type=urn:ietf:params:oauth:grant-type:device_code")
  TOKEN=$(printf '%s' "$RESP" | python -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  [ -n "$TOKEN" ] && break
  sleep 6
done
if [ -z "$TOKEN" ]; then echo "RESULT=超时：15分钟内未完成授权"; rm -f /c/tmp/gh_device_code.txt; exit 1; fi
echo "RESULT=授权成功"

USER_JSON=$(curl -s --max-time 30 https://api.github.com/user -H "Authorization: Bearer $TOKEN")
OWNER=$(printf '%s' "$USER_JSON" | python -c "import sys,json;print(json.load(sys.stdin).get('login',''))")
echo "OWNER=$OWNER"

# 创建公开仓库（ASCII 描述避免中文编码问题；已存在则忽略错误继续）
CREATE_RESP=$(curl -s --max-time 30 -X POST https://api.github.com/user/repos \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d '{"name":"ai-bear-sports","private":false,"description":"AI Bear Sports Picks (static site)"}')
REPO_URL=$(printf '%s' "$CREATE_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('html_url') or ('ERR:'+str(d.get('errors',d))))")
echo "REPO=$REPO_URL"

cd "/c/Users/Administrator/Desktop/足球预测站"
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$OWNER/ai-bear-sports.git"

PUSH_OK=0
for i in 1 2 3; do
  echo "PUSH_ATTEMPT=$i"
  if git -c http.extraHeader="Authorization: Bearer $TOKEN" push -u origin master; then
    PUSH_OK=1; break
  fi
  sleep 5
done
if [ "$PUSH_OK" = "0" ]; then echo "RESULT=推送失败（连续3次）"; rm -f /c/tmp/gh_device_code.txt; exit 1; fi
echo "PUSH=成功"

PAGES_RESP=$(curl -s --max-time 30 -X POST "https://api.github.com/repos/$OWNER/ai-bear-sports/pages" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d '{"source":{"branch":"master","path":"/"}}')
PAGES_URL=$(printf '%s' "$PAGES_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('html_url') or ('ERR:'+str(d.get('errors',d))))")
echo "PAGES=$PAGES_URL"

git remote set-url origin "https://github.com/$OWNER/ai-bear-sports.git"
rm -f /c/tmp/gh_device_code.txt
echo "RESULT=全部完成 https://$OWNER.github.io/ai-bear-sports/"
