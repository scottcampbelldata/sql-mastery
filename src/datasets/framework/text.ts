// Small, committed lowercase list of obvious offensive/profanity/slur tokens. Kept short and
// deliberately made of whole words that are unlikely to appear as substrings of ordinary
// English names, cities, or generic words, so containsBanned does not over-trigger on clean text.
export const BANNED_TOKENS: string[] = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'whore',
  'slut',
  'nigger',
  'faggot',
  'retard',
  'chink',
  'kike',
];

// Lowercases s and strips everything that is not a letter or digit, then checks whether any
// BANNED_TOKENS entry appears as a substring. Stripping punctuation/whitespace first means a
// disguised token like "f u c k" or "f-u-c-k" still collapses down to "fuck" and gets caught.
export function containsBanned(s: string): boolean {
  const normalized = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BANNED_TOKENS.some((token) => normalized.includes(token));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net']);

// PII-shape guard: true when s looks like a real email address whose domain is not one of the
// reserved, always-safe example domains (example.com/.org/.net). Used both by generators (to
// avoid accidentally emitting a real-looking address) and by adversarial checks (to confirm
// seeded data stays inside the reserved domains).
export function looksLikeRealEmail(s: string): boolean {
  if (!EMAIL_PATTERN.test(s)) return false;
  const domain = s.slice(s.indexOf('@') + 1).toLowerCase();
  return !RESERVED_EMAIL_DOMAINS.has(domain);
}

// PII-shape guard: true when s, read as a US NANP phone number, does not use the reserved 555
// central-office code. Extracts all digits, takes the last 10 (area code + central office +
// line number), and reads the central-office code at zero-indexed positions 3,4,5. Fewer than
// 10 digits cannot be a real NANP number, so it is treated as safe (false).
export function looksLikeRealPhone(s: string): boolean {
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 10) return false;
  const last10 = digits.slice(-10);
  const centralOffice = last10.slice(3, 6);
  return centralOffice !== '555';
}
