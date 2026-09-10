import { defineStore } from 'pinia';
import type { Account } from '@/types';
import { ACCOUNT_MAP, DEFAULT_ACCOUNTS } from '@/data/accounts.config';

interface State {
  accounts: Account[];
}

export const useAccountsStore = defineStore('accounts', {
  state: (): State => ({
    accounts: [...DEFAULT_ACCOUNTS]
  }),
  getters: {
    accountMap(state): Record<string, Account> {
      return state.accounts.reduce((m, a) => ((m[a.code] = a), m), {} as Record<string, Account>);
    },
    leafAccounts(state): Account[] {
      return state.accounts.filter((a) => a.isLeaf);
    },
    rootAccounts(state): Account[] {
      return state.accounts.filter((a) => a.parentCode === null);
    },
    childrenOf(state) {
      return (code: string): Account[] => state.accounts.filter((a) => a.parentCode === code);
    }
  },
  actions: {
    reset() {
      this.accounts = [...DEFAULT_ACCOUNTS];
    }
  },
  persist: {
    key: 'av.v2.accounts'
  }
});
