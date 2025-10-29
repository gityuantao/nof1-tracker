import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFollowCommand } from '../src/commands/follow';
import { CommandOptions } from '../src/types/command';

/**
 * Vercel Serverless Function for following AI agents
 * 
 * Usage:
 * - GET /api/follow?agent=gpt-5&interval=30&riskOnly=true
 * - POST /api/follow with JSON body:
 *   {
 *     "agent": "gpt-5",
 *     "interval": 30,
 *     "riskOnly": false,
 *     "totalMargin": 1000,
 *     "priceTolerance": 1.0,
 *     "profit": 30,
 *     "autoRefollow": false,
 *     "marginType": "CROSSED"
 *   }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 只允许 GET 和 POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 从查询参数或请求体获取配置
    const agentName = req.query.agent || req.body?.agent || process.env.VERCEL_AGENT_NAME;
    const interval = req.query.interval || req.body?.interval || process.env.VERCEL_POLLING_INTERVAL;
    const riskOnly = req.query.riskOnly === 'true' || req.body?.riskOnly === true || process.env.VERCEL_RISK_ONLY === 'true';
    const totalMargin = parseFloat(req.query.totalMargin as string || req.body?.totalMargin || process.env.VERCEL_TOTAL_MARGIN || '10');
    const priceTolerance = parseFloat(req.query.priceTolerance as string || req.body?.priceTolerance || process.env.VERCEL_PRICE_TOLERANCE || '1.0');
    const profit = req.query.profit || req.body?.profit || process.env.VERCEL_PROFIT_TARGET ? parseFloat(req.query.profit as string || req.body?.profit || process.env.VERCEL_PROFIT_TARGET || '0') : undefined;
    const autoRefollow = req.query.autoRefollow === 'true' || req.body?.autoRefollow === true || process.env.VERCEL_AUTO_REFOLLOW === 'true';
    const marginType = (req.query.marginType as string || req.body?.marginType || process.env.VERCEL_MARGIN_TYPE || 'CROSSED').toUpperCase();

    if (!agentName) {
      return res.status(400).json({ 
        error: 'Agent name is required',
        usage: {
          get: '/api/follow?agent=gpt-5&interval=30',
          post: 'POST /api/follow with JSON body containing agent, interval, etc.'
        }
      });
    }

    const options: CommandOptions = {
      riskOnly,
      interval: interval ? String(interval) : undefined,
      totalMargin,
      priceTolerance,
      profit,
      autoRefollow,
      marginType: marginType === 'ISOLATED' ? 'ISOLATED' : 'CROSSED'
    };

    console.log(`[Vercel] Starting follow command for agent: ${agentName}`);
    console.log(`[Vercel] Options:`, JSON.stringify(options, null, 2));

    // 在 Vercel 环境中，我们只执行一次轮询（不支持持续轮询）
    // 如果需要定期执行，使用 Vercel Cron Jobs
    const optionsWithoutInterval = { ...options, interval: undefined };

    // 捕获输出用于返回
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logs.push(message);
      originalLog(...args);
    };

    try {
      await handleFollowCommand(agentName, optionsWithoutInterval);

      return res.status(200).json({
        success: true,
        agent: agentName,
        options: optionsWithoutInterval,
        message: 'Follow command executed successfully',
        logs: logs.slice(-50) // 只返回最后50条日志
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error = (...args: any[]) => {
        logs.push(`ERROR: ${args.join(' ')}`);
        originalLog(...args);
      };
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        logs: logs.slice(-50)
      });
    } finally {
      console.log = originalLog;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}

