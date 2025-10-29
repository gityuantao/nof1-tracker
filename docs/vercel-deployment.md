# Vercel 部署指南

本指南说明如何将 nof1-tracker 部署到 Vercel 并配置自动跟单。

## 📋 前置要求

1. Vercel 账户（免费账户即可）
2. GitHub 仓库已连接 Vercel
3. 已配置 Binance API 密钥

## 🚀 部署步骤

### 1. 推送代码到 GitHub

确保代码已提交并推送到 GitHub：

```bash
git add .
git commit -m "feat: 添加 Vercel Serverless Functions 支持"
git push
```

### 2. 在 Vercel 中配置项目

#### 2.1 导入项目

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New..." → "Project"
3. 导入你的 GitHub 仓库 `gityuantao/nof1-tracker`
4. 配置如下：
   - **Framework Preset**: Other
   - **Root Directory**: `./` (默认)
   - **Build Command**: `npm run build`
   - **Output Directory**: `public`
   - **Install Command**: `npm install`

#### 2.2 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

**必需的环境变量：**
```
BINANCE_API_KEY=你的Binance API密钥
BINANCE_API_SECRET=你的Binance Secret密钥
BINANCE_TESTNET=false  # 或 true（测试环境）
VERCEL_AGENT_NAME=gpt-5  # 要跟随的AI Agent名称
```

**可选的环境变量：**
```
VERCEL_POLLING_INTERVAL=30  # 轮询间隔（秒），注意：Cron Jobs使用固定计划
VERCEL_RISK_ONLY=false  # true=仅观察模式，false=真实交易
VERCEL_TOTAL_MARGIN=1000  # 总保证金（USDT）
VERCEL_PRICE_TOLERANCE=1.0  # 价格容差（%）
VERCEL_PROFIT_TARGET=30  # 盈利目标（%），达到后自动平仓
VERCEL_AUTO_REFOLLOW=false  # 盈利退出后自动重新跟单
VERCEL_MARGIN_TYPE=CROSSED  # 保证金模式：CROSSED（全仓）或 ISOLATED（逐仓）
CRON_SECRET=你的随机密钥  # 用于保护 Cron Jobs（可选）
```

**其他环境变量（根据项目需要）：**
```
TELEGRAM_BOT_TOKEN=你的Telegram Bot Token（如果使用Telegram通知）
TELEGRAM_CHAT_ID=你的Telegram Chat ID
MAX_POSITION_SIZE=1000
DEFAULT_LEVERAGE=10
RISK_PERCENTAGE=2.0
```

### 3. 配置 Cron Jobs

编辑 `vercel.json` 中的 `crons` 配置来设置定时执行间隔：

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

**Cron 计划说明：**
- `*/1 * * * *` - 每分钟执行一次（适合频繁监控）
- `*/5 * * * *` - 每5分钟执行一次
- `*/30 * * * *` - 每30分钟执行一次
- `0 * * * *` - 每小时执行一次

**注意：** Vercel Hobby 计划（免费）的 Cron Jobs 有执行次数限制，请合理设置间隔。

### 4. 部署

提交代码后，Vercel 会自动触发部署。你也可以在 Vercel Dashboard 中手动触发：

1. 进入项目页面
2. 点击 "Deployments" 标签
3. 点击 "Redeploy"

## 📡 API 端点使用

部署完成后，你可以使用以下 API 端点：

### 1. 手动触发跟单

**GET 请求：**
```
https://你的项目.vercel.app/api/follow?agent=gpt-5&riskOnly=false&totalMargin=1000
```

**POST 请求：**
```bash
curl -X POST https://你的项目.vercel.app/api/follow \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gpt-5",
    "riskOnly": false,
    "totalMargin": 1000,
    "priceTolerance": 1.0,
    "profit": 30,
    "autoRefollow": false,
    "marginType": "CROSSED"
  }'
```

### 2. Cron Job 端点

Cron Job 会自动调用 `/api/cron`，使用环境变量中的配置。

## 🔒 安全配置

### 保护 Cron Jobs

如果你设置了 `CRON_SECRET` 环境变量，需要在 `vercel.json` 中配置验证。但 Vercel 的 Cron Jobs 默认已经有内置验证，通常不需要额外配置。

### API 密钥安全

- ✅ 始终使用环境变量存储敏感信息
- ✅ 不要在代码中硬编码密钥
- ✅ 定期轮换 API 密钥
- ✅ 在 Binance 中设置 IP 白名单（如果可能）

## 📊 监控和日志

### 查看日志

1. 在 Vercel Dashboard 中进入项目
2. 点击 "Functions" 标签
3. 查看 `/api/cron` 或 `/api/follow` 的执行日志

### 查看 Cron Jobs 执行历史

1. 在 Vercel Dashboard 中进入项目
2. 点击 "Crons" 标签
3. 查看执行历史和状态

## ⚠️ 注意事项

### Vercel 限制

1. **Function 执行时间限制：**
   - Hobby 计划：10秒
   - Pro 计划：60秒
   - 如果跟单操作耗时较长，可能需要升级到 Pro 计划

2. **Cron Jobs 限制：**
   - Hobby 计划：每月有限次数
   - 请根据你的计划调整执行频率

3. **文件系统限制：**
   - Vercel Serverless Functions 使用临时文件系统
   - `order-history.json` 等文件会保存在 `/tmp` 目录，重启后会丢失
   - 建议使用外部存储（如 MongoDB、Supabase）来持久化数据

### 持久化数据方案

由于 Vercel 的 Serverless Functions 无法持久化文件，你可以：

1. **使用环境变量存储简单状态**（不推荐，有限）
2. **集成外部数据库**：
   - MongoDB Atlas（免费层）
   - Supabase（免费层）
   - Vercel KV（Redis，需要付费）
3. **使用对象存储**：
   - AWS S3
   - Cloudflare R2
   - Vercel Blob Storage

## 🔧 故障排除

### 问题 1: Cron Job 未执行

**检查：**
- Vercel 项目是否已部署成功
- `vercel.json` 中的 cron 配置是否正确
- 环境变量 `VERCEL_AGENT_NAME` 是否已设置
- 在 Vercel Dashboard 的 "Crons" 标签中查看执行状态

### 问题 2: Function 超时

**解决方案：**
- 升级到 Vercel Pro 计划（60秒超时）
- 优化代码，减少执行时间
- 将耗时操作拆分为多个步骤

### 问题 3: 订单历史丢失

**原因：** Vercel Serverless Functions 使用临时文件系统，重启后数据会丢失。

**解决方案：** 
- 实现外部存储（数据库或对象存储）
- 每次执行时从 API 重新获取状态

### 问题 4: API 密钥错误

**检查：**
- 环境变量是否正确设置
- API 密钥是否有合约交易权限
- 是否启用了 "Enable Futures" 权限

## 📚 参考

- [Vercel Cron Jobs 文档](https://vercel.com/docs/cron-jobs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Vercel 环境变量](https://vercel.com/docs/environment-variables)

