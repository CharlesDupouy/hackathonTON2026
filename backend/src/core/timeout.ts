import * as queries from '../db/queries';

const activeTimers = new Map<number, NodeJS.Timeout>();

/**
 * Start a 10-minute payment timeout for a trip.
 * If not all payments are completed within the timeout,
 * refund all payments and reset trip to active.
 */
export function startPaymentTimer(
  tripId: number,
  timeoutMs: number = 10 * 60 * 1000,
  onTimeout?: (tripId: number) => void
): void {
  // Clear any existing timer for this trip
  cancelPaymentTimer(tripId);

  const timer = setTimeout(() => {
    const trip = queries.getTripById(tripId);
    if (!trip || trip.status !== 'settling') return;

    // Check if all payments are complete
    const payments = queries.getPayments(tripId);
    const allPaid = payments.every((p) => p.status === 'paid');

    if (!allPaid) {
      // Refund all payments and reset trip
      queries.refundAllPayments(tripId);
      queries.updateTripStatus(tripId, 'active');
      onTimeout?.(tripId);
    }

    activeTimers.delete(tripId);
  }, timeoutMs);

  activeTimers.set(tripId, timer);
}

export function cancelPaymentTimer(tripId: number): void {
  const timer = activeTimers.get(tripId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(tripId);
  }
}

export function hasActiveTimer(tripId: number): boolean {
  return activeTimers.has(tripId);
}

// =============================================
// Game timer (for external mini-game timeout)
// =============================================

const activeGameTimers = new Map<number, NodeJS.Timeout>();

export function startGameTimer(
  tripId: number,
  timeoutMs: number,
  onTimeout: (tripId: number) => void
): void {
  cancelGameTimer(tripId);

  const timer = setTimeout(() => {
    const trip = queries.getTripById(tripId);
    if (!trip || trip.status !== 'playing') return;

    onTimeout(tripId);
    activeGameTimers.delete(tripId);
  }, timeoutMs);

  activeGameTimers.set(tripId, timer);
}

export function cancelGameTimer(tripId: number): void {
  const timer = activeGameTimers.get(tripId);
  if (timer) {
    clearTimeout(timer);
    activeGameTimers.delete(tripId);
  }
}
