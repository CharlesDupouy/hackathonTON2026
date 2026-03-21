// Payment verification logic
// For the hackathon, we trust the client-side transaction hash
// In production, you would verify on-chain using TonClient

import * as queries from '../db/queries';

/**
 * Verify a payment from a member.
 * For the hackathon: trust the txHash from TON Connect UI.
 * In production: fetch the transaction from the blockchain and verify amount/sender.
 */
export function verifyPayment(
  tripId: number,
  memberId: number,
  txHash: string
): { success: boolean; allPaid: boolean } {
  const payment = queries.getPaymentByMember(tripId, memberId);
  if (!payment) {
    return { success: false, allPaid: false };
  }

  if (payment.status === 'paid') {
    // Already paid
    const payments = queries.getPayments(tripId);
    const allPaid = payments.every((p) => p.status === 'paid');
    return { success: true, allPaid };
  }

  // Mark as paid
  queries.updatePaymentStatus(payment.id, 'paid', payment.amount_due, txHash);

  // Check if all payments are now complete
  const payments = queries.getPayments(tripId);
  const allPaid = payments.every((p) => p.status === 'paid');

  return { success: true, allPaid };
}
