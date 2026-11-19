import {
  canonicalJson, importedDishId, importedIngredientId, importedRecipeCard,
  ingredientIdentity, isRecipeFingerprint, readRecipeJson,
} from './recipe-contract.js';

export const RECIPE_TAB = 'Recipe_Definitions';
export const RECIPE_HEADER = ['dish_id', 'definition_json', 'ingredient_keys_json', 'created_at', 'import_fingerprint'];
export const IMPORT_MARKER = 'event_hub_recipe_import_v1';

export const hasHeaders = (rows, header) =>
  Array.isArray(rows?.[0]) && rows[0].length === header.length && header.every((key, col) => rows[0][col] === key);

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows ?? []) {
    if (!Array.isArray(row) || !row.length) continue;
    const id = row[0];
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

function groupIngredients(ingredients) {
  const groups = new Map();
  for (const [index, item] of ingredients.entries()) {
    const identity = ingredientIdentity(item);
    if (!groups.has(identity)) groups.set(identity, { item, indices: [] });
    groups.get(identity).indices.push(index);
  }
  return [...groups.values()];
}

export function attachRecipeRecords(data, { definitionRows, menuRows, groceryRows, roster, ready, issues, legacyKeys }) {
  const rawDefinitions = groupRows(definitionRows);
  const rawMenu = groupRows(menuRows);
  const rawGrocery = groupRows(groceryRows);
  const definitions = new Map();
  const imported = [];
  const parsed = new Map();
  for (const [id, rows] of rawDefinitions) {
    try {
      if (!ready || !importedDishId.test(id) || rows.length !== 1) throw new Error();
      const [, text, mappingText, createdAt, fingerprint] = rows[0];
      if (!isRecipeFingerprint(fingerprint) || typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) ||
          typeof mappingText !== 'string' || mappingText.length > 4000) throw new Error();
      const { recipe, serialized } = readRecipeJson(text);
      const mapping = JSON.parse(mappingText);
      if (!Array.isArray(mapping) || mapping.length !== recipe.ingredients.length ||
          !mapping.every(key => typeof key === 'string' && (roster.has(key) || importedIngredientId.test(key)))) throw new Error();
      parsed.set(id, { recipe, serialized, mapping, fingerprint });
    } catch {
      issues.add(typeof id === 'string' ? id.slice(0, 100) : 'Recipe_Definitions');
    }
  }

  // The recipe that allocated a key supplies its identity, even after removal from the menu.
  for (const [id, { recipe, mapping }] of parsed) {
    const prefix = 'ing-' + id.slice('recipe-'.length) + '-';
    const ownedIngredients = new Map();
    for (const [groupIndex, { item, indices }] of groupIngredients(recipe.ingredients).entries()) {
      const expectedKey = prefix + (groupIndex + 1);
      for (const index of indices) {
        const key = mapping[index];
        if (!key.startsWith(prefix) || !data.grocery.has(key)) continue;
        if (key !== expectedKey) ownedIngredients.set(key, null);
        else if (!ownedIngredients.has(key)) {
          ownedIngredients.set(key, { key, name: item.name.trim(), unit: item.unit, aisle: item.aisle });
        }
      }
    }
    for (const [key, identity] of ownedIngredients) if (identity) roster.set(key, identity);
  }
  for (const key of data.grocery.keys()) {
    if (importedIngredientId.test(key) && !roster.has(key)) {
      issues.add(key);
      data.grocery.delete(key);
    }
  }
  for (const [id, { recipe, serialized, mapping, fingerprint }] of parsed) {
    if (!data.menu.has(id) || !mapping.every((key, index) => roster.has(key) &&
        ingredientIdentity(roster.get(key)) === ingredientIdentity(recipe.ingredients[index]))) {
      issues.add(id);
      continue;
    }
    definitions.set(id, { serialized, mapping, fingerprint });
    imported.push(importedRecipeCard(id, recipe, mapping));
  }
  for (const id of data.menu.keys()) {
    if (!legacyKeys.has(id) && !definitions.has(id)) {
      issues.add(id);
      data.menu.delete(id);
    }
  }
  data.recipeImport = { ready, roster, definitions, imported, issues: [...issues], rawDefinitions, rawMenu, rawGrocery };
}

export function reviewRecipe(recipe, target, choices, snapshot) {
  const title = recipe.title.trim().toLowerCase();
  const sameTitles = [...snapshot.menu].filter(([, entry]) => entry.title.toLowerCase() === title).map(([key]) => key).sort();
  const rows = groupIngredients(recipe.ingredients).map((group, index) => {
    const identity = ingredientIdentity(group.item);
    const candidates = new Map();
    for (const ingredientIndex of group.indices) {
      const candidate = snapshot.recipeImport.roster.get(recipe.ingredients[ingredientIndex].grocery_key);
      if (candidate && ingredientIdentity(candidate) === identity && !candidates.has(candidate.key)) {
        candidates.set(candidate.key, { ...candidate, checked: snapshot.grocery.get(candidate.key).value });
      }
    }
    const requested = choices?.[index] ?? '';
    return { ...group, candidates: [...candidates.values()], matched: candidates.get(requested), requested };
  });
  const signature = canonicalJson({
    sameTitles,
    target,
    choices: rows.map(({ requested, candidates }) => [requested, candidates.map(({ key, name, checked }) => [key, name, checked])]),
  });
  return { rows, sameTitles, signature };
}

function positiveMetadataId() {
  const random = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(random); } while ((random[0] & 0x7fffffff) === 0);
  return random[0] & 0x7fffffff;
}

export async function prepareRecipeOperation({ id, recipe, serialized, target }, review) {
  if (!importedDishId.test(id) || !Number.isInteger(target) || target < 1 || target > 100) throw new Error('Enter event servings from 1 to 100.');
  const mapping = Array(recipe.ingredients.length);
  const newIngredients = [];
  const reused = new Map();
  for (const [index, { item, indices, matched }] of review.rows.entries()) {
    const key = matched?.key ?? 'ing-' + id.slice('recipe-'.length) + '-' + (index + 1);
    if (matched) reused.set(key, matched);
    else newIngredients.push({ key, name: item.name.trim(), unit: item.unit, aisle: item.aisle });
    for (const i of indices) mapping[i] = key;
  }
  const bytes = new TextEncoder().encode(canonicalJson({ recipe, mapping, target }));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return {
    id, title: recipe.title.trim(), target, serialized, mapping, newIngredients, reused, fingerprint,
    createdAt: new Date().toISOString(), metadataId: positiveMetadataId(),
  };
}

function cell(value) {
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

const metadataValue = operation => operation.id + ':' + operation.fingerprint;

export function recipeAppendRequest(operation, sheetIds) {
  const append = (tab, rows) => ({ appendCells: {
    sheetId: sheetIds[tab],
    rows: rows.map(values => ({ values: values.map(cell) })),
    fields: 'userEnteredValue',
  } });
  const { id, serialized, mapping, title, target, createdAt, fingerprint, metadataId, newIngredients } = operation;
  const requests = [{ createDeveloperMetadata: { developerMetadata: {
    metadataId, metadataKey: IMPORT_MARKER, metadataValue: metadataValue(operation),
    visibility: 'DOCUMENT', location: { spreadsheet: true },
  } } }];
  requests.push(append(RECIPE_TAB, [[id, serialized, JSON.stringify(mapping), createdAt, fingerprint]]));
  requests.push(append('Menu_Servings', [[id, title, target, '', createdAt]]));
  if (newIngredients.length) {
    requests.push(append('Grocery_Checks', newIngredients.map(({ key }) => [key, false, '', createdAt])));
  }
  return { requests };
}

export function reconcileRecipe(operation, snapshot, marker) {
  const info = snapshot.recipeImport;
  const definition = info.definitions.get(operation.id);
  const menus = info.rawMenu.get(operation.id)?.length ?? 0;
  const definitions = info.rawDefinitions.get(operation.id)?.length ?? 0;
  const newRows = operation.newIngredients.map(({ key }) => info.rawGrocery.get(key)?.length ?? 0);
  if (!marker && !menus && !definitions && newRows.every(count => count === 0)) return 'absent';
  const markerMatches = marker?.metadataId === operation.metadataId && marker?.metadataKey === IMPORT_MARKER &&
    marker?.metadataValue === metadataValue(operation) && marker?.visibility === 'DOCUMENT' && marker?.location?.spreadsheet === true;
  const identities = [...operation.newIngredients, ...operation.reused.values()].every(item => {
    const current = info.roster.get(item.key);
    return current && ingredientIdentity(item) === ingredientIdentity(current);
  });
  if (markerMatches && menus === 1 && definitions === 1 && newRows.every(count => count === 1) && identities &&
      definition?.serialized === operation.serialized && definition?.fingerprint === operation.fingerprint &&
      canonicalJson(definition.mapping) === canonicalJson(operation.mapping)) return 'recorded';
  return 'conflict';
}
