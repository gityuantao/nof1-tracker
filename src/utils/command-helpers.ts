import { ApiAnalyzer, FollowPlan } from '../scripts/analyze-api';
import { TradingExecutor, StopOrderExecutionResult } from '../services/trading-executor';
import { RiskManager } from '../services/risk-manager';
import { OrderHistoryManager } from '../services/order-history-manager';
import { TradingPlan } from '../types/trading';
import { CommandOptions, ServiceContainer } from '../types/command';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 初始化服务容器
 */
export function initializeServices(includeOrderHistory = false): ServiceContainer {
  const analyzer = new ApiAnalyzer();
  return {
    analyzer,
    executor: new TradingExecutor(),
    riskManager: new RiskManager(),
    // 使用 analyzer 内部的 orderHistoryManager 实例,确保一致性
    ...(includeOrderHistory && { orderHistoryManager: analyzer.getOrderHistoryManager() })
  };
}

/**
 * 应用配置选项
 */
export function applyConfiguration(analyzer: ApiAnalyzer, options: CommandOptions): void {
  if (options.priceTolerance && !isNaN(options.priceTolerance)) {
    analyzer.getConfigManager().setPriceTolerance(options.priceTolerance);
    console.log(`📊 Price tolerance set to ${options.priceTolerance}%`);
  }

  if (options.totalMargin && !isNaN(options.totalMargin)) {
    console.log(`💰 Total margin set to $${options.totalMargin.toFixed(2)}`);
  }
}

/**
 * 打印交易计划基本信息
 */
export function printPlanInfo(plan: TradingPlan, index?: number): void {
  const prefix = index !== undefined ? `${index + 1}. ` : '';
  console.log(`${prefix}${plan.symbol}`);
  console.log(`   ID: ${plan.id}`);
  console.log(`   Side: ${plan.side}`);
  console.log(`   Type: ${plan.type}`);
  console.log(`   Quantity: ${plan.quantity}`);
  console.log(`   Leverage: ${plan.leverage}x`);
  if ('timestamp' in plan) {
    console.log(`   Timestamp: ${new Date(plan.timestamp).toISOString()}`);
  }
}

/**
 * 打印跟随计划信息
 */
export function printFollowPlanInfo(plan: FollowPlan, index: number): void {
  console.log(`\n${index + 1}. ${plan.symbol} - ${plan.action}`);
  console.log(`   Side: ${plan.side}`);
  console.log(`   Type: ${plan.type}`);
  console.log(`   Quantity: ${plan.quantity.toFixed(6)}`);
  console.log(`   Leverage: ${plan.leverage}x`);
  if (plan.entryPrice) console.log(`   Entry Price: ${plan.entryPrice}`);
  if (plan.exitPrice) console.log(`   Exit Price: ${plan.exitPrice}`);
  console.log(`   Reason: ${plan.reason}`);
}

/**
 * 打印风险评估结果
 */
export function printRiskAssessment(riskAssessment: any): void {
  console.log(`   ⚠️  Risk Score: ${riskAssessment.riskScore}/100`);

  if (riskAssessment.warnings.length > 0) {
    console.log(`   🚨 Warnings: ${riskAssessment.warnings.join(', ')}`);
  }

  if (riskAssessment.priceTolerance) {
    const pt = riskAssessment.priceTolerance;
    console.log(`   💰 Price Check: Entry $${pt.entryPrice} vs Current $${pt.currentPrice}`);
    console.log(`   📏 Price Difference: ${pt.priceDifference.toFixed(2)}% (Tolerance: ${pt.tolerance}%)`);
    console.log(`   ✅ Price Tolerance: ${pt.reason}`);
  }
}

/**
 * 转换 FollowPlan 为 TradingPlan
 */
export function convertToTradingPlan(plan: FollowPlan): TradingPlan {
  return {
    id: `${plan.agent}_${plan.symbol}_${plan.timestamp}`,
    symbol: plan.symbol,
    side: plan.side,
    type: plan.type,
    quantity: plan.quantity,
    leverage: plan.leverage,
    timestamp: plan.timestamp,
    marginType: plan.marginType
  };
}

/**
 * 评估风险(支持价格容差检查)
 */
export function assessRiskWithTolerance(
  riskManager: RiskManager,
  plan: FollowPlan,
  tradingPlan: TradingPlan,
  priceTolerance?: number
): any {
  if (plan.action === "ENTER" && plan.entryPrice && plan.position?.current_price) {
    return riskManager.assessRiskWithPriceTolerance(
      tradingPlan,
      plan.entryPrice,
      plan.position.current_price,
      plan.symbol,
      priceTolerance
    );
  }
  return riskManager.assessRisk(tradingPlan);
}

/**
 * 获取币种的最小数量和步长
 */
async function getSymbolLotSize(binanceService: any, symbol: string): Promise<{ minQty: number; stepSize: number }> {
  const defaults = { minQty: 0.001, stepSize: 0.001 };
  
  try {
    const symbolInfo = await binanceService.getSymbolInfo(symbol);
    const lotSizeFilter = symbolInfo?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
    
    if (lotSizeFilter) {
      return {
        minQty: parseFloat(lotSizeFilter.minQty || defaults.minQty.toString()),
        stepSize: parseFloat(lotSizeFilter.stepSize || defaults.stepSize.toString())
      };
    }
  } catch (error) {
    console.warn(`   ⚠️ Failed to get symbol info for ${symbol}, using defaults`);
  }
  
  return defaults;
}

/**
 * 获取当前价格（优先使用position中的价格）
 */
async function getCurrentPrice(binanceService: any, symbol: string, positionPrice?: number): Promise<number> {
  if (positionPrice) return positionPrice;
  
  try {
    const ticker = await binanceService.get24hrTicker(symbol);
    return parseFloat(ticker.lastPrice || ticker.price);
  } catch (error) {
    console.warn(`   ⚠️ Failed to get current price for ${symbol}`);
    return 0;
  }
}

/**
 * 根据保证金计算并调整数量（考虑最小数量和步长）
 */
function calculateAdjustedQuantity(
  marginToUse: number,
  leverage: number,
  currentPrice: number,
  minQty: number,
  stepSize: number
): number {
  const notionalValue = marginToUse * leverage;
  let quantity = notionalValue / currentPrice;
  
  // 根据stepSize向下取整到有效步长
  const steps = Math.floor(quantity / stepSize);
  quantity = steps * stepSize;
  
  // 确保不少于最小数量
  return Math.max(quantity, minQty);
}

/**
 * 计算开仓数量（使用20%保证金）
 */
async function calculateOpeningQuantity(
  executor: TradingExecutor,
  tradingPlan: TradingPlan,
  followPlan: FollowPlan
): Promise<void> {
  try {
    const accountInfo = await executor.getAccountInfo();
    const totalAvailableBalance = parseFloat(accountInfo.availableBalance);
    const marginToUse = totalAvailableBalance * 0.2;
    
    const binanceService = (executor as any).binanceService;
    if (!binanceService) {
      console.warn(`   ⚠️ binanceService not available, using original quantity: ${tradingPlan.quantity}`);
      return;
    }
    
    // 获取币种信息和价格
    const { minQty, stepSize } = await getSymbolLotSize(binanceService, tradingPlan.symbol);
    console.log(`   📊 Symbol info: minQty=${minQty}, stepSize=${stepSize}`);
    
    const currentPrice = await getCurrentPrice(binanceService, tradingPlan.symbol, followPlan.position?.current_price);
    
    if (currentPrice <= 0) {
      console.warn(`   ⚠️ Unable to get current price for ${tradingPlan.symbol}, using original quantity: ${tradingPlan.quantity}`);
      return;
    }
    
    // 计算并调整数量
    const adjustedQuantity = calculateAdjustedQuantity(marginToUse, tradingPlan.leverage, currentPrice, minQty, stepSize);
    const formattedStr = binanceService.formatQuantity(adjustedQuantity, tradingPlan.symbol);
    tradingPlan.quantity = Number(formattedStr);
    
    console.log(`   💰 Opening 10% position for ${tradingPlan.symbol}: ${tradingPlan.quantity.toFixed(6)} (Margin: $${marginToUse.toFixed(2)}, Price: $${currentPrice.toFixed(2)})`);
  } catch (error) {
    console.warn(`   ⚠️ Failed to calculate quantity: ${error instanceof Error ? error.message : 'Unknown error'}, using original quantity: ${tradingPlan.quantity}`);
  }
}

/**
 * 执行交易并保存订单历史
 */
export async function executeTradeWithHistory(
  executor: TradingExecutor,
  tradingPlan: TradingPlan,
  followPlan: FollowPlan,
  orderHistoryManager?: OrderHistoryManager
): Promise<StopOrderExecutionResult> {
  let result: StopOrderExecutionResult;

  // 如果是ENTER操作（开仓），使用10%保证金计算数量
  if (followPlan.action === "ENTER") {
    await calculateOpeningQuantity(executor, tradingPlan, followPlan);
  } else if (followPlan.releasedMargin && followPlan.releasedMargin > 0 && followPlan.position) {
    // 对于非ENTER操作（如平仓），使用 releasedMargin
    const notionalValue = followPlan.releasedMargin * followPlan.leverage;
    const adjustedQuantity = notionalValue / followPlan.position.current_price;
    console.log(`   💰 Using released margin: $${followPlan.releasedMargin.toFixed(2)} (${followPlan.leverage}x leverage) → Quantity: ${adjustedQuantity.toFixed(4)}`);
    tradingPlan.quantity = adjustedQuantity;
  }

  // 如果是ENTER操作且有position信息,使用带止盈止损的执行方法
  if (followPlan.action === "ENTER" && followPlan.position) {
    console.log(`   🛡️ Setting up stop orders based on exit plan...`);
    result = await executor.executePlanWithStopOrders(tradingPlan, followPlan.position);

    if (result.success) {
      console.log(`   ✅ Trade executed successfully!`);
      console.log(`   📝 Main Order ID: ${result.orderId}`);
      if (result.takeProfitOrderId) {
        console.log(`   📈 Take Profit Order ID: ${result.takeProfitOrderId}`);
      }
      if (result.stopLossOrderId) {
        console.log(`   📉 Stop Loss Order ID: ${result.stopLossOrderId}`);
      }
    }
  } else {
    // 使用普通执行方法
    result = await executor.executePlan(tradingPlan);

    if (result.success) {
      console.log(`   ✅ Trade executed successfully!`);
      console.log(`   📝 Order ID: ${result.orderId}`);
    }
  }

  // 保存订单历史
  if (result.success && orderHistoryManager && followPlan.position?.entry_oid && result.orderId) {
    console.log(`   💾 Saving order to history: ${followPlan.symbol} (OID: ${followPlan.position.entry_oid})`);
    orderHistoryManager.saveProcessedOrder(
      followPlan.position.entry_oid,
      followPlan.symbol,
      followPlan.agent,
      followPlan.side,
      followPlan.quantity,
      followPlan.entryPrice,
      result.orderId.toString()
    );
  } else if (result.success) {
    // 调试信息：为什么没有保存订单历史
    if (!orderHistoryManager) {
      console.log(`   ⚠️ Order history not saved: orderHistoryManager is missing`);
    } else if (!followPlan.position?.entry_oid) {
      console.log(`   ⚠️ Order history not saved: entry_oid is missing (position: ${!!followPlan.position})`);
    } else if (!result.orderId) {
      console.log(`   ⚠️ Order history not saved: orderId is missing`);
    }
  }

  if (!result.success) {
    console.log(`   ❌ Trade execution failed: ${result.error}`);
  }

  return result;
}

/**
 * 统一错误处理
 */
export function handleError(error: unknown, context: string): never {
  console.error(`❌ ${context}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}

/**
 * 从 package.json 读取版本号
 */
export function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.warn('Warning: Could not read version from package.json, defaulting to 1.0.0');
    return '1.0.0';
  }
}
