import { googleClientId, spreadsheetId } from './sheets-config.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const HEADERS = ['ticket_id', 'created_at', 'category', 'summary', 'details', 'status'];
const CATEGORIES = new Set(['issue', 'suggestion', 'question']);
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const API_TIMEOUT_MS = 15_000;
const CONSENT_TIMEOUT_MS = 180_000;

const form = document.querySelector('#feedback');
const fields = document.querySelector('#feedback-fields');
const button = document.querySelector('#send-feedback');
const status = document.querySelector('#feedback-status');

let busy = false;
let unresolvedTicket;

class FeedbackError extends Error {}
class AuthorizationError extends FeedbackError {}

function announce(message, error = false) {
  status.textContent = message;
  status.toggleAttribute('data-error', error);
}

function setBusy(value, retryAuthorization = false) {
  busy = value;
  fields.disabled = value || Boolean(unresolvedTicket);
  button.disabled = value;
  button.textContent = retryAuthorization ? 'Retry with Google' : 'Send with Google';
  if (unresolvedTicket) button.textContent = 'Check and retry with Google';
}

function requestAccessToken(oauth) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AuthorizationError('Google authorization timed out.'));
    }, CONSENT_TIMEOUT_MS);

    function fail(message) {
      clearTimeout(timer);
      reject(new AuthorizationError(message));
    }

    try {
      const client = oauth.initTokenClient({
        client_id: googleClientId,
        scope: SCOPE,
        include_granted_scopes: false,
        callback(response) {
          try {
            if (response?.access_token && !response.error && oauth.hasGrantedAllScopes(response, SCOPE)) {
              clearTimeout(timer);
              resolve(response.access_token);
              return;
            }
          } catch {
            fail('Google returned an unreadable authorization response.');
            return;
          }
          fail('Google did not grant permission to send feedback.');
        },
        error_callback(error) {
          const message = error?.type === 'popup_closed'
            ? 'The Google window closed before authorization finished.'
            : 'The Google authorization window could not open. Check your popup settings.';
          fail(message);
        },
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch {
      fail('Google authorization could not start.');
    }
  });
}

class SheetsError extends FeedbackError {
  constructor(statusCode) {
    const messages = {
      400: 'The support tab is unavailable or misconfigured.',
      401: 'Google authorization expired. Try again to reconnect.',
      403: 'Google denied access. Use an invited account with Editor access to send feedback.',
      404: 'The support Sheet could not be opened. Check your invitation or ask the organizer.',
      429: 'Google Sheets is busy. Wait a moment and try again.',
    };
    super(messages[statusCode] ?? 'Google Sheets did not complete the request.');
    this.statusCode = statusCode;
  }
}

async function requestValues(token, range, appendValues) {
  const url = new URL(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  const headers = { Authorization: `Bearer ${token}` };
  const request = { headers, cache: 'no-store', signal: AbortSignal.timeout(API_TIMEOUT_MS) };

  if (appendValues) {
    url.pathname += ':append';
    url.search = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    request.method = 'POST';
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify({ values: [appendValues] });
  } else {
    url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  }

  const response = await fetch(url, request);
  if (!response.ok) throw new SheetsError(response.status);
  return response.json();
}

async function submitTicket(oauth, ticket, recovering) {
  announce('Waiting for Google authorization…');
  const token = await requestAccessToken(oauth);
  announce(recovering ? 'Checking your ticket…' : 'Sending your ticket…');

  if (recovering) {
    const result = await requestValues(token, 'Support_Tickets!A2:A');
    const values = result?.values === undefined ? [] : result.values;
    const idRange = /^(?:Support_Tickets|'Support_Tickets')!A2:A[0-9]*$/;
    if (!idRange.test(result?.range) || !Array.isArray(values) ||
        !values.every(row => Array.isArray(row) && (row.length === 0 || (row.length === 1 && typeof row[0] === 'string')))) {
      throw new FeedbackError('Google Sheets could not confirm which tickets are recorded.');
    }
    if (values.some(([id]) => id === ticket[0])) return;
  }

  const result = await requestValues(token, 'Support_Tickets!A1:F1');
  const actualHeaders = result.values?.[0];
  if (actualHeaders?.length !== HEADERS.length || !HEADERS.every((header, i) => actualHeaders[i] === header)) {
    throw new FeedbackError('The support tab needs to be set up by the organizer.');
  }

  try {
    const { updates } = await requestValues(token, 'Support_Tickets!A1:F', ticket);
    if (updates?.updatedRows !== 1 || updates.updatedColumns !== HEADERS.length) {
      throw new Error('Google Sheets returned an incomplete receipt.');
    }
  } catch (error) {
    const rejected = error instanceof SheetsError && [400, 401, 403, 404, 429].includes(error.statusCode);
    if (!rejected) unresolvedTicket = ticket;
    if (!rejected && !(error instanceof SheetsError)) {
      throw new FeedbackError('Google Sheets did not confirm the save.');
    }
    throw error;
  }
}

async function handleSubmit(event, oauth) {
  event.preventDefault();
  if (busy) return;

  const data = new FormData(form);
  const category = data.get('category');
  const summary = data.get('summary')?.trim();
  const details = data.get('details')?.trim() ?? '';
  if (!unresolvedTicket && (!CATEGORIES.has(category) || !summary || summary.length > 120 || details.length > 2000)) {
    announce('Enter a summary of up to 120 characters and details of up to 2,000 characters.', true);
    return;
  }

  const ticket = unresolvedTicket ?? [crypto.randomUUID(), new Date().toISOString(), category, summary, details, 'open'];
  let retryAuthorization = false;
  setBusy(true);
  try {
    await submitTicket(oauth, ticket, Boolean(unresolvedTicket));
    unresolvedTicket = undefined;
    form.reset();
    announce(`Feedback recorded. Ticket ID ${ticket[0]}`);
  } catch (error) {
    retryAuthorization = error instanceof AuthorizationError;
    const message = error instanceof FeedbackError
      ? error.message
      : 'Google Sheets could not be reached. Try again.';
    const recovery = unresolvedTicket
      ? ` Ticket ${ticket[0]} may have been saved. Keep this page open and use Check and retry.`
      : '';
    const draft = retryAuthorization && !unresolvedTicket ? ' Your feedback is still in the form.' : '';
    announce(message + recovery + draft, true);
  } finally {
    setBusy(false, retryAuthorization);
  }
}

function loadGoogleIdentity() {
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = () => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth?.initTokenClient || !oauth.hasGrantedAllScopes) {
      announce('Google authorization is unavailable. Refresh the page to try again.', true);
      return;
    }

    form.addEventListener('submit', event => handleSubmit(event, oauth));
    setBusy(false);
    announce('');
  };
  script.onerror = () => announce('Google authorization is unavailable. Refresh the page to try again.', true);
  document.head.append(script);
}

if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(googleClientId) || !/^[\w-]+$/.test(spreadsheetId)) {
  announce('The organizer has not connected feedback to Google Sheets yet.');
} else {
  announce('Loading Google authorization…');
  loadGoogleIdentity();
}
