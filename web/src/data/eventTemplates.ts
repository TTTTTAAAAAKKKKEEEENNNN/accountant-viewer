/**
 * 事件模板库
 * 每个模板必须保证 Σdebit === Σcredit（容差 0.005，由 validators 校验）。
 * cfCategory 只打在"实际借/贷货币资金"的分录行上。
 * 结转类模板生成 isClosing=true 的分录，CF 表会跳过。
 */
import type { DraftEntry, EventTemplate, TemplateBuildContext } from '@/types';
import { PL_CLOSING_TARGET, RETAINED_EARNINGS } from './accounts.config';

/** 拼一条完整摘要 */
function s(...parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p !== undefined && p !== '').join(' ');
}

/** 通用金额参数 */
const AMOUNT = { key: 'amount', label: '金额', type: 'number' as const, required: true, min: 0.01 };

/* ------------------------------------------------------------------ */
/* 经营活动                                                            */
/* ------------------------------------------------------------------ */

const T_CASH_BUY_MATERIALS: EventTemplate = {
  code: 'CASH_BUY_MATERIALS',
  name: '现购原材料',
  category: '经营',
  description: '借:原材料 / 贷:银行存款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('现购原材料', memo),
      lines: [
        { accountCode: '1403', debit: +amount, credit: 0 },
        { accountCode: '1002', debit: 0, credit: +amount, cfCategory: 'OPERATING' }
      ]
    }
  ]
};

const T_CREDIT_BUY_MATERIALS: EventTemplate = {
  code: 'CREDIT_BUY_MATERIALS',
  name: '赊购原材料',
  category: '经营',
  description: '借:原材料 / 贷:应付账款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('赊购原材料', memo),
      lines: [
        { accountCode: '1403', debit: +amount, credit: 0 },
        { accountCode: '2202', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_CREDIT_SALE: EventTemplate = {
  code: 'CREDIT_SALE',
  name: '赊销商品',
  category: '经营',
  description: '借:应收账款 / 贷:主营业务收入；同时结转成本 借:主营业务成本 / 贷:库存商品',
  params: [
    { ...AMOUNT, label: '销售收入金额' },
    { key: 'cost', label: '结转成本金额', type: 'number', required: true, min: 0 },
    { key: 'memo', label: '备注', type: 'string' }
  ],
  build: ({ amount, cost, memo }) => {
    const entries: DraftEntry[] = [
      {
        date: '',
        summary: s('赊销商品', memo),
        lines: [
          { accountCode: '1122', debit: +amount, credit: 0 },
          { accountCode: '6001', debit: 0, credit: +amount }
        ]
      }
    ];
    if (+cost > 0) {
      entries.push({
        date: '',
        summary: s('结转销售成本', memo),
        lines: [
          { accountCode: '6401', debit: +cost, credit: 0 },
          { accountCode: '1405', debit: 0, credit: +cost }
        ]
      });
    }
    return entries;
  }
};

const T_CASH_SALE: EventTemplate = {
  code: 'CASH_SALE',
  name: '现销商品',
  category: '经营',
  description: '借:银行存款 / 贷:主营业务收入；同时结转成本',
  params: [
    { ...AMOUNT, label: '销售收入金额' },
    { key: 'cost', label: '结转成本金额', type: 'number', required: true, min: 0 },
    { key: 'memo', label: '备注', type: 'string' }
  ],
  build: ({ amount, cost, memo }) => {
    const entries: DraftEntry[] = [
      {
        date: '',
        summary: s('现销商品', memo),
        lines: [
          { accountCode: '1002', debit: +amount, credit: 0, cfCategory: 'OPERATING' },
          { accountCode: '6001', debit: 0, credit: +amount }
        ]
      }
    ];
    if (+cost > 0) {
      entries.push({
        date: '',
        summary: s('结转销售成本', memo),
        lines: [
          { accountCode: '6401', debit: +cost, credit: 0 },
          { accountCode: '1405', debit: 0, credit: +cost }
        ]
      });
    }
    return entries;
  }
};

const T_COLLECT_AR: EventTemplate = {
  code: 'COLLECT_AR',
  name: '收回应收账款',
  category: '经营',
  description: '借:银行存款 / 贷:应收账款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('收回货款', memo),
      lines: [
        { accountCode: '1002', debit: +amount, credit: 0, cfCategory: 'OPERATING' },
        { accountCode: '1122', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_PAY_SALARY: EventTemplate = {
  code: 'PAY_SALARY',
  name: '支付工资',
  category: '经营',
  description: '借:管理费用 / 贷:银行存款（简化教学：不通过应付职工薪酬过渡）',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('支付工资', memo),
      lines: [
        { accountCode: '6602', debit: +amount, credit: 0 },
        { accountCode: '1002', debit: 0, credit: +amount, cfCategory: 'OPERATING' }
      ]
    }
  ]
};

const T_DEPRECIATION: EventTemplate = {
  code: 'DEPRECIATION',
  name: '计提折旧',
  category: '经营',
  description: '借:管理费用 / 贷:累计折旧',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('计提折旧', memo),
      lines: [
        { accountCode: '6602', debit: +amount, credit: 0 },
        { accountCode: '1602', debit: 0, credit: +amount }
      ]
    }
  ]
};

/**
 * 计提应付职工薪酬
 *  借：管理费用（默认 6602；可通过 expenseCode 参数改为 6601 销售费用 / 6603 财务费用）
 *  贷：应付职工薪酬 2211
 * 教学说明：与"支付工资"配套使用——先计提形成负债，再实际支付减少现金。
 * 不涉及货币资金，因此不打 cfCategory。
 */
const T_ACCRUE_SALARY: EventTemplate = {
  code: 'ACCRUE_SALARY',
  name: '计提应付职工薪酬',
  category: '经营',
  description: '借:管理费用(可切换) / 贷:应付职工薪酬（形成负债，不动现金）',
  params: [
    AMOUNT,
    {
      key: 'expenseCode',
      label: '费用科目',
      type: 'select',
      required: true,
      default: '6602',
      options: [
        { label: '6601 销售费用', value: '6601' },
        { label: '6602 管理费用', value: '6602' },
        { label: '6603 财务费用', value: '6603' }
      ]
    },
    { key: 'memo', label: '备注', type: 'string' }
  ],
  build: ({ amount, expenseCode, memo }) => {
    // 合法的费用科目白名单，防止用户把工资误挂到资产/负债/收入类
    const allowed = new Set(['6601', '6602', '6603']);
    const raw = typeof expenseCode === 'string' ? expenseCode.trim() : '';
    const debitCode = allowed.has(raw) ? raw : '6602';
    return [
      {
        date: '',
        summary: s('计提应付职工薪酬', memo),
        lines: [
          { accountCode: debitCode, debit: +amount, credit: 0 },
          { accountCode: '2211', debit: 0, credit: +amount }
        ]
      }
    ];
  }
};

/**
 * 支付应付职工薪酬
 *  借：应付职工薪酬 2211（冲减负债）
 *  贷：银行存款 1002（cfCategory=OPERATING）
 * 与"计提应付职工薪酬"配套：先计提形成负债，再实际支付减少现金。
 */
const T_PAY_ACCRUED_SALARY: EventTemplate = {
  code: 'PAY_ACCRUED_SALARY',
  name: '支付应付职工薪酬',
  category: '经营',
  description: '借:应付职工薪酬 / 贷:银行存款（冲减负债，减少现金）',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('支付应付职工薪酬', memo),
      lines: [
        { accountCode: '2211', debit: +amount, credit: 0 },
        { accountCode: '1002', debit: 0, credit: +amount, cfCategory: 'OPERATING' }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* 投资活动                                                            */
/* ------------------------------------------------------------------ */

const T_INVEST_INCOME: EventTemplate = {
  code: 'INVEST_INCOME',
  name: '取得投资收益',
  category: '投资',
  description: '借:银行存款 / 贷:投资收益',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('取得投资收益', memo),
      lines: [
        { accountCode: '1002', debit: +amount, credit: 0, cfCategory: 'INVESTING' },
        { accountCode: '6111', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_BUY_FA: EventTemplate = {
  code: 'BUY_FA',
  name: '购买固定资产',
  category: '投资',
  description: '借:固定资产 / 贷:银行存款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('购买固定资产', memo),
      lines: [
        { accountCode: '1601', debit: +amount, credit: 0 },
        { accountCode: '1002', debit: 0, credit: +amount, cfCategory: 'INVESTING' }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* 筹资活动                                                            */
/* ------------------------------------------------------------------ */

const T_CAPITAL_INJECT: EventTemplate = {
  code: 'CAPITAL_INJECT',
  name: '股东投入资本',
  category: '筹资',
  description: '借:银行存款 / 贷:实收资本',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('股东注资', memo),
      lines: [
        { accountCode: '1002', debit: +amount, credit: 0, cfCategory: 'FINANCING' },
        { accountCode: '4001', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_SHORT_LOAN: EventTemplate = {
  code: 'SHORT_LOAN',
  name: '取得短期借款',
  category: '筹资',
  description: '借:银行存款 / 贷:短期借款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('取得短期借款', memo),
      lines: [
        { accountCode: '1002', debit: +amount, credit: 0, cfCategory: 'FINANCING' },
        { accountCode: '2001', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_DECLARE_DIVIDEND: EventTemplate = {
  code: 'DECLARE_DIVIDEND',
  name: '宣告分红',
  category: '筹资',
  description: '借:利润分配—未分配利润 / 贷:应付股利（不涉及货币资金，不入 CF）',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('宣告分红', memo),
      lines: [
        { accountCode: RETAINED_EARNINGS, debit: +amount, credit: 0 },
        { accountCode: '2232', debit: 0, credit: +amount }
      ]
    }
  ]
};

const T_PAY_DIVIDEND: EventTemplate = {
  code: 'PAY_DIVIDEND',
  name: '支付股利',
  category: '筹资',
  description: '借:应付股利 / 贷:银行存款',
  params: [AMOUNT, { key: 'memo', label: '备注', type: 'string' }],
  build: ({ amount, memo }) => [
    {
      date: '',
      summary: s('支付股利', memo),
      lines: [
        { accountCode: '2232', debit: +amount, credit: 0 },
        { accountCode: '1002', debit: 0, credit: +amount, cfCategory: 'FINANCING' }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* 结转类                                                              */
/* ------------------------------------------------------------------ */

/**
 * 月末结转损益 → 本年利润
 * 把所有收入/费用类科目的期末余额清零，净额转入本年利润 4103。
 *  - 收入类（贷方科目）：借收入类 贷本年利润
 *  - 费用类（借方科目）：借本年利润 贷费用类
 */
const T_CLOSE_PL: EventTemplate = {
  code: 'CLOSE_PL',
  name: '期末结转损益 → 本年利润',
  category: '结转',
  description: '将所有 PL 类科目的当期发生净额转入 4103 本年利润，清零 PL 类科目余额',
  params: [],
  build: (_params, ctx: TemplateBuildContext) => {
    // 收入类（贷方余额）：科目 code -> 期末贷方净额
    const revCodes = ['6001', '6051', '6111'];
    // 费用类（借方余额）
    const expCodes = ['6401', '6403', '6601', '6602', '6603', '6801'];

    const revLines: { code: string; amount: number }[] = [];
    const expLines: { code: string; amount: number }[] = [];

    for (const code of revCodes) {
      // 贷方科目：期末正向余额 = 贷方净额
      const bal = ctx.getBalance(code);
      if (bal > 0) revLines.push({ code, amount: bal });
    }
    for (const code of expCodes) {
      const bal = ctx.getBalance(code);
      if (bal > 0) expLines.push({ code, amount: bal });
    }

    const entries: DraftEntry[] = [];

    // 借收入 贷本年利润
    if (revLines.length > 0) {
      const total = revLines.reduce((s2, x) => s2 + x.amount, 0);
      entries.push({
        date: '',
        summary: '结转收入类科目至本年利润',
        isClosing: true,
        lines: [
          ...revLines.map((x) => ({ accountCode: x.code, debit: x.amount, credit: 0 })),
          { accountCode: PL_CLOSING_TARGET, debit: 0, credit: total }
        ]
      });
    }
    // 借本年利润 贷费用
    if (expLines.length > 0) {
      const total = expLines.reduce((s2, x) => s2 + x.amount, 0);
      entries.push({
        date: '',
        summary: '结转费用类科目至本年利润',
        isClosing: true,
        lines: [
          { accountCode: PL_CLOSING_TARGET, debit: total, credit: 0 },
          ...expLines.map((x) => ({ accountCode: x.code, debit: 0, credit: x.amount }))
        ]
      });
    }

    return entries;
  }
};

/**
 * 年末结转本年利润 → 未分配利润
 * 只在 P12 使用。取 4103 期末余额的净值：
 *   - 若贷方余额（盈利）：借本年利润 贷未分配利润
 *   - 若借方余额（亏损）：借未分配利润 贷本年利润
 */
const T_CLOSE_YEAR: EventTemplate = {
  code: 'CLOSE_YEAR',
  name: '年末结转本年利润 → 未分配利润',
  category: '结转',
  description: '将 4103 本年利润余额清零，净额结入 4104 利润分配—未分配利润（一年一次，通常在 P12）',
  params: [],
  build: (_params, ctx) => {
    const bal = ctx.getBalance(PL_CLOSING_TARGET);
    if (bal === 0) return [];
    // 本年利润是贷方科目：getBalance > 0 表示贷方净额（盈利）
    const closingDebit = ctx.getClosingDebit(PL_CLOSING_TARGET);
    const closingCredit = ctx.getClosingCredit(PL_CLOSING_TARGET);
    const net = closingCredit - closingDebit; // >0 盈利，<0 亏损
    const abs = Math.abs(net);
    if (abs === 0) return [];
    if (net > 0) {
      return [
        {
          date: '',
          summary: '年末结转本年利润至未分配利润（盈利）',
          isClosing: true,
          lines: [
            { accountCode: PL_CLOSING_TARGET, debit: abs, credit: 0 },
            { accountCode: RETAINED_EARNINGS, debit: 0, credit: abs }
          ]
        }
      ];
    }
    return [
      {
        date: '',
        summary: '年末结转本年利润至未分配利润（亏损）',
        isClosing: true,
        lines: [
          { accountCode: RETAINED_EARNINGS, debit: abs, credit: 0 },
          { accountCode: PL_CLOSING_TARGET, debit: 0, credit: abs }
        ]
      }
    ];
  }
};

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

export const EVENT_TEMPLATES: EventTemplate[] = [
  T_CASH_BUY_MATERIALS,
  T_CREDIT_BUY_MATERIALS,
  T_CREDIT_SALE,
  T_CASH_SALE,
  T_COLLECT_AR,
  T_PAY_SALARY,
  T_ACCRUE_SALARY,
  T_PAY_ACCRUED_SALARY,
  T_DEPRECIATION,
  T_INVEST_INCOME,
  T_BUY_FA,
  T_CAPITAL_INJECT,
  T_SHORT_LOAN,
  T_DECLARE_DIVIDEND,
  T_PAY_DIVIDEND,
  T_CLOSE_PL,
  T_CLOSE_YEAR
];

export const TEMPLATE_MAP: Record<string, EventTemplate> = EVENT_TEMPLATES.reduce(
  (m, t) => ((m[t.code] = t), m),
  {} as Record<string, EventTemplate>
);
