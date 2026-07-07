// Curated value pools for the Sideline dataset (region, team, player, tournament, match,
// map_result, roster_change, sponsor, team_sponsor). Everything here is a plain, real-sounding
// value with no banned tokens; the generator's seeded streams combine these deterministically.

export interface RegionSeed {
  shortCode: string;
  name: string;
  countries: readonly string[];
  cities: readonly string[];
}

// Eight competitive regions, matching the DDL's short_code CHECK-by-convention values
// (NA,EU,KR,BR,CN,SEA,JP,OCE). Each carries its own country/city pool so team home_city,
// tournament host_city/host_country, and player.country stay region appropriate.
export const REGIONS: readonly RegionSeed[] = [
  {
    shortCode: 'NA',
    name: 'North America',
    countries: ['United States', 'Canada'],
    cities: ['Los Angeles', 'Toronto', 'Dallas', 'Seattle', 'Chicago', 'Miami'],
  },
  {
    shortCode: 'EU',
    name: 'Europe',
    countries: ['Germany', 'France', 'Sweden', 'Poland', 'United Kingdom', 'Spain'],
    cities: ['Berlin', 'Paris', 'Stockholm', 'Warsaw', 'London', 'Madrid'],
  },
  {
    shortCode: 'KR',
    name: 'Korea',
    countries: ['South Korea'],
    cities: ['Seoul', 'Busan', 'Incheon'],
  },
  {
    shortCode: 'BR',
    name: 'Brazil',
    countries: ['Brazil'],
    cities: ['Sao Paulo', 'Rio de Janeiro', 'Curitiba'],
  },
  {
    shortCode: 'CN',
    name: 'China',
    countries: ['China'],
    cities: ['Shanghai', 'Beijing', 'Chengdu', 'Shenzhen'],
  },
  {
    shortCode: 'SEA',
    name: 'Southeast Asia',
    countries: ['Philippines', 'Indonesia', 'Thailand', 'Vietnam', 'Singapore'],
    cities: ['Manila', 'Jakarta', 'Bangkok', 'Ho Chi Minh City', 'Singapore'],
  },
  {
    shortCode: 'JP',
    name: 'Japan',
    countries: ['Japan'],
    cities: ['Tokyo', 'Osaka', 'Nagoya'],
  },
  {
    shortCode: 'OCE',
    name: 'Oceania',
    countries: ['Australia', 'New Zealand'],
    cities: ['Sydney', 'Melbourne', 'Auckland'],
  },
];

// Number of teams seeded per region, in REGIONS order. Sums to 40.
export const TEAMS_PER_REGION: readonly number[] = [7, 7, 6, 5, 5, 4, 3, 3];

// Parallel root/tag pools for team names and tickers: sampling indices without replacement
// guarantees both name and tag stay unique in one draw, since each root maps to exactly one tag.
export const TEAM_NAME_ROOTS: readonly string[] = [
  'Velocity', 'Eclipse', 'Specter', 'Nova', 'Zenith', 'Rampart', 'Cinder', 'Talon', 'Vantage', 'Obsidian',
  'Frostline', 'Ironclad', 'Solstice', 'Quartz', 'Ashen', 'Wraith', 'Halcyon', 'Cobalt', 'Vortex', 'Skyline',
  'Paragon', 'Riftline', 'Aurora', 'Blitz', 'Catalyst', 'Dominion', 'Ember', 'Fracture', 'Glacier', 'Havoc',
  'Ignite', 'Jolt', 'Kinetic', 'Lumen', 'Momentum', 'Nomad', 'Onyx', 'Pulse', 'Quantum', 'Rogue',
  'Surge', 'Titan', 'Umbra', 'Vertex', 'Wildfire',
];

export const TEAM_TAGS: readonly string[] = [
  'VEL', 'ECL', 'SPTR', 'NOVA', 'ZEN', 'RAMP', 'CIN', 'TLN', 'VNTG', 'OBS',
  'FRST', 'IRON', 'SOL', 'QTZ', 'ASH', 'WRTH', 'HALC', 'COB', 'VTX', 'SKY',
  'PARA', 'RIFT', 'AUR', 'BLZ', 'CAT', 'DOM', 'EMB', 'FRAC', 'GLAC', 'HVC',
  'IGN', 'JLT', 'KIN', 'LUM', 'MOM', 'NMD', 'ONX', 'PLS', 'QTM', 'RGE',
  'SRG', 'TTN', 'UMB', 'VRT', 'WLD',
];

export const TEAM_NAME_SUFFIXES: readonly string[] = [
  'Esports', 'Gaming', 'Guild', 'Collective', 'Syndicate', 'Academy', 'Squad',
];

// Gamertag fragments. The generator crosses every prefix with every suffix (20 x 15 = 300
// combinations) and samples 280 without replacement, guaranteeing unique handles by construction.
export const HANDLE_PREFIXES: readonly string[] = [
  'Zeph', 'Kryo', 'Nex', 'Vyn', 'Rax', 'Sly', 'Jinx', 'Volt', 'Ashen', 'Rook',
  'Kite', 'Frost', 'Grim', 'Snap', 'Ozone', 'Halo', 'Vex', 'Cinder', 'Dusk', 'Rune',
];

export const HANDLE_SUFFIXES: readonly string[] = [
  'ling', 'zor', 'yte', 'ix', 'ara', 'oni', 'ex', 'wick', 'fall', 'byte',
  'storm', 'shade', 'wing', 'crest', 'flux',
];

export interface NamePool {
  given: readonly string[];
  surname: readonly string[];
}

// Region-weighted given/surname parts so player.full_name reads as region appropriate. Keyed by
// short_code; the generator looks this up per player based on the region their team (or, for
// free agents, a randomly assigned home region) belongs to.
export const REGION_NAME_POOLS: Record<string, NamePool> = {
  NA: {
    given: ['Tyler', 'Jordan', 'Cameron', 'Austin', 'Dylan', 'Hunter', 'Blake', 'Mason', 'Logan', 'Ethan', 'Noah', 'Wyatt', 'Colton', 'Trevor', 'Brody'],
    surname: ['Carter', 'Bennett', 'Foster', 'Reyes', 'Coleman', 'Sullivan', 'Barrett', 'Hayes', 'Fletcher', 'Chambers', 'Whitman', 'Ellison', 'Prescott', 'Donovan', 'Kingsley'],
  },
  EU: {
    given: ['Lukas', 'Mateusz', 'Erik', 'Hugo', 'Felix', 'Viktor', 'Oliver', 'Anton', 'Sebastian', 'Elias', 'Jonas', 'Maxime', 'Nils', 'Tomas', 'Adrian'],
    surname: ['Muller', 'Schneider', 'Andersson', 'Lindqvist', 'Kowalski', 'Nowak', 'Dubois', 'Lefevre', 'Garcia', 'Fernandez', 'Novak', 'Horvat', 'Larsen', 'Berg', 'Weber'],
  },
  KR: {
    given: ['Minjun', 'Seojun', 'Doyoon', 'Jihoon', 'Hyunwoo', 'Junho', 'Seungmin', 'Taeyang', 'Woojin', 'Donghyun', 'Yerin', 'Sooyoung', 'Jimin', 'Hyeri', 'Nayoung'],
    surname: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon'],
  },
  BR: {
    given: ['Lucas', 'Gabriel', 'Matheus', 'Pedro', 'Rafael', 'Bruno', 'Felipe', 'Thiago', 'Diego', 'Gustavo', 'Vitor', 'Caio', 'Leonardo', 'Igor', 'Andre'],
    surname: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araujo', 'Melo', 'Barbosa', 'Ribeiro', 'Teixeira'],
  },
  CN: {
    given: ['Wei', 'Jian', 'Hao', 'Lei', 'Yang', 'Ming', 'Feng', 'Bo', 'Chao', 'Peng', 'Xin', 'Jun', 'Kai', 'Long', 'Rui'],
    surname: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu'],
  },
  SEA: {
    given: ['Ronnel', 'Kevin', 'Jayson', 'Angelo', 'Miguel', 'Andi', 'Budi', 'Wira', 'Somchai', 'Anucha', 'Minh', 'Duc', 'Hai', 'Farhan', 'Rizky'],
    surname: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Wijaya', 'Santoso', 'Saetang', 'Chaiyasit', 'Nguyen', 'Tran', 'Pham', 'Le', 'Hasan', 'Wibowo', 'Kusuma'],
  },
  JP: {
    given: ['Haruto', 'Yuto', 'Sota', 'Ren', 'Riku', 'Kaito', 'Sora', 'Itsuki', 'Hinata', 'Yuma', 'Takumi', 'Kenta', 'Ryo', 'Sho', 'Daiki'],
    surname: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Saito', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi'],
  },
  OCE: {
    given: ['Jack', 'Liam', 'Noah', 'Cooper', 'Ryan', 'Riley', 'Lachlan', 'Harrison', 'Ethan', 'Jayden', 'Zac', 'Hayden', 'Connor', 'Flynn', 'Beau'],
    surname: ['Smith', 'Wilson', 'Taylor', 'Anderson', 'Thompson', 'White', 'Harris', 'Robinson', 'Walker', 'Turner', 'Mitchell', 'Campbell', 'Stewart', 'Morris', 'Cooper'],
  },
};

export const PLAYER_ROLES: readonly string[] = ['Duelist', 'Sentinel', 'Controller', 'Initiator', 'IGL', 'Flex'];

// Valorant's standard competitive map pool.
export const MAP_POOL: readonly string[] = ['Ascent', 'Bind', 'Haven', 'Split', 'Lotus', 'Sunset', 'Icebox'];

export const CHANGE_REASONS: readonly string[] = ['Signed', 'Transfer', 'Promoted', 'Loan', 'Released', 'Retired', 'Benched'];

export const TOURNAMENT_STAGES: readonly string[] = ['Group', 'Quarterfinal', 'Semifinal', 'Final', 'Grand Final'];

// International (region_id NULL) event names: enough for every non-regional tournament slot.
export const INTERNATIONAL_TOURNAMENT_NAMES: readonly string[] = [
  'Global Championship', 'World Masters', 'Champions Cup', 'Ignition World Finals',
  'Continental Clash', 'Apex Invitational', 'Rift Valley Major', 'Horizon Series Finals',
];

// Regional event name suffixes, combined with a region's name at generation time.
export const REGIONAL_TOURNAMENT_SUFFIXES: readonly string[] = [
  'Open', 'Challengers', 'Masters', 'Circuit Finals', 'Proving Grounds', 'Regional Series',
];

export interface SponsorSeed {
  name: string;
  industry: string;
}

// 30 unique sponsor name/industry pairs (parallel, not separate pools) so a name never gets
// paired with a mismatched industry. Index 0, "Voltrush Energy", is the seeded energy-drink
// megabrand that lands on ~10 teams.
export const SPONSORS: readonly SponsorSeed[] = [
  { name: 'Voltrush Energy', industry: 'Energy Drink' },
  { name: 'Cragmont Hardware', industry: 'Hardware' },
  { name: 'Peregrine Airlines', industry: 'Airline' },
  { name: 'Lumen Telecom', industry: 'Telecom' },
  { name: 'Bastion Insurance', industry: 'Insurance' },
  { name: 'Redline Automotive', industry: 'Automotive' },
  { name: 'Solace Apparel', industry: 'Apparel' },
  { name: 'Northwind Bank', industry: 'Finance' },
  { name: 'Circuitry Labs', industry: 'Hardware' },
  { name: 'Kestrel Software', industry: 'Software' },
  { name: 'Overclock PC', industry: 'Hardware' },
  { name: 'Tidewave Beverages', industry: 'Beverage' },
  { name: 'Amberlight Snacks', industry: 'Snack Food' },
  { name: 'Granite Financial', industry: 'Finance' },
  { name: 'Skyferry Airlines', industry: 'Airline' },
  { name: 'Prism Optics', industry: 'Hardware' },
  { name: 'Vantagepoint Media', industry: 'Media' },
  { name: 'Coppergate Bank', industry: 'Finance' },
  { name: 'Fenwick Apparel', industry: 'Apparel' },
  { name: 'Static Peripherals', industry: 'Peripherals' },
  { name: 'Brightline Telecom', industry: 'Telecom' },
  { name: 'Palisade Insurance', industry: 'Insurance' },
  { name: 'Marrow Energy Drinks', industry: 'Energy Drink' },
  { name: 'Ferro Automotive', industry: 'Automotive' },
  { name: 'Quillfeather Media', industry: 'Media' },
  { name: 'Lodestar Software', industry: 'Software' },
  { name: 'Chromatic Peripherals', industry: 'Peripherals' },
  { name: 'Beacon Financial', industry: 'Finance' },
  { name: 'Driftwood Snacks', industry: 'Snack Food' },
  { name: 'Anchorpoint Hardware', industry: 'Hardware' },
];

export const SPONSOR_HQ_COUNTRIES: readonly string[] = [
  'United States', 'Germany', 'South Korea', 'Japan', 'United Kingdom', 'Sweden', 'Canada', 'Singapore',
  'France', 'Australia',
];

// Index into SPONSORS for the seeded energy-drink megabrand ("Voltrush Energy").
export const MEGABRAND_SPONSOR_INDEX = 0;

// Region market-size multipliers applied to sponsorship annual_value_usd, keyed by short_code.
export const REGION_MARKET_MULTIPLIER: Record<string, number> = {
  NA: 1.4,
  EU: 1.3,
  KR: 1.2,
  CN: 1.3,
  BR: 0.8,
  SEA: 0.7,
  JP: 1.0,
  OCE: 0.7,
};
