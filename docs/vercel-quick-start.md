# Vercel 快速启动指南

## 🚀 快速配置步骤

### 1. 环境变量配置

在 Vercel 项目设置中添加以下**必需**的环境变量：

```bash
# Binance API 配置（必需）
BINANCE_API_KEY=你的API密钥
BINANCE_API_SECRET=你的Secret密钥
BINANCE_TESTNET=false

# 要跟随的 AI Agent（必需）
VERCEL_AGENT_NAME=gpt-5

# 可选配置
VERCEL_RISK_ONLY=false          # true=仅观察，false=真实交易
VERCEL_TOTAL_MARGIN=1000        # 总保证金（USDT）
VERCEL_PRICE_TOLERANCE=1.0      # 价格容差（%）
VERCEL_PROFIT_TARGET=30         # 盈利目标（%）
VERCEL_AUTO_REFOLLOW=false      # 自动重新跟单
VERCEL_MARGIN_TYPE=CROSSED      # CROSSED 或 ISOLATED
```

### 2. 配置 Cron 执行频率

编辑 `vercel.json`，修改 cron 计划：

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/5 * * * *"  // 每5分钟执行一次
    }
  ]
}
```

**常用计划：**
- `*/1 * * * *` - 每分钟（适合高频监控，注意免费计划限制）
- `*/5 * * * *` - 每5分钟（推荐）
- `*/30 * * * *` - 每30分钟（适合低频监控）

### 3. 支持的 AI Agent

可用的 Agent 名称：
- `gpt-5`
- `gemini-2.5-pro`
- `deepseek-chat-v3.1`
- `claude-sonnet-4-5`
- `buynhold_btc`
- `grok-4`
- `qwen3-max`

### 4. 部署和启动

1. 推送代码到 GitHub
2. Vercel 会自动部署
3. Cron Job 会自动开始运行

### 5. 手动触发测试

部署完成后，可以通过 API 手动触发：

```bash
# GET 方式
curl "https://你的项目.vercel.app/api/follow?agent=gpt-5&riskOnly=true"

# POST 方式（推荐）
curl -X POST "https://你的项目.vercel.app/api/follow" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gpt-5",
    "riskOnly": true,
    "totalMargin": 1000
  }'
```

### 6. 查看执行日志

1. 进入 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择项目
3. 点击 "Functions" 标签查看 `/api/cron` 的执行日志
4. 点击 "Crons" 标签查看定时任务执行历史

## ⚠️ 重要提示

### Vercel 限制

1. **执行时间限制：**
   - 免费计划：10秒
   - Pro 计划：60秒
   - 如果超时，考虑升级计划或优化代码

2. **数据持久化：**
   - Vercel Serverless Functions 使用临时文件系统
   - `order-history.json` 等文件会在重启后丢失
   - **建议**：使用外部数据库（MongoDB、Supabase）来持久化数据

3. **Cron Jobs 限制：**
   - 免费计划有执行次数限制
   - 请合理设置执行频率

### 推荐配置（新手）

```bash
VERCEL_AGENT_NAME=gpt-5
VERCEL_RISK_ONLY=true          # 先使用观察模式
VERCEL_TOTAL_MARGIN=100        # 小额测试
VERCEL_PROFIT_TARGET=20        # 保守的盈利目标
```

Cron 计划：`*/5 * * * *`（每5分钟执行一次）

## 📚 详细文档

查看 [完整部署指南](./vercel-deployment.md) 了解更多配置选项和故障排除方法。

