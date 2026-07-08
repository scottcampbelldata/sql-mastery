import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rove from '../src/datasets/rove/generate';

const NAIVE_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

test('rove clean core generates deterministic, funnel-consistent, believable data', () => {
  const d1 = rove.generateClean(rove.SEED);
  const d2 = rove.generateClean(rove.SEED);
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

  // In-flight orders (believability #1): a realistic operational snapshot always has some orders
  // still in progress at DATASET_END_MS. Every sub-stage keeps cancelled_at/delivered_at NULL and
  // carries exactly the trailing NULLs (and courier presence/absence) its stage implies.
  const inFlightStatuses = new Set(['placed', 'accepted', 'picked_up']);
  let inFlightCount = 0;
  for (const o of d1.orders as any[]) {
    if (!inFlightStatuses.has(o.status)) continue;
    inFlightCount += 1;
    assert.equal(o.cancelled_at, null, `in-flight order ${o.order_id} (${o.status}) has cancelled_at set`);
    assert.equal(o.delivered_at, null, `in-flight order ${o.order_id} (${o.status}) has delivered_at set`);
    if (o.status === 'placed') {
      assert.equal(o.accepted_at, null, `placed order ${o.order_id} has accepted_at set`);
      assert.equal(o.picked_up_at, null, `placed order ${o.order_id} has picked_up_at set`);
      assert.equal(o.courier_id, null, `placed order ${o.order_id} has a courier_id set`);
    } else if (o.status === 'accepted') {
      assert.ok(o.accepted_at !== null, `accepted order ${o.order_id} missing accepted_at`);
      assert.equal(o.picked_up_at, null, `accepted order ${o.order_id} has picked_up_at set`);
      assert.ok(o.courier_id !== null, `accepted order ${o.order_id} missing courier_id`);
    } else {
      assert.ok(o.accepted_at !== null, `picked_up order ${o.order_id} missing accepted_at`);
      assert.ok(o.picked_up_at !== null, `picked_up order ${o.order_id} missing picked_up_at`);
      assert.ok(o.courier_id !== null, `picked_up order ${o.order_id} missing courier_id`);
    }
  }
  assert.ok(inFlightCount > 0, 'expected some in-flight (placed/accepted/picked_up) orders to exist');
  const inFlightRate = inFlightCount / d1.orders.length;
  assert.ok(
    inFlightRate >= 0.03 && inFlightRate <= 0.1,
    `in-flight order rate ${inFlightRate.toFixed(4)} outside the expected [0.03, 0.10] band`
  );

  // every master_customer_id distinct in the clean core (one row per person, no dups yet)
  const masterIds = (d1.customers as any[]).map((c) => c.master_customer_id);
  assert.equal(new Set(masterIds).size, masterIds.length, 'master_customer_id values are not all distinct');

  // cohorts span >= 12 distinct signup months
  const months = new Set((d1.customers as any[]).map((c) => String(c.signup_ts).slice(0, 7)));
  assert.ok(months.size >= 12, `expected >= 12 distinct signup months, got ${months.size}`);

  // Retention curve (believability #2): take the largest of the first 12 signup-month cohorts and,
  // for tenure offsets 0..3, count distinct cohort customers with >= 1 order placed in that offset
  // month. The spec targets a smooth ~100/48/33/26/22...% decay; verify the realized curve is
  // monotonic non-increasing and that month-3 activity, relative to month-0, lands in [0.20, 0.34]
  // (i.e. materially steeper than a shallow ~0.49 falloff).
  {
    const monthKey = (ts: string): string => ts.slice(0, 7);
    const addMonths = (ym: string, n: number): string => {
      const [y, mo] = ym.split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1 + n, 1));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const cohortOfCustomer = new Map<number, string>();
    const cohortSizes = new Map<string, number>();
    for (const c of d1.customers as any[]) {
      const m = monthKey(c.signup_ts as string);
      cohortOfCustomer.set(c.customer_id as number, m);
      cohortSizes.set(m, (cohortSizes.get(m) ?? 0) + 1);
    }
    const first12 = [...cohortSizes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, 12);
    const bestCohort = [...first12].sort((a, b) => b[1] - a[1])[0][0];
    const cohortCustomerIds = new Set(
      [...cohortOfCustomer.entries()].filter(([, m]) => m === bestCohort).map(([id]) => id)
    );

    const activeByOffset: Set<number>[] = [0, 1, 2, 3].map(() => new Set());
    for (const o of d1.orders as any[]) {
      const custId = o.customer_id as number;
      if (!cohortCustomerIds.has(custId)) continue;
      const orderMonth = monthKey(o.placed_at as string);
      for (let off = 0; off <= 3; off += 1) {
        if (orderMonth === addMonths(bestCohort, off)) activeByOffset[off].add(custId);
      }
    }
    const curve = activeByOffset.map((s) => s.size);
    assert.ok(curve[0] > 0, `expected a non-empty month-0 active cohort, got curve=[${curve.join(', ')}]`);
    for (let i = 1; i < curve.length; i += 1) {
      assert.ok(curve[i] <= curve[i - 1], `retention curve is not monotonic non-increasing: [${curve.join(', ')}]`);
    }
    const month3Ratio = curve[3] / curve[0];
    assert.ok(
      month3Ratio >= 0.2 && month3Ratio <= 0.34,
      `month-3 retention ratio ${month3Ratio.toFixed(3)} outside [0.20, 0.34] (curve=[${curve.join(', ')}])`
    );
  }

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

  // Courier-activation consistency: an assigned courier must have been active (activated, not yet
  // churned) at the order's accepted_at, and every order that reached accepted/picked_up/delivered
  // must carry a non-null courier_id. Guards against the "no active courier in city" fallback ever
  // assigning an inactive home-city courier instead of cancelling the order.
  const courierWindowById = new Map<number, { activatedMs: number | null; churnedMs: number | null }>();
  for (const c of d1.couriers as any[]) {
    courierWindowById.set(c.courier_id as number, {
      activatedMs: c.activated_at === null ? null : Date.parse(`${c.activated_at}Z`),
      churnedMs: c.churned_at === null ? null : Date.parse(`${c.churned_at}Z`),
    });
  }

  let courierNotActiveAtAccept = 0;
  let acceptedOrLaterMissingCourier = 0;
  for (const o of d1.orders as any[]) {
    if (o.courier_id !== null) {
      const window = courierWindowById.get(o.courier_id as number);
      const acceptedMs = o.accepted_at === null ? null : Date.parse(`${o.accepted_at}Z`);
      const active =
        window !== undefined &&
        acceptedMs !== null &&
        window.activatedMs !== null &&
        window.activatedMs <= acceptedMs &&
        (window.churnedMs === null || window.churnedMs > acceptedMs);
      if (!active) courierNotActiveAtAccept += 1;
    }

    if ((o.status === 'accepted' || o.status === 'picked_up' || o.status === 'delivered') && o.courier_id === null) {
      acceptedOrLaterMissingCourier += 1;
    }
  }
  assert.equal(
    courierNotActiveAtAccept,
    0,
    `${courierNotActiveAtAccept} orders have a courier_id that was not active at accepted_at`
  );
  assert.equal(
    acceptedOrLaterMissingCourier,
    0,
    `${acceptedOrLaterMissingCourier} accepted/picked_up/delivered orders have a null courier_id`
  );
});
