import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFollowCommand } from '../src/commands/follow';
import { CommandOptions } from '../src/types/command';

/**
 * Vercel Cron Job endpoint for automated following
 * 
 * Configure this in vercel.json crons section
 * This endpoint will be called automatically by Vercel Cron Jobs
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 验证 Cron Secret（安全验证）
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 从环境变量获取配置
    const agentName = process.env.VERCEL_AGENT_NAME;
    
    if (!agentName) {
      return res.status(400).json({ 
        error: 'VERCEL_AGENT_NAME environment variable is required',
        message: 'Please set VERCEL_AGENT_NAME in your Vercel project settings'
      });
    }

    const options: CommandOptions = {
      riskOnly: process.env.VERCEL_RISK_ONLY === 'true',
      interval: undefined, // Cron jobs don't use interval
      totalMargin: parseFloat(process.env.VERCEL_TOTAL_MARGIN || '10'),
      priceTolerance: parseFloat(process.env.VERCEL_PRICE_TOLERANCE || '1.0'),
      profit: process.env.VERCEL_PROFIT_TARGET ? parseFloat(process.env.VERCEL_PROFIT_TARGET) : undefined,
      autoRefollow: process.env.VERCEL_AUTO_REFOLLOW === 'true',
      marginType: process.env.VERCEL_MARGIN_TYPE === 'ISOLATED' ? 'ISOLATED' : 'CROSSED'
    };

    console.log(`[Cron] Executing follow command for agent: ${agentName}`);
    console.log(`[Cron] Options:`, JSON.stringify(options, null, 2));

    // 捕获输出
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logs.push(message);
      originalLog(...args);
    };

    try {
      await handleFollowCommand(agentName, options);

      return res.status(200).json({
        success: true,
        agent: agentName,
        timestamp: new Date().toISOString(),
        message: 'Cron job executed successfully',
        logs: logs.slice(-100) // 返回最后100条日志
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
        timestamp: new Date().toISOString(),
        logs: logs.slice(-100)
      });
    } finally {
      console.log = originalLog;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}

