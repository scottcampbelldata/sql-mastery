import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

export interface AuthService {
  verifyGoogleToken(idToken: string): Promise<GoogleProfile>;
  issueSession(sub: string): string;
  verifySession(token: string): { sub: string } | null;
}

// Verifies Google ID tokens and issues/verifies our own session JWT. The Google
// verifier is injectable so tests never reach the network; the client id and secret
// come from options or the environment.
export function createAuthService(options: {
  clientId?: string;
  sessionSecret?: string;
  ttlSeconds?: number;
  verifyGoogle?: (idToken: string) => Promise<GoogleProfile>;
} = {}): AuthService {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
  const sessionSecret = options.sessionSecret ?? process.env.SQL_MASTERY_SESSION_SECRET ?? '';
  const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 24 * 30;

  const client = new OAuth2Client(clientId);
  const verifyGoogle = options.verifyGoogle ?? (async (idToken: string): Promise<GoogleProfile> => {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error('Google token had no subject.');
    return { sub: payload.sub, email: payload.email ?? '', name: payload.name ?? '' };
  });

  return {
    verifyGoogleToken: (idToken: string) => verifyGoogle(idToken),
    issueSession: (sub: string): string => {
      if (!sessionSecret) throw new Error('SQL_MASTERY_SESSION_SECRET is not set.');
      return jwt.sign({ sub }, sessionSecret, { expiresIn: ttlSeconds });
    },
    verifySession: (token: string): { sub: string } | null => {
      if (!sessionSecret) return null;
      try {
        const decoded = jwt.verify(token, sessionSecret) as { sub?: string };
        return decoded.sub ? { sub: decoded.sub } : null;
      } catch {
        return null;
      }
    }
  };
}
