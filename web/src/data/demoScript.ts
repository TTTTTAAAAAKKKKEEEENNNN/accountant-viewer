/**
 * 演示剧本
 * 一键往 store 灌入完整业务流，覆盖 2025P01 ~ 2026P01。
 * 不涉及增值税等流转税，专注三表结转链路。
 */

export interface DemoStep {
  periodId: string;
  templateCode: string;
  params: Record<string, any>;
  description: string;
}

/**
 * 剧本按顺序执行，每一步会通过 events store 的 addEvent 落库。
 * 结转类事件的 params 为空，模板会读 ctx 里的余额生成分录。
 */
export const DEMO_SCRIPT: DemoStep[] = [
  /* --- 2025P01 起步 --- */
  { periodId: '2025P01', templateCode: 'CAPITAL_INJECT', params: { amount: 1000000, memo: '发起人注资' }, description: '股东注资 100 万' },
  { periodId: '2025P01', templateCode: 'SHORT_LOAN',     params: { amount: 200000,  memo: '流动资金贷款' }, description: '短期借款 20 万' },
  { periodId: '2025P01', templateCode: 'BUY_FA',         params: { amount: 300000,  memo: '生产设备' },     description: '购买设备 30 万' },

  /* --- 2025P02 --- */
  { periodId: '2025P02', templateCode: 'CASH_BUY_MATERIALS', params: { amount: 100000, memo: '主要原料' }, description: '现购原材料 10 万' },

  /* --- 2025P03（Q1 末） --- */
  { periodId: '2025P03', templateCode: 'CREDIT_SALE',   params: { amount: 150000, cost: 80000, memo: '批发客户 A' }, description: '赊销 15 万（成本 8 万）' },
  { periodId: '2025P03', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P04 --- */
  { periodId: '2025P04', templateCode: 'PAY_SALARY',    params: { amount: 30000, memo: '员工工资' }, description: '支付工资 3 万' },
  { periodId: '2025P04', templateCode: 'DEPRECIATION',  params: { amount: 10000, memo: '设备折旧' }, description: '计提折旧 1 万' },
  { periodId: '2025P04', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P05 --- */
  { periodId: '2025P05', templateCode: 'COLLECT_AR',    params: { amount: 100000, memo: '客户 A 回款' }, description: '收回应收 10 万' },
  { periodId: '2025P05', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益（无损益则跳过）' },

  /* --- 2025P06（Q2 末） --- */
  { periodId: '2025P06', templateCode: 'CASH_SALE',     params: { amount: 80000, cost: 40000, memo: '零售客户' }, description: '现销 8 万（成本 4 万）' },
  { periodId: '2025P06', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P07 ~ P08 留空，观察无业务月余额滚存 --- */

  /* --- 2025P09（Q3 末） --- */
  { periodId: '2025P09', templateCode: 'INVEST_INCOME', params: { amount: 20000, memo: '理财收益' }, description: '取得投资收益 2 万' },
  { periodId: '2025P09', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P10 --- */
  { periodId: '2025P10', templateCode: 'DEPRECIATION',  params: { amount: 10000, memo: '设备折旧' }, description: '计提折旧 1 万' },
  { periodId: '2025P10', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P11 --- */
  { periodId: '2025P11', templateCode: 'DEPRECIATION',  params: { amount: 10000, memo: '设备折旧' }, description: '计提折旧 1 万' },
  { periodId: '2025P11', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },

  /* --- 2025P12（年末） --- */
  { periodId: '2025P12', templateCode: 'DEPRECIATION',  params: { amount: 10000, memo: '设备折旧' }, description: '计提折旧 1 万' },
  { periodId: '2025P12', templateCode: 'CLOSE_PL',      params: {}, description: '月末结转损益' },
  { periodId: '2025P12', templateCode: 'CLOSE_YEAR',    params: {}, description: '年末结转本年利润 → 未分配利润' },

  /* --- 2026P01（跨年分红） --- */
  { periodId: '2026P01', templateCode: 'DECLARE_DIVIDEND', params: { amount: 50000, memo: '2025 年度分红' }, description: '宣告分红 5 万' },
  { periodId: '2026P01', templateCode: 'PAY_DIVIDEND',     params: { amount: 50000, memo: '2025 年度分红' }, description: '支付股利 5 万' }
];
