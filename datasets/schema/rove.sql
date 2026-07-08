DROP TABLE IF EXISTS support_tickets, ratings, promo_redemption, event_log, payments, orders, couriers, customers, promos, merchants, cities, seed_meta CASCADE;

CREATE TABLE seed_meta (
  db text,
  version text,
  seed bigint,
  row_counts jsonb
);

CREATE TABLE cities (
  city_id          smallint PRIMARY KEY,
  name             text NOT NULL,
  country_code     char(2) NOT NULL,
  timezone         text NOT NULL,                    -- clean IANA zone; the R14 answer key
  utc_offset_hours smallint NOT NULL,                -- denormalized hint, made STALE for some rows (trap)
  latitude         numeric(8,5) NOT NULL,
  longitude        numeric(8,5) NOT NULL,
  launched_on      date NOT NULL,
  population_k      integer NOT NULL,
  is_active        boolean NOT NULL DEFAULT true
);
CREATE TABLE merchants (
  merchant_id      integer PRIMARY KEY,
  city_id          smallint NOT NULL REFERENCES cities(city_id),
  name             text NOT NULL,
  category         text NOT NULL,                    -- restaurant|grocery|pharmacy|convenience|alcohol|flowers
  price_tier       smallint NOT NULL,
  onboarded_on     date NOT NULL,
  avg_prep_minutes numeric(4,1) NOT NULL,
  is_active        boolean NOT NULL
);
CREATE TABLE promos (
  promo_id        integer PRIMARY KEY,
  code            text NOT NULL,                       -- canonical clean code (answer key for R08)
  promo_type      text NOT NULL,                       -- percent|flat|free_delivery
  value_cents     integer,
  percent_off     smallint,
  min_order_cents integer NOT NULL DEFAULT 0,
  starts_at       timestamp NOT NULL,
  ends_at         timestamp NOT NULL,
  city_id         smallint REFERENCES cities(city_id), -- NULL = all cities
  first_order_only boolean NOT NULL,
  max_redemptions integer
);
CREATE TABLE customers (
  customer_id            integer PRIMARY KEY,
  full_name              text,                        -- FIX: added; dirty (casing/whitespace/nickname), sentinel-NULL slice
  email                  text,                        -- FIX: added; dirty (case/space/mailto/domain typos), example.com/org only
  phone                  text,                        -- FIX: added; dirty formats, 555 ranges only
  signup_ts              timestamp NOT NULL,          -- naive local (cohort key via date_trunc)
  signup_city_id         smallint NOT NULL REFERENCES cities(city_id),
  acquisition_channel    text NOT NULL,               -- organic|paid_social|referral|app_store|promo
  birth_year             smallint,                    -- ~8% NULL
  segment                text NOT NULL,               -- new|casual|regular|power (drives frequency)
  referred_by_customer_id integer REFERENCES customers(customer_id),  -- self-ref, ~18%
  master_customer_id     integer NOT NULL,            -- FIX: added HIDDEN answer key; equal across a person's dup rows
  is_deleted             boolean NOT NULL DEFAULT false
);
CREATE TABLE couriers (
  courier_id         integer PRIMARY KEY,
  full_name          text,                            -- FIX: added
  phone              text,                            -- FIX: added; dirty formats, 555 ranges only
  home_city_id       smallint NOT NULL REFERENCES cities(city_id),
  applied_at         timestamp NOT NULL,              -- naive local
  approved_at        timestamp,                       -- NULL ~22% (never cleared vetting)
  activated_at       timestamp,                       -- NULL ~10% (approved, never active)
  churned_at         timestamp,                       -- NULL ~55% (still active)
  status             text NOT NULL,                   -- applied|approved|active|churned (consistent w/ timestamps; dirty casing)
  vehicle_type       text NOT NULL,                   -- bike|ebike|scooter|car (dirty casing/synonyms)
  lifetime_deliveries integer NOT NULL DEFAULT 0,      -- INTENTIONAL exact ties within city (RANK)
  rating_avg         numeric(3,2)                      -- NULL for 0-completed couriers
);
CREATE TABLE orders (
  order_id           bigint PRIMARY KEY,
  customer_id        integer NOT NULL,                -- FIX: NO FK (permit bounded purged-customer orphans, R09)
  courier_id         integer,                         -- FIX: NO FK (NULL pre-accept; bounded soft-deleted/purged orphans, R09)
  merchant_id        integer NOT NULL REFERENCES merchants(merchant_id),
  city_id            smallint NOT NULL REFERENCES cities(city_id),
  status             text NOT NULL,                   -- placed|accepted|picked_up|delivered|cancelled (dirty casing+synonyms)
  placed_at          timestamp NOT NULL,              -- naive local (FIX: timestamp not timestamptz; demand curve; AT TIME ZONE target)
  accepted_at        timestamp,                       -- naive local; NULL onward from cancel stage
  picked_up_at       timestamp,
  delivered_at       timestamp,
  cancelled_at       timestamp,
  distance_km        numeric(5,2) NOT NULL,
  subtotal_cents     integer NOT NULL,
  delivery_fee_cents integer NOT NULL,
  tip_cents          integer,                          -- ~40% NULL (vs 0 distinction for COALESCE)
  discount_cents     integer NOT NULL DEFAULT 0,
  amount_cents       integer NOT NULL,                 -- FIX: added canonical clean total = subtotal+fee+COALESCE(tip,0)-discount
  order_total_legacy text,                             -- FIX: added dirty money-as-text derived from amount_cents ($, commas, USD, '', NULL)
  surge_multiplier   numeric(3,2) NOT NULL DEFAULT 1.00,
  promo_id           integer REFERENCES promos(promo_id),  -- clean parallel FK (~21%)
  promo_code         text,                             -- FIX: added free-text, NO FK (orphans/typos/sentinels, R08)
  vendor_category    text NOT NULL
);
CREATE TABLE payments (
  payment_id       bigint PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES orders(order_id),   -- NOT unique: R16 allows retries/dupes
  amount_cents     integer NOT NULL,                  -- clean truth
  amount_legacy    text,                              -- FIX: added dirty money-as-text
  currency         char(3) NOT NULL,
  method           text NOT NULL,                     -- dirty casing/synonyms
  status           text NOT NULL,                     -- paid|refunded|chargeback (+ captured/failed synonyms, R02)
  processor        text NOT NULL,
  authorized_at    timestamp NOT NULL,                -- naive local
  captured_at      timestamp,
  refunded_at      timestamp,
  refund_amount_cents integer
);
CREATE TABLE event_log (
  event_id    bigint PRIMARY KEY,
  customer_id integer NOT NULL,                        -- no FK (matches orders looseness)
  order_id    bigint,
  session_id  uuid NOT NULL,                           -- generator ground truth; re-derived in sessionization lesson
  event_type  text NOT NULL,                           -- app_open|search|view_merchant|add_to_cart|checkout_start|order_placed|support_open
  event_ts    timestamp NOT NULL,                      -- naive local (FIX: timestamp; AT TIME ZONE target); bounded clock-skew (R11)
  city_id     smallint NOT NULL REFERENCES cities(city_id),
  device_os   text NOT NULL,
  app_version text NOT NULL
);
CREATE TABLE promo_redemption (
  redemption_id  bigint PRIMARY KEY,
  promo_id       integer NOT NULL REFERENCES promos(promo_id),
  customer_id    integer NOT NULL,
  order_id       bigint NOT NULL REFERENCES orders(order_id),
  redeemed_at    timestamp NOT NULL,
  discount_cents integer NOT NULL
);
CREATE TABLE ratings (
  rating_id   bigint PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES orders(order_id),
  customer_id integer NOT NULL,
  courier_id  integer,
  stars       smallint NOT NULL,                       -- valid 1..5; R12 injects 0/6/-1/99 sentinels
  comment     text,                                    -- ~85% NULL
  rated_at    timestamp NOT NULL
);
CREATE TABLE support_tickets (
  ticket_id        integer PRIMARY KEY,
  customer_id      integer NOT NULL,
  order_id         bigint,                             -- ~30% NULL
  category         text NOT NULL,                      -- dirty casing/synonyms (R01/R02)
  channel          text NOT NULL,
  priority         text NOT NULL,
  opened_at        timestamp NOT NULL,
  first_response_at timestamp,                         -- ~6% NULL (never answered)
  resolved_at      timestamp,
  status           text NOT NULL,
  csat             smallint,                           -- ~40% set
  is_deleted       boolean NOT NULL DEFAULT false
);
