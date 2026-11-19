import { googleClientId, spreadsheetId } from './sheets-config.js';

export const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const googleConfigured = /^[\w-]+\.apps\.googleusercontent\.com$/.test(googleClientId)
  && /^[\w-]+$/.test(spreadsheetId);

export class AuthorizationError extends Error {}

let identity;
let authorizationPending = false;

export function loadGoogleIdentity() {
  if (!identity) {
    identity = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        const oauth = window.google?.accounts?.oauth2;
        if (oauth?.initTokenClient && oauth.hasGrantedAllScopes) resolve(oauth);
        else reject(new AuthorizationError('Google authorization is unavailable.'));
      };
      script.onerror = () => reject(new AuthorizationError('Google authorization is unavailable.'));
      document.head.append(script);
    });
  }
  return identity;
}

export function requestAccessToken(oauth, scope) {
  if (authorizationPending) {
    return Promise.reject(new AuthorizationError('Finish the open Google authorization window first.'));
  }
  authorizationPending = true;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail('Google authorization timed out.'), 180_000);

    function fail(message) {
      clearTimeout(timer);
      reject(new AuthorizationError(message));
    }

    try {
      const client = oauth.initTokenClient({
        client_id: googleClientId,
        scope,
        include_granted_scopes: false,
        callback(response) {
          try {
            const ttl = Number(response?.expires_in);
            if (typeof response?.access_token === 'string' && response.access_token &&
                !response.error && ttl > 0 && Number.isFinite(ttl) &&
                oauth.hasGrantedAllScopes(response, scope)) {
              clearTimeout(timer);
              resolve({ token: response.access_token, expiresAt: Date.now() + ttl * 1000 });
              return;
            }
          } catch {
            fail('Google returned an unreadable authorization response.');
            return;
          }
          fail('Google did not grant the requested permission.');
        },
        error_callback(error) {
          fail(error?.type === 'popup_closed'
            ? 'The Google window closed before authorization finished.'
            : 'The Google authorization window could not open. Check your popup settings.');
        },
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch {
      fail('Google authorization could not start.');
    }
  }).finally(() => { authorizationPending = false; });
}
