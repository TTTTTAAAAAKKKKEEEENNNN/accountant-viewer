/**
 * 分录 / 事件 校验器（纯函数）
 * 详见 openspec/specs/system-overview.md §12
 */
import type {
  Account,
  DraftEntry,
  EventParamDef,
  EventTemplate,
  JournalEntry,
  Period,
  ValidationError,
  ValidationResult
} from '@/types';

/** 借贷平衡容差（元） */
export const BALANCE_TOLERANCE = 0.005;

function err(code: string, message: string, detail?: Record<string, any>): ValidationError {
  return { code, message, detail };
}

function ok(): ValidationResult {
  return { ok: true };
}

function fail(errors: ValidationError[]): ValidationResult {
  return { ok: false, errors };
}

/**
 * 校验一条分录的合法性：
 *  - 至少 2 行
 *  - 每行 debit / credit 恰好一方为正
 *  - 金额必须是正常有限数字
 *  - 借贷合计相等（容差 0.005）
 *  - 引用的科目必须存在、必须是叶子
 */
export function validateEntry(entry: DraftEntry | JournalEntry, accountMap: Record<string, Account>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!entry.lines || entry.lines.length < 2) {
    errors.push(err('TOO_FEW_LINES', '分录至少要有 2 行'));
    return fail(errors);
  }

  let sumDebit = 0;
  let sumCredit = 0;

  entry.lines.forEach((line, idx) => {
    const { accountCode, debit, credit } = line;
    const label = `第 ${idx + 1} 行`;

    // 金额合法性
    for (const [name, v] of [['借方', debit], ['贷方', credit]] as const) {
      if (typeof v !== 'number' || !Number.isFinite(v) || Number.isNaN(v)) {
        errors.push(err('INVALID_AMOUNT', `${label}${name}金额非法`, { idx, value: v }));
        return;
      }
      if (v < 0) {
        errors.push(err('NEGATIVE_AMOUNT', `${label}${name}金额不能为负`, { idx, value: v }));
        return;
      }
    }

    // 借贷互斥
    const dPositive = debit > 0;
    const cPositive = credit > 0;
    if (dPositive && cPositive) {
      errors.push(err('BOTH_SIDES_POSITIVE', `${label}借方与贷方不能同时为正`, { idx }));
    }
    if (!dPositive && !cPositive) {
      errors.push(err('BOTH_SIDES_ZERO', `${label}借方与贷方不能同时为 0`, { idx }));
    }

    // 科目校验
    const acc = accountMap[accountCode];
    if (!acc) {
      errors.push(err('ACCOUNT_NOT_FOUND', `${label}引用的科目 ${accountCode} 不存在`, { idx, accountCode }));
    } else if (!acc.isLeaf) {
      errors.push(err('NON_LEAF_ACCOUNT', `${label}使用了非叶子科目 ${acc.code} ${acc.name}，请使用明细科目`, { idx, accountCode }));
    }

    sumDebit += debit;
    sumCredit += credit;
  });

  // 借贷平衡
  const diff = Math.abs(sumDebit - sumCredit);
  if (diff > BALANCE_TOLERANCE) {
    errors.push(err('UNBALANCED_ENTRY',
      `借贷不平衡：借方合计 ${sumDebit.toFixed(2)} / 贷方合计 ${sumCredit.toFixed(2)}`,
      { sumDebit, sumCredit, diff }));
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** 校验多条分录（比如一个事件模板产出的多条） */
export function validateEntries(entries: (DraftEntry | JournalEntry)[], accountMap: Record<string, Account>): ValidationResult {
  if (!entries || entries.length === 0) {
    return fail([err('NO_ENTRIES', '本次操作没有产生任何分录（可能无余额可结转）')]);
  }
  const allErrors: ValidationError[] = [];
  entries.forEach((e, i) => {
    const r = validateEntry(e, accountMap);
    if (!r.ok) {
      r.errors.forEach((er) => allErrors.push({ ...er, detail: { ...er.detail, entryIndex: i } }));
    }
  });
  return allErrors.length === 0 ? ok() : fail(allErrors);
}

/** 校验事件模板参数 */
export function validateEventParams(template: EventTemplate, params: Record<string, any>): ValidationResult {
  const errors: ValidationError[] = [];
  for (const def of template.params) {
    const v = params[def.key];
    const missing = v === undefined || v === null || v === '';
    if (def.required && missing) {
      errors.push(err('MISSING_PARAM', `参数「${def.label}」必填`, { key: def.key }));
      continue;
    }
    if (missing) continue;
    if (def.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || Number.isNaN(n)) {
        errors.push(err('INVALID_NUMBER', `参数「${def.label}」不是有效数字`, { key: def.key, value: v }));
        continue;
      }
      if (def.min !== undefined && n < def.min) {
        errors.push(err('BELOW_MIN', `参数「${def.label}」不能小于 ${def.min}`, { key: def.key, min: def.min, value: n }));
      }
    }
    if (def.type === 'select') {
      const allowed = (def.options ?? []).map((o) => o.value);
      if (allowed.length > 0 && !allowed.includes(v)) {
        errors.push(
          err('INVALID_OPTION', `参数「${def.label}」的值必须是候选项之一`, {
            key: def.key,
            value: v,
            allowed
          })
        );
      }
    }
  }
  return errors.length === 0 ? ok() : fail(errors);
}

/** 校验期间可用于录入（未结账） */
export function validatePeriodOpenForWrite(period: Period | undefined): ValidationResult {
  if (!period) return fail([err('PERIOD_NOT_FOUND', '期间不存在')]);
  if (period.status === 'CLOSED') {
    return fail([err('PERIOD_CLOSED', `期间「${period.name}」已结账，无法录入。请先反结账`, { periodId: period.id })]);
  }
  return ok();
}

/** 校验期间可用于删除事件 */
export function validatePeriodOpenForDelete(period: Period | undefined): ValidationResult {
  if (!period) return fail([err('PERIOD_NOT_FOUND', '期间不存在')]);
  if (period.status === 'CLOSED') {
    return fail([err('PERIOD_CLOSED_DELETE', `期间「${period.name}」已结账，无法删除事件，请先反结账`, { periodId: period.id })]);
  }
  return ok();
}

/**
 * 校验科目是否可以删除（不能有子科目、不能被分录/报表引用）
 * report / entry 引用检查由 store 层传入 counts 完成，这里只做结构校验。
 */
export function validateAccountDeletable(
  code: string,
  accounts: Account[],
  usedByEntries: boolean,
  usedByReportTree: boolean
): ValidationResult {
  const errors: ValidationError[] = [];
  const hasChildren = accounts.some((a) => a.parentCode === code);
  if (hasChildren) errors.push(err('HAS_CHILDREN', '科目下还有子科目，无法删除'));
  if (usedByEntries) errors.push(err('USED_BY_ENTRIES', '该科目已被分录使用，无法删除'));
  if (usedByReportTree) errors.push(err('USED_BY_REPORT', '该科目已被报表引用，无法删除'));
  return errors.length === 0 ? ok() : fail(errors);
}
