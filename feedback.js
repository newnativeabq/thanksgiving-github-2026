import { spreadsheetId } from './sheets-config.js';
const HEADERS = ['ticket_id', 'created_at', 'category', 'summary', 'details', 'status'];
const CATEGORIES = new Set(['issue', 'suggestion', 'question']);
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const API_TIMEOUT_MS = 15_000;

class FeedbackError extends Error {}

class SheetsError extends FeedbackError {
  constructor(statusCode, writing) {
    const messages = {
      400: 'The support tab is unavailable or misconfigured.',
      401: 'Your Google session expired. Sign in again.',
      403: writing ? 'Google denied the feedback edit.' : 'Google denied access to the support tab.',
      404: 'The support Sheet could not be opened. Check your invitation or ask the organizer.',
      429: 'Google Sheets is busy. Wait a moment and try again.',
    };
    super(messages[statusCode] ?? 'Google Sheets did not complete the request.');
    this.statusCode = statusCode;
  }
}

async function requestValues(token, signal, range, appendValues) {
  const url = new URL(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  const headers = { Authorization: `Bearer ${token}` };
  const request = { headers, cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]) };

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
  if (!response.ok) throw new SheetsError(response.status, Boolean(appendValues));
  return response.json();
}

export function createFeedback({ getToken, onExpired, onAccessDenied }) {
  const form = document.querySelector('#feedback');
  const fields = document.querySelector('#feedback-fields');
  const options = document.querySelector('#feedback-options');
  const button = document.querySelector('#send-feedback');
  const status = document.querySelector('#feedback-status');
  let editable = false;
  let attempt;
  let unresolvedTicket;

  function announce(message, error = false) {
    status.textContent = message;
    status.toggleAttribute('data-error', error);
  }

  function render() {
    fields.disabled = !editable || Boolean(attempt || unresolvedTicket);
    button.disabled = !editable || Boolean(attempt);
    button.textContent = unresolvedTicket ? 'Check and retry' : 'Send feedback';
  }

  function clearDraft() {
    form.reset();
    options.open = false;
  }

  async function submitTicket(token, signal, ticket) {
    if (unresolvedTicket) {
      const result = await requestValues(token, signal, 'Support_Tickets!A2:A');
      const values = result?.values === undefined ? [] : result.values;
      const idRange = /^(?:Support_Tickets|'Support_Tickets')!A2:A[0-9]*$/;
      if (!idRange.test(result?.range) || !Array.isArray(values) ||
          !values.every(row => Array.isArray(row) && (row.length === 0 || (row.length === 1 && typeof row[0] === 'string')))) {
        throw new FeedbackError('Google Sheets could not confirm which tickets are recorded.');
      }
      if (values.some(([id]) => id === ticket[0])) return;
    }

    const result = await requestValues(token, signal, 'Support_Tickets!A1:F1');
    const actualHeaders = result.values?.[0];
    if (actualHeaders?.length !== HEADERS.length || !HEADERS.every((header, i) => actualHeaders[i] === header)) {
      throw new FeedbackError('The support tab needs to be set up by the organizer.');
    }

    signal.throwIfAborted();
    try {
      const { updates } = await requestValues(token, signal, 'Support_Tickets!A1:F', ticket);
      if (updates?.updatedRows !== 1 || updates.updatedColumns !== HEADERS.length) {
        throw new Error('Google Sheets returned an incomplete receipt.');
      }
    } catch (error) {
      if (signal.aborted) {
        if (attempt?.signal === signal) unresolvedTicket = ticket;
        throw error;
      }
      const rejected = error instanceof SheetsError && [400, 401, 403, 404, 429].includes(error.statusCode);
      if (!rejected) unresolvedTicket = ticket;
      if (!rejected && !(error instanceof SheetsError)) {
        throw new FeedbackError('Google Sheets did not confirm the save.');
      }
      throw error;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (attempt || !editable) return;
    const token = getToken();
    if (!token) return;

    const data = new FormData(form);
    const category = data.get('category');
    const enteredSummary = data.get('summary')?.trim() ?? '';
    const details = data.get('details')?.trim() ?? '';
    const summary = enteredSummary || details.split('\n', 1)[0].slice(0, 120).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
    if (!unresolvedTicket && (!CATEGORIES.has(category) || !summary || summary.length > 120 || details.length > 2000)) {
      announce('Enter what should change, or add a summary under Details.', true);
      return;
    }

    const ticket = unresolvedTicket ?? [crypto.randomUUID(), new Date().toISOString(), category, summary, details, 'open'];
    const controller = new AbortController();
    attempt = controller;
    announce(unresolvedTicket ? 'Checking your ticket…' : 'Sending your ticket…');
    render();
    try {
      await submitTicket(token, controller.signal, ticket);
      if (attempt !== controller) return;
      unresolvedTicket = undefined;
      clearDraft();
      announce(`Feedback recorded. Ticket ID ${ticket[0]}`);
    } catch (error) {
      if (attempt !== controller) return;
      if (error.statusCode === 401) {
        onExpired(token);
        return;
      }
      const message = controller.signal.aborted
        ? 'Google edit access changed during submission.'
        : error instanceof FeedbackError ? error.message : 'Google Sheets could not be reached. Try again.';
      const recovery = unresolvedTicket
        ? ` Ticket ${ticket[0]} may have been saved. Keep this page open and use Check and retry.`
        : '';
      announce(message + recovery, true);
      if (error.statusCode === 403 || error.statusCode === 404) onAccessDenied(token);
    } finally {
      if (attempt === controller) {
        attempt = undefined;
        render();
      }
    }
  });

  return {
    setEditable(value) {
      editable = Boolean(value);
      if (!editable) attempt?.abort();
      render();
    },
    reset() {
      const previous = attempt;
      attempt = undefined;
      previous?.abort();
      unresolvedTicket = undefined;
      editable = false;
      clearDraft();
      announce('');
      render();
    },
  };
}
