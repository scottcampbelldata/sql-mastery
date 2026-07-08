// Rove mess injection layer (task 11). Applied OVER the already-committed clean core
// (generateClean in ./generate). Every defect here is DERIVED from the clean value already
// sitting in the row, so it is provably reversible: nothing here invents a fact the clean core
// did not already establish. All randomness comes from the single `rng` passed into injectMess
// (deriveStream(seed, 'mess')), so a given seed always reproduces byte-identical mess.
//
// Column-to-defect map (see docs/superpowers/specs/2026-07-07-owned-datasets-design.md, "Rove
// mess taxonomy", for the R01-R16 definitions):
//   R01 casing/whitespace : orders.status, payments.status, payments.method, couriers.status,
//                            couriers.vehicle_type, support_tickets.category
//   R02 synonyms           : orders.status, payments.status, support_tickets.category,
//                            couriers.vehicle_type (extension: the DDL marks vehicle_type
//                            "dirty casing/synonyms" even though the taxonomy table's "where"
//                            column only lists 3 columns; folded into the same SYNONYM_MAP)
//   R03 duplicate customers: customers (row-set expansion, ~5% of people)
//   R04 phone format       : customers.phone, couriers.phone
//   R05 email variance     : customers.email
//   R06 money-as-text      : orders.order_total_legacy, payments.amount_legacy
//   R07 NULL funnel ts     : already structural in generateClean; nothing injected here
//   R08 orphaned promo_code: orders.promo_code
//   R09 orphaned/soft-deleted refs: orders.customer_id, orders.courier_id
//   R10 duplicate events    : event_log (row-set expansion)
//   R11 clock skew          : event_log.event_ts
//   R12 sentinel ratings    : ratings.stars (0 = null-sentinel, {6,-1,99} = out-of-range noise;
//                              stars stays smallint NOT NULL per the DDL, so a genuine SQL NULL
//                              is not an option -- 0 plays that role, cleaned via NULLIF(stars,0))
//   R13 soft-deleted rows   : customers.is_deleted, support_tickets.is_deleted (re-rolled here,
//                              independent of whatever generateClean assigned, so the rate is
//                              provably this layer's doing)
//   R14 timezone-naive ts   : already structural in generateClean; nothing injected here
//   R15 NULL-as-string      : customers.full_name, customers.phone, orders.promo_code (the
//                              legitimately-null slice). Deliberately NOT applied to
//                              customers.email -- see note on injectCustomerContactMess.
//   R16 duplicate payments  : payments (row-set expansion)
//
// cities/merchants/promos/promo_redemption are never touched: they are the authoritative
// dimensions the rest of the mess is reversible against.

import type { Prng } from '../framework/prng';
import { intBetween, pick, bernoulli, sampleWithout } from '../framework/random';
import { formatTimestamp, parseTimestamp } from '../framework/dates';
import { PROMO_ROOTS } from './pools';

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return String(v);
}

// ---------------------------------------------------------------------------------------------
// Committed finite maps. Each is used both to dirty (here) and, in test/rove-mess.test.ts, to
// clean back to the committed canonical answer key.
// ---------------------------------------------------------------------------------------------

// Lowercase surface form -> canonical enum value. A dirty cell's canonical value is always
// recoverable via: SYNONYM_MAP[cell.trim().toLowerCase()] ?? cell.trim().toLowerCase().
export const SYNONYM_MAP: Record<string, string> = {
  // orders.status: placed | accepted | picked_up | delivered | cancelled
  canceled: 'cancelled',
  cancel: 'cancelled',
  completed: 'delivered',
  fulfilled: 'delivered',
  'picked up': 'picked_up',
  in_transit: 'picked_up',
  'in transit': 'picked_up',
  out_for_delivery: 'picked_up',
  confirmed: 'accepted',
  pending: 'placed',
  new: 'placed',
  // payments.status: paid | refunded | chargeback
  captured: 'paid',
  success: 'paid',
  successful: 'paid',
  reversed: 'refunded',
  disputed: 'chargeback',
  charge_back: 'chargeback',
  'charge back': 'chargeback',
  // support_tickets.category: missing_item | late_delivery | payment_issue | app_bug |
  // courier_behavior | refund_request | order_quality | other
  item_missing: 'missing_item',
  'missing item': 'missing_item',
  delivery_late: 'late_delivery',
  'delivery late': 'late_delivery',
  delayed: 'late_delivery',
  billing_issue: 'payment_issue',
  'billing issue': 'payment_issue',
  payment_problem: 'payment_issue',
  bug: 'app_bug',
  technical_issue: 'app_bug',
  'technical issue': 'app_bug',
  driver_behavior: 'courier_behavior',
  'driver behavior': 'courier_behavior',
  rider_behavior: 'courier_behavior',
  refund: 'refund_request',
  quality_issue: 'order_quality',
  'quality issue': 'order_quality',
  food_quality: 'order_quality',
  misc: 'other',
  general: 'other',
  // couriers.vehicle_type: bike | ebike | scooter | car
  bicycle: 'bike',
  automobile: 'car',
  vehicle: 'car',
  'e-bike': 'ebike',
  electric_bike: 'ebike',
  'electric bike': 'ebike',
  'e-scooter': 'scooter',
  escooter: 'scooter',
};

const SYNONYMS_BY_CANONICAL: Record<string, string[]> = {};
for (const [surface, canonical] of Object.entries(SYNONYM_MAP)) {
  (SYNONYMS_BY_CANONICAL[canonical] ??= []).push(surface);
}

// Nickname (lowercase) -> canonical given name (lowercase). Applied only to the first token of
// customers.full_name; the surname token is left untouched. Recoverable via
// NICKNAME_MAP[firstToken.toLowerCase()] ?? firstToken.toLowerCase().
export const NICKNAME_MAP: Record<string, string> = {
  jim: 'james', jimmy: 'james',
  bob: 'robert', rob: 'robert', bobby: 'robert', robbie: 'robert',
  jack: 'john', johnny: 'john',
  mike: 'michael', mikey: 'michael',
  bill: 'william', will: 'william', billy: 'william',
  rick: 'richard', dick: 'richard', richie: 'richard',
  joe: 'joseph', joey: 'joseph',
  tom: 'thomas', tommy: 'thomas',
  chuck: 'charles', charlie: 'charles',
  chris: 'christopher',
  dan: 'daniel', danny: 'daniel',
  matt: 'matthew',
  tony: 'anthony',
  steve: 'steven',
  andy: 'andrew', drew: 'andrew',
  ken: 'kenneth', kenny: 'kenneth',
  ed: 'edward', eddie: 'edward',
  don: 'donald', donnie: 'donald',
  josh: 'joshua',
  pat: 'patricia', patty: 'patricia', trish: 'patricia',
  jen: 'jennifer', jenny: 'jennifer',
  liz: 'elizabeth', beth: 'elizabeth', betsy: 'elizabeth',
  barb: 'barbara',
  sue: 'susan', susie: 'susan',
  jess: 'jessica',
  maggie: 'margaret', meg: 'margaret', peggy: 'margaret',
  sandy: 'sandra',
  kim: 'kimberly',
  em: 'emily',
  shelly: 'michelle',
  mandy: 'amanda',
  missy: 'melissa',
  deb: 'deborah', debbie: 'deborah',
  steph: 'stephanie',
};

const NICKNAMES_BY_GIVEN: Record<string, string[]> = {};
for (const [nickname, given] of Object.entries(NICKNAME_MAP)) {
  (NICKNAMES_BY_GIVEN[given] ??= []).push(nickname);
}

// Typo domain (post-lowercase) -> the real reserved domain it is a typo of. Every typo domain is
// itself still a misspelling of example.com/example.org (never a real-looking third-party
// domain), so the PII-shape guarantee (reserved example domains only) holds for dirty rows too.
export const EMAIL_TYPO_MAP: Record<string, string> = {
  'exmaple.com': 'example.com',
  'example.con': 'example.com',
  'example.cm': 'example.com',
  'exampel.com': 'example.com',
  'examle.com': 'example.com',
  'exmaple.org': 'example.org',
  'example.ogr': 'example.org',
  'example.or': 'example.org',
  'exampel.org': 'example.org',
};

const TYPO_DOMAINS_BY_REAL: Record<string, string[]> = {};
for (const [typo, real] of Object.entries(EMAIL_TYPO_MAP)) {
  (TYPO_DOMAINS_BY_REAL[real] ??= []).push(typo);
}

// Finite vocabulary of text placeholders standing in for a true NULL. Recoverable via
// NULL_SENTINELS.includes(cell) -> treat as NULL (NULLIF/CASE), never by inverting to the
// original value (a legacy exporter that wrote "N/A" did not retain what the value used to be).
export const NULL_SENTINELS: readonly string[] = ['NULL', 'null', 'N/A', 'n/a', 'None', 'none', '-', 'unknown'];

// ---------------------------------------------------------------------------------------------
// Small shared noise primitives.
// ---------------------------------------------------------------------------------------------

// R01 casing noise: uppercase the whole token, capitalize just the first character, or leave
// case untouched (whitespaceNoise below still guarantees a visible change either way).
function caseNoise(rng: Prng, s: string): string {
  const roll = intBetween(rng, 0, 2);
  if (roll === 0) return s.toUpperCase();
  if (roll === 1) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// R01 whitespace noise: every branch changes the string, so whenever this is invoked the cell is
// guaranteed to differ from its input (recoverable via .trim().toLowerCase()).
function whitespaceNoise(rng: Prng, s: string): string {
  const roll = intBetween(rng, 0, 3);
  if (roll === 0) return `  ${s}`;
  if (roll === 1) return `${s}  `;
  if (roll === 2) return ` ${s} `;
  return `${s}\t`;
}

function applyCasingWhitespace(rng: Prng, s: string): string {
  return whitespaceNoise(rng, caseNoise(rng, s));
}

// R01 + R02 combined for a single enum cell: optionally swap in a synonym (R02), then optionally
// layer casing/whitespace noise on top of whatever text resulted (R01). Reversible via
// SYNONYM_MAP[cell.trim().toLowerCase()] ?? cell.trim().toLowerCase() landing in the canonical set.
function dirtyEnumCell(rng: Prng, canonical: string, synonymRate: number, casingRate: number): string {
  let s = canonical;
  const synonyms = SYNONYMS_BY_CANONICAL[canonical];
  if (synonyms && synonyms.length > 0 && bernoulli(rng, synonymRate)) {
    s = pick(rng, synonyms);
  }
  if (bernoulli(rng, casingRate)) {
    s = applyCasingWhitespace(rng, s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// R01 / R02: enum casing + whitespace + synonym variance.
// ---------------------------------------------------------------------------------------------

function injectOrderStatusMess(orders: Row[], rng: Prng): void {
  for (const o of orders) o.status = dirtyEnumCell(rng, str(o.status), 0.2, 0.4);
}

function injectPaymentEnumMess(payments: Row[], rng: Prng): void {
  for (const p of payments) {
    p.status = dirtyEnumCell(rng, str(p.status), 0.2, 0.4);
    p.method = dirtyEnumCell(rng, str(p.method), 0, 0.4);
  }
}

function injectCourierEnumMess(couriers: Row[], rng: Prng): void {
  for (const c of couriers) {
    c.status = dirtyEnumCell(rng, str(c.status), 0, 0.4);
    c.vehicle_type = dirtyEnumCell(rng, str(c.vehicle_type), 0.2, 0.4);
  }
}

function injectSupportCategoryMess(tickets: Row[], rng: Prng): void {
  for (const t of tickets) t.category = dirtyEnumCell(rng, str(t.category), 0.2, 0.4);
}

// ---------------------------------------------------------------------------------------------
// R03: duplicate customer entities.
// ---------------------------------------------------------------------------------------------

// Appends ~5% (of the original person count) new customer rows, each a clone of a real person
// sharing that person's master_customer_id but a brand-new customer_id. The clone starts as an
// exact copy of the contact fields (same email/phone/full_name string) so that the later, fully
// independent per-row noise passes (injectCustomerContactMess et al.) can dirty the original and
// the duplicate differently while both still normalize back to the same base identity.
function injectDuplicateCustomers(customers: Row[], rng: Prng): void {
  const originalCount = customers.length;
  let nextId = 0;
  for (const c of customers) nextId = Math.max(nextId, c.customer_id as number);
  nextId += 1;

  const dupCount = Math.round(originalCount * 0.05);
  const chosen = sampleWithout(rng, Array.from({ length: originalCount }, (_, i) => i), dupCount);

  for (const idx of chosen) {
    const original = customers[idx];
    customers.push({ ...original, customer_id: nextId, referred_by_customer_id: null });
    nextId += 1;
  }
}

// ---------------------------------------------------------------------------------------------
// R04 / R05 / R15 (name/email/phone slice): customer + courier contact fields.
// ---------------------------------------------------------------------------------------------

function injectFullName(rng: Prng, name: string): string {
  let out = name;
  if (bernoulli(rng, 0.12)) {
    const [given, ...rest] = out.split(' ');
    const nicknames = NICKNAMES_BY_GIVEN[given.toLowerCase()];
    if (nicknames && nicknames.length > 0) {
      const nick = pick(rng, nicknames);
      out = `${nick.charAt(0).toUpperCase()}${nick.slice(1)} ${rest.join(' ')}`;
    }
  }
  if (bernoulli(rng, 0.28)) {
    out = applyCasingWhitespace(rng, out);
  }
  return out;
}

// R04: reformats a "(area) 555-XXXX" phone into an alternate template built from the same 10
// digits, or leaves it in the canonical format. digits.slice(-10) always recovers the same
// 10-digit number regardless of which template was used.
function injectPhone(rng: Prng, phone: string): string {
  if (!bernoulli(rng, 0.6)) return phone;
  const digits = phone.replace(/\D/g, '');
  const area = digits.slice(0, 3);
  const line = digits.slice(6, 10);
  const variant = intBetween(rng, 0, 4);
  switch (variant) {
    case 0: return `${area}-555-${line}`;
    case 1: return `${area}.555.${line}`;
    case 2: return `+1 ${area} 555 ${line}`;
    case 3: return `1-${area}-555-${line}`;
    default: return `${area}555${line}`;
  }
}

// R05: ~2% domain-typo (drawn only from typos of the email's OWN current domain, so it always
// resolves back through EMAIL_TYPO_MAP to the correct domain) + ~40% formatting noise (case,
// whitespace, mailto: prefix, spaced '@'). Never touches the local part, so the embedded
// customer identity is always intact.
function injectEmail(rng: Prng, email: string): string {
  let out = email;
  if (bernoulli(rng, 0.02)) {
    const at = out.lastIndexOf('@');
    const domain = out.slice(at + 1);
    const typos = TYPO_DOMAINS_BY_REAL[domain];
    if (typos && typos.length > 0) {
      out = `${out.slice(0, at)}@${pick(rng, typos)}`;
    }
  }
  if (bernoulli(rng, 0.4)) {
    const roll = intBetween(rng, 0, 3);
    if (roll === 0) out = out.toUpperCase();
    else if (roll === 1) out = `  ${out}  `;
    else if (roll === 2) out = `mailto:${out}`;
    else out = out.replace('@', ' @ ');
  }
  return out;
}

// R15 is deliberately NOT applied to customers.email here: a sentinel like "N/A" would collapse
// every affected person's row into the same normalized-email bucket, breaking the "grouping by
// normalized email recovers exactly one master_customer_id per person" invariant the R03 dedup
// lesson depends on. full_name and phone carry the R15 slice instead.
function injectCustomerContactMess(customers: Row[], rng: Prng): void {
  for (const c of customers) {
    let name = injectFullName(rng, str(c.full_name));
    let phone = injectPhone(rng, str(c.phone));
    const email = injectEmail(rng, str(c.email));

    if (bernoulli(rng, 0.03)) name = pick(rng, NULL_SENTINELS);
    if (bernoulli(rng, 0.03)) phone = pick(rng, NULL_SENTINELS);

    c.full_name = name;
    c.phone = phone;
    c.email = email;
  }
}

function injectCourierPhoneMess(couriers: Row[], rng: Prng): void {
  for (const c of couriers) c.phone = injectPhone(rng, str(c.phone));
}

// ---------------------------------------------------------------------------------------------
// R13: soft-deleted rows present. Re-rolled here (independent of whatever generateClean set) so
// the rate is provably this layer's doing; the flag itself stays a clean, never-null boolean.
// ---------------------------------------------------------------------------------------------

function injectSoftDeleteRates(customers: Row[], tickets: Row[], rng: Prng): void {
  for (const c of customers) c.is_deleted = bernoulli(rng, 0.035);
  for (const t of tickets) t.is_deleted = bernoulli(rng, 0.035);
}

// ---------------------------------------------------------------------------------------------
// R06: money-as-text legacy columns.
// ---------------------------------------------------------------------------------------------

function centsToPlain(cents: number): string {
  return (cents / 100).toFixed(2);
}

function insertThousandsComma(plain: string): string {
  const [intPart, fracPart] = plain.split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fracPart}`;
}

// ~4% null/empty, ~30% non-plain (currency symbol/code, thousands comma, stray whitespace),
// the rest left as the plain "12.34" decimal string. Every non-empty value strips back to
// amount_cents via regexp_replace(legacy, '[^0-9.]', '') -> CAST -> *100 -> round.
function dirtyMoneyText(rng: Prng, cents: number): string | null {
  const plain = centsToPlain(cents);
  if (bernoulli(rng, 0.04)) {
    return bernoulli(rng, 0.5) ? null : '';
  }
  if (!bernoulli(rng, 0.3)) return plain;
  const variant = intBetween(rng, 0, 4);
  switch (variant) {
    case 0: return `$${plain}`;
    case 1: return `${plain} USD`;
    case 2: return `USD ${plain}`;
    case 3: return `$${insertThousandsComma(plain)}`;
    default: return ` ${plain} `;
  }
}

function injectMoneyLegacyMess(orders: Row[], payments: Row[], rng: Prng): void {
  for (const o of orders) o.order_total_legacy = dirtyMoneyText(rng, o.amount_cents as number);
  for (const p of payments) p.amount_legacy = dirtyMoneyText(rng, p.amount_cents as number);
}

// ---------------------------------------------------------------------------------------------
// R08 (+ R15 slice): orphaned/dirty promo_code.
// ---------------------------------------------------------------------------------------------

const FAKE_PROMO_SUFFIXES: readonly string[] = ['X', 'OLD', 'EXP', '2019', '2020'];
// Never one of the real denominations promos actually use (5/10/15/20/25), so a fabricated code
// can never coincidentally collide with a real promos.code.
const FAKE_PROMO_NUMBERS: readonly number[] = [3, 7, 8, 12, 30, 40, 50, 99];

function fabricateOrphanCode(rng: Prng): string {
  return `${pick(rng, PROMO_ROOTS)}${pick(rng, FAKE_PROMO_NUMBERS)}`;
}

// Appends a suffix outside the closed root+denomination vocabulary, so the result can never equal
// a real promos.code by construction (length/content always diverges), while still visibly
// resembling the original code (an "expired-looking" near-miss).
function mutateCodeToOrphan(rng: Prng, code: string): string {
  return `${code}${pick(rng, FAKE_PROMO_SUFFIXES)}`;
}

function injectPromoCodeMess(orders: Row[], rng: Prng): void {
  for (const o of orders) {
    if (o.promo_id !== null) {
      // Coded order: promo_id stays untouched (the clean, always-authoritative FK); promo_code
      // text gets orphaned ~9% of the time, or just casing/whitespace-noised ~20% of the time.
      const clean = str(o.promo_code);
      if (bernoulli(rng, 0.09)) {
        o.promo_code = bernoulli(rng, 0.7) ? fabricateOrphanCode(rng) : mutateCodeToOrphan(rng, clean);
      } else if (bernoulli(rng, 0.2)) {
        o.promo_code = applyCasingWhitespace(rng, clean);
      }
    } else if (bernoulli(rng, 0.04)) {
      // R15 slice: a legitimately-null promo_code becomes a text sentinel instead of a real NULL.
      o.promo_code = pick(rng, NULL_SENTINELS);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// R09: orphaned / soft-deleted orders.customer_id / orders.courier_id.
// ---------------------------------------------------------------------------------------------

// Must run after injectSoftDeleteRates (reads the mess-final customers.is_deleted flags) and
// after injectDuplicateCustomers (reads the mess-final max customer_id so purged ids never
// collide with a real one).
function injectOrphanRefs(orders: Row[], customers: Row[], couriers: Row[], rng: Prng): void {
  const deletedCustomerIds: number[] = [];
  let maxCustomerId = 0;
  for (const c of customers) {
    const id = c.customer_id as number;
    if (id > maxCustomerId) maxCustomerId = id;
    if (c.is_deleted === true) deletedCustomerIds.push(id);
  }
  let maxCourierId = 0;
  for (const c of couriers) maxCourierId = Math.max(maxCourierId, c.courier_id as number);

  let purgedCustomerCounter = maxCustomerId + 500000;
  let purgedCourierCounter = maxCourierId + 500000;

  for (const o of orders) {
    if (bernoulli(rng, 0.015)) {
      if (deletedCustomerIds.length > 0 && bernoulli(rng, 0.5)) {
        o.customer_id = pick(rng, deletedCustomerIds);
      } else {
        o.customer_id = purgedCustomerCounter;
        purgedCustomerCounter += 1;
      }
    }
    if (o.courier_id !== null && bernoulli(rng, 0.015)) {
      o.courier_id = purgedCourierCounter;
      purgedCourierCounter += 1;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// R12: out-of-range / sentinel ratings.
// ---------------------------------------------------------------------------------------------

// stars stays smallint NOT NULL (see DDL), so a genuine SQL NULL is never an option. 0 plays the
// "unrated / null" role instead (NULLIF(stars, 0) recovers real null-semantics); 6/-1/99 are pure
// out-of-range noise. Every value stays within the explicit finite domain {1..5, 0, 6, -1, 99}.
const RATING_OUT_OF_RANGE: readonly number[] = [6, -1, 99];

function injectRatingsSentinels(ratings: Row[], rng: Prng): void {
  for (const r of ratings) {
    if (bernoulli(rng, 0.1)) {
      r.stars = 0;
    } else if (bernoulli(rng, 0.03)) {
      r.stars = pick(rng, RATING_OUT_OF_RANGE);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// R10 / R11: event_log duplicate rows + bounded clock-skew.
// ---------------------------------------------------------------------------------------------

function injectEventLogMess(events: Row[], rng: Prng): void {
  const originalCount = events.length;

  // R11: bounded +/-180s skew on a subset of the ORIGINAL rows only (before R10 appends any
  // duplicates). event_id is left untouched, so ORDER BY event_id always recovers the true
  // generation-order chronology even where event_ts has been skewed; 180s stays comfortably
  // under the 30-minute sessionization gap, so a skew never manufactures a false session split.
  for (let i = 0; i < originalCount; i += 1) {
    if (bernoulli(rng, 0.07)) {
      const e = events[i];
      const trueMs = parseTimestamp(str(e.event_ts));
      const skewSec = intBetween(rng, -180, 180);
      if (skewSec !== 0) e.event_ts = formatTimestamp(trueMs + skewSec * 1000);
    }
  }

  // R10: ~4% duplicate rows, each a clone of an earlier row (same session_id + event_type
  // natural key) appended with a strictly larger event_id and a small (0-30s) retry delay.
  let nextEventId = 0;
  for (const e of events) nextEventId = Math.max(nextEventId, e.event_id as number);
  nextEventId += 1;

  const dupCount = Math.round(originalCount * 0.04);
  const dupIdxs = sampleWithout(rng, Array.from({ length: originalCount }, (_, i) => i), dupCount);
  for (const idx of dupIdxs) {
    const src = events[idx];
    const srcMs = parseTimestamp(str(src.event_ts));
    events.push({
      ...src,
      event_id: nextEventId,
      event_ts: formatTimestamp(srcMs + intBetween(rng, 0, 30) * 1000),
    });
    nextEventId += 1;
  }
}

// ---------------------------------------------------------------------------------------------
// R16: duplicate / retried payments.
// ---------------------------------------------------------------------------------------------

// Runs after injectPaymentEnumMess / injectMoneyLegacyMess so the appended retry row inherits
// whatever (possibly already-dirtied) status/method/amount_legacy its source row ended up with.
function injectDuplicatePayments(payments: Row[], rng: Prng): void {
  const firstIdxByOrder = new Map<number, number>();
  const multiOrder = new Set<number>();
  for (let i = 0; i < payments.length; i += 1) {
    const orderId = payments[i].order_id as number;
    if (firstIdxByOrder.has(orderId)) multiOrder.add(orderId);
    else firstIdxByOrder.set(orderId, i);
  }
  const eligibleIdxs = Array.from(firstIdxByOrder.entries())
    .filter(([orderId]) => !multiOrder.has(orderId))
    .map(([, idx]) => idx);

  const dupCount = Math.round(eligibleIdxs.length * 0.04);
  const chosen = sampleWithout(rng, eligibleIdxs, dupCount);

  let nextPaymentId = 0;
  for (const p of payments) nextPaymentId = Math.max(nextPaymentId, p.payment_id as number);
  nextPaymentId += 1;

  for (const idx of chosen) {
    const src = payments[idx];
    const authMs = parseTimestamp(str(src.authorized_at));
    const shiftSec = intBetween(rng, 30, 900);
    const capturedAt = src.captured_at === null ? null : formatTimestamp(parseTimestamp(str(src.captured_at)) + shiftSec * 1000);
    const refundedAt = src.refunded_at === null ? null : formatTimestamp(parseTimestamp(str(src.refunded_at)) + shiftSec * 1000);
    payments.push({
      ...src,
      payment_id: nextPaymentId,
      authorized_at: formatTimestamp(authMs + shiftSec * 1000),
      captured_at: capturedAt,
      refunded_at: refundedAt,
    });
    nextPaymentId += 1;
  }
}

// ---------------------------------------------------------------------------------------------
// Orchestrator.
// ---------------------------------------------------------------------------------------------

export function injectMess(data: Record<string, Row[]>, rng: Prng): void {
  injectDuplicateCustomers(data.customers, rng);
  injectCustomerContactMess(data.customers, rng);
  injectSoftDeleteRates(data.customers, data.support_tickets, rng);

  injectCourierPhoneMess(data.couriers, rng);
  injectCourierEnumMess(data.couriers, rng);

  injectOrderStatusMess(data.orders, rng);
  injectPaymentEnumMess(data.payments, rng);
  injectSupportCategoryMess(data.support_tickets, rng);

  injectMoneyLegacyMess(data.orders, data.payments, rng);
  injectPromoCodeMess(data.orders, rng);

  injectOrphanRefs(data.orders, data.customers, data.couriers, rng);

  injectRatingsSentinels(data.ratings, rng);

  injectEventLogMess(data.event_log, rng);
  injectDuplicatePayments(data.payments, rng);
}
