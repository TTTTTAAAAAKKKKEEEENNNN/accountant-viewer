/**
 * 报表分组树配置（简化版）
 * 只摆放科目、逐级向上求和；备抵科目在 reportAggregator 中按 -1 参与求和。
 * 不做表达式、正负号、跨行引用等（M7 里程碑再扩展）。
 */
import type { ReportConfig } from '@/types';

/* ============ 资产负债表 ============ */
const BS: ReportConfig = {
  key: 'BS',
  name: '资产负债表',
  root: [
    {
      key: 'bs.assets',
      label: '一、资产',
      defaultExpanded: true,
      children: [
        {
          key: 'bs.assets.current',
          label: '流动资产',
          defaultExpanded: true,
          children: [
            { key: 'bs.assets.cash',        label: '库存现金',   accountCodes: ['1001'] },
            { key: 'bs.assets.bank',        label: '银行存款',   accountCodes: ['1002'] },
            { key: 'bs.assets.ar',          label: '应收账款',   accountCodes: ['1122'] },
            { key: 'bs.assets.other_ar',    label: '其他应收款', accountCodes: ['1221'] },
            { key: 'bs.assets.prepaid',     label: '预付账款',   accountCodes: ['1123'] },
            { key: 'bs.assets.materials',   label: '原材料',     accountCodes: ['1403'] },
            { key: 'bs.assets.goods',       label: '库存商品',   accountCodes: ['1405'] }
          ]
        },
        {
          key: 'bs.assets.noncurrent',
          label: '非流动资产',
          defaultExpanded: true,
          children: [
            { key: 'bs.assets.fa',          label: '固定资产',       accountCodes: ['1601'] },
            { key: 'bs.assets.accum_dep',   label: '减：累计折旧',   accountCodes: ['1602'] },
            { key: 'bs.assets.intangible',  label: '无形资产',       accountCodes: ['1701'] }
          ]
        }
      ]
    },
    {
      key: 'bs.liab',
      label: '二、负债',
      defaultExpanded: true,
      children: [
        {
          key: 'bs.liab.current',
          label: '流动负债',
          defaultExpanded: true,
          children: [
            { key: 'bs.liab.short_loan',    label: '短期借款',       accountCodes: ['2001'] },
            { key: 'bs.liab.ap',            label: '应付账款',       accountCodes: ['2202'] },
            { key: 'bs.liab.salary',        label: '应付职工薪酬',   accountCodes: ['2211'] },
            { key: 'bs.liab.tax',           label: '应交税费',       accountCodes: ['2221'] },
            { key: 'bs.liab.dividend',      label: '应付股利',       accountCodes: ['2232'] }
          ]
        },
        {
          key: 'bs.liab.noncurrent',
          label: '非流动负债',
          children: [
            { key: 'bs.liab.long_loan',     label: '长期借款',       accountCodes: ['2501'] }
          ]
        }
      ]
    },
    {
      key: 'bs.equity',
      label: '三、所有者权益',
      defaultExpanded: true,
      children: [
        { key: 'bs.equity.capital',         label: '实收资本',                 accountCodes: ['4001'] },
        { key: 'bs.equity.cap_reserve',     label: '资本公积',                 accountCodes: ['4002'] },
        { key: 'bs.equity.surplus',         label: '盈余公积',                 accountCodes: ['4101'] },
        { key: 'bs.equity.current_profit',  label: '本年利润',                 accountCodes: ['4103'] },
        { key: 'bs.equity.retained',        label: '利润分配—未分配利润',       accountCodes: ['4104'] }
      ]
    }
  ]
};

/* ============ 利润表（简化版：收入组 + 费用组 平行摆放，不做减法） ============ */
const PL: ReportConfig = {
  key: 'PL',
  name: '利润表',
  root: [
    {
      key: 'pl.revenue',
      label: '一、营业收入',
      defaultExpanded: true,
      children: [
        { key: 'pl.rev.main',   label: '主营业务收入', accountCodes: ['6001'] },
        { key: 'pl.rev.other',  label: '其他业务收入', accountCodes: ['6051'] },
        { key: 'pl.rev.invest', label: '投资收益',     accountCodes: ['6111'] }
      ]
    },
    {
      key: 'pl.expense',
      label: '二、营业成本及费用',
      defaultExpanded: true,
      children: [
        { key: 'pl.exp.cogs',   label: '主营业务成本', accountCodes: ['6401'] },
        { key: 'pl.exp.tax',    label: '税金及附加',   accountCodes: ['6403'] },
        { key: 'pl.exp.sell',   label: '销售费用',     accountCodes: ['6601'] },
        { key: 'pl.exp.admin',  label: '管理费用',     accountCodes: ['6602'] },
        { key: 'pl.exp.fin',    label: '财务费用',     accountCodes: ['6603'] },
        { key: 'pl.exp.income_tax', label: '所得税费用', accountCodes: ['6801'] }
      ]
    },
    // 直接从"本年利润"科目取数，避免"收入 - 费用"跨类相减
    { key: 'pl.net_profit', label: '三、净利润（取自"本年利润"科目余额）', accountCodes: ['4103'] }
  ]
};

/* ============ 现金流量表（直接法）
 * CF 表由 engine/cashFlowCalculator.ts 直接计算，本配置仅提供展示结构，
 * 具体金额不走 reportAggregator。UI 层用 CashFlowView.vue 单独渲染。
 */
const CF: ReportConfig = {
  key: 'CF',
  name: '现金流量表（直接法）',
  root: [
    { key: 'cf.op',     label: '一、经营活动产生的现金流量净额' },
    { key: 'cf.inv',    label: '二、投资活动产生的现金流量净额' },
    { key: 'cf.fin',    label: '三、筹资活动产生的现金流量净额' },
    { key: 'cf.net',    label: '四、现金及现金等价物净增加额' },
    { key: 'cf.opening',label: '五、期初现金及现金等价物余额' },
    { key: 'cf.ending', label: '六、期末现金及现金等价物余额' }
  ]
};

export const REPORT_CONFIGS: ReportConfig[] = [BS, PL, CF];

export const REPORT_MAP: Record<'BS' | 'PL' | 'CF', ReportConfig> = { BS, PL, CF };
