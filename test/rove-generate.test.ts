import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rove from '../src/datasets/rove/generate';

const NAIVE_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

test('rove clean core generates deterministic, funnel-consistent, believable data', () => {
  const d1 = rove.generate(rove.SEED);
  const d2 = rove.generate(rove.SEED);
  assert.deepEqual(d1, d2); // deterministic

  assert.ok(d1.orders.length >= 100000, `expected >= 100000 orders, got ${d1.orders.length}`);

  // funnel monotonic where present; delivered orders have all four timestamps; canceled orders
  // have consistent trailing NULLs; amount_cents reconciles for every order; timestamps are naive
  for (const o of d1.orders as any[]) {
    for (const field of [o.placed_at, o.accepted_at, o.picked_up_at, o.delivered_at, o.cancelled_at]) {
      if (field !== null) assert.ok(NAIVE_TS_RE.test(field), `timestamp ${field} is not a naive "YYYY-MM-DD HH:MM:SS" string`);
    }

    const placed = Date.parse(`${o.placed_at}Z`);
    if (o.accepted_at !== null) {
      const accepted = Date.parse(`${o.accepted_at}Z`);
      assert.ok(accepted >= placed, `order ${o.order_id} accepted_at < placed_at`);
      if (o.picked_up_at !== null) {
        const pickedUp = Date.parse(`${o.picked_up_at}Z`);
        assert.ok(pickedUp >= accepted, `order ${o.order_id} picked_up_at < accepted_at`);
        if (o.delivered_at !== null) {
          const delivered = Date.parse(`${o.delivered_at}Z`);
          assert.ok(delivered >= pickedUp, `order ${o.order_id} delivered_at < picked_up_at`);
        }
      }
    }

    if (o.status === 'delivered') {
      assert.ok(o.accepted_at !== null, `delivered order ${o.order_id} missing accepted_at`);
      assert.ok(o.picked_up_at !== null, `delivered order ${o.order_id} missing picked_up_at`);
      assert.ok(o.delivered_at !== null, `delivered order ${o.order_id} missing delivered_at`);
      assert.equal(o.cancelled_at, null, `delivered order ${o.order_id} has cancelled_at set`);
    }

    if (o.status === 'cancelled') {
      assert.ok(o.cancelled_at !== null, `cancelled order ${o.order_id} missing cancelled_at`);
      assert.equal(o.delivered_at, null, `cancelled order ${o.order_id} has delivered_at set`);
      if (o.accepted_at === null) {
        assert.equal(o.picked_up_at, null, `cancelled order ${o.order_id} has picked_up_at without accepted_at`);
      }
      if (o.picked_up_at === null) {
        // consistent trailing NULL: nothing further downstream should be set (already covered by
        // delivered_at check above)
      }
    } else {
      assert.equal(o.cancelled_at, null, `non-cancelled order ${o.order_id} has cancelled_at set`);
    }

    const expectedAmount = o.subtotal_cents + o.delivery_fee_cents + (o.tip_cents ?? 0) - o.discount_cents;
    assert.equal(o.amount_cents, expectedAmount, `order ${o.order_id} amount_cents does not reconcile`);
  }

  // every master_customer_id distinct in the clean core (one row per person, no dups yet)
  const masterIds = (d1.customers as any[]).map((c) => c.master_customer_id);
  assert.equal(new Set(masterIds).size, masterIds.length, 'master_customer_id values are not all distinct');

  // cohorts span >= 12 distinct signup months
  const months = new Set((d1.customers as any[]).map((c) => String(c.signup_ts).slice(0, 7)));
  assert.ok(months.size >= 12, `expected >= 12 distinct signup months, got ${months.size}`);

  // naive timestamps (no timezone suffix) across every timestamp-bearing table
  const timestampSamples: string[] = [
    ...(d1.customers as any[]).slice(0, 50).map((c) => c.signup_ts),
    ...(d1.couriers as any[]).slice(0, 50).map((c) => c.applied_at),
    ...(d1.payments as any[]).slice(0, 50).map((p) => p.authorized_at),
    ...(d1.event_log as any[]).slice(0, 50).map((e) => e.event_ts),
    ...(d1.ratings as any[]).slice(0, 50).map((r) => r.rated_at),
    ...(d1.support_tickets as any[]).slice(0, 50).map((t) => t.opened_at),
  ];
  for (const ts of timestampSamples) {
    assert.ok(NAIVE_TS_RE.test(ts), `timestamp ${ts} is not naive (no tz suffix)`);
  }
});
