import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rove from '../src/datasets/rove/generate';
import { SYNONYM_MAP, EMAIL_TYPO_MAP, NULL_SENTINELS, NICKNAME_MAP } from '../src/datasets/rove/mess';
import { parseTimestamp } from '../src/datasets/framework/dates';

type Row = Record<string, any>;

function inBand(rate: number, lo: number, hi: number, label: string): void {
  assert.ok(rate >= lo && rate <= hi, `${label}: rate ${rate.toFixed(4)} not in [${lo}, ${hi}]`);
}

// Committed cleaning recipe for every enum-style dirty column (orders.status, payments.status,
// payments.method, couriers.status, couriers.vehicle_type, support_tickets.category):
// LOWER(TRIM(dirty)), then SYNONYM_MAP lookup, falling back to the lowered/trimmed form itself.
function cleanEnum(dirty: string): string {
  const key = dirty.trim().toLowerCase();
  return SYNONYM_MAP[key] ?? key;
}

// Committed cleaning recipe for customers.email: LOWER, strip ALL whitespace, strip a leading
// "mailto:", then correct the domain via EMAIL_TYPO_MAP (falling back to the domain as-is).
function cleanEmailKey(dirty: string): string {
  let s = dirty.trim().toLowerCase().replace(/\s+/g, '');
  if (s.startsWith('mailto:')) s = s.slice(7);
  const at = s.lastIndexOf('@');
  if (at < 0) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  return `${local}@${EMAIL_TYPO_MAP[domain] ?? domain}`;
}

function centsFromLegacy(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const stripped = String(v).replace(/[^0-9.]/g, '');
  if (stripped === '') return null;
  return Math.round(parseFloat(stripped) * 100);
}

test('rove mess layer: every injected defect is present at its target rate and reversible to the clean answer key', () => {
  const clean = rove.generateClean(rove.SEED);
  const messy = rove.generate(rove.SEED);

  // ---- R01 / R02: enum casing + whitespace + synonym variance -------------------------------

  {
    const cleanStatusByOrderId = new Map<number, string>();
    for (const o of clean.orders as Row[]) cleanStatusByOrderId.set(o.order_id, o.status);

    let dirtyCount = 0;
    const surfaceForms = new Set<string>();
    for (const o of messy.orders as Row[]) {
      const trueStatus = cleanStatusByOrderId.get(o.order_id)!;
      assert.ok(rove.CANONICAL.orderStatus.includes(trueStatus));
      assert.equal(cleanEnum(String(o.status)), trueStatus, `order ${o.order_id} status "${o.status}" does not recover to "${trueStatus}"`);
      surfaceForms.add(String(o.status));
      if (String(o.status) !== trueStatus) dirtyCount += 1;
    }
    inBand(dirtyCount / (messy.orders as Row[]).length, 0.4, 0.65, 'orders.status dirty rate (R01+R02)');
    assert.ok(surfaceForms.size > rove.CANONICAL.orderStatus.length, 'orders.status should show more surface forms than canonical values');
  }

  {
    const cleanByPaymentId = new Map<number, { status: string; method: string }>();
    for (const p of clean.payments as Row[]) cleanByPaymentId.set(p.payment_id, { status: p.status, method: p.method });

    let statusDirty = 0;
    let methodDirty = 0;
    let checked = 0;
    for (const p of messy.payments as Row[]) {
      const truth = cleanByPaymentId.get(p.payment_id);
      if (!truth) continue; // R16 duplicate row, no direct clean counterpart by this id
      checked += 1;
      assert.equal(cleanEnum(String(p.status)), truth.status, `payment ${p.payment_id} status does not recover`);
      assert.equal(cleanEnum(String(p.method)), truth.method, `payment ${p.payment_id} method does not recover`);
      if (String(p.status) !== truth.status) statusDirty += 1;
      if (String(p.method) !== truth.method) methodDirty += 1;
    }
    inBand(statusDirty / checked, 0.4, 0.65, 'payments.status dirty rate (R01+R02)');
    inBand(methodDirty / checked, 0.3, 0.5, 'payments.method dirty rate (R01 only)');
  }

  {
    let statusDirty = 0;
    let vehicleDirty = 0;
    const couriers = messy.couriers as Row[];
    const cleanByCourierId = new Map<number, { status: string; vehicle_type: string }>();
    for (const c of clean.couriers as Row[]) cleanByCourierId.set(c.courier_id, { status: c.status, vehicle_type: c.vehicle_type });
    for (const c of couriers) {
      const truth = cleanByCourierId.get(c.courier_id)!;
      assert.equal(cleanEnum(String(c.status)), truth.status, `courier ${c.courier_id} status does not recover`);
      assert.equal(cleanEnum(String(c.vehicle_type)), truth.vehicle_type, `courier ${c.courier_id} vehicle_type does not recover`);
      if (String(c.status) !== truth.status) statusDirty += 1;
      if (String(c.vehicle_type) !== truth.vehicle_type) vehicleDirty += 1;
    }
    inBand(statusDirty / couriers.length, 0.3, 0.5, 'couriers.status dirty rate (R01 only)');
    inBand(vehicleDirty / couriers.length, 0.4, 0.65, 'couriers.vehicle_type dirty rate (R01+R02)');
  }

  {
    let dirty = 0;
    const tickets = messy.support_tickets as Row[];
    const cleanByTicketId = new Map<number, string>();
    for (const t of clean.support_tickets as Row[]) cleanByTicketId.set(t.ticket_id, t.category);
    for (const t of tickets) {
      const truth = cleanByTicketId.get(t.ticket_id)!;
      assert.equal(cleanEnum(String(t.category)), truth, `ticket ${t.ticket_id} category does not recover`);
      if (String(t.category) !== truth) dirty += 1;
    }
    inBand(dirty / tickets.length, 0.4, 0.65, 'support_tickets.category dirty rate (R01+R02)');
  }

  // ---- R03: duplicate customer entities ------------------------------------------------------

  {
    const cleanCustomers = clean.customers as Row[];
    const messyCustomers = messy.customers as Row[];
    const totalPeople = new Set(cleanCustomers.map((c) => c.master_customer_id)).size;
    assert.equal(totalPeople, cleanCustomers.length, 'clean core should have zero duplicate master_customer_id');

    const dupRate = (messyCustomers.length - totalPeople) / totalPeople;
    inBand(dupRate, 0.02, 0.08, 'customers duplicate-row rate (R03)');

    const masterByNormalizedEmail = new Map<string, Set<number>>();
    for (const c of messyCustomers) {
      const key = cleanEmailKey(String(c.email));
      if (!masterByNormalizedEmail.has(key)) masterByNormalizedEmail.set(key, new Set());
      masterByNormalizedEmail.get(key)!.add(c.master_customer_id);
    }
    for (const [key, ids] of masterByNormalizedEmail) {
      assert.equal(ids.size, 1, `normalized email "${key}" spans multiple master_customer_id: ${[...ids].join(',')}`);
    }
    assert.equal(
      masterByNormalizedEmail.size,
      totalPeople,
      `grouping by normalized email should recover exactly ${totalPeople} people, got ${masterByNormalizedEmail.size}`
    );
  }

  // ---- R04: phone format variance (customers + couriers) -------------------------------------

  function checkPhoneReversibility(cleanRows: Row[], messyRows: Row[], idField: string, label: string): void {
    const cleanById = new Map<number, string>();
    for (const r of cleanRows) cleanById.set(r[idField], r.phone);
    let nonCanonical = 0;
    let checked = 0;
    for (const r of messyRows) {
      const truePhone = cleanById.get(r[idField]);
      if (truePhone === undefined) continue; // R03 duplicate row
      const dirty = String(r.phone);
      if (NULL_SENTINELS.includes(dirty)) continue; // R15 slice, not a format variant
      checked += 1;
      if (dirty !== truePhone) nonCanonical += 1;
      const digits = dirty.replace(/\D/g, '');
      const trueDigits = truePhone.replace(/\D/g, '');
      assert.equal(digits.slice(-10), trueDigits.slice(-10), `${label} ${r[idField]} phone "${dirty}" digits do not match "${truePhone}"`);
    }
    inBand(nonCanonical / checked, 0.4, 0.75, `${label}.phone non-canonical-format rate (R04)`);
  }

  checkPhoneReversibility(clean.customers as Row[], messy.customers as Row[], 'customer_id', 'customers');
  checkPhoneReversibility(clean.couriers as Row[], messy.couriers as Row[], 'courier_id', 'couriers');

  // ---- R05: email variance + domain typos -----------------------------------------------------

  {
    const cleanByCustomerId = new Map<number, string>();
    for (const c of clean.customers as Row[]) cleanByCustomerId.set(c.customer_id, c.email);
    let nonCanonical = 0;
    let typoCount = 0;
    let checked = 0;
    for (const c of messy.customers as Row[]) {
      const trueEmail = cleanByCustomerId.get(c.customer_id);
      if (trueEmail === undefined) continue; // R03 duplicate row
      checked += 1;
      const dirty = String(c.email);
      if (dirty !== trueEmail) nonCanonical += 1;
      assert.equal(cleanEmailKey(dirty), trueEmail.toLowerCase(), `customer ${c.customer_id} email "${dirty}" does not recover to "${trueEmail}"`);
      const domain = dirty.trim().toLowerCase().slice(dirty.trim().toLowerCase().lastIndexOf('@') + 1);
      if (EMAIL_TYPO_MAP[domain]) typoCount += 1;
    }
    inBand(nonCanonical / checked, 0.25, 0.55, 'customers.email non-canonical rate (R05)');
    inBand(typoCount / checked, 0.005, 0.05, 'customers.email domain-typo rate (R05)');
  }

  // ---- Nickname substitution + R15 sentinel slice on customers.full_name --------------------

  {
    const cleanByCustomerId = new Map<number, string>();
    for (const c of clean.customers as Row[]) cleanByCustomerId.set(c.customer_id, c.full_name);
    let nicknameHits = 0;
    let sentinelHits = 0;
    let checked = 0;
    for (const c of messy.customers as Row[]) {
      const trueName = cleanByCustomerId.get(c.customer_id);
      if (trueName === undefined) continue; // R03 duplicate row
      checked += 1;
      const dirty = String(c.full_name);
      if (NULL_SENTINELS.includes(dirty)) {
        sentinelHits += 1;
        continue;
      }
      const tokens = dirty.trim().split(/\s+/);
      const trueFirst = trueName.split(' ')[0].toLowerCase();
      const recoveredFirst = NICKNAME_MAP[tokens[0].toLowerCase()] ?? tokens[0].toLowerCase();
      assert.equal(recoveredFirst, trueFirst, `customer ${c.customer_id} full_name "${dirty}" does not recover given name "${trueFirst}"`);
      if (tokens[0].toLowerCase() !== trueFirst) nicknameHits += 1;
    }
    assert.ok(nicknameHits > 0, 'expected some nickname substitutions in customers.full_name');
    inBand(sentinelHits / checked, 0.01, 0.06, 'customers.full_name null-sentinel rate (R15)');
  }

  // ---- R06: money-as-text legacy columns ------------------------------------------------------

  function checkMoneyLegacy(rows: Row[], legacyField: string, amountField: string, label: string): void {
    let nullCount = 0;
    let nonPlainCount = 0;
    for (const r of rows) {
      const cents = centsFromLegacy(r[legacyField]);
      if (cents === null) {
        nullCount += 1;
        continue;
      }
      assert.equal(cents, r[amountField], `${label} ${legacyField} "${r[legacyField]}" does not reconcile to ${amountField}=${r[amountField]}`);
      if (String(r[legacyField]) !== (r[amountField] / 100).toFixed(2)) nonPlainCount += 1;
    }
    inBand(nullCount / rows.length, 0.02, 0.07, `${label}.${legacyField} null/empty rate (R06)`);
    inBand(nonPlainCount / rows.length, 0.2, 0.4, `${label}.${legacyField} non-plain rate (R06)`);
  }

  checkMoneyLegacy(messy.orders as Row[], 'order_total_legacy', 'amount_cents', 'orders');
  checkMoneyLegacy(messy.payments as Row[], 'amount_legacy', 'amount_cents', 'payments');

  // ---- R08 (+ R15 slice): orphaned/dirty promo_code -------------------------------------------

  {
    const promoCodeByPromoId = new Map<number, string>();
    for (const p of clean.promos as Row[]) promoCodeByPromoId.set(p.promo_id, p.code);

    let codedCount = 0;
    let orphanCount = 0;
    for (const o of messy.orders as Row[]) {
      if (o.promo_id === null) continue;
      codedCount += 1;
      assert.ok(promoCodeByPromoId.has(o.promo_id), `order ${o.order_id} promo_id ${o.promo_id} is not a real promo (should never be touched)`);
      const truth = promoCodeByPromoId.get(o.promo_id)!;
      const dirty = o.promo_code === null ? '' : String(o.promo_code).trim().toUpperCase();
      if (dirty !== truth.toUpperCase()) orphanCount += 1;
    }
    inBand(orphanCount / codedCount, 0.06, 0.14, 'orders.promo_code orphan rate among coded orders (R08)');

    let nullEligible = 0;
    let sentinelCount = 0;
    for (const o of messy.orders as Row[]) {
      if (o.promo_id !== null) continue;
      nullEligible += 1;
      if (o.promo_code !== null) {
        assert.ok(NULL_SENTINELS.includes(String(o.promo_code)), `order ${o.order_id} has an unexpected non-null promo_code "${o.promo_code}" with no promo_id`);
        sentinelCount += 1;
      }
    }
    inBand(sentinelCount / nullEligible, 0.02, 0.07, 'orders.promo_code null-sentinel rate (R15)');
  }

  // ---- R09: orphaned / soft-deleted orders.customer_id / orders.courier_id -------------------

  // Measured as a messy-vs-clean diff at the same array position (order count and order never
  // change), which isolates R09's own injection rate from the ambient rate at which an
  // UNTOUCHED order's original customer_id simply happens to belong to a customer that R13
  // independently flagged is_deleted (both are real, expected effects, but only the former is
  // R09's own target rate).
  {
    const cleanOrders = clean.orders as Row[];
    const messyOrders = messy.orders as Row[];
    assert.equal(cleanOrders.length, messyOrders.length, 'R09 must not change the order row count');

    const customerIds = new Set((messy.customers as Row[]).map((c) => c.customer_id));
    const deletedCustomerIds = new Set((messy.customers as Row[]).filter((c) => c.is_deleted).map((c) => c.customer_id));
    const courierIds = new Set((messy.couriers as Row[]).map((c) => c.courier_id));

    let custTouched = 0;
    let courierTouched = 0;
    let courierEligible = 0;
    for (let i = 0; i < cleanOrders.length; i += 1) {
      const cleanO = cleanOrders[i];
      const messyO = messyOrders[i];
      if (messyO.customer_id !== cleanO.customer_id) {
        custTouched += 1;
        // Reversible: the new id either resolves to nothing (purged, correct LEFT JOIN miss) or
        // resolves to a real row flagged is_deleted (soft-deleted, still recoverable in the dim).
        assert.ok(
          !customerIds.has(messyO.customer_id) || deletedCustomerIds.has(messyO.customer_id),
          `order ${messyO.order_id} R09-touched customer_id ${messyO.customer_id} is neither purged nor soft-deleted`
        );
      }
      if (cleanO.courier_id !== null) {
        courierEligible += 1;
        if (messyO.courier_id !== cleanO.courier_id) {
          courierTouched += 1;
          assert.ok(!courierIds.has(messyO.courier_id), `order ${messyO.order_id} R09-touched courier_id ${messyO.courier_id} unexpectedly resolves to a real courier`);
        }
      }
    }
    inBand(custTouched / cleanOrders.length, 0.008, 0.025, 'orders.customer_id R09 injection rate');
    inBand(courierTouched / courierEligible, 0.008, 0.025, 'orders.courier_id R09 injection rate');
  }

  // ---- R10: duplicate event_log rows -----------------------------------------------------------

  {
    const events = messy.event_log as Row[];
    const groups = new Map<string, Row[]>();
    for (const e of events) {
      const key = `${e.session_id}|${e.event_type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    let extraCount = 0;
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      rows.sort((a, b) => (a.event_id as number) - (b.event_id as number));
      const canonical = rows[0];
      for (let i = 1; i < rows.length; i += 1) {
        extraCount += 1;
        assert.equal(rows[i].customer_id, canonical.customer_id, 'duplicate event row customer_id mismatch');
        assert.equal(rows[i].order_id, canonical.order_id, 'duplicate event row order_id mismatch');
        assert.equal(rows[i].city_id, canonical.city_id, 'duplicate event row city_id mismatch');
        assert.ok((rows[i].event_id as number) > (canonical.event_id as number), 'duplicate event row should carry a later event_id than its canonical row');
      }
    }
    inBand(extraCount / events.length, 0.02, 0.06, 'event_log duplicate-row rate (R10)');
  }

  // ---- R11: out-of-order events (bounded clock-skew) -------------------------------------------

  {
    const cleanTsByEventId = new Map<number, string>();
    for (const e of clean.event_log as Row[]) cleanTsByEventId.set(e.event_id, e.event_ts);

    let skewed = 0;
    let checked = 0;
    const bySession = new Map<string, { eventId: number; trueTs: string }[]>();
    for (const e of messy.event_log as Row[]) {
      const trueTs = cleanTsByEventId.get(e.event_id);
      if (trueTs === undefined) continue; // R10 duplicate row
      checked += 1;
      if (e.event_ts !== trueTs) {
        skewed += 1;
        const skewSec = Math.abs(parseTimestamp(String(e.event_ts)) - parseTimestamp(trueTs)) / 1000;
        assert.ok(skewSec <= 180, `event ${e.event_id} skew ${skewSec}s exceeds the 180s bound`);
      }
      if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
      bySession.get(e.session_id)!.push({ eventId: e.event_id, trueTs });
    }
    inBand(skewed / checked, 0.04, 0.11, 'event_log clock-skew rate (R11)');

    // Reversibility: ORDER BY event_id always recovers the true chronological order within a
    // session, even where event_ts has been skewed.
    let sessionsChecked = 0;
    for (const rows of bySession.values()) {
      if (rows.length < 2) continue;
      sessionsChecked += 1;
      const byEventId = [...rows].sort((a, b) => a.eventId - b.eventId).map((r) => r.eventId);
      const byTrueTs = [...rows]
        .sort((a, b) => (a.trueTs < b.trueTs ? -1 : a.trueTs > b.trueTs ? 1 : a.eventId - b.eventId))
        .map((r) => r.eventId);
      assert.deepEqual(byEventId, byTrueTs, 'ORDER BY event_id should recover the true chronological order within a session');
    }
    assert.ok(sessionsChecked > 1000, `expected > 1000 multi-event sessions to check ordering recovery on, got ${sessionsChecked}`);
  }

  // ---- R12: out-of-range / sentinel ratings ------------------------------------------------------

  {
    const VALID = new Set([1, 2, 3, 4, 5]);
    const OUT_OF_RANGE = new Set([6, -1, 99]);
    let zeroCount = 0;
    let outOfRangeCount = 0;
    const ratings = messy.ratings as Row[];
    for (const r of ratings) {
      const s = r.stars as number;
      assert.ok(VALID.has(s) || s === 0 || OUT_OF_RANGE.has(s), `rating ${r.rating_id} stars ${s} outside the declared domain {1..5, 0, 6, -1, 99}`);
      if (s === 0) zeroCount += 1;
      else if (OUT_OF_RANGE.has(s)) outOfRangeCount += 1;
    }
    inBand(zeroCount / ratings.length, 0.06, 0.14, 'ratings.stars null-sentinel(0) rate (R12)');
    inBand(outOfRangeCount / ratings.length, 0.015, 0.05, 'ratings.stars out-of-range rate (R12)');
  }

  // ---- R13: soft-deleted rows present, clean never-null boolean flag ---------------------------

  {
    const customers = messy.customers as Row[];
    const tickets = messy.support_tickets as Row[];
    const custDeleted = customers.filter((c) => c.is_deleted === true).length;
    const ticketDeleted = tickets.filter((t) => t.is_deleted === true).length;

    inBand(custDeleted / customers.length, 0.02, 0.06, 'customers.is_deleted rate (R13)');
    inBand(ticketDeleted / tickets.length, 0.02, 0.06, 'support_tickets.is_deleted rate (R13)');
    for (const c of customers) assert.equal(typeof c.is_deleted, 'boolean', `customer ${c.customer_id} is_deleted is not a clean boolean`);
    for (const t of tickets) assert.equal(typeof t.is_deleted, 'boolean', `ticket ${t.ticket_id} is_deleted is not a clean boolean`);

    // WHERE NOT is_deleted cleanly excludes exactly the flagged rows; they remain present
    // (un-filtered) in the raw table, which is the entire point of the R13 trap.
    const filtered = customers.filter((c) => !c.is_deleted);
    assert.equal(filtered.length, customers.length - custDeleted);
  }

  // ---- R16: duplicate / retried payments --------------------------------------------------------

  {
    const payments = messy.payments as Row[];
    const amountByOrderId = new Map<number, number>();
    for (const o of messy.orders as Row[]) amountByOrderId.set(o.order_id, o.amount_cents);

    const byOrder = new Map<number, Row[]>();
    for (const p of payments) {
      if (!byOrder.has(p.order_id)) byOrder.set(p.order_id, []);
      byOrder.get(p.order_id)!.push(p);
    }
    let dupOrders = 0;
    let singleOrders = 0;
    for (const rows of byOrder.values()) {
      if (rows.length > 1) {
        dupOrders += 1;
        rows.sort((a, b) => parseTimestamp(a.authorized_at) - parseTimestamp(b.authorized_at));
        const canonical = rows[0];
        const truth = amountByOrderId.get(canonical.order_id);
        if (truth !== undefined) {
          assert.equal(canonical.amount_cents, truth, `order ${canonical.order_id} canonical (earliest) payment amount does not reconcile`);
        }
      } else {
        singleOrders += 1;
      }
    }
    inBand(dupOrders / (dupOrders + singleOrders), 0.02, 0.07, 'payments duplicate-order rate (R16)');
  }

  // ---- Determinism: the mess layer itself must be reproducible under the same seed -------------

  {
    const messy2 = rove.generate(rove.SEED);
    assert.deepEqual(messy, messy2, 'generate(SEED) is not deterministic across calls');
  }
});
