/**
 * The contract every pipeline step must implement. This is the one thing
 * that has to stay stable across the whole platform — everything else
 * (a step's internals, its dependencies, its version) can change freely
 * as long as the step still satisfies Step<TIn, TOut>.
 *
 * A pipeline is just: Inbound -> Mapping -> Foradling -> Mapping -> Outbound,
 * where every arrow is one Step. Two steps can be swapped, tested, and
 * versioned independently as long as their input/output types line up.
 */
export type Step<TIn, TOut> = (input: TIn, ctx: StepContext) => Promise<TOut>;

/**
 * Dependencies a step is allowed to use, passed in rather than reached for
 * globally. A step that only touches ctx (never process.env, a shared
 * singleton, module-level state, ...) can be unit-tested with a fake
 * context and moved between environments without surprises.
 */
export interface StepContext {
  customerId: string;
  log: (message: string, data?: Record<string, unknown>) => void;
  now: () => Date;
}

/** Identity + version of a step, used by the platform's step catalog/registry. */
export interface StepMeta {
  name: string;
  version: string;
}

/**
 * The canonical "Order" IM model — the same shape used by the Mapping
 * Engine POC (poc/mapping-engine.html). Every Mapping step produces or
 * consumes this shape (or an extension of it); a Foradling step is free to
 * add fields, as long as it still returns everything the next step needs.
 */
export interface OrderIM {
  id: string;
  customerName: string;
  date: string;
  deliveryAddress: {
    street: string;
    postalCode: string;
    city: string;
  };
  lines: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
}
