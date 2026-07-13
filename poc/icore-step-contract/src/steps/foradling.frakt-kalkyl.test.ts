import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderIM, StepContext } from '../types.js';
import { run as runV1, meta as metaV1 } from './foradling.frakt-kalkyl.js';
import { run as runV2, meta as metaV2 } from './foradling.frakt-kalkyl.v2.js';

// A step only ever touches ctx — never a global — so a test can hand it a
// fake one and run entirely offline, without a database or a live pipeline.
function fakeContext(): StepContext {
  const logs: Array<{ message: string; data?: Record<string, unknown> }> = [];
  return {
    customerId: 'test-customer',
    now: () => new Date('2026-07-13T12:00:00Z'),
    log: (message, data) => logs.push({ message, data }),
  };
}

const sampleOrder: OrderIM = {
  id: 'SE-100293',
  customerName: 'Nordic Lager AB',
  date: '2026-07-11',
  deliveryAddress: { street: 'Hamngatan 4', postalCode: '41103', city: 'Göteborg' },
  lines: [
    { sku: 'ART-4471', quantity: 12, unitPrice: 249 },
    { sku: 'ART-2210', quantity: 3, unitPrice: 89 },
    { sku: 'ART-9981', quantity: 1, unitPrice: 1490 },
  ],
};

test('fraktkalkyl v1: bas + fast avgift per rad', async () => {
  const result = await runV1(sampleOrder, fakeContext());
  assert.equal(result.freightCost, 214);
  // Steget lägger bara till ett fält -- resten av ordern ska vara orörd,
  // annars kan nästa steg i kedjan tappa data det förväntade sig fanns kvar.
  assert.equal(result.id, sampleOrder.id);
  assert.equal(result.lines.length, sampleOrder.lines.length);
});

test('fraktkalkyl v2: zonbaserad avgift ger annat men rimligt pris', async () => {
  const result = await runV2(sampleOrder, fakeContext());
  assert.equal(result.freightCost, 198);
});

test('v1 och v2 delar samma kontrakt (samma fält in, samma fält ut)', async () => {
  assert.equal(metaV1.name, metaV2.name);
  assert.notEqual(metaV1.version, metaV2.version);

  const r1 = await runV1(sampleOrder, fakeContext());
  const r2 = await runV2(sampleOrder, fakeContext());
  assert.deepEqual(Object.keys(r1).sort(), Object.keys(r2).sort());
});

test('tom order (inga rader) kraschar inte, ger bara basavgiften', async () => {
  const emptyOrder: OrderIM = { ...sampleOrder, lines: [] };
  const result = await runV1(emptyOrder, fakeContext());
  assert.equal(result.freightCost, 49);
});
