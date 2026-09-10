/**
 * 默认科目表（30+ 个）
 * 覆盖 BS/PL 三表联动、结转链路、分红教学。
 * 用户后续可通过 UI（M7）增删改。
 */
import type { Account } from '@/types';

export const DEFAULT_ACCOUNTS: Account[] = [
  /* ============ 资产 ============ */
  { code: '1',    name: '资产',       type: 'ASSET',  direction: 'DEBIT',  parentCode: null,   isLeaf: false, statement: 'BS' },
  { code: '11',   name: '流动资产',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '1',    isLeaf: false, statement: 'BS' },
  { code: '1001', name: '库存现金',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1002', name: '银行存款',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1122', name: '应收账款',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1221', name: '其他应收款',  type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1123', name: '预付账款',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1403', name: '原材料',      type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },
  { code: '1405', name: '库存商品',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '11',   isLeaf: true,  statement: 'BS' },

  { code: '12',   name: '非流动资产',  type: 'ASSET',  direction: 'DEBIT',  parentCode: '1',    isLeaf: false, statement: 'BS' },
  { code: '1601', name: '固定资产',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '12',   isLeaf: true,  statement: 'BS' },
  // ⭐ 累计折旧：备抵科目
  { code: '1602', name: '累计折旧',    type: 'ASSET',  direction: 'CREDIT', parentCode: '12',   isLeaf: true,  statement: 'BS', isContra: true },
  { code: '1701', name: '无形资产',    type: 'ASSET',  direction: 'DEBIT',  parentCode: '12',   isLeaf: true,  statement: 'BS' },

  /* ============ 负债 ============ */
  { code: '2',    name: '负债',        type: 'LIABILITY', direction: 'CREDIT', parentCode: null, isLeaf: false, statement: 'BS' },
  { code: '21',   name: '流动负债',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '2',  isLeaf: false, statement: 'BS' },
  { code: '2001', name: '短期借款',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '21', isLeaf: true,  statement: 'BS' },
  { code: '2202', name: '应付账款',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '21', isLeaf: true,  statement: 'BS' },
  { code: '2211', name: '应付职工薪酬', type: 'LIABILITY', direction: 'CREDIT', parentCode: '21', isLeaf: true,  statement: 'BS' },
  { code: '2221', name: '应交税费',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '21', isLeaf: true,  statement: 'BS' },
  { code: '2232', name: '应付股利',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '21', isLeaf: true,  statement: 'BS' },

  { code: '22',   name: '非流动负债',  type: 'LIABILITY', direction: 'CREDIT', parentCode: '2',  isLeaf: false, statement: 'BS' },
  { code: '2501', name: '长期借款',    type: 'LIABILITY', direction: 'CREDIT', parentCode: '22', isLeaf: true,  statement: 'BS' },

  /* ============ 所有者权益 ============ */
  { code: '3',    name: '所有者权益',  type: 'EQUITY', direction: 'CREDIT', parentCode: null,  isLeaf: false, statement: 'BS' },
  { code: '4001', name: '实收资本',    type: 'EQUITY', direction: 'CREDIT', parentCode: '3',   isLeaf: true,  statement: 'BS' },
  { code: '4002', name: '资本公积',    type: 'EQUITY', direction: 'CREDIT', parentCode: '3',   isLeaf: true,  statement: 'BS' },
  { code: '4101', name: '盈余公积',    type: 'EQUITY', direction: 'CREDIT', parentCode: '3',   isLeaf: true,  statement: 'BS' },
  { code: '4103', name: '本年利润',    type: 'EQUITY', direction: 'CREDIT', parentCode: '3',   isLeaf: true,  statement: 'BOTH' },
  { code: '4104', name: '利润分配—未分配利润', type: 'EQUITY', direction: 'CREDIT', parentCode: '3', isLeaf: true, statement: 'BS' },

  /* ============ 收入 ============ */
  { code: '6',    name: '收入',        type: 'REVENUE', direction: 'CREDIT', parentCode: null, isLeaf: false, statement: 'PL' },
  { code: '6001', name: '主营业务收入', type: 'REVENUE', direction: 'CREDIT', parentCode: '6', isLeaf: true, statement: 'PL' },
  { code: '6051', name: '其他业务收入', type: 'REVENUE', direction: 'CREDIT', parentCode: '6', isLeaf: true, statement: 'PL' },
  { code: '6111', name: '投资收益',    type: 'REVENUE', direction: 'CREDIT', parentCode: '6', isLeaf: true, statement: 'PL' },

  /* ============ 费用 ============ */
  { code: '7',    name: '费用',        type: 'EXPENSE', direction: 'DEBIT', parentCode: null, isLeaf: false, statement: 'PL' },
  { code: '6401', name: '主营业务成本', type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' },
  { code: '6403', name: '税金及附加',  type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' },
  { code: '6601', name: '销售费用',    type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' },
  { code: '6602', name: '管理费用',    type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' },
  { code: '6603', name: '财务费用',    type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' },
  { code: '6801', name: '所得税费用',  type: 'EXPENSE', direction: 'DEBIT', parentCode: '7', isLeaf: true, statement: 'PL' }
];

/** 快速查表 */
export const ACCOUNT_MAP: Record<string, Account> = DEFAULT_ACCOUNTS.reduce(
  (m, a) => ((m[a.code] = a), m),
  {} as Record<string, Account>
);

/** 常用科目常量（引擎中会引用） */
export const CASH_CODES = ['1001', '1002'];             // 货币资金
export const PL_CLOSING_TARGET = '4103';                // 本年利润
export const RETAINED_EARNINGS = '4104';                // 利润分配—未分配利润
