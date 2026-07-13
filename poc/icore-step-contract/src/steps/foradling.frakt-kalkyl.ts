import type { OrderIM, Step, StepMeta } from '../types.js';

export const meta: StepMeta = {
  name: 'foradling.frakt-kalkyl',
  version: '1.0.0',
};

/**
 * v1: a flat handling fee plus a fixed cost per order line. Simple, but it
 * doesn't know that a delivery to central Gothenburg is cheaper to route
 * than one to a rural postcode — see v2 for the improved version.
 */
export const run: Step<OrderIM, OrderIM & { freightCost: number }> = async (order, ctx) => {
  const BASE_FEE = 49;
  const PER_LINE_FEE = 55;

  const freightCost = BASE_FEE + order.lines.length * PER_LINE_FEE;

  ctx.log('frakt-kalkyl v1 klar', { orderId: order.id, freightCost });

  return { ...order, freightCost };
};
