<#
  olist-setup.ps1
  Downloads the Olist Brazilian e-commerce dataset (CSV) and loads it into a local
  PostgreSQL database named "olist" — the advanced dataset for the senior analytics phases.

  Requirements:
    - PostgreSQL client tools (psql) on PATH  (e.g. C:\Program Files\PostgreSQL\16\bin)
    - A running local PostgreSQL you can create a database in
    - Internet access (pulls CSVs from a public GitHub mirror; no Kaggle account needed)

  Usage (from any PowerShell window):
    $env:PGUSER = "postgres"          # if not already set
    $env:PGPASSWORD = "yourpassword"  # optional; you'll be prompted if unset
    ./scripts/olist-setup.ps1

  Re-runnable: it drops and recreates the olist database each time.
#>

$ErrorActionPreference = 'Stop'

# ---- connection settings (env vars win; sensible defaults otherwise) ----
$PGHOST = if ($env:PGHOST) { $env:PGHOST } else { 'localhost' }
$PGPORT = if ($env:PGPORT) { $env:PGPORT } else { '5432' }
$PGUSER = if ($env:PGUSER) { $env:PGUSER } else { 'postgres' }
$DBNAME = 'olist'
$env:PGCLIENTENCODING = 'UTF8'

# find psql: PATH first, then $env:PSQL, then the standard PostgreSQL install dirs
$Psql = $null
if (Get-Command psql -ErrorAction SilentlyContinue) {
  $Psql = 'psql'
} elseif ($env:PSQL -and (Test-Path $env:PSQL)) {
  $Psql = $env:PSQL
} else {
  $found = @()
  foreach ($root in @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL", "$env:LOCALAPPDATA\Programs\PostgreSQL")) {
    if (Test-Path $root) { $found += Get-ChildItem $root -Recurse -Filter psql.exe -ErrorAction SilentlyContinue }
  }
  # prefer the real client under \bin\, highest version number
  $best = $found | Where-Object { $_.FullName -match '\\bin\\psql\.exe$' } | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $best) { $best = $found | Sort-Object FullName -Descending | Select-Object -First 1 }
  if ($best) { $Psql = $best.FullName }
}
if (-not $Psql) {
  throw "psql was not found. Set `$env:PSQL to the full path of psql.exe (e.g. 'C:\Program Files\PostgreSQL\18\bin\psql.exe') and re-run."
}
Write-Host "Using psql: $Psql"

# password: use PGPASSWORD if present, otherwise prompt once
if (-not $env:PGPASSWORD) {
  $sec = Read-Host "PostgreSQL password for user '$PGUSER'" -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

# ---- 1. download the CSVs to a temp folder ----
$base = 'https://raw.githubusercontent.com/Ganesh7699/Brazilian-E-Commerce-OList/main'
$tmp  = Join-Path $env:TEMP 'olist-data'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$files = @(
  'olist_customers_dataset', 'olist_orders_dataset', 'olist_order_items_dataset',
  'olist_order_payments_dataset', 'olist_order_reviews_dataset', 'olist_products_dataset',
  'olist_sellers_dataset', 'product_category_name_translation',
  'olist_closed_deals_dataset', 'olist_marketing_qualified_leads_dataset'
)
# robust download: curl.exe (built into Windows 10/11) retries and fails loudly on
# a dropped connection; then we verify the on-disk size matches the server's.
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
foreach ($f in $files) {
  $dest = Join-Path $tmp "$f.csv"
  $url  = "$base/$f.csv"
  Write-Host "Downloading $f.csv ..."
  if ($curl) {
    & curl.exe -sSL --fail --retry 5 --retry-all-errors -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "Download failed for $f.csv" }
  } else {
    $ok = $false
    for ($try = 1; $try -le 5 -and -not $ok; $try++) {
      try { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing; $ok = $true }
      catch { if ($try -eq 5) { throw }; Start-Sleep 3 }
    }
  }
  # integrity check: local bytes must equal the server's Content-Length
  try {
    $remote = [int64]((Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing).Headers['Content-Length'])
    $local  = (Get-Item $dest).Length
    if ($remote -gt 0 -and $local -ne $remote) {
      throw "Incomplete download for $f.csv ($local of $remote bytes). Re-run the script."
    }
  } catch [System.Net.WebException] { }  # HEAD not supported → skip the check
}

# ---- helpers ----
function Invoke-Psql([string]$db, [string]$sql) {
  & $Psql -h $PGHOST -p $PGPORT -U $PGUSER -d $db -v ON_ERROR_STOP=1 -q -c $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed on: $sql" }
}
function Import-Csv-Table([string]$table, [string]$file, [string]$withOpts) {
  $path = (Join-Path $tmp "$file.csv") -replace '\\', '/'
  $cmd  = "\copy $table FROM '$path' WITH ($withOpts)"
  & $Psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DBNAME -v ON_ERROR_STOP=1 -q -c $cmd
  if ($LASTEXITCODE -ne 0) { throw "Load failed for table '$table'." }
  Write-Host "  loaded $table"
}

# ---- 2. (re)create the database ----
Write-Host "Creating database '$DBNAME' ..."
Invoke-Psql 'postgres' "DROP DATABASE IF EXISTS $DBNAME WITH (FORCE);"
Invoke-Psql 'postgres' "CREATE DATABASE $DBNAME WITH ENCODING 'UTF8' TEMPLATE template0;"

# ---- 3. schema (clean table + column names; order matches each CSV) ----
$schema = @'
CREATE TABLE customers (
  customer_id            text PRIMARY KEY,
  customer_unique_id     text,
  customer_zip_code_prefix int,
  customer_city          text,
  customer_state         text
);
CREATE TABLE orders (
  order_id               text PRIMARY KEY,
  customer_id            text,
  order_status           text,
  order_purchase_timestamp     timestamp,
  order_approved_at            timestamp,
  order_delivered_carrier_date timestamp,
  order_delivered_customer_date timestamp,
  order_estimated_delivery_date timestamp
);
CREATE TABLE order_items (
  order_id               text,
  order_item_id          int,
  product_id             text,
  seller_id              text,
  shipping_limit_date    timestamp,
  price                  numeric,
  freight_value          numeric
);
CREATE TABLE order_payments (
  order_id               text,
  payment_sequential     int,
  payment_type           text,
  payment_installments   int,
  payment_value          numeric
);
CREATE TABLE order_reviews (
  review_id              text,
  order_id               text,
  review_score           int,
  review_comment_title   text,
  review_comment_message text,
  review_creation_date   timestamp,
  review_answer_timestamp timestamp
);
CREATE TABLE products (
  product_id             text PRIMARY KEY,
  product_category_name  text,
  product_name_length    int,
  product_description_length int,
  product_photos_qty     int,
  product_weight_g       int,
  product_length_cm      int,
  product_height_cm      int,
  product_width_cm       int
);
CREATE TABLE sellers (
  seller_id              text PRIMARY KEY,
  seller_zip_code_prefix int,
  seller_city            text,
  seller_state           text
);
CREATE TABLE category_translation (
  product_category_name  text,
  product_category_name_english text
);
CREATE TABLE closed_deals (
  mql_id                 text,
  seller_id              text,
  sdr_id                 text,
  sr_id                  text,
  won_date               timestamp,
  business_segment       text,
  lead_type              text,
  lead_behaviour_profile text,
  has_company            text,
  has_gtin               text,
  average_stock          text,
  business_type          text,
  declared_product_catalog_size numeric,
  declared_monthly_revenue      numeric
);
CREATE TABLE qualified_leads (
  mql_id                 text,
  first_contact_date     date,
  landing_page_id        text,
  origin                 text
);
'@
Write-Host "Creating schema ..."
$schema | & $Psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DBNAME -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw "Schema creation failed." }

# ---- 4. load each CSV (FORCE_NULL turns empty quoted fields "" into NULL for typed columns) ----
Write-Host "Loading data ..."
Import-Csv-Table 'customers'            'olist_customers_dataset'                'FORMAT csv, HEADER true'
Import-Csv-Table 'orders'               'olist_orders_dataset'                   'FORMAT csv, HEADER true, FORCE_NULL (order_approved_at, order_delivered_carrier_date, order_delivered_customer_date, order_estimated_delivery_date)'
Import-Csv-Table 'order_items'          'olist_order_items_dataset'              'FORMAT csv, HEADER true'
Import-Csv-Table 'order_payments'       'olist_order_payments_dataset'           'FORMAT csv, HEADER true'
Import-Csv-Table 'order_reviews'        'olist_order_reviews_dataset'            'FORMAT csv, HEADER true, FORCE_NULL (review_creation_date, review_answer_timestamp)'
Import-Csv-Table 'products'             'olist_products_dataset'                 'FORMAT csv, HEADER true, FORCE_NULL (product_name_length, product_description_length, product_photos_qty, product_weight_g, product_length_cm, product_height_cm, product_width_cm)'
Import-Csv-Table 'sellers'              'olist_sellers_dataset'                  'FORMAT csv, HEADER true'
Import-Csv-Table 'category_translation' 'product_category_name_translation'      'FORMAT csv, HEADER true'
Import-Csv-Table 'closed_deals'         'olist_closed_deals_dataset'             'FORMAT csv, HEADER true, FORCE_NULL (won_date, declared_product_catalog_size, declared_monthly_revenue)'
Import-Csv-Table 'qualified_leads'      'olist_marketing_qualified_leads_dataset' 'FORMAT csv, HEADER true, FORCE_NULL (first_contact_date)'

# ---- 5. helpful foreign keys + indexes (make joins fast and the schema explorable) ----
$constraints = @'
ALTER TABLE orders         ADD CONSTRAINT fk_orders_customer  FOREIGN KEY (customer_id) REFERENCES customers(customer_id);
ALTER TABLE order_items    ADD CONSTRAINT fk_items_order      FOREIGN KEY (order_id)    REFERENCES orders(order_id);
ALTER TABLE order_items    ADD CONSTRAINT fk_items_product    FOREIGN KEY (product_id)  REFERENCES products(product_id);
ALTER TABLE order_items    ADD CONSTRAINT fk_items_seller     FOREIGN KEY (seller_id)   REFERENCES sellers(seller_id);
ALTER TABLE order_payments ADD CONSTRAINT fk_payments_order   FOREIGN KEY (order_id)    REFERENCES orders(order_id);
CREATE INDEX idx_orders_purchase ON orders (order_purchase_timestamp);
CREATE INDEX idx_items_order     ON order_items (order_id);
CREATE INDEX idx_payments_order  ON order_payments (order_id);
CREATE INDEX idx_reviews_order   ON order_reviews (order_id);
'@
Write-Host "Adding keys and indexes ..."
$constraints | & $Psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DBNAME -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { Write-Warning "Some constraints/indexes failed (data loaded OK; joins still work)." }

# ---- 6. sanity check ----
Write-Host "`nRow counts:"
& $Psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DBNAME -q -c "SELECT 'customers' t, count(*) FROM customers UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'order_items', count(*) FROM order_items UNION ALL SELECT 'order_payments', count(*) FROM order_payments UNION ALL SELECT 'order_reviews', count(*) FROM order_reviews UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'sellers', count(*) FROM sellers ORDER BY 1;"

Write-Host "`nDone. 'olist' is ready. Expect ~99k orders, ~99k customers, ~112k order_items, ~32k products, ~3k sellers." -ForegroundColor Green
