/**
 * Future service boundary for an account credit system.
 *
 * Documented placeholder only. Do NOT implement authentication, payments,
 * Stripe, real credits, or fake credit balances here. Asset Bench V1 is
 * fully free and local — this file exists purely so a future commercial
 * layer has a clear seam to slot into, without touching tool code.
 */
export class CreditService {
  async getBalance() {
    throw new Error('CreditService.getBalance() is not implemented — accounts/credits do not exist yet.');
  }

  /** @param {number} _amount */
  async deduct(_amount) {
    throw new Error('CreditService.deduct() is not implemented yet.');
  }

  async listPacks() {
    throw new Error('CreditService.listPacks() is not implemented yet.');
  }
}
