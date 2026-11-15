import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Explicitly enforce persistent local login across reloads and PWA restarts
void setPersistence(auth, browserLocalPersistence).catch(() => {
  // Ignore persistence errors in restricted environments
});

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Keep the OAuth access token in memory
let cachedAccessToken: string | null = null;

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            login_hint?: string;
            prompt?: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/**
 * Attempts a silent OAuth token refresh using Google Identity Services (`prompt: ''`)
 * with the persisted Firebase user's email as `login_hint`.
 */
async function trySilentGisToken(email?: string | null): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId || typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 3500);

    try {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        login_hint: email || undefined,
        prompt: '',
        callback: (resp) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (resp?.access_token) {
            cachedAccessToken = resp.access_token;
            resolve(resp.access_token);
          } else {
            resolve(null);
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

export const initAuth = (
  onAuthReady?: (user: User, token: string | null) => void,
  onSignedOut?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthReady) onAuthReady(user, cachedAccessToken);
        return;
      }
      // User is persistently signed in! Restore their session immediately
      // so saved folder memory works without forcing a re-login.
      if (onAuthReady) {
        onAuthReady(user, cachedAccessToken);
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (onSignedOut) onSignedOut();
    }
  });
};

export const googleSignIn = async (
  loginHintEmail?: string | null
): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const hint = loginHintEmail || auth.currentUser?.email;
    if (hint) {
      provider.setCustomParameters({
        login_hint: hint,
      });
    } else {
      provider.setCustomParameters({
        prompt: 'select_account',
      });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter o token de acesso do Google Drive.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Returns the active OAuth access token, or silently refreshes it if the user is
 * persistently signed in.
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  if (auth.currentUser) {
    const silentToken = await trySilentGisToken(auth.currentUser.email);
    if (silentToken) return silentToken;
  }
  return cachedAccessToken;
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
