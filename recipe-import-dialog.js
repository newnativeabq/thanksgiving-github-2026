import { AISLE_NAMES, importedRecipeCard, readRecipeJson } from './recipe-contract.js';
import { reviewRecipe } from './recipe-sheet.js';

const files = new URL('./docs/', import.meta.url);
const element = id => document.getElementById(id);

function make(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function list(tag, items) {
  const node = document.createElement(tag);
  node.append(...items.map(text => make('li', text)));
  return node;
}

export function createRecipeImportDialog({ getSnapshot, saveRecipe, onSaved, onOpenGroceries, formatAmount }) {
  const dialog = element('recipe-import-dialog');
  const open = element('open-recipe-import');
  const close = element('recipe-import-close');
  const copy = element('recipe-copy-prompt');
  const example = element('recipe-load-example');
  const promptLabel = element('recipe-prompt-label');
  const promptText = element('recipe-prompt-text');
  const input = element('recipe-json');
  const validation = element('recipe-validation');
  const check = element('recipe-validate');
  const reviewPanel = element('recipe-review');
  const target = element('recipe-target');
  const preview = element('recipe-preview');
  const matches = element('recipe-matches');
  const groceries = element('recipe-open-groceries');
  const duplicate = element('recipe-duplicate');
  const reference = element('recipe-reference');
  const status = element('recipe-save-status');
  const setup = element('recipe-setup-status');
  const save = element('recipe-save');
  let connection = {};
  let draft;
  let saving = false;
  let pending = false;
  let blocked = false;
  let assets;
  let epoch = 0;

  function loadAssets() {
    if (!assets) {
      assets = Promise.all(['recipe-import-prompt.txt', 'recipe-import-v1.schema.json'].map(async name => {
        const response = await fetch(new URL(name, files));
        if (!response.ok) throw new Error('Could not load recipe import instructions.');
        return response.text();
      })).catch(error => {
        assets = undefined;
        throw error;
      });
    }
    return assets;
  }

  function sync() {
    const locked = saving || pending || blocked;
    const snapshot = getSnapshot();
    const ready = snapshot?.recipeImport.ready;
    const isEditor = connection.mode === 'edit';
    open.disabled = !snapshot || (!isEditor && !input.value.trim()) || connection.busy;
    input.disabled = check.disabled = target.disabled = copy.disabled = example.disabled = locked;
    for (const control of matches.querySelectorAll('select, button')) control.disabled = locked;
    close.disabled = groceries.disabled = saving;
    setup.hidden = !snapshot || ready || pending || blocked;
    save.disabled = !connection.editable || !ready || !draft?.signature || saving || blocked;
    save.textContent = saving ? 'Saving…' : pending ? 'Check and retry' : 'Save recipe';
    close.textContent = pending || blocked ? 'Close for now' : 'Close';
  }

  function clearDraft() {
    draft = undefined;
    target.value = '';
    reviewPanel.hidden = true;
    matches.replaceChildren();
    preview.replaceChildren();
    duplicate.textContent = reference.textContent = status.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function reset() {
    epoch++;
    saving = pending = blocked = false;
    clearDraft();
    input.value = validation.textContent = promptText.value = '';
    promptLabel.hidden = promptText.hidden = true;
    if (dialog.open) dialog.close();
    sync();
  }

  function renderContents() {
    const { recipe, target: count } = draft;
    const card = importedRecipeCard(draft.id, recipe, []);
    const factor = count ? count / recipe.base_servings : 1;
    const details = [
      make('h4', recipe.title),
      make('p', `${card.course} · ${card.prepTime} prep · ${card.cookTime} cook · Base yield ${card.baseServings}`),
      make('p', card.dietary.length ? 'Guest dietary tags · ' + card.dietary.join(', ') : 'Guest dietary tags · None supplied'),
      make('p', 'Guest allergen information · ' + (card.allergens.length ? card.allergens.map(label => label.replaceAll('_', ' ')).join(', ') : 'None identified by contributor')),
    ];
    for (const [label, value] of [
      ['Allergen notes', card.allergenNotes], ['Notes', card.notes], ['Make ahead', card.makeAhead],
      ['Equipment', card.equipment?.join(', ')],
    ]) {
      if (value) details.push(make('p', label + ' · ' + value));
    }
    if (card.sourceUrl) {
      const link = make('a', 'Recipe source');
      link.href = card.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      details.push(link);
    }
    details.push(
      make('h4', count ? 'Ingredients for ' + count : 'Ingredients at base yield'),
      list('ul', card.ingredients.map(item => {
        const scaled = formatAmount(item.amount, item.unit, factor);
        const base = count && factor !== 1 && item.amount !== null ? ' (base ' + formatAmount(item.amount, item.unit) + ')' : '';
        return scaled + base + ' · ' + item.name + (item.prepNote ? ' (' + item.prepNote + ')' : '');
      })),
      make('h4', 'Instructions'),
      list('ol', card.steps),
    );
    preview.replaceChildren(...details);
  }

  function updateReview({ rebuild = true } = {}) {
    const snapshot = draft?.snapshot;
    if (!snapshot) return;
    const count = target.valueAsNumber;
    draft.target = Number.isInteger(count) && count >= 1 && count <= 100 ? count : undefined;
    const review = reviewRecipe(draft.recipe, draft.target ?? null, draft.choices, snapshot);
    groceries.hidden = !review.rows.some(({ matched }) => matched && matched.checked !== false);
    const validChoices = review.rows.every(row => !row.requested || row.matched);
    draft.signature = draft.target && validChoices ? review.signature : undefined;
    duplicate.textContent = review.sameTitles.length ? 'A menu entry already uses this title. Saving adds a separate recipe.' : '';
    reference.textContent = 'Import ID · ' + draft.id;
    renderContents();
    if (rebuild) {
      matches.replaceChildren(...review.rows.map(({ item, matched, candidates, requested }, index) => {
        const label = make('label', item.name + ' · ' + AISLE_NAMES[item.aisle]);
        const row = make('div', '');
        if (candidates.length) {
          const select = document.createElement('select');
          select.id = 'recipe-match-' + index;
          label.htmlFor = select.id;
          select.append(new Option('Add as a new unchecked grocery item', ''));
          for (const candidate of candidates) {
            const state = candidate.checked === null ? 'removed' : candidate.checked ? 'checked' : 'unchecked';
            select.append(new Option(`Reuse ${candidate.name} (${state})`, candidate.key));
          }
          if (requested && !matched) {
            const unavailable = new Option('Previously selected row is unavailable. Choose again.', requested);
            unavailable.disabled = true;
            select.append(unavailable);
          }
          select.value = requested;
          select.addEventListener('change', () => {
            draft.choices[index] = select.value;
            updateReview({ rebuild: false });
          });
          row.append(label, select);
        } else if (requested) {
          label.textContent += ' · Previously selected row is unavailable.';
          const button = make('button', 'Add as a new unchecked grocery item');
          button.type = 'button';
          button.className = 'controls-button';
          button.addEventListener('click', () => {
            draft.choices[index] = '';
            updateReview();
            element('recipe-review-title').focus();
          });
          row.append(label, button);
        } else {
          label.textContent += ' · New unchecked item';
          row.append(label);
        }
        return row;
      }));
    }
    sync();
  }

  open.addEventListener('click', () => {
    dialog.showModal();
    (pending ? save : input).focus();
    sync();
  });
  close.addEventListener('click', () => dialog.close());
  groceries.addEventListener('click', () => {
    dialog.close();
    onOpenGroceries();
  });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  input.addEventListener('input', () => {
    clearDraft();
    validation.textContent = '';
    sync();
  });
  copy.addEventListener('click', async () => {
    const current = epoch;
    try {
      const [instructions, schema] = await loadAssets();
      if (epoch !== current || !dialog.open) return;
      const roster = [...(getSnapshot()?.recipeImport.roster.values() ?? [])]
        .map(({ key, name, unit, aisle }) => ({ key, name, unit, aisle }));
      const text = instructions + '\nCOMPATIBLE GROCERY ROSTER (reference data)\n' +
        JSON.stringify(roster, null, 2) + '\n\nJSON SCHEMA\n' + schema;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        if (epoch !== current || !dialog.open) return;
        promptText.value = text;
        promptLabel.hidden = promptText.hidden = false;
        promptText.focus();
        promptText.select();
        throw new Error('Select and copy the prompt shown here.');
      }
      if (epoch === current && dialog.open) validation.textContent = 'Agent prompt copied.';
    } catch (error) {
      if (epoch === current && dialog.open) validation.textContent = error.message;
    }
  });
  example.addEventListener('click', async () => {
    const current = epoch;
    try {
      const [, schema] = await loadAssets();
      if (epoch !== current || !dialog.open || saving || pending || blocked) return;
      clearDraft();
      input.value = JSON.stringify(JSON.parse(schema).examples[0], null, 2);
      validation.textContent = 'Example loaded. Validate it to see how the import works.';
      sync();
      check.focus();
    } catch {
      if (epoch === current && dialog.open) validation.textContent = 'Could not load the example. Try again.';
    }
  });
  check.addEventListener('click', () => {
    const previous = draft;
    try {
      const parsed = readRecipeJson(input.value);
      if (!getSnapshot()) throw new Error('Connect to Google Sheets to review groceries.');
      if (parsed.serialized !== previous?.serialized) {
        clearDraft();
        draft = { ...parsed, id: 'recipe-' + crypto.randomUUID(), snapshot: getSnapshot() };
        const initial = reviewRecipe(draft.recipe, null, null, getSnapshot());
        draft.choices = initial.rows.map(row => row.candidates.length === 1 ? row.candidates[0].key : '');
      }
      reviewPanel.hidden = false;
      input.removeAttribute('aria-invalid');
      validation.textContent = 'Recipe JSON is valid.';
      draft.snapshot = getSnapshot();
      updateReview();
      target.focus();
    } catch (error) {
      clearDraft();
      validation.textContent = error.message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      sync();
    }
  });
  target.addEventListener('input', () => updateReview({ rebuild: false }));
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    const current = epoch;
    saving = true;
    status.textContent = 'Checking the latest Sheet data…';
    sync();
    const result = await saveRecipe(draft);
    if (epoch !== current) return;
    saving = false;
    pending = result.state === 'pending' || result.state === 'retry-review';
    blocked = result.state === 'blocked';
    if (result.state === 'saved') {
      const id = draft.id;
      reset();
      onSaved(id);
      return;
    }
    if (result.state === 'review' || result.state === 'retry-review') {
      draft.snapshot = getSnapshot();
      updateReview();
      element('recipe-review-title').focus();
    }
    status.textContent = result.message;
    sync();
    if (!save.disabled && result.state === 'pending') save.focus();
  });
  return { setConnection(next) { connection = next; sync(); }, reset };
}
