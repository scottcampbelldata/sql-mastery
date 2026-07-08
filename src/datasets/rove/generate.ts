import path from 'path';

import type { Prng } from '../framework/prng';
import { deriveStream } from '../framework/prng';
import { injectMess } from './mess';
import { intBetween, floatBetween, pick, weightedPick, bernoulli, gaussian, sampleWithout, round2 } from '../framework/random';
import { formatDate, formatTimestamp, ANCHOR_MS, DATASET_END_MS, addDays } from '../framework/dates';
import { GIVEN_NAMES, SURNAMES } from '../framework/pools';
import type { DatasetModule, TableSpec } from '../framework/types';
import {
  ROVE_CITIES,
  RoveCitySeed,
  MERCHANT_CATEGORY_WEIGHTS,
  MERCHANT_NAME_PARTS,
  PRICE_TIER_WEIGHTS,
  PROMO_ROOTS,
  ACQUISITION_CHANNEL_WEIGHTS,
  SEGMENT_WEIGHTS,
  SEGMENT_ACTIVITY_MULT,
  CHANNEL_RETENTION_MULT,
  RETENTION_WEIGHTS,
  VEHICLE_TYPE_WEIGHTS,
  PAYMENT_METHOD_WEIGHTS,
  PAYMENT_PROCESSOR_WEIGHTS,
  DEVICE_OS_WEIGHTS,
  APP_VERSIONS,
  LINKED_SESSION_TEMPLATES,
  BROWSE_SESSION_TEMPLATES,
  SUPPORT_CATEGORIES,
  SUPPORT_CHANNELS,
  RATING_COMMENTS,
} from './pools';

type Row = Record<string, unknown>;

export const DB_NAME = 'rove';
export const SCHEMA_FILE = path.join(process.cwd(), 'datasets', 'schema', 'rove.sql');
export const SEED = 0x524f5645;
export const VERSION = 'rove-1';

// Canonical vocabularies shared with the (later) mess layer and its tests, so a single source of
// truth defines what "clean" means for every column the mess taxonomy dirties.
export const CANONICAL = {
  orderStatus: ['placed', 'accepted', 'picked_up', 'delivered', 'cancelled'],
  paymentStatus: ['paid', 'refunded', 'chargeback'],
  paymentMethod: PAYMENT_METHOD_WEIGHTS.map(([m]) => m),
  courierStatus: ['applied', 'approved', 'active', 'churned'],
  vehicleType: VEHICLE_TYPE_WEIGHTS.map(([v]) => v),
  merchantCategory: MERCHANT_CATEGORY_WEIGHTS.map(([c]) => c),
  supportCategory: [...SUPPORT_CATEGORIES],
  supportChannel: [...SUPPORT_CHANNELS],
  supportPriority: ['low', 'medium', 'high', 'urgent'],
  supportStatus: ['open', 'pending', 'resolved', 'closed'],
};

export const TABLES: TableSpec[] = [
  {
    name: 'cities',
    columns: [
      'city_id', 'name', 'country_code', 'timezone', 'utc_offset_hours', 'latitude', 'longitude',
      'launched_on', 'population_k', 'is_active',
    ],
  },
  {
    name: 'merchants',
    columns: ['merchant_id', 'city_id', 'name', 'category', 'price_tier', 'onboarded_on', 'avg_prep_minutes', 'is_active'],
  },
  {
    name: 'promos',
    columns: [
      'promo_id', 'code', 'promo_type', 'value_cents', 'percent_off', 'min_order_cents', 'starts_at',
      'ends_at', 'city_id', 'first_order_only', 'max_redemptions',
    ],
  },
  {
    name: 'customers',
    columns: [
      'customer_id', 'full_name', 'email', 'phone', 'signup_ts', 'signup_city_id', 'acquisition_channel',
      'birth_year', 'segment', 'referred_by_customer_id', 'master_customer_id', 'is_deleted',
    ],
  },
  {
    name: 'couriers',
    columns: [
      'courier_id', 'full_name', 'phone', 'home_city_id', 'applied_at', 'approved_at', 'activated_at',
      'churned_at', 'status', 'vehicle_type', 'lifetime_deliveries', 'rating_avg',
    ],
  },
  {
    name: 'orders',
    columns: [
      'order_id', 'customer_id', 'courier_id', 'merchant_id', 'city_id', 'status', 'placed_at',
      'accepted_at', 'picked_up_at', 'delivered_at', 'cancelled_at', 'distance_km', 'subtotal_cents',
      'delivery_fee_cents', 'tip_cents', 'discount_cents', 'amount_cents', 'order_total_legacy',
      'surge_multiplier', 'promo_id', 'promo_code', 'vendor_category',
    ],
  },
  {
    name: 'payments',
    columns: [
      'payment_id', 'order_id', 'amount_cents', 'amount_legacy', 'currency', 'method', 'status',
      'processor', 'authorized_at', 'captured_at', 'refunded_at', 'refund_amount_cents',
    ],
  },
  {
    name: 'event_log',
    columns: ['event_id', 'customer_id', 'order_id', 'session_id', 'event_type', 'event_ts', 'city_id', 'device_os', 'app_version'],
  },
  {
    name: 'promo_redemption',
    columns: ['redemption_id', 'promo_id', 'customer_id', 'order_id', 'redeemed_at', 'discount_cents'],
  },
  {
    name: 'ratings',
    columns: ['rating_id', 'order_id', 'customer_id', 'courier_id', 'stars', 'comment', 'rated_at'],
  },
  {
    name: 'support_tickets',
    columns: [
      'ticket_id', 'customer_id', 'order_id', 'category', 'channel', 'priority', 'opened_at',
      'first_response_at', 'resolved_at', 'status', 'csat', 'is_deleted',
    ],
  },
];

const DAY_MS = 86400000;

const MERCHANT_COUNT = 1200;
const PROMO_COUNT = 45;
const CUSTOMER_COUNT = 45000;
const COURIER_COUNT = 3800;
const ORDER_COUNT = 520000;
// Spec target is 2,000,000; dialed to 1,200,000 (the spec's stated fallback) to keep in-memory
// generation and the double-run determinism test fast. See task-10-report.md for the rationale.
const EVENT_LOG_TARGET = 1200000;
const LINKED_ORDER_SESSION_COUNT = 90000;
// Oversampled: only ~70% of sampled slots land in a city/time window where a promo is actually
// active, so this target is tuned to land the realized promo_redemption count near the spec's
// 110,000 (verified empirically, see task-10-report.md).
const PROMO_SLOT_TARGET = 158000;
const RATING_SAMPLE_COUNT = 150000;
const SUPPORT_TICKET_COUNT = 22000;
const PAYMENT_SKIP_COUNT = 50000;
// Rolled inside buildFunnel only for orders that clear the cancel decision, so the realized
// share of ALL orders landing in-flight is smaller than this raw rate (see buildFunnel comment).
// Tuned so the realized split lands close to delivered ~80-83% / cancelled ~12% / in-flight ~5-7%.
const IN_FLIGHT_RATE = 0.07;

// Double lunch/dinner peaks, local hour of day, 0..23.
const HOUR_WEIGHTS: readonly number[] = [
  2, 1, 1, 1, 1, 2, 4, 6, 8, 8, 9, 14, 20, 18, 10, 8, 9, 14, 22, 24, 20, 14, 8, 4,
];
// Sun..Sat (index 0 = Sunday), Fri/Sat busiest.
const DOW_WEIGHTS: readonly number[] = [1.1, 0.9, 0.9, 0.95, 1.0, 1.25, 1.3];

const MERCHANT_CATEGORY_PREP_BASE: Record<string, number> = {
  restaurant: 22, grocery: 30, pharmacy: 8, convenience: 7, alcohol: 12, flowers: 20,
};
const PRICE_TIER_SUBTOTAL_BANDS: Record<number, readonly [number, number]> = {
  1: [800, 2500], 2: [1500, 4000], 3: [2500, 6000], 4: [4000, 9000],
};

function buildCumulative(weights: readonly number[]): number[] {
  const cum: number[] = [];
  let sum = 0;
  for (const w of weights) {
    sum += w;
    cum.push(sum);
  }
  return cum;
}

function pickIndexByCumulative(rng: Prng, cum: readonly number[]): number {
  const total = cum[cum.length - 1];
  const target = rng() * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const HOUR_CUM = buildCumulative(HOUR_WEIGHTS);

function naiveMs(dayOffset: number, hour: number, minute: number, second: number): number {
  return ANCHOR_MS + dayOffset * DAY_MS + hour * 3600000 + minute * 60000 + second * 1000;
}

// ANCHOR_MS (2020-01-01) is a Wednesday (weekday index 3); dayOffset advances the calendar day.
function dowOf(dayOffset: number): number {
  return (((3 + dayOffset) % 7) + 7) % 7;
}

function monthIndexOf(dayOffset: number): number {
  return Math.floor(dayOffset / 30);
}

// Splits `total` across buckets proportional to `weights`, guaranteeing every bucket gets >= 1
// and the counts sum to exactly `total` (largest-remainder method), the same exact-volume pattern
// the Sideline generator uses for its match-count-per-tournament distribution.
function allocateCounts(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sumW) * total);
  const counts = raw.map((r) => Math.max(1, Math.floor(r)));
  let allocated = counts.reduce((a, b) => a + b, 0);
  let diff = total - allocated;
  if (diff > 0) {
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    let p = 0;
    while (diff > 0) {
      counts[order[p % n].i] += 1;
      diff -= 1;
      p += 1;
    }
  } else if (diff < 0) {
    const order = counts.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    let p = 0;
    while (diff < 0) {
      const idx = order[p % n].i;
      if (counts[idx] > 1) {
        counts[idx] -= 1;
        diff += 1;
      }
      p += 1;
    }
  }
  return counts;
}

function buildCityWeights(): number[] {
  return ROVE_CITIES.map((c) => {
    const startDay = Math.max(0, c.launchOffsetDays);
    const activeDays = Math.max(1, 730 - startDay);
    return c.populationK * activeDays;
  });
}

interface CityDayDist {
  days: number[];
  cum: number[];
}

// Per-city day-of-window weights: a 6-month ramp from launch to a plateau, times day-of-week
// seasonality. Shared by customers/couriers/orders/event_log so every table's activity ramps and
// seasons the same way per city.
function buildCityDayDist(city: RoveCitySeed): CityDayDist {
  const startDay = Math.max(0, city.launchOffsetDays);
  const days: number[] = [];
  const weights: number[] = [];
  for (let d = startDay; d < 730; d += 1) {
    const month = monthIndexOf(d);
    const ramp = Math.min(1, (month + 1) / 6);
    const w = ramp * DOW_WEIGHTS[dowOf(d)];
    days.push(d);
    weights.push(w);
  }
  return { days, cum: buildCumulative(weights) };
}

function pickDay(rng: Prng, dist: CityDayDist): number {
  return dist.days[pickIndexByCumulative(rng, dist.cum)];
}

function randomUuid(rng: Prng): string {
  const hex = (): string => Math.floor(rng() * 16).toString(16);
  const seg = (count: number): string => Array.from({ length: count }, hex).join('');
  const variant = (8 + Math.floor(rng() * 4)).toString(16);
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${variant}${seg(3)}-${seg(12)}`;
}

function buildCities(): Row[] {
  return ROVE_CITIES.map((c, i) => ({
    city_id: i + 1,
    name: c.name,
    country_code: c.countryCode,
    timezone: c.timezone,
    utc_offset_hours: c.utcOffsetHours,
    latitude: c.latitude,
    longitude: c.longitude,
    launched_on: formatDate(addDays(ANCHOR_MS, c.launchOffsetDays)),
    population_k: c.populationK,
    is_active: true,
  }));
}

interface MerchantsResult {
  rows: Row[];
  avgPrepMinutes: number[];
  isActive: boolean[];
  byCity: number[][];
}

function buildMerchants(seed: number, cityWeights: number[]): MerchantsResult {
  const rng = deriveStream(seed, 'merchants');
  const counts = allocateCounts(MERCHANT_COUNT, cityWeights);

  const rows: Row[] = [];
  const avgPrepMinutes: number[] = [];
  const isActive: boolean[] = [];
  const byCity: number[][] = ROVE_CITIES.map(() => []);

  let merchantId = 1;
  for (let c = 0; c < ROVE_CITIES.length; c += 1) {
    const city = ROVE_CITIES[c];
    const windowStartMs = addDays(ANCHOR_MS, Math.max(0, city.launchOffsetDays));
    for (let k = 0; k < counts[c]; k += 1) {
      const category = weightedPick(rng, MERCHANT_CATEGORY_WEIGHTS);
      const tier = weightedPick(rng, PRICE_TIER_WEIGHTS);
      const parts = MERCHANT_NAME_PARTS[category];
      const name = `${pick(rng, parts.prefixes)} ${pick(rng, parts.suffixes)}`;
      const onboardedMs = intBetween(rng, windowStartMs, DATASET_END_MS - DAY_MS);
      const base = MERCHANT_CATEGORY_PREP_BASE[category];
      const rawPrep = Math.max(3, base + (tier - 1) * 1.5 + floatBetween(rng, -3, 3));
      const prep = Math.round(rawPrep * 10) / 10;
      const active = bernoulli(rng, 0.92);

      const idx = rows.length;
      rows.push({
        merchant_id: merchantId,
        city_id: c + 1,
        name,
        category,
        price_tier: tier,
        onboarded_on: formatDate(onboardedMs),
        avg_prep_minutes: prep,
        is_active: active,
      });
      avgPrepMinutes.push(prep);
      isActive.push(active);
      byCity[c].push(idx);
      merchantId += 1;
    }
  }
  return { rows, avgPrepMinutes, isActive, byCity };
}

// Allocation-free weighted pick (called once per order, up to 520000 times): active merchants
// are 10x as likely to be chosen as inactive ones.
function pickMerchantForCity(rng: Prng, cityIdx: number, merchants: MerchantsResult): number {
  const list = merchants.byCity[cityIdx];
  let total = 0;
  for (const idx of list) total += merchants.isActive[idx] ? 10 : 1;
  let target = rng() * total;
  for (const idx of list) {
    target -= merchants.isActive[idx] ? 10 : 1;
    if (target < 0) return idx;
  }
  return list[list.length - 1];
}

interface PromoMeta {
  id: number;
  code: string;
  type: string;
  valueCents: number | null;
  percentOff: number | null;
  cityId: number | null;
  startMs: number;
  endMs: number;
  eligible: boolean;
}

interface PromosResult {
  rows: Row[];
  meta: PromoMeta[];
}

function buildPromos(seed: number): PromosResult {
  const rng = deriveStream(seed, 'promos');
  const allCodes: string[] = [];
  for (const root of PROMO_ROOTS) {
    for (const n of [5, 10, 15, 20, 25]) allCodes.push(`${root}${n}`);
  }
  const codes = sampleWithout(rng, allCodes, PROMO_COUNT);

  const rows: Row[] = [];
  const meta: PromoMeta[] = [];
  for (let i = 0; i < PROMO_COUNT; i += 1) {
    const type = weightedPick(rng, [['percent', 50], ['flat', 30], ['free_delivery', 20]] as const);
    const percentOff = type === 'percent' ? pick(rng, [10, 15, 20, 25]) : null;
    const valueCents = type === 'flat' ? intBetween(rng, 6, 20) * 50 : null;
    const minOrderCents = pick(rng, [0, 1000, 1500, 2000]);
    const startDay = intBetween(rng, 0, 600);
    const durationDays = intBetween(rng, 14, 90);
    const endDay = Math.min(729, startDay + durationDays);
    const cityId = bernoulli(rng, 0.5) ? null : intBetween(rng, 1, ROVE_CITIES.length);
    const firstOrderOnly = bernoulli(rng, 0.3);
    const maxRedemptions = bernoulli(rng, 0.2) ? intBetween(rng, 50, 200) : null;
    // Last two promo codes are reserved edge cases: never selected by orders, so they surface as
    // zero-redemption promos for the "capped and zero-redemption promos" lesson target.
    const eligible = i < PROMO_COUNT - 2;

    const startMs = naiveMs(startDay, 0, 0, 0);
    const endMs = naiveMs(endDay, 23, 59, 59);

    rows.push({
      promo_id: i + 1,
      code: codes[i],
      promo_type: type,
      value_cents: valueCents,
      percent_off: percentOff,
      min_order_cents: minOrderCents,
      starts_at: formatTimestamp(startMs),
      ends_at: formatTimestamp(endMs),
      city_id: cityId,
      first_order_only: firstOrderOnly,
      max_redemptions: maxRedemptions,
    });
    meta.push({ id: i + 1, code: codes[i], type, valueCents, percentOff, cityId, startMs, endMs, eligible });
  }
  return { rows, meta };
}

interface CustomersResult {
  rows: Row[];
  cityIdx: number[];
  signupMs: number[];
  segment: string[];
  channel: string[];
  retentionThreshold: number[];
  byCityMonth: Map<string, number[]>;
  byCity: number[][];
}

function buildCustomers(seed: number, cityWeights: number[], cityDayDist: CityDayDist[]): CustomersResult {
  const rng = deriveStream(seed, 'customers');
  const counts = allocateCounts(CUSTOMER_COUNT, cityWeights);

  const rows: Row[] = [];
  const cityIdx: number[] = [];
  const signupMs: number[] = [];
  const segmentArr: string[] = [];
  const channelArr: string[] = [];
  const retentionThresholdArr: number[] = [];
  const byCityMonth = new Map<string, number[]>();
  const byCity: number[][] = ROVE_CITIES.map(() => []);

  let customerId = 1;
  for (let c = 0; c < ROVE_CITIES.length; c += 1) {
    const city = ROVE_CITIES[c];
    for (let k = 0; k < counts[c]; k += 1) {
      const dayOffset = pickDay(rng, cityDayDist[c]);
      const hour = pickIndexByCumulative(rng, HOUR_CUM);
      const ms = naiveMs(dayOffset, hour, intBetween(rng, 0, 59), intBetween(rng, 0, 59));

      const given = pick(rng, GIVEN_NAMES);
      const surname = pick(rng, SURNAMES);
      const domain = bernoulli(rng, 0.5) ? 'example.com' : 'example.org';
      const email = `${given.toLowerCase()}.${surname.toLowerCase()}${customerId}@${domain}`;
      const phone = `(${city.areaCode}) 555-${String(intBetween(rng, 0, 9999)).padStart(4, '0')}`;

      const acqChannel = weightedPick(rng, ACQUISITION_CHANNEL_WEIGHTS);
      const birthYear = bernoulli(rng, 0.92) ? intBetween(rng, 1955, 2004) : null;
      const seg = weightedPick(rng, SEGMENT_WEIGHTS);

      const referredBy = acqChannel === 'referral' && customerId > 1 ? intBetween(rng, 1, customerId - 1) : null;
      // Retention gate (believability #2): a per-customer uniform draw compared, at order time,
      // against RETENTION_WEIGHTS[tenure] / RETENTION_WEIGHTS[0] in pickCustomerForOrder. Lower
      // draws survive longer, so the SET of customers still eligible to order shrinks
      // monotonically as tenure grows, making the cohort's realized active-rate curve track the
      // spec's ~100/48/33/26/22... decay directly instead of emerging (too shallow) from
      // segment/channel weighting alone.
      const retentionThreshold = rng();

      const idx = rows.length;
      rows.push({
        customer_id: customerId,
        full_name: `${given} ${surname}`,
        email,
        phone,
        signup_ts: formatTimestamp(ms),
        signup_city_id: c + 1,
        acquisition_channel: acqChannel,
        birth_year: birthYear,
        segment: seg,
        referred_by_customer_id: referredBy,
        master_customer_id: customerId,
        is_deleted: bernoulli(rng, 0.03),
      });
      cityIdx.push(c);
      signupMs.push(ms);
      segmentArr.push(seg);
      channelArr.push(acqChannel);
      retentionThresholdArr.push(retentionThreshold);
      byCity[c].push(idx);
      const month = monthIndexOf(dayOffset);
      const key = `${c}|${month}`;
      if (!byCityMonth.has(key)) byCityMonth.set(key, []);
      byCityMonth.get(key)!.push(idx);

      customerId += 1;
    }
  }
  return {
    rows,
    cityIdx,
    signupMs,
    segment: segmentArr,
    channel: channelArr,
    retentionThreshold: retentionThresholdArr,
    byCityMonth,
    byCity,
  };
}

// Picks a customer for an order at (cityIdx, orderMonth): first samples a signup-cohort "tenure"
// weighted by RETENTION_WEIGHTS (recent cohorts order far more than old ones), then samples a
// customer within that cohort weighted by segment/channel activity multipliers.
function pickCustomerForOrder(rng: Prng, cityIdx: number, orderMonth: number, customers: CustomersResult): number {
  const candidates: (readonly [number, number])[] = [];
  for (let tenure = 0; tenure < RETENTION_WEIGHTS.length; tenure += 1) {
    const cohortMonth = orderMonth - tenure;
    if (cohortMonth < 0) break;
    const bucket = customers.byCityMonth.get(`${cityIdx}|${cohortMonth}`);
    if (bucket && bucket.length > 0) candidates.push([cohortMonth, RETENTION_WEIGHTS[tenure]] as const);
  }
  if (candidates.length === 0) {
    return pick(rng, customers.byCity[cityIdx]);
  }
  const cohortMonth = weightedPick(rng, candidates);
  const bucket = customers.byCityMonth.get(`${cityIdx}|${cohortMonth}`)!;
  const tenure = orderMonth - cohortMonth;

  // Retention gate: only customers whose individually assigned retentionThreshold clears this
  // tenure's cohort-wide survival rate are eligible this month, so the SET of customers an order
  // can land on shrinks monotonically with tenure (see buildCustomers). RETENTION_WEIGHTS[0] is
  // the normalizer (100), so survivalRate at tenure 0 is 1.0 (everyone still eligible in their
  // signup month) and decays to RETENTION_WEIGHTS[tenure]/100 beyond that.
  const survivalRate = RETENTION_WEIGHTS[Math.min(tenure, RETENTION_WEIGHTS.length - 1)] / RETENTION_WEIGHTS[0];

  // Allocation-free weighted pick within the cohort bucket (called once per order, up to 520000
  // times): power/referral/organic customers are proportionally more likely within their cohort,
  // among those still retention-eligible at this tenure.
  const custWeight = (idx: number): number => {
    if (customers.retentionThreshold[idx] > survivalRate) return 0;
    return SEGMENT_ACTIVITY_MULT[customers.segment[idx]] * CHANNEL_RETENTION_MULT[customers.channel[idx]];
  };
  let total = 0;
  for (const idx of bucket) total += custWeight(idx);
  if (total <= 0) {
    // Small-bucket edge case: nobody in this cohort survives to this tenure under the gate.
    // Fall back to an ungated pick from the same bucket rather than leaving the order without a
    // customer; rare, and only matters for tiny tail cohorts (e.g. Charlotte/Baltimore's first
    // months), so it does not meaningfully dilute the retention curve.
    return pick(rng, bucket);
  }
  let target = rng() * total;
  for (const idx of bucket) {
    target -= custWeight(idx);
    if (target < 0) return idx;
  }
  return bucket[bucket.length - 1];
}

interface CouriersResult {
  rows: Row[];
  activatedMs: (number | null)[];
  churnedMs: (number | null)[];
  byCity: number[][];
}

function buildCouriers(seed: number, cityWeights: number[], cityDayDist: CityDayDist[]): CouriersResult {
  const rng = deriveStream(seed, 'couriers');
  const counts = allocateCounts(COURIER_COUNT, cityWeights);

  const rows: Row[] = [];
  const activatedMsArr: (number | null)[] = [];
  const churnedMsArr: (number | null)[] = [];
  const byCity: number[][] = ROVE_CITIES.map(() => []);

  let courierId = 1;
  for (let c = 0; c < ROVE_CITIES.length; c += 1) {
    const city = ROVE_CITIES[c];
    for (let k = 0; k < counts[c]; k += 1) {
      const appliedDay = pickDay(rng, cityDayDist[c]);
      const appliedMs = naiveMs(appliedDay, intBetween(rng, 7, 21), intBetween(rng, 0, 59), intBetween(rng, 0, 59));

      let approvedMs: number | null = null;
      let activatedMs: number | null = null;
      let churnedMs: number | null = null;
      let status = 'applied';

      if (bernoulli(rng, 0.78)) {
        approvedMs = addDays(appliedMs, intBetween(rng, 1, 14));
        status = 'approved';
        if (bernoulli(rng, 0.9)) {
          activatedMs = addDays(approvedMs, intBetween(rng, 0, 7));
          status = 'active';
          if (bernoulli(rng, 0.45)) {
            const candidateChurn = addDays(activatedMs, intBetween(rng, 30, 500));
            if (candidateChurn <= DATASET_END_MS) {
              churnedMs = candidateChurn;
              status = 'churned';
            }
          }
        }
      }

      const vehicle = weightedPick(rng, VEHICLE_TYPE_WEIGHTS);
      const given = pick(rng, GIVEN_NAMES);
      const surname = pick(rng, SURNAMES);
      const phone = `(${city.areaCode}) 555-${String(intBetween(rng, 0, 9999)).padStart(4, '0')}`;

      const idx = rows.length;
      rows.push({
        courier_id: courierId,
        full_name: `${given} ${surname}`,
        phone,
        home_city_id: c + 1,
        applied_at: formatTimestamp(appliedMs),
        approved_at: approvedMs === null ? null : formatTimestamp(approvedMs),
        activated_at: activatedMs === null ? null : formatTimestamp(activatedMs),
        churned_at: churnedMs === null ? null : formatTimestamp(churnedMs),
        status,
        vehicle_type: vehicle,
        lifetime_deliveries: 0,
        rating_avg: null,
      });
      activatedMsArr.push(activatedMs);
      churnedMsArr.push(churnedMs);
      byCity[c].push(idx);
      courierId += 1;
    }
  }
  return { rows, activatedMs: activatedMsArr, churnedMs: churnedMsArr, byCity };
}

// Allocation-free weighted pick over eligible (activated, not-yet-churned) couriers in a city,
// weighted by tenure so more experienced couriers get proportionally more orders. Called for
// nearly every order (up to 520000 times), so this avoids building an intermediate array.
function courierWeight(couriers: CouriersResult, idx: number, atMs: number): number {
  const am = couriers.activatedMs[idx];
  if (am === null || am > atMs) return 0;
  const cm = couriers.churnedMs[idx];
  if (cm !== null && cm <= atMs) return 0;
  const tenureDays = (atMs - am) / DAY_MS;
  return 1 + Math.min(40, tenureDays / 30);
}

// True when at least one home-city courier is activated and not yet churned at atMs. buildFunnel
// checks this before deciding an order's funnel branch, so pickCourierForOrder below is only ever
// asked to pick a courier when a real, active candidate exists in the city at that instant.
function cityHasActiveCourier(couriers: CouriersResult, cityIdx: number, atMs: number): boolean {
  const cityList = couriers.byCity[cityIdx];
  for (const idx of cityList) {
    if (courierWeight(couriers, idx, atMs) > 0) return true;
  }
  return false;
}

function pickCourierForOrder(
  rng: Prng,
  cityIdx: number,
  atMs: number,
  couriers: CouriersResult
): number | null {
  const cityList = couriers.byCity[cityIdx];
  let total = 0;
  for (const idx of cityList) total += courierWeight(couriers, idx, atMs);
  if (total > 0) {
    let target = rng() * total;
    for (const idx of cityList) {
      target -= courierWeight(couriers, idx, atMs);
      if (target < 0) return idx;
    }
  }
  // No active (activated, not-churned) courier exists in this city at atMs. Callers must not
  // paper over this with an arbitrary home-city courier, since that would assign a courier who
  // was not actually active at accept time. buildFunnel guarantees this path is never taken for
  // an order that ends up accepted/picked_up/delivered by calling cityHasActiveCourier first.
  return null;
}

interface FunnelResult {
  status: string;
  acceptedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  courierIdx: number | null;
}

function buildFunnel(
  rng: Prng,
  placedMs: number,
  prepMinutes: number,
  distanceKm: number,
  surge: number,
  cityIdx: number,
  couriers: CouriersResult
): FunnelResult {
  const acceptDelaySec = intBetween(rng, 30, 360);
  const acceptedMs = placedMs + acceptDelaySec * 1000;

  if (!cityHasActiveCourier(couriers, cityIdx, acceptedMs)) {
    // No courier is active in this city at accept time (e.g. a brand-new city before its first
    // activation), so the order cannot actually be served. Cancel it up front instead of falling
    // through to a branch that would assign a courier who was not active at accepted_at.
    const cancelledMs = placedMs + intBetween(rng, 10, 600) * 1000;
    return { status: 'cancelled', acceptedAt: null, pickedUpAt: null, deliveredAt: null, cancelledAt: cancelledMs, courierIdx: null };
  }

  const prepMs = Math.max(2, prepMinutes) * 60000;
  const pickedUpMs = acceptedMs + prepMs;
  const travelMinutes = (distanceKm / 20) * 60 + intBetween(rng, 2, 10);
  const travelMs = Math.round(travelMinutes * (0.8 + 0.2 * surge) * 60000);
  const deliveredMs = pickedUpMs + travelMs;

  if (bernoulli(rng, 0.12)) {
    const stage = weightedPick(rng, [['before_accept', 40], ['after_accept', 35], ['after_pickup', 25]] as const);
    if (stage === 'before_accept') {
      const cancelledMs = placedMs + intBetween(rng, 10, 600) * 1000;
      return { status: 'cancelled', acceptedAt: null, pickedUpAt: null, deliveredAt: null, cancelledAt: cancelledMs, courierIdx: null };
    }
    const courierIdx = pickCourierForOrder(rng, cityIdx, acceptedMs, couriers);
    if (stage === 'after_accept') {
      const cancelledMs = acceptedMs + intBetween(rng, 10, 600) * 1000;
      return { status: 'cancelled', acceptedAt: acceptedMs, pickedUpAt: null, deliveredAt: null, cancelledAt: cancelledMs, courierIdx };
    }
    const cancelledMs = pickedUpMs + intBetween(rng, 10, 600) * 1000;
    return { status: 'cancelled', acceptedAt: acceptedMs, pickedUpAt: pickedUpMs, deliveredAt: null, cancelledAt: cancelledMs, courierIdx };
  }

  // Snapshot in-flight orders (believability #1): a realistic operational snapshot always has
  // some live orders that simply have not advanced yet at export time, independent of how close
  // placedMs is to DATASET_END_MS. cancelled_at stays NULL for every sub-stage below, and a
  // courier is only ever attached via pickCourierForOrder, which -- exactly like every other
  // branch -- is only reachable here because cityHasActiveCourier already confirmed a real,
  // active courier exists at acceptedMs.
  if (bernoulli(rng, IN_FLIGHT_RATE)) {
    const stage = weightedPick(rng, [['placed', 15], ['accepted', 40], ['picked_up', 45]] as const);
    if (stage === 'placed') {
      return { status: 'placed', acceptedAt: null, pickedUpAt: null, deliveredAt: null, cancelledAt: null, courierIdx: null };
    }
    const inFlightCourierIdx = pickCourierForOrder(rng, cityIdx, acceptedMs, couriers);
    if (stage === 'accepted') {
      return { status: 'accepted', acceptedAt: acceptedMs, pickedUpAt: null, deliveredAt: null, cancelledAt: null, courierIdx: inFlightCourierIdx };
    }
    return { status: 'picked_up', acceptedAt: acceptedMs, pickedUpAt: pickedUpMs, deliveredAt: null, cancelledAt: null, courierIdx: inFlightCourierIdx };
  }

  if (deliveredMs > DATASET_END_MS) {
    if (acceptedMs > DATASET_END_MS) {
      return { status: 'placed', acceptedAt: null, pickedUpAt: null, deliveredAt: null, cancelledAt: null, courierIdx: null };
    }
    const courierIdx = pickCourierForOrder(rng, cityIdx, acceptedMs, couriers);
    if (pickedUpMs > DATASET_END_MS) {
      return { status: 'accepted', acceptedAt: acceptedMs, pickedUpAt: null, deliveredAt: null, cancelledAt: null, courierIdx };
    }
    return { status: 'picked_up', acceptedAt: acceptedMs, pickedUpAt: pickedUpMs, deliveredAt: null, cancelledAt: null, courierIdx };
  }

  const courierIdx = pickCourierForOrder(rng, cityIdx, acceptedMs, couriers);
  return { status: 'delivered', acceptedAt: acceptedMs, pickedUpAt: pickedUpMs, deliveredAt: deliveredMs, cancelledAt: null, courierIdx };
}

interface OrdersResult {
  rows: Row[];
  placedMs: number[];
  deliveredMs: (number | null)[];
  cityIdx: number[];
  customerId: number[];
  courierId: (number | null)[];
  status: string[];
}

function buildOrders(
  seed: number,
  cityWeights: number[],
  cityDayDist: CityDayDist[],
  merchants: MerchantsResult,
  customers: CustomersResult,
  couriers: CouriersResult,
  promos: PromosResult
): OrdersResult {
  const rng = deriveStream(seed, 'orders');
  const counts = allocateCounts(ORDER_COUNT, cityWeights);

  const rows: Row[] = [];
  const placedMs: number[] = [];
  const deliveredMs: (number | null)[] = [];
  const cityIdxArr: number[] = [];
  const customerIdArr: number[] = [];
  const courierIdArr: (number | null)[] = [];
  const statusArr: string[] = [];

  const promoSlots = new Set(
    sampleWithout(rng, Array.from({ length: ORDER_COUNT }, (_, i) => i), Math.min(PROMO_SLOT_TARGET, ORDER_COUNT))
  );

  let orderId = 1;
  let globalSlot = 0;

  for (let c = 0; c < ROVE_CITIES.length; c += 1) {
    for (let k = 0; k < counts[c]; k += 1) {
      const dayOffset = pickDay(rng, cityDayDist[c]);
      const hour = pickIndexByCumulative(rng, HOUR_CUM);
      const placed = naiveMs(dayOffset, hour, intBetween(rng, 0, 59), intBetween(rng, 0, 59));
      const month = monthIndexOf(dayOffset);
      const dow = dowOf(dayOffset);

      const custIdx = pickCustomerForOrder(rng, c, month, customers);
      const merchIdx = pickMerchantForCity(rng, c, merchants);
      const merchantRow = merchants.rows[merchIdx];
      const priceTier = merchantRow.price_tier as number;

      const distanceKm = round2(0.3 + Math.pow(rng(), 2) * 11.7);

      const isPeakHour = hour === 12 || hour === 13 || hour === 18 || hour === 19 || hour === 20;
      const isWeekendPeak = dow === 5 || dow === 6;
      let surge = 1.0;
      if ((isPeakHour || isWeekendPeak) && bernoulli(rng, 0.15)) {
        surge = round2(floatBetween(rng, 1.1, 1.8));
      }

      const band = PRICE_TIER_SUBTOTAL_BANDS[priceTier];
      const subtotalCents = intBetween(rng, band[0], band[1]);
      const baseFee = 199 + Math.round(distanceKm * 35) + (priceTier - 1) * 20;
      const deliveryFeeCents = Math.round(baseFee * surge);
      const tipCents = bernoulli(rng, 0.6) ? Math.round(subtotalCents * floatBetween(rng, 0.08, 0.22)) : null;

      let promoIdx = -1;
      if (promoSlots.has(globalSlot)) {
        const eligiblePromos = promos.meta.filter(
          (p) => p.eligible && (p.cityId === null || p.cityId === c + 1) && p.startMs <= placed && placed <= p.endMs
        );
        if (eligiblePromos.length > 0) {
          promoIdx = pick(rng, eligiblePromos).id - 1;
        }
      }

      let discountCents = 0;
      let promoId: number | null = null;
      let promoCode: string | null = null;
      if (promoIdx >= 0) {
        const promo = promos.meta[promoIdx];
        promoId = promo.id;
        promoCode = promo.code;
        if (promo.type === 'percent') {
          discountCents = Math.round((subtotalCents * (promo.percentOff ?? 0)) / 100);
        } else if (promo.type === 'flat') {
          discountCents = Math.min(promo.valueCents ?? 0, subtotalCents);
        } else {
          discountCents = deliveryFeeCents;
        }
        const maxDiscount = subtotalCents + deliveryFeeCents + (tipCents ?? 0) - 100;
        discountCents = Math.max(0, Math.min(discountCents, maxDiscount));
      }

      const amountCents = subtotalCents + deliveryFeeCents + (tipCents ?? 0) - discountCents;

      const funnel = buildFunnel(rng, placed, merchants.avgPrepMinutes[merchIdx], distanceKm, surge, c, couriers);
      const courierIdVal = funnel.courierIdx === null ? null : (couriers.rows[funnel.courierIdx].courier_id as number);
      const customerIdVal = customers.rows[custIdx].customer_id as number;

      rows.push({
        order_id: orderId,
        customer_id: customerIdVal,
        courier_id: courierIdVal,
        merchant_id: merchantRow.merchant_id,
        city_id: c + 1,
        status: funnel.status,
        placed_at: formatTimestamp(placed),
        accepted_at: funnel.acceptedAt === null ? null : formatTimestamp(funnel.acceptedAt),
        picked_up_at: funnel.pickedUpAt === null ? null : formatTimestamp(funnel.pickedUpAt),
        delivered_at: funnel.deliveredAt === null ? null : formatTimestamp(funnel.deliveredAt),
        cancelled_at: funnel.cancelledAt === null ? null : formatTimestamp(funnel.cancelledAt),
        distance_km: distanceKm,
        subtotal_cents: subtotalCents,
        delivery_fee_cents: deliveryFeeCents,
        tip_cents: tipCents,
        discount_cents: discountCents,
        amount_cents: amountCents,
        order_total_legacy: (amountCents / 100).toFixed(2),
        surge_multiplier: surge,
        promo_id: promoId,
        promo_code: promoCode,
        vendor_category: merchantRow.category,
      });

      placedMs.push(placed);
      deliveredMs.push(funnel.deliveredAt);
      cityIdxArr.push(c);
      customerIdArr.push(customerIdVal);
      courierIdArr.push(courierIdVal);
      statusArr.push(funnel.status);

      orderId += 1;
      globalSlot += 1;
    }
  }

  return { rows, placedMs, deliveredMs, cityIdx: cityIdxArr, customerId: customerIdArr, courierId: courierIdArr, status: statusArr };
}

function buildPayments(seed: number, ordersRows: Row[], orders: OrdersResult, problemMerchantIds: Set<number>): Row[] {
  const rng = deriveStream(seed, 'payments');
  const n = ordersRows.length;

  const beforeAcceptCancelIdxs: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (orders.status[i] === 'cancelled' && ordersRows[i].accepted_at === null) beforeAcceptCancelIdxs.push(i);
  }
  const skipTarget = Math.min(PAYMENT_SKIP_COUNT, n);
  const skipSet = new Set(sampleWithout(rng, beforeAcceptCancelIdxs, Math.min(skipTarget, beforeAcceptCancelIdxs.length)));
  if (skipSet.size < skipTarget) {
    const remainingPool = Array.from({ length: n }, (_, i) => i).filter((i) => !skipSet.has(i));
    for (const i of sampleWithout(rng, remainingPool, skipTarget - skipSet.size)) skipSet.add(i);
  }

  const rows: Row[] = [];
  let paymentId = 1;
  for (let i = 0; i < n; i += 1) {
    if (skipSet.has(i)) continue;
    const order = ordersRows[i];
    const amountCents = order.amount_cents as number;
    const merchantId = order.merchant_id as number;
    const isProblem = problemMerchantIds.has(merchantId);
    const status = orders.status[i];
    const beforeAccept = status === 'cancelled' && order.accepted_at === null;

    const authorizedMs = orders.placedMs[i] + intBetween(rng, 0, 30) * 1000;

    let payStatus: string;
    if (status === 'cancelled') {
      payStatus = 'refunded';
    } else if (isProblem && bernoulli(rng, 0.15)) {
      payStatus = 'chargeback';
    } else if (!isProblem && bernoulli(rng, 0.02)) {
      payStatus = 'chargeback';
    } else if (bernoulli(rng, 0.03)) {
      payStatus = 'refunded';
    } else {
      payStatus = 'paid';
    }

    const capturedMs = beforeAccept ? null : authorizedMs + intBetween(rng, 60, 900) * 1000;
    const refundedMs = payStatus === 'refunded' ? (capturedMs ?? authorizedMs) + intBetween(rng, 1, 72) * 3600000 : null;
    const refundAmountCents = payStatus === 'refunded' ? amountCents : null;

    rows.push({
      payment_id: paymentId,
      order_id: order.order_id,
      amount_cents: amountCents,
      amount_legacy: (amountCents / 100).toFixed(2),
      currency: 'USD',
      method: weightedPick(rng, PAYMENT_METHOD_WEIGHTS),
      status: payStatus,
      processor: weightedPick(rng, PAYMENT_PROCESSOR_WEIGHTS),
      authorized_at: formatTimestamp(authorizedMs),
      captured_at: capturedMs === null ? null : formatTimestamp(capturedMs),
      refunded_at: refundedMs === null ? null : formatTimestamp(refundedMs),
      refund_amount_cents: refundAmountCents,
    });
    paymentId += 1;
  }
  return rows;
}

function buildEventLog(
  seed: number,
  orders: OrdersResult,
  ordersRows: Row[],
  customers: CustomersResult,
  cityDayDist: CityDayDist[]
): Row[] {
  const rng = deriveStream(seed, 'event_log');
  const rows: Row[] = [];
  let eventId = 1;

  const linkedOrderIdxs = sampleWithout(
    rng,
    Array.from({ length: ordersRows.length }, (_, i) => i),
    Math.min(LINKED_ORDER_SESSION_COUNT, ordersRows.length)
  );

  for (const orderIdx of linkedOrderIdxs) {
    const template = pick(rng, LINKED_SESSION_TEMPLATES);
    const sessionId = randomUuid(rng);
    const cityIdx = orders.cityIdx[orderIdx];
    const custId = orders.customerId[orderIdx];
    const placed = orders.placedMs[orderIdx];
    const deviceOs = weightedPick(rng, DEVICE_OS_WEIGHTS);
    const appVersion = pick(rng, APP_VERSIONS);

    const leadSeconds = intBetween(rng, 90, 1500);
    const stepCount = template.length - 1;
    for (let s = 0; s < template.length; s += 1) {
      const isLast = s === template.length - 1;
      const ts = isLast ? placed : placed - Math.round((leadSeconds * (stepCount - s)) / stepCount) * 1000;
      rows.push({
        event_id: eventId,
        customer_id: custId,
        order_id: isLast ? ordersRows[orderIdx].order_id : null,
        session_id: sessionId,
        event_type: template[s],
        event_ts: formatTimestamp(ts),
        city_id: cityIdx + 1,
        device_os: deviceOs,
        app_version: appVersion,
      });
      eventId += 1;
    }
  }

  let remaining = EVENT_LOG_TARGET - rows.length;
  while (remaining > 0) {
    const custIdx = intBetween(rng, 0, customers.rows.length - 1);
    const cityIdx = customers.cityIdx[custIdx];
    const custId = customers.rows[custIdx].customer_id as number;
    const template = pick(rng, BROWSE_SESSION_TEMPLATES);
    const sessionId = randomUuid(rng);
    const deviceOs = weightedPick(rng, DEVICE_OS_WEIGHTS);
    const appVersion = pick(rng, APP_VERSIONS);

    let dayOffset = pickDay(rng, cityDayDist[cityIdx]);
    const signupDayOffset = Math.floor((customers.signupMs[custIdx] - ANCHOR_MS) / DAY_MS);
    if (dayOffset < signupDayOffset) dayOffset = Math.min(729, signupDayOffset);
    const hour = pickIndexByCumulative(rng, HOUR_CUM);
    let ts = naiveMs(dayOffset, hour, intBetween(rng, 0, 59), intBetween(rng, 0, 59));

    for (let s = 0; s < template.length; s += 1) {
      rows.push({
        event_id: eventId,
        customer_id: custId,
        order_id: null,
        session_id: sessionId,
        event_type: template[s],
        event_ts: formatTimestamp(ts),
        city_id: cityIdx + 1,
        device_os: deviceOs,
        app_version: appVersion,
      });
      eventId += 1;
      ts += intBetween(rng, 10, 180) * 1000;
    }
    remaining -= template.length;
  }

  return rows;
}

function buildPromoRedemption(ordersRows: Row[]): Row[] {
  const rows: Row[] = [];
  let redemptionId = 1;
  for (const order of ordersRows) {
    if (order.promo_id === null) continue;
    rows.push({
      redemption_id: redemptionId,
      promo_id: order.promo_id,
      customer_id: order.customer_id,
      order_id: order.order_id,
      redeemed_at: order.placed_at,
      discount_cents: order.discount_cents,
    });
    redemptionId += 1;
  }
  return rows;
}

function buildRatings(seed: number, orders: OrdersResult, ordersRows: Row[], couriers: CouriersResult): Row[] {
  const rng = deriveStream(seed, 'ratings');
  const deliveredIdxs: number[] = [];
  for (let i = 0; i < ordersRows.length; i += 1) {
    if (orders.status[i] === 'delivered') deliveredIdxs.push(i);
  }

  const chosen = sampleWithout(rng, deliveredIdxs, Math.min(RATING_SAMPLE_COUNT, deliveredIdxs.length));

  const rows: Row[] = [];
  let ratingId = 1;
  for (const idx of chosen) {
    const order = ordersRows[idx];
    const courierId = order.courier_id as number;
    const courierIdx = courierId - 1;
    const activatedMs = couriers.activatedMs[courierIdx];
    const deliveredMs = orders.deliveredMs[idx] as number;
    const tenureDays = activatedMs === null ? 0 : Math.max(0, (deliveredMs - activatedMs) / DAY_MS);
    const meanStars = Math.min(4.6, 3.9 + tenureDays * 0.0015);
    const stars = Math.max(1, Math.min(5, Math.round(gaussian(rng, meanStars, 0.85))));
    const hasComment = bernoulli(rng, 0.15);

    rows.push({
      rating_id: ratingId,
      order_id: order.order_id,
      customer_id: order.customer_id,
      courier_id: order.courier_id,
      stars,
      comment: hasComment ? pick(rng, RATING_COMMENTS) : null,
      rated_at: formatTimestamp(deliveredMs + intBetween(rng, 300, 3 * 86400) * 1000),
    });
    ratingId += 1;
  }
  return rows;
}

function buildSupportTickets(seed: number, orders: OrdersResult, ordersRows: Row[], customers: CustomersResult): Row[] {
  const rng = deriveStream(seed, 'support_tickets');
  const ordersByCustomer = new Map<number, number[]>();
  for (let i = 0; i < ordersRows.length; i += 1) {
    const cid = orders.customerId[i];
    if (!ordersByCustomer.has(cid)) ordersByCustomer.set(cid, []);
    ordersByCustomer.get(cid)!.push(i);
  }

  const customerWeights = customers.rows.map((c) => (ordersByCustomer.get(c.customer_id as number)?.length ?? 0) + 1);
  const cumWeights = buildCumulative(customerWeights);

  const rows: Row[] = [];
  for (let i = 0; i < SUPPORT_TICKET_COUNT; i += 1) {
    const custIdx = pickIndexByCumulative(rng, cumWeights);
    const custRow = customers.rows[custIdx];
    const custId = custRow.customer_id as number;
    const custOrders = ordersByCustomer.get(custId) ?? [];

    let orderId: number | null = null;
    let openedMs: number;
    if (custOrders.length > 0 && bernoulli(rng, 0.7)) {
      const orderIdx = pick(rng, custOrders);
      orderId = ordersRows[orderIdx].order_id as number;
      openedMs = orders.placedMs[orderIdx] + intBetween(rng, 300, 5 * 86400) * 1000;
    } else {
      const signupMs = customers.signupMs[custIdx];
      const maxOffsetSec = Math.max(3600, Math.floor((DATASET_END_MS - signupMs) / 1000));
      openedMs = signupMs + intBetween(rng, 3600, maxOffsetSec) * 1000;
    }
    if (openedMs > DATASET_END_MS) openedMs = DATASET_END_MS - 3600000;

    const hasFirstResponse = bernoulli(rng, 0.94);
    const firstResponseMs = hasFirstResponse ? openedMs + intBetween(rng, 60, 7200) * 1000 : null;
    const isResolved = firstResponseMs !== null && bernoulli(rng, 0.85);
    const resolvedMs = isResolved ? (firstResponseMs as number) + intBetween(rng, 60, 86400) * 1000 : null;

    let status: string;
    if (firstResponseMs === null) status = 'open';
    else if (resolvedMs === null) status = 'pending';
    else status = weightedPick(rng, [['resolved', 80], ['closed', 20]] as const);

    const csat = resolvedMs !== null && bernoulli(rng, 0.55) ? intBetween(rng, 1, 5) : null;

    rows.push({
      ticket_id: i + 1,
      customer_id: custId,
      order_id: orderId,
      category: pick(rng, SUPPORT_CATEGORIES),
      channel: pick(rng, SUPPORT_CHANNELS),
      priority: weightedPick(rng, [['low', 50], ['medium', 30], ['high', 15], ['urgent', 5]] as const),
      opened_at: formatTimestamp(openedMs),
      first_response_at: firstResponseMs === null ? null : formatTimestamp(firstResponseMs),
      resolved_at: resolvedMs === null ? null : formatTimestamp(resolvedMs),
      status,
      csat,
      is_deleted: bernoulli(rng, 0.02),
    });
  }
  return rows;
}

// Backfills couriers.lifetime_deliveries / rating_avg from the generated orders/ratings (these
// cannot be known until both exist), then forces an exact lifetime_deliveries tie in every city
// with >= 3 couriers so RANK vs DENSE_RANK has a gap to find everywhere.
function patchCourierStats(couriers: CouriersResult, orders: OrdersResult, ratings: Row[]): void {
  const deliveredCount = new Array(couriers.rows.length).fill(0) as number[];
  for (let i = 0; i < orders.status.length; i += 1) {
    if (orders.status[i] === 'delivered') {
      const cid = orders.courierId[i];
      if (cid !== null) deliveredCount[cid - 1] += 1;
    }
  }

  const ratingSum = new Array(couriers.rows.length).fill(0) as number[];
  const ratingCount = new Array(couriers.rows.length).fill(0) as number[];
  for (const r of ratings) {
    const cid = r.courier_id as number | null;
    if (cid === null) continue;
    ratingSum[cid - 1] += r.stars as number;
    ratingCount[cid - 1] += 1;
  }

  for (let i = 0; i < couriers.rows.length; i += 1) {
    couriers.rows[i].lifetime_deliveries = deliveredCount[i];
    couriers.rows[i].rating_avg = ratingCount[i] > 0 ? round2(ratingSum[i] / ratingCount[i]) : null;
  }

  for (let c = 0; c < couriers.byCity.length; c += 1) {
    const list = couriers.byCity[c];
    if (list.length < 3) continue;
    const sorted = [...list].sort(
      (a, b) => (couriers.rows[b].lifetime_deliveries as number) - (couriers.rows[a].lifetime_deliveries as number)
    );
    couriers.rows[sorted[1]].lifetime_deliveries = couriers.rows[sorted[0]].lifetime_deliveries;
  }
}

// The clean, fully consistent core (Task 10). Every column that the mess layer (Task 11, ./mess)
// later dirties is exactly correct here: canonical enum spellings, real distinct
// master_customer_id per row, plain decimal money-as-text, no orphaned FKs, no sentinel text, a
// clean stars domain, one row per customer/payment/event. This is the answer key mess.ts's
// injected defects must remain reversible to.
export function generateClean(seed: number): Record<string, Row[]> {
  const cityWeights = buildCityWeights();
  const cityDayDist = ROVE_CITIES.map((c) => buildCityDayDist(c));

  const cities = buildCities();
  const merchants = buildMerchants(seed, cityWeights);
  const promos = buildPromos(seed);
  const customers = buildCustomers(seed, cityWeights, cityDayDist);
  const couriers = buildCouriers(seed, cityWeights, cityDayDist);

  const problemMerchantIds = new Set(
    sampleWithout(
      deriveStream(seed, 'problem_merchants'),
      merchants.rows.map((m) => m.merchant_id as number),
      3
    )
  );

  const orders = buildOrders(seed, cityWeights, cityDayDist, merchants, customers, couriers, promos);
  const payments = buildPayments(seed, orders.rows, orders, problemMerchantIds);
  const eventLog = buildEventLog(seed, orders, orders.rows, customers, cityDayDist);
  const promoRedemption = buildPromoRedemption(orders.rows);
  const ratings = buildRatings(seed, orders, orders.rows, couriers);
  const supportTickets = buildSupportTickets(seed, orders, orders.rows, customers);

  patchCourierStats(couriers, orders, ratings);

  return {
    cities,
    merchants: merchants.rows,
    promos: promos.rows,
    customers: customers.rows,
    couriers: couriers.rows,
    orders: orders.rows,
    payments,
    event_log: eventLog,
    promo_redemption: promoRedemption,
    ratings,
    support_tickets: supportTickets,
  };
}

// The seeded entrypoint (scripts/seed-rove.ts and the DatasetModule below both call THIS
// function): builds the clean core, then applies the mess layer over it in place using an
// independent named stream so adding/removing other streams elsewhere never perturbs the mess.
export function generate(seed: number): Record<string, Row[]> {
  const data = generateClean(seed);
  injectMess(data, deriveStream(seed, 'mess'));
  return data;
}

const mod: DatasetModule = { DB_NAME, SCHEMA_FILE, SEED, VERSION, TABLES, generate };
export default mod;
