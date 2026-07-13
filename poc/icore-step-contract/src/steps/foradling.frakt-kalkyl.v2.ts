import type { OrderIM, Step, StepMeta } from '../types.js';

export const meta: StepMeta = {
  name: 'foradling.frakt-kalkyl',
  version: '2.1.0',
};

/**
 * v2 replaces the flat per-line fee with a delivery-zone base fee, derived
 * from the postcode's first digit, plus a lower per-line fee. Same
 * contract as v1 (OrderIM -> OrderIM & { freightCost }), so a customer's
 * pipeline can point at whichever version it wants without touching the
 * mapping steps on either side.
 */
export const run: Step<OrderIM, OrderIM & { freightCost: number }> = async (order, ctx) => {
  const PER_LINE_FEE = 33;
  const ZONE_BASE_FEE: Record<string, number> = {
    '1': 79, '2': 79, // storstad
    '3': 99, '4': 99, '5': 99, '6': 99, // tatort
    '0': 129, '7': 129, '8': 129, '9': 129, // gles bygd
  };

  const zoneDigit = order.deliveryAddress.postalCode.trim()[0] ?? '9';
  const baseFee = ZONE_BASE_FEE[zoneDigit] ?? 129;
  const freightCost = baseFee + order.lines.length * PER_LINE_FEE;

  ctx.log('frakt-kalkyl v2 klar', { orderId: order.id, freightCost, zoneDigit });

  return { ...order, freightCost };
};
