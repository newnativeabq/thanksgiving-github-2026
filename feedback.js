import { spreadsheetId } from './sheets-config.js';
const HEADERS = ['ticket_id', 'created_at', 'category', 'summary', 'details', 'status'];
const CATEGORIES = new Set(['issue', 'suggestion', 'question']);
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const API_TIMEOUT_MS = 15_000;
const RECENT_TICKET_LIMIT = 10;
const SUPPORT_RANGE = 'Support_Tickets!A1:F';
const TICKET_STATUSES = new Map([
  ['open', { label: 'New', icon: '○' }],
  ['seen', { label: 'Seen It!', icon: '✓' }],
  ['in_progress', { label: 'On It!', icon: '✓' }],
  ['closed', { label: 'Done!', icon: '✓✓' }],
]);

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

async function requestSheet(token, signal, endpoint, query, body) {
  const url = new URL(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}${endpoint}`);
  url.search = new URLSearchParams(query);
  const headers = { Authorization: `Bearer ${token}` };
  const request = { headers, cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]) };
  if (body) {
    request.method = 'POST';
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  const response = await fetch(url, request);
  if (!response.ok) throw new SheetsError(response.status, Boolean(body));
  return response.json();
}

function requestValues(token, signal, range, appendValues) {
  const path = '/values/' + encodeURIComponent(range);
  return appendValues
    ? requestSheet(token, signal, path + ':append', { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }, { values: [appendValues] })
    : requestSheet(token, signal, path, { valueRenderOption: 'UNFORMATTED_VALUE' });
}

function readSupportRows(result) {
  const [headers, ...rows] = result.values ?? [];
  if (headers?.length !== HEADERS.length || !HEADERS.every((header, i) => headers[i] === header)) {
    throw new FeedbackError('The support tab needs to be set up by the organizer.');
  }
  return rows;
}

async function readTicket(token, signal, id) {
  const result = await requestSheet(token, signal, '', {
    ranges: SUPPORT_RANGE,
    fields: 'sheets(properties(sheetId,title),data(rowData(values(effectiveValue,note))))',
  });
  const sheet = result.sheets?.[0];
  const rows = sheet?.data?.[0]?.rowData;
  if (sheet?.properties?.title !== 'Support_Tickets' || !Number.isInteger(sheet.properties.sheetId) || !Array.isArray(rows)) {
    throw new FeedbackError('Google Sheets did not return the ticket details.');
  }
  const values = rows.map(row => (row.values ?? []).map(cell => cell.effectiveValue?.stringValue ?? ''));
  const tickets = readSupportRows({ values });
  const index = tickets.findIndex(row => row[0] === id) + 1;
  if (index === 0) throw new FeedbackError('This ticket is no longer in the Sheet.');
  const [, , , summary, details, status = ''] = values[index];
  const notes = rows[index].values?.[5]?.note ?? '';
  return { sheetId: sheet.properties.sheetId, rowIndex: index, summary, details, status, notes };
}

async function saveTicketChanges(token, signal, id, original, changes) {
  const current = await readTicket(token, signal, id);
  const fields = [];
  const cell = {};
  for (const [field, mask] of [['status', 'userEnteredValue'], ['notes', 'note']]) {
    if (changes[field] === original[field] || changes[field] === current[field]) continue;
    if (current[field] !== original[field]) {
      throw new FeedbackError('This ticket changed in Google Sheets. Reopen it to review the latest values.');
    }
    fields.push(mask);
    cell[mask] = field === 'status' ? { stringValue: changes.status } : changes.notes;
  }
  if (!fields.length) return;
  const { sheetId, rowIndex } = current;
  const result = await requestSheet(token, signal, ':batchUpdate', {}, {
    requests: [{ updateCells: {
      start: { sheetId, rowIndex, columnIndex: 5 },
      rows: [{ values: [cell] }],
      fields: fields.join(','),
    } }],
  });
  if (result.spreadsheetId !== spreadsheetId || result.replies?.length !== 1) {
    throw new FeedbackError('Google Sheets did not confirm the save. Check and try again.');
  }
}

function renderTicket(row, onOpen) {
  const [id, , , summary, , state] = row;
  const { label, icon } = TICKET_STATUSES.get(state) ?? { label: 'Status unavailable', icon: '○' };
  const item = document.createElement('li');
  const trigger = document.createElement('button');
  const title = document.createElement('span');
  const badge = document.createElement('span');
  const check = document.createElement('span');
  title.className = 'feedback-ticket-summary';
  title.textContent = summary;
  badge.className = 'feedback-ticket-badge';
  if (TICKET_STATUSES.has(state)) badge.dataset.status = state;
  check.setAttribute('aria-hidden', 'true');
  check.textContent = icon;
  badge.append(check, label);
  trigger.type = 'button';
  trigger.className = 'feedback-ticket-trigger';
  trigger.dataset.ticketId = id;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.addEventListener('click', () => onOpen(id, summary));
  trigger.append(title, badge);
  item.append(trigger);
  return item;
}

export function createFeedback({ getToken, onExpired, onAccessDenied }) {
  const form = document.querySelector('#feedback');
  const fields = document.querySelector('#feedback-fields');
  const options = document.querySelector('#feedback-options');
  const button = document.querySelector('#send-feedback');
  const status = document.querySelector('#feedback-status');
  const tickets = document.querySelector('#feedback-tickets');
  const ticketsMessage = document.querySelector('#feedback-tickets-message');
  const dialog = document.querySelector('#feedback-ticket-dialog');
  const dialogForm = document.querySelector('#feedback-ticket-form');
  const dialogTitle = document.querySelector('#feedback-ticket-title');
  const dialogDetails = document.querySelector('#feedback-ticket-details');
  const dialogFields = document.querySelector('#feedback-ticket-fields');
  const dialogStatus = document.querySelector('#feedback-ticket-state');
  const dialogNotes = document.querySelector('#feedback-ticket-notes');
  const dialogMessage = document.querySelector('#feedback-ticket-message');
  const dialogClose = document.querySelector('#feedback-ticket-close');
  const dialogSave = document.querySelector('#feedback-ticket-save');
  for (const [value, { label }] of TICKET_STATUSES) dialogStatus.add(new Option(label, value));
  let editable = false;
  let visible = false;
  let ticketRead;
  let attempt;
  let unresolvedTicket;
  let ticketEditor;

  function focusTicket(id) {
    const trigger = [...tickets.querySelectorAll('button')].find(button => button.dataset.ticketId === id);
    (trigger ?? document.querySelector('[data-tab="feedback"]:not([hidden])'))?.focus();
  }

  function showTickets(items, message = '') {
    const focusedTicket = document.activeElement?.dataset.ticketId;
    tickets.replaceChildren(...items);
    tickets.hidden = !items.length;
    ticketsMessage.textContent = message;
    if (focusedTicket) focusTicket(focusedTicket);
  }

  function renderEditor() {
    const ready = Boolean(ticketEditor?.original);
    const saving = Boolean(ticketEditor?.saving);
    dialogFields.disabled = !ready || saving || !editable;
    dialogSave.disabled = !ready || saving || !editable;
    dialogSave.textContent = saving ? 'Saving…' : 'Save changes';
    dialogClose.disabled = saving;
  }

  function closeEditor(restoreFocus = true) {
    const current = ticketEditor;
    if (!current) return;
    ticketEditor = undefined;
    current.controller.abort();
    dialog.close();
    dialogForm.reset();
    dialogTitle.textContent = '';
    dialogDetails.textContent = '';
    dialogMessage.textContent = '';
    if (restoreFocus) focusTicket(current.id);
  }

  async function openTicket(id, summary) {
    if (ticketEditor) return;
    const token = getToken();
    if (!token) return;
    const current = { id, controller: new AbortController() };
    ticketEditor = current;
    dialogTitle.textContent = summary;
    dialogMessage.textContent = 'Loading ticket…';
    renderEditor();
    dialog.showModal();
    dialogClose.focus();
    try {
      const ticket = await readTicket(token, current.controller.signal, id);
      if (ticketEditor !== current) return;
      current.original = ticket;
      dialogTitle.textContent = ticket.summary || summary;
      dialogDetails.textContent = ticket.details === ticket.summary ? '' : ticket.details;
      dialogStatus.value = TICKET_STATUSES.has(ticket.status) ? ticket.status : '';
      dialogNotes.value = ticket.notes;
      dialogMessage.textContent = '';
      renderEditor();
      if (document.activeElement === dialogClose) dialogStatus.focus();
    } catch (error) {
      if (ticketEditor !== current) return;
      if (error.statusCode === 401) onExpired(token);
      else dialogMessage.textContent = error instanceof FeedbackError ? error.message : 'Could not load this ticket.';
    }
  }

  dialogClose.addEventListener('click', () => closeEditor());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!ticketEditor?.saving) closeEditor();
  });
  dialogForm.addEventListener('submit', async event => {
    event.preventDefault();
    const current = ticketEditor;
    if (!current?.original || dialogSave.disabled) return;
    const token = getToken();
    if (!token) return;
    const status = dialogStatus.value || current.original.status;
    const notes = dialogNotes.value === current.original.notes.replace(/\r\n?/g, '\n')
      ? current.original.notes : dialogNotes.value;
    if (notes !== current.original.notes && notes.length > dialogNotes.maxLength) {
      dialogMessage.textContent = `Use at most ${dialogNotes.maxLength} characters for notes.`;
      return;
    }
    current.saving = true;
    dialogMessage.textContent = '';
    renderEditor();
    try {
      await saveTicketChanges(token, current.controller.signal, current.id, current.original, { status, notes });
      if (ticketEditor !== current) return;
      closeEditor();
      await refreshTickets('Ticket updated.');
    } catch (error) {
      if (ticketEditor !== current) return;
      if (error.statusCode === 401) onExpired(token);
      else dialogMessage.textContent = error instanceof FeedbackError ? error.message : 'Could not confirm the save. Check and try again.';
    } finally {
      if (ticketEditor === current) {
        current.saving = false;
        renderEditor();
      }
    }
  });

  async function refreshTickets(successMessage = '') {
    if (!visible) return;
    const token = getToken();
    if (!token) return;
    ticketRead?.abort();
    const controller = new AbortController();
    ticketRead = controller;
    if (tickets.hidden) ticketsMessage.textContent = 'Loading feedback…';
    try {
      const result = await requestValues(token, controller.signal, SUPPORT_RANGE);
      if (ticketRead !== controller) return;
      const unique = new Map();
      for (const row of readSupportRows(result)) {
        const [id, , , summary] = row;
        if (typeof id === 'string' && id && typeof summary === 'string' && summary.trim() && !unique.has(id)) {
          unique.set(id, row);
        }
      }
      const recent = [...unique.values()].sort((a, b) =>
        (Date.parse(b[1]) || 0) - (Date.parse(a[1]) || 0)
      ).slice(0, RECENT_TICKET_LIMIT);
      showTickets(recent.map(row => renderTicket(row, openTicket)), recent.length ? successMessage : 'No feedback yet.');
    } catch (error) {
      if (ticketRead !== controller) return;
      if (error.statusCode === 401) {
        onExpired(token);
        return;
      }
      const message = error instanceof FeedbackError ? error.message : 'Google Sheets could not be reached.';
      showTickets([], `Could not load feedback. ${message}`);
    } finally {
      if (ticketRead === controller) ticketRead = undefined;
    }
  }

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

    readSupportRows(await requestValues(token, signal, 'Support_Tickets!A1:F1'));

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
      void refreshTickets();
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
    refreshTickets,
    setVisible(value) {
      if (value === visible) return;
      visible = value;
      if (visible) void refreshTickets();
    },
    setEditable(value) {
      editable = Boolean(value);
      if (!editable) attempt?.abort();
      renderEditor();
      render();
    },
    reset() {
      closeEditor(false);
      const previous = attempt;
      attempt = undefined;
      previous?.abort();
      unresolvedTicket = undefined;
      editable = false;
      visible = false;
      const previousRead = ticketRead;
      ticketRead = undefined;
      previousRead?.abort();
      showTickets([]);
      clearDraft();
      announce('');
      render();
    },
  };
}
