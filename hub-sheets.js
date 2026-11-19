import { importedDishId, importedIngredientId } from './recipe-contract.js';
import {
  attachRecipeRecords, hasHeaders, INGREDIENT_HEADER, prepareRecipeOperation, readGroceryIdentity,
  RECIPE_HEADER, RECIPE_TAB, recipeAppendRequest, reconcileRecipe, reviewRecipe,
} from './recipe-sheet.js';
import { spreadsheetId } from './sheets-config.js';
import { googleConfigured, loadGoogleIdentity, requestAccessToken, WRITE_SCOPE } from './google-auth.js';

const TABS = {
  menu: ['Menu_Servings', 'dish_id,dish_name,target_servings,updated_by,updated_at'],
  potluck: ['Potluck_Signups', 'claim_id,guest_name,guest_email,dish_name,category,needs,status,timestamp,slot_id,servings,dietary'],
  grocery: ['Grocery_Checks', 'item_key,checked,checked_by,updated_at'],
  prep: ['Prep_Checklist', 'step_id,completed,completed_by,updated_at'],
};
const REFRESH_MS = 30_000;

class SheetsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class EditConflict extends Error {
  constructor() {
    super('This entry changed in Google Sheets. Review the refreshed values before trying again.');
  }
}

function schemaError(tab) {
  return new SheetsError(0, 'Check the headers, keys, and value types in ' + tab + '.');
}

function permissionDenied(error) {
  return error.status === 403 || error.status === 404;
}

async function request(token, endpoint, { query, body, method = 'GET', signal } = {}) {
  const suffix = endpoint.startsWith(':') ? endpoint : endpoint ? '/' + endpoint : '';
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${suffix}`);
  if (query) url.search = query;
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, {
    method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!response.ok) {
    const messages = {
      400: 'Google Sheets could not find the expected tabs or ranges.',
      401: 'Your Google session expired. Sign in again.',
      403: 'Google denied access to the Sheet.',
      404: 'Google could not find the shared Sheet.',
      429: 'Google Sheets is busy. Wait a moment before trying again.',
    };
    throw new SheetsError(response.status, messages[response.status] ?? 'Google Sheets did not complete the request.');
  }
  try {
    return await response.json();
  } catch {
    throw new SheetsError(0, 'Google Sheets returned unreadable data.');
  }
}

function parseClaims(rows) {
  const claims = new Map();
  const locations = new Map();
  rows.forEach((row, index) => {
    if (row.length === 0) return;
    const [id, guestName, , dishName, course, kitchenNeeds, status, , slotId = '', servings, dietary = ''] = row;
    if (typeof id !== 'string' || !id || !['claimed', 'withdrawn'].includes(status)) throw schemaError('Potluck_Signups');
    if (!locations.has(id)) locations.set(id, []);
    locations.get(id).push({ row: index + 2, status });
    const previous = claims.get(id);
    if (previous?.status === 'withdrawn') return;
    if (status === 'withdrawn') {
      claims.set(id, { id, status });
      return;
    }
    if (![guestName, dishName, course, kitchenNeeds, slotId, dietary].every(value => typeof value === 'string') ||
        !guestName.trim() || !dishName.trim() ||
        !Number.isInteger(servings) || servings < 1 || servings > 100) {
      throw schemaError('Potluck_Signups');
    }
    const claim = { id, guestName, dishName, course, kitchenNeeds, status, slotId, servings, dietary: dietary.split(',').map(tag => tag.trim()).filter(Boolean) };
    if (previous) {
      if (JSON.stringify({ ...previous, needsReview: undefined }) !== JSON.stringify(claim)) previous.needsReview = true;
    } else {
      claims.set(id, claim);
    }
  });
  return { claims, locations };
}

function rangeMatches(envelope, tab, last) {
  return new RegExp("^(?:" + tab + "|'" + tab + "')!A1:" + last + "[0-9]*$").test(envelope?.range);
}

function parseSnapshot({ result, extended }, keys) {
  const ranges = result?.valueRanges;
  if (!Array.isArray(ranges) || ranges.length !== Object.keys(TABS).length + Number(extended)) {
    throw new SheetsError(0, 'Google Sheets returned an incomplete hub response.');
  }
  const data = {};
  const roster = new Map();
  const issues = new Set();
  const groceryHeader = TABS.grocery[1].split(',');
  const definitionRange = extended ? ranges.at(-1) : undefined;
  const ready = Boolean(rangeMatches(definitionRange, RECIPE_TAB, 'E') &&
    hasHeaders(definitionRange.values, RECIPE_HEADER) &&
    hasHeaders(ranges[2]?.values, [...groceryHeader, ...INGREDIENT_HEADER]));
  const tableRows = {};
  Object.entries(TABS).forEach(([kind, [tab, header]], i) => {
    const expected = header.split(',');
    const width = kind === 'grocery' && extended ? 7 : expected.length;
    const last = String.fromCharCode(64 + width);
    const envelope = ranges[i];
    const rows = envelope?.values;
    if (!rangeMatches(envelope, tab, last) || !Array.isArray(rows) ||
        !Array.isArray(rows[0]) || !expected.every((key, col) => rows[0][col] === key) ||
        (kind !== 'grocery' && rows[0].length !== width)) throw schemaError(tab);
    const body = rows.slice(1);
    tableRows[kind] = body;
    if (kind === 'potluck') {
      if (!body.every(row => Array.isArray(row) && row.length <= width)) throw schemaError(tab);
      const { claims, locations } = parseClaims(body);
      data.potluck = claims;
      data.potluckRows = locations;
      return;
    }
    const results = new Map();
    const dynamicIds = new Set();
    body.forEach((row, index) => {
      if (!Array.isArray(row) || row.length > width) throw schemaError(tab);
      if (!row.length) return;
      const id = row[0];
      const legacy = keys[kind].has(id);
      const rawValue = row[kind === 'menu' ? 2 : 1];
      const value = rawValue === undefined || rawValue === '' ? null : rawValue;
      const goodValue = kind === 'menu'
        ? typeof row[1] === 'string' && row[1].trim() && (value === null || Number.isInteger(value) && value >= 1 && value <= 100)
        : value === null || typeof value === 'boolean';
      if (legacy && (results.has(id) || !goodValue) || !legacy && kind === 'prep') throw schemaError(tab);
      const groceryIdentity = kind === 'grocery' && (legacy ? keys.legacyRoster.get(id) : readGroceryIdentity(id, row));
      if (!legacy) {
        const pattern = kind === 'menu' ? importedDishId : importedIngredientId;
        const invalid = !pattern.test(id) || !goodValue || (kind === 'grocery' && !groceryIdentity);
        if (dynamicIds.has(id) || invalid) {
          issues.add(typeof id === 'string' && id ? id.slice(0, 100) : tab);
          results.delete(id);
          roster.delete(id);
        }
        if (dynamicIds.has(id)) return;
        dynamicIds.add(id);
        if (invalid || !ready) return;
      }
      results.set(id, kind === 'menu' ? { row: index + 2, value, title: row[1].trim() } : { row: index + 2, value });
      if (groceryIdentity) roster.set(id, groceryIdentity);
    });
    if ([...keys[kind]].some(id => !results.has(id))) throw schemaError(tab);
    data[kind] = results;
  });
  attachRecipeRecords(data, {
    definitionRows: ready ? definitionRange.values.slice(1) : [],
    menuRows: tableRows.menu, groceryRows: tableRows.grocery, roster, ready, issues, legacyKeys: keys.menu,
  });
  const importedIngredients = new Map(data.recipeImport.imported.map(recipe => [
    recipe.id, recipe.ingredients.map(item => item.groceryId),
  ]));
  data.activeGrocery = new Set();
  for (const [dishId, entry] of data.menu) {
    if (entry.value === null) continue;
    for (const id of keys.ingredientsByRecipe.get(dishId) ?? importedIngredients.get(dishId) ?? []) data.activeGrocery.add(id);
  }
  return data;
}

async function readData(token, signal) {
  async function read(extended) {
    const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
    for (const [kind, [tab, header]] of Object.entries(TABS)) {
      const last = kind === 'grocery' && extended ? 'G' : String.fromCharCode(64 + header.split(',').length);
      query.append('ranges', `${tab}!A1:${last}`);
    }
    if (extended) query.append('ranges', `${RECIPE_TAB}!A1:E`);
    const result = await request(token, 'values:batchGet', { query, signal });
    return { result, extended };
  }
  try {
    return await read(true);
  } catch (error) {
    if (error.status !== 400) throw error;
    return read(false);
  }
}

const CLAIM_COLUMNS = { guestName: 'B', dishName: 'D', course: 'E', kitchenNeeds: 'F', servings: 'J', dietary: 'K' };
const same = (a, b) => Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
const isSignup = update => update?.kind === 'potluck' && Array.isArray(update.row);
const cell = (tab, column, row, value) => ({ range: `${tab}!${column}${row}`, values: [[value]] });

function recordBaseline(update, snapshot) {
  if (update.kind === 'potluck') return snapshot.potluck.get(update.id);
  const keys = new Set([...Object.keys(update.values ?? {}), ...Object.keys(update.titles ?? {})]);
  return Object.fromEntries([...keys].map(id => [id, snapshot[update.kind].get(id)]));
}

function claimChanges(update, snapshot, baseline) {
  const tab = TABS.potluck[0];
  const rows = snapshot.potluckRows.get(update.id);
  const current = snapshot.potluck.get(update.id);
  if (!current || !rows) throw new EditConflict();
  if (update.withdraw) {
    if (current.status === 'claimed' &&
        (!baseline || current.dishName !== baseline.dishName || current.guestName !== baseline.guestName ||
         Boolean(current.needsReview) !== Boolean(baseline.needsReview))) {
      throw new EditConflict();
    }
    return rows.filter(entry => entry.status !== 'withdrawn').map(entry => cell(tab, 'G', entry.row, 'withdrawn'));
  }
  if (current.status !== 'claimed' || current.needsReview || !baseline) throw new EditConflict();
  return Object.entries(update.changes).flatMap(([field, value]) => {
    if (same(current[field], value)) return [];
    if (!same(current[field], baseline[field]) || !CLAIM_COLUMNS[field]) throw new EditConflict();
    const scalar = field === 'dietary' ? value.join(',') : value;
    return rows.map(entry => cell(tab, CLAIM_COLUMNS[field], entry.row, scalar));
  });
}

function fixedChanges(update, snapshot, baseline) {
  const { kind, values = {}, titles = {}, restore } = update;
  const [tab] = TABS[kind];
  const firstColumn = kind === 'menu' ? 'C' : 'B';
  const lastColumn = kind === 'menu' ? 'E' : 'D';
  const timestamp = new Date().toISOString();
  const rows = new Set([...Object.keys(values), ...Object.keys(titles)]);
  return [...rows].flatMap(id => {
    if (kind === 'grocery' && !snapshot.activeGrocery.has(id)) {
      if (update.activeGroceriesOnly) return [];
      if (!restore) throw new EditConflict();
    }
    const entry = snapshot[kind].get(id);
    const before = baseline?.[id];
    if (!entry || !before) throw new EditConflict();
    const hasValue = Object.hasOwn(values, id);
    const hasTitle = Object.hasOwn(titles, id);
    const newValue = values[id];
    const changeValue = hasValue && newValue !== entry.value;
    const changeTitle = hasTitle && titles[id] !== entry.title;
    const changesRemovedEntry = entry.value === null && !restore && (changeTitle || changeValue);
    const staleRestore = restore && entry.value !== null && (changeValue || changeTitle);
    const renamedBeforeRemoval = kind === 'menu' && changeValue && newValue === null && entry.title !== before.title;
    if (changesRemovedEntry || staleRestore || renamedBeforeRemoval || (changeValue && entry.value !== before.value) ||
        (changeTitle && entry.title !== before.title)) {
      throw new EditConflict();
    }
    const data = [];
    if (changeTitle) data.push(cell(tab, 'B', entry.row, titles[id]));
    if (changeValue) {
      data.push({
        range: `${tab}!${firstColumn}${entry.row}:${lastColumn}${entry.row}`,
        values: [[newValue ?? '', '', timestamp]],
      });
    } else if (changeTitle) {
      data.push({ range: `${tab}!D${entry.row}:E${entry.row}`, values: [['', timestamp]] });
    }
    return data;
  });
}

async function writeValues(token, update, snapshot, baseline, signal) {
  const { kind } = update;
  if (isSignup(update)) {
    const query = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    const result = await request(token, 'values/Potluck_Signups!A1%3AK:append', {
      method: 'POST', query, body: { values: [update.row] }, signal,
    });
    if (result?.updates?.updatedRows !== 1 || result.updates.updatedColumns !== 11) {
      throw new SheetsError(0, 'Google Sheets did not confirm the signup.');
    }
    return;
  }

  const data = kind === 'potluck' ? claimChanges(update, snapshot, baseline) : fixedChanges(update, snapshot, baseline);
  if (!data.length) return;
  if (data.length === 1 && kind !== 'grocery' && kind !== 'potluck') {
    const [{ range, values }] = data;
    const result = await request(token, 'values/' + encodeURIComponent(range), {
      method: 'PUT', query: new URLSearchParams({ valueInputOption: 'RAW' }), body: { values }, signal,
    });
    if (result?.updatedRows !== 1 || result.updatedColumns !== 3) {
      throw new SheetsError(0, 'Google Sheets did not confirm the update.');
    }
    return;
  }

  const result = await request(token, 'values:batchUpdate', {
    method: 'POST', body: { valueInputOption: 'RAW', data }, signal,
  });
  if (!Array.isArray(result?.responses) || result.responses.length !== data.length ||
      !result.responses.every(update => typeof update?.updatedRange === 'string')) {
    throw new SheetsError(0, 'Google Sheets did not confirm the updates.');
  }
}

export function createHubSheets({ keys, onData, onStatus, onSessionReset }) {
  let oauth;
  let session;
  let snapshot;
  let generation = 0;
  let authenticating = false;
  let expiry;
  let reading;
  let writing;
  let pending;
  let pendingBaseline;
  let recipeAttempt;
  let needsFreshRead = false;
  let accessRecheck = false;
  let notice = googleConfigured ? 'Loading Google authorization…' : 'Google Sheets setup is incomplete.';
  let backoffUntil = 0;

  function emit() {
    onStatus({
      available: Boolean(oauth),
      mode: session?.mode,
      authenticating,
      busy: authenticating || Boolean(writing),
      feedbackEditable: session?.mode === 'edit' && !authenticating && !accessRecheck,
      refreshing: Boolean(reading),
      hasPending: Boolean(pending),
      pendingValues: pending && !isSignup(pending) && !writing ? pending : undefined,
      editable: Boolean(session?.mode === 'edit' && snapshot && !writing && !pending && !needsFreshRead && !accessRecheck),
      retryable: Boolean(pending && session?.mode === 'edit' && !writing && !reading),
      discardable: Boolean(pending && !writing && !reading),
      notice,
    });
  }

  function abortRead() {
    const previous = reading;
    reading = undefined;
    previous?.abort();
  }

  function reset(message) {
    generation++;
    clearTimeout(expiry);
    abortRead();
    writing?.abort();
    writing = undefined;
    session = undefined;
    snapshot = undefined;
    pending = undefined;
    pendingBaseline = undefined;
    recipeAttempt = undefined;
    needsFreshRead = false;
    accessRecheck = false;
    authenticating = false;
    backoffUntil = 0;
    notice = message;
    onSessionReset();
    onData(null);
    emit();
  }

  function validSession() {
    if (!session) return false;
    if (Date.now() < session.expiresAt) return true;
      reset('Your Google session expired. Sign in again.');
    return false;
  }

  async function refresh({ priority = false, manual = false } = {}) {
    if (!validSession() || reading || (writing && !priority)) return;
    if (Date.now() < backoffUntil && !priority && !manual) return;
    const active = session;
    const controller = new AbortController();
    reading = controller;
    const currentRead = () => session === active && reading === controller && validSession();
    emit();
    try {
      if (accessRecheck) {
        const metadata = await request(active.token, '', {
          query: new URLSearchParams({ fields: 'spreadsheetId' }), signal: controller.signal,
        });
        if (!currentRead()) return;
        if (metadata?.spreadsheetId !== spreadsheetId) {
          throw new SheetsError(0, 'Google Sheets did not confirm access to the shared Sheet.');
        }
        accessRecheck = false;
      }
      const result = await readData(active.token, controller.signal);
      if (!currentRead()) return;
      const next = parseSnapshot(result, keys);
      snapshot = next;
      needsFreshRead = false;
      const recovered = isSignup(pending) && next.potluck.has(pending.row[0]);
      if (recovered) pending = undefined;
      onData(next);
      if (recovered) notice = 'Potluck signup recorded.';
      else if (!pending && (!writing || priority)) notice = active.mode === 'edit' ? 'Connected to Google Sheets.' : 'Connected. Edits require Editor access.';
      return next;
    } catch (error) {
      if (session !== active || reading !== controller) return;
      if (error.status === 401 || permissionDenied(error)) {
        reset(error.status === 401 ? 'Your Google session expired. Sign in again.' : 'This Google account cannot read the shared Sheet. Check your invitation.');
        return;
      }
      if (error.status === 0 || error.status === 400) {
        snapshot = undefined;
        onData(null);
      }
      backoffUntil = Date.now() + REFRESH_MS * 2;
      notice = error instanceof SheetsError ? error.message : 'Could not refresh from Google Sheets.';
    } finally {
      if (reading === controller) {
        reading = undefined;
        emit();
      }
    }
  }

  async function connect() {
    if (!oauth || authenticating || writing) return;
    reset('Waiting for Google authorization…');
    const current = generation;
    authenticating = true;
    emit();
    try {
      const grant = await requestAccessToken(oauth, WRITE_SCOPE);
      if (generation !== current) return;
      session = { ...grant, mode: 'edit' };
      expiry = setTimeout(() => validSession(), Math.max(0, grant.expiresAt - Date.now()));
      notice = 'Loading the shared Sheet…';
      await refresh();
    } catch (error) {
      if (generation === current) notice = error.message;
    } finally {
      if (generation === current) {
        authenticating = false;
        emit();
      }
    }
  }

  async function save(update = pending) {
    const retrying = pending === update;
    if (!update || !validSession() || session.mode !== 'edit' || writing ||
        (!retrying && (!snapshot || needsFreshRead || accessRecheck))) return false;
    if (pending && !retrying) return false;
    const active = session;
    abortRead();
    const controller = new AbortController();
    writing = controller;
    if (!retrying && !isSignup(update)) pendingBaseline = update.baseline ?? recordBaseline(update, snapshot);
    pending = update;
    notice = 'Saving to Google Sheets…';
    emit();
    try {
      if (retrying || !isSignup(update)) {
        const latest = await refresh({ priority: true });
        if (session !== active || !latest || accessRecheck) return false;
        if (!pending) return true;
      }
      const data = snapshot;
      await writeValues(active.token, update, data, pendingBaseline, controller.signal);
      if (session !== active || !validSession()) return false;
      pending = undefined;
      pendingBaseline = undefined;
      needsFreshRead = true;
      notice = 'Saved to Google Sheets.';
      const refreshed = await refresh({ priority: true });
      if (refreshed) notice = 'Saved to Google Sheets.';
      else if (session === active) notice = 'Saved to Google Sheets. Refresh before making another edit. ' + notice;
      return session === active;
    } catch (error) {
      if (session !== active) return false;
      if (error instanceof EditConflict) {
        pending = undefined;
        pendingBaseline = undefined;
        notice = error.message;
        return false;
      }
      if (error.status === 401) {
        reset('Your Google session expired. Sign in again.');
        return false;
      }
      if (permissionDenied(error)) {
        active.mode = 'view';
        const readable = await refresh({ priority: true });
        if (session === active && readable) notice = 'Google denied the edit. Ask the organizer to check Editor access or range protection.';
        return false;
      }
      if (!error.status || error.status >= 500) {
        const latest = await refresh({ priority: true });
        if (session !== active) return false;
        if (isSignup(update) && !pending && latest) return true;
      }
      notice = error instanceof SheetsError ? error.message : 'Google Sheets did not confirm the save.';
      if (isSignup(update) && (!error.status || error.status >= 500)) {
        notice += ` Signup ${update.row[0]} may have been saved. Keep this page open and check before retrying.`;
      } else {
        notice += ' Your change is still pending here.';
      }
      if (error.status === 429) backoffUntil = Date.now() + REFRESH_MS * 2;
      return false;
    } finally {
      if (writing === controller) {
        writing = undefined;
        emit();
        if (accessRecheck) void refresh({ priority: true });
      }
    }
  }

  async function saveRecipe(draft) {
    if (!draft || !validSession() || session.mode !== 'edit' || writing || pending || accessRecheck) {
      return { state: 'error', message: 'Sign in with edit access and finish any pending edit before saving.' };
    }
    if (recipeAttempt && recipeAttempt.id !== draft.id) {
      return { state: 'blocked', message: 'Resolve the previous recipe import before starting another one.' };
    }
    const active = session;
    const retrying = Boolean(recipeAttempt);
    abortRead();
    const controller = new AbortController();
    const { signal } = controller;
    writing = controller;
    const current = () => session === active && validSession() && !accessRecheck && !signal.aborted;
    const unresolved = () => ({ state: 'pending', message: 'Google Sheets has not confirmed this import. Keep this page open and use Check and retry.' });
    const conflict = () => ({ state: 'blocked', message: 'The import records disagree. Give the organizer the import ID shown here to investigate.' });
    const saved = () => {
      recipeAttempt = undefined;
      notice = 'Recipe added to Google Sheets.';
      return { state: 'saved' };
    };
    async function inspect(latest) {
      const marker = await request(active.token, 'developerMetadata/' + recipeAttempt.metadataId, { signal })
        .catch(error => {
          if (error.status !== 404) throw error;
          return undefined;
        });
      if (!current()) return;
      const state = reconcileRecipe(recipeAttempt, latest, marker);
      if (state !== 'conflict' || !marker || latest.recipeImport.rawMenu.has(draft.id)) return state;
      // A delayed batch can commit between the values read and the marker read.
      const newer = await refresh({ priority: true });
      return current() && newer?.recipeImport.ready ? reconcileRecipe(recipeAttempt, newer, marker) : undefined;
    }
    emit();
    try {
      const latest = await refresh({ priority: true });
      if (!current() || !latest) return recipeAttempt ? unresolved() : { state: 'error', message: 'Could not refresh Google Sheets. Try again.' };
      if (!latest.recipeImport.ready) {
        return recipeAttempt ? unresolved() : { state: 'error', message: 'The organizer needs to finish the recipe import setup in Google Sheets.' };
      }
      const review = reviewRecipe(draft.recipe, draft.target, draft.choices, latest);
      if (recipeAttempt) {
        const state = await inspect(latest);
        if (state === 'recorded') return saved();
        if (state === 'conflict') return conflict();
        if (state !== 'absent') return unresolved();
        if (review.rows.some(row => row.requested && !row.matched)) {
          return { state: 'blocked', message: 'A reused grocery row changed during this import. Give the organizer the import ID shown here.' };
        }
        if (review.signature !== draft.signature) {
          return { state: 'retry-review', message: 'The Sheet changed. Review the updated checklist status and warnings, then confirm the retry.' };
        }
      } else {
        if (review.signature !== draft.signature || review.rows.some(row => row.requested && !row.matched)) {
          return { state: 'review', message: 'The Sheet changed. Review the updated grocery choices before saving.' };
        }
        const operation = await prepareRecipeOperation(draft, review);
        if (!current()) return { state: 'error', message: 'The Google session changed. Sign in again to save.' };
        if (reconcileRecipe(operation, latest) !== 'absent') return conflict();
        const details = await request(active.token, '', {
          query: new URLSearchParams({ fields: 'sheets(properties(sheetId,title))' }), signal,
        });
        if (!current()) return { state: 'error', message: 'The Google session changed. Sign in again to save.' };
        const sheetIds = Object.fromEntries((details?.sheets ?? []).map(({ properties }) => [properties?.title, properties?.sheetId]));
        if (![RECIPE_TAB, 'Menu_Servings', 'Grocery_Checks'].every(tab => Number.isInteger(sheetIds[tab]) && sheetIds[tab] >= 0)) {
          return { state: 'error', message: 'Google Sheets did not return the recipe import tabs.' };
        }
        recipeAttempt = { ...operation, body: recipeAppendRequest(operation, sheetIds) };
      }
      let rejected;
      try {
        await request(active.token, ':batchUpdate', { method: 'POST', body: recipeAttempt.body, signal });
      } catch (error) {
        if (error.status === 401) throw error;
        rejected = error.status;
        if (rejected === 403 && current()) active.mode = 'view';
      }
      if (!current()) return unresolved();
      const confirmed = await refresh({ priority: true });
      if (rejected === 403 && current() && confirmed) {
        notice = 'Google denied the import. Ask the organizer to check Editor access and Sheet protections.';
      }
      if (!current() || !confirmed?.recipeImport.ready) return unresolved();
      const state = await inspect(confirmed);
      if (state === 'recorded') return saved();
      if (state === 'conflict') return conflict();
      if (!retrying && state === 'absent' && [400, 403].includes(rejected)) {
        recipeAttempt = undefined;
        return {
          state: 'error',
          message: rejected === 403
            ? notice
            : 'Google rejected the import. Ask the organizer to check the tab layout and Sheet protections.',
        };
      }
      if (rejected === 403) {
        return { state: 'pending', message: notice + ' Keep the import ID for organizer review.' };
      }
      return unresolved();
    } catch (error) {
      if (error.status === 401 && session === active) reset('Your Google session expired. Sign in again.');
      return recipeAttempt ? unresolved() : { state: 'error', message: 'Could not start the import. Refresh the Sheet and try again.' };
    } finally {
      if (writing === controller) {
        writing = undefined;
        emit();
        if (accessRecheck) void refresh({ priority: true });
      }
    }
  }

  function discard() {
    if (!pending || writing) return;
    pending = undefined;
    pendingBaseline = undefined;
    notice = 'Pending change cleared from this page.';
    emit();
    void refresh();
  }

  emit();
  if (googleConfigured) {
    loadGoogleIdentity().then(client => {
      oauth = client;
      notice = 'Sign in with your invited Google account to load the hub.';
      emit();
    }).catch(() => {
      notice = 'Google authorization is unavailable. Refresh the page to try again.';
      emit();
    });
  }
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  return {
    connect,
    refresh: () => refresh({ manual: true }),
    save,
    saveRecipe,
    discard,
    disconnect: () => reset('Signed out of Event Hub.'),
    editToken: () => validSession() && !authenticating && !accessRecheck && session.mode === 'edit' ? session.token : undefined,
    expireToken: token => {
      if (session?.token === token) reset('Your Google session expired. Sign in again.');
    },
    recheckAccess: token => {
      if (session?.token !== token) return;
      accessRecheck = true;
      abortRead();
      emit();
      if (!writing) void refresh({ priority: true });
    },
  };
}
