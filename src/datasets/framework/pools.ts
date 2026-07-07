// Curated, deduplicated value pools shared by the dataset generators. Every entry is a plain,
// real-sounding word with no banned tokens (see text.ts BANNED_TOKENS / containsBanned), so
// generators can freely combine these into believable names, addresses, and labels.

export const GIVEN_NAMES: readonly string[] = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
  'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Andrew', 'Emily', 'Paul', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Melissa', 'George', 'Deborah', 'Edward', 'Stephanie',
];

export const SURNAMES: readonly string[] = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez',
];

export const CITY_NAMES: readonly string[] = [
  'Portland', 'Austin', 'Denver', 'Nashville', 'Seattle', 'Boston', 'Chicago', 'Phoenix', 'Dallas', 'Houston',
  'Miami', 'Atlanta', 'Orlando', 'Tampa', 'Charlotte', 'Raleigh', 'Columbus', 'Cincinnati', 'Cleveland', 'Pittsburgh',
  'Baltimore', 'Richmond', 'Louisville', 'Memphis', 'Minneapolis', 'Milwaukee', 'Indianapolis', 'Sacramento', 'Fresno', 'Tucson',
  'Albuquerque', 'Omaha', 'Tulsa', 'Wichita', 'Boise', 'Spokane', 'Eugene',
];

// Generic word fragments for composing brand, team, or product names in the per-dataset pools
// (e.g. Aperture/Sideline/Rove) without hard-coding domain-specific vocabulary here.
export const WORD_PARTS: readonly string[] = [
  'Summit', 'Harbor', 'Ridge', 'Grove', 'Vertex', 'Atlas', 'Meridian', 'Cedar', 'Maple', 'Falcon',
  'Anchor', 'Beacon', 'Crescent', 'Orchard', 'Prairie', 'Compass', 'Lantern', 'Horizon', 'Timber', 'Granite',
  'Ember', 'Willow', 'Canyon', 'Delta',
];
