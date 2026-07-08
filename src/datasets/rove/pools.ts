// Curated value pools for the Rove dataset (cities, merchants, promos, customers, couriers,
// orders, payments, event_log, promo_redemption, ratings, support_tickets). Everything here is a
// plain, real-sounding value with no banned tokens; the generator's seeded streams combine these
// deterministically. Every column that the mess taxonomy later dirties (Task 11) stays canonical
// here: one spelling per concept, no whitespace, no synonyms.

export interface RoveCitySeed {
  name: string;
  countryCode: string;
  timezone: string;
  utcOffsetHours: number;
  latitude: number;
  longitude: number;
  populationK: number;
  launchOffsetDays: number; // relative to ANCHOR_MS; negative = already live before the window
  areaCode: string;
}

// 16 US metros spanning all four continental US time zones (Pacific/Mountain/Central/Eastern) so
// the local-hour demand curve produces genuinely different peak UTC-equivalent hours per city (the
// R14 "AT TIME ZONE via city join" lesson target). The last two (Charlotte, Baltimore) launch deep
// into the dataset window on purpose, giving them tiny signup/order cohorts relative to the 14
// founding cities that were already live before ANCHOR_MS.
export const ROVE_CITIES: readonly RoveCitySeed[] = [
  { name: 'Portland', countryCode: 'US', timezone: 'America/Los_Angeles', utcOffsetHours: -8, latitude: 45.52, longitude: -122.68, populationK: 650, launchOffsetDays: -900, areaCode: '503' },
  { name: 'Seattle', countryCode: 'US', timezone: 'America/Los_Angeles', utcOffsetHours: -8, latitude: 47.61, longitude: -122.33, populationK: 750, launchOffsetDays: -880, areaCode: '206' },
  { name: 'Sacramento', countryCode: 'US', timezone: 'America/Los_Angeles', utcOffsetHours: -8, latitude: 38.58, longitude: -121.49, populationK: 520, launchOffsetDays: -700, areaCode: '916' },
  { name: 'Denver', countryCode: 'US', timezone: 'America/Denver', utcOffsetHours: -7, latitude: 39.74, longitude: -104.99, populationK: 715, launchOffsetDays: -860, areaCode: '303' },
  { name: 'Phoenix', countryCode: 'US', timezone: 'America/Phoenix', utcOffsetHours: -7, latitude: 33.45, longitude: -112.07, populationK: 1680, launchOffsetDays: -840, areaCode: '602' },
  { name: 'Tucson', countryCode: 'US', timezone: 'America/Phoenix', utcOffsetHours: -7, latitude: 32.22, longitude: -110.93, populationK: 545, launchOffsetDays: -600, areaCode: '520' },
  { name: 'Austin', countryCode: 'US', timezone: 'America/Chicago', utcOffsetHours: -6, latitude: 30.27, longitude: -97.74, populationK: 965, launchOffsetDays: -910, areaCode: '512' },
  { name: 'Chicago', countryCode: 'US', timezone: 'America/Chicago', utcOffsetHours: -6, latitude: 41.88, longitude: -87.63, populationK: 2700, launchOffsetDays: -930, areaCode: '312' },
  { name: 'Dallas', countryCode: 'US', timezone: 'America/Chicago', utcOffsetHours: -6, latitude: 32.78, longitude: -96.80, populationK: 1340, launchOffsetDays: -800, areaCode: '214' },
  { name: 'Nashville', countryCode: 'US', timezone: 'America/Chicago', utcOffsetHours: -6, latitude: 36.16, longitude: -86.78, populationK: 690, launchOffsetDays: -750, areaCode: '615' },
  { name: 'Minneapolis', countryCode: 'US', timezone: 'America/Chicago', utcOffsetHours: -6, latitude: 44.98, longitude: -93.27, populationK: 425, launchOffsetDays: -500, areaCode: '612' },
  { name: 'Boston', countryCode: 'US', timezone: 'America/New_York', utcOffsetHours: -5, latitude: 42.36, longitude: -71.06, populationK: 685, launchOffsetDays: -920, areaCode: '617' },
  { name: 'Miami', countryCode: 'US', timezone: 'America/New_York', utcOffsetHours: -5, latitude: 25.76, longitude: -80.19, populationK: 470, launchOffsetDays: -870, areaCode: '305' },
  { name: 'Atlanta', countryCode: 'US', timezone: 'America/New_York', utcOffsetHours: -5, latitude: 33.75, longitude: -84.39, populationK: 500, launchOffsetDays: -820, areaCode: '404' },
  { name: 'Charlotte', countryCode: 'US', timezone: 'America/New_York', utcOffsetHours: -5, latitude: 35.23, longitude: -80.84, populationK: 150, launchOffsetDays: 600, areaCode: '704' },
  { name: 'Baltimore', countryCode: 'US', timezone: 'America/New_York', utcOffsetHours: -5, latitude: 39.29, longitude: -76.61, populationK: 90, launchOffsetDays: 660, areaCode: '410' },
];

export const MERCHANT_CATEGORY_WEIGHTS: readonly (readonly [string, number])[] = [
  ['restaurant', 55],
  ['grocery', 15],
  ['pharmacy', 8],
  ['convenience', 12],
  ['alcohol', 6],
  ['flowers', 4],
];

export interface MerchantNameParts {
  prefixes: readonly string[];
  suffixes: readonly string[];
}

export const MERCHANT_NAME_PARTS: Record<string, MerchantNameParts> = {
  restaurant: {
    prefixes: ['Cedar', 'Maple', 'Harbor', 'Summit', 'Golden', 'Blue Ridge', 'Copper', 'Willow', 'Prairie', 'Ember', 'Sunset', 'Riverside'],
    suffixes: ['Kitchen', 'Grill', 'Bistro', 'Diner', 'Eatery', 'Cantina', 'Table', 'Noodle House'],
  },
  grocery: {
    prefixes: ['Fresh', 'Corner', 'Neighborhood', 'Green', 'Harvest', 'Meadow', 'Orchard'],
    suffixes: ['Market', 'Grocer', 'Foods', 'Provisions', 'Pantry'],
  },
  pharmacy: {
    prefixes: ['City', 'Wellness', 'Care', 'Family', 'Main Street', 'Cornerstone'],
    suffixes: ['Pharmacy', 'Drugs', 'Rx', 'Apothecary'],
  },
  convenience: {
    prefixes: ['Quick', 'Corner', 'Express', 'Depot', 'Handy', 'Anchor'],
    suffixes: ['Mart', 'Stop', 'Shop', 'Corner Store'],
  },
  alcohol: {
    prefixes: ['The Vintage', 'Granite', 'Copper Barrel', 'Lantern', 'Harbor', 'Cedar'],
    suffixes: ['Cellar', 'Spirits', 'Wine and Spirits', 'Bottle Shop', 'Taproom'],
  },
  flowers: {
    prefixes: ['Bloom', 'Petal', 'Meadow', 'Willow', 'Garden Row', 'Springtime'],
    suffixes: ['Florist', 'Blooms', 'Flowers', 'Petals', 'Garden Co'],
  },
};

export const PRICE_TIER_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 30],
  [2, 35],
  [3, 25],
  [4, 10],
];

export const PROMO_ROOTS: readonly string[] = [
  'SAVE', 'WELCOME', 'ROVE', 'SUMMER', 'WINTER', 'WEEKEND', 'LUNCH', 'FIRSTORDER', 'FREESHIP',
  'TREAT', 'FRESH', 'EXPRESS', 'LOCAL', 'COMEBACK', 'SPRING',
];

export const ACQUISITION_CHANNEL_WEIGHTS: readonly (readonly [string, number])[] = [
  ['organic', 38],
  ['paid_social', 24],
  ['referral', 18],
  ['app_store', 15],
  ['promo', 5],
];

export const SEGMENT_WEIGHTS: readonly (readonly [string, number])[] = [
  ['new', 30],
  ['casual', 35],
  ['regular', 25],
  ['power', 10],
];

// Relative order-frequency multiplier per segment; feeds the retention-weighted customer picker.
export const SEGMENT_ACTIVITY_MULT: Record<string, number> = {
  new: 1,
  casual: 1.6,
  regular: 2.6,
  power: 4.4,
};

// Retention "slightly better for referral/organic than paid_social" multiplier.
export const CHANNEL_RETENTION_MULT: Record<string, number> = {
  organic: 1.1,
  referral: 1.15,
  app_store: 1.0,
  promo: 0.95,
  paid_social: 0.85,
};

// Relative weight by whole months of tenure (index 0 = signup month), approximating the spec's
// ~100/48/33/26/22... monthly retention decay.
export const RETENTION_WEIGHTS: readonly number[] = [
  100, 48, 33, 26, 22, 19, 17, 15, 14, 13, 12, 11, 10, 9, 9, 8, 8, 7, 7, 6, 6, 6, 5, 5,
];

export const VEHICLE_TYPE_WEIGHTS: readonly (readonly [string, number])[] = [
  ['bike', 30],
  ['ebike', 25],
  ['scooter', 20],
  ['car', 25],
];

export const PAYMENT_METHOD_WEIGHTS: readonly (readonly [string, number])[] = [
  ['credit_card', 45],
  ['debit_card', 20],
  ['paypal', 15],
  ['apple_pay', 12],
  ['google_pay', 6],
  ['gift_card', 2],
];

export const PAYMENT_PROCESSOR_WEIGHTS: readonly (readonly [string, number])[] = [
  ['stripe', 50],
  ['braintree', 20],
  ['adyen', 20],
  ['worldpay', 10],
];

export const DEVICE_OS_WEIGHTS: readonly (readonly [string, number])[] = [
  ['iOS', 55],
  ['Android', 45],
];

export const APP_VERSIONS: readonly string[] = [
  '3.2.0', '3.3.0', '3.3.1', '3.4.0', '3.4.2', '3.5.0', '3.5.1', '3.6.0',
];

export const EVENT_TYPES = {
  APP_OPEN: 'app_open',
  SEARCH: 'search',
  VIEW_MERCHANT: 'view_merchant',
  ADD_TO_CART: 'add_to_cart',
  CHECKOUT_START: 'checkout_start',
  ORDER_PLACED: 'order_placed',
  SUPPORT_OPEN: 'support_open',
} as const;

// Session templates for order-linked event trails (end in order_placed).
export const LINKED_SESSION_TEMPLATES: readonly (readonly string[])[] = [
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.ORDER_PLACED],
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.VIEW_MERCHANT, EVENT_TYPES.CHECKOUT_START, EVENT_TYPES.ORDER_PLACED],
  [
    EVENT_TYPES.APP_OPEN,
    EVENT_TYPES.SEARCH,
    EVENT_TYPES.VIEW_MERCHANT,
    EVENT_TYPES.ADD_TO_CART,
    EVENT_TYPES.CHECKOUT_START,
    EVENT_TYPES.ORDER_PLACED,
  ],
];

// Session templates for browsing sessions that never convert to an order.
export const BROWSE_SESSION_TEMPLATES: readonly (readonly string[])[] = [
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.SEARCH],
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.VIEW_MERCHANT],
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.SEARCH, EVENT_TYPES.VIEW_MERCHANT],
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.SEARCH, EVENT_TYPES.VIEW_MERCHANT, EVENT_TYPES.ADD_TO_CART],
  [EVENT_TYPES.APP_OPEN, EVENT_TYPES.SUPPORT_OPEN],
];

export const SUPPORT_CATEGORIES: readonly string[] = [
  'missing_item', 'late_delivery', 'payment_issue', 'app_bug', 'courier_behavior', 'refund_request', 'order_quality', 'other',
];

export const SUPPORT_CHANNELS: readonly string[] = ['app', 'email', 'chat', 'phone'];
export const SUPPORT_PRIORITIES: readonly string[] = ['low', 'medium', 'high', 'urgent'];
export const SUPPORT_STATUSES: readonly string[] = ['open', 'pending', 'resolved', 'closed'];

export const RATING_COMMENTS: readonly string[] = [
  'Food arrived hot and on time, great experience.',
  'Courier was friendly and quick.',
  'Order took longer than expected.',
  'Missing an item from my order.',
  'Everything was perfect, will order again.',
  'Delivery was a bit late but the food was good.',
  'Packaging could be better, some items were spilled.',
  'Fast delivery, courier was polite.',
  'Not happy with the order accuracy this time.',
  'Great service, five stars.',
  'Courier had trouble finding the address.',
  'Really appreciated the quick turnaround.',
  'Food was cold on arrival.',
  'Smooth process from start to finish.',
  'Would recommend this merchant to others.',
];
