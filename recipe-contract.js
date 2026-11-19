import validate from './recipe-validator.generated.js';

export const AISLE_NAMES = {
  produce: 'Produce',
  proteins: 'Meat & Plant-Based Proteins',
  refrigerated: 'Dairy & Vegan Fridge',
  bakery: 'Bakery & Bread',
  pantry: 'Pantry & Oils',
  spices: 'Spices & Seasonings',
  other: 'Other',
};

const COURSES = {
  appetizer: 'Appetizer', salad: 'Salad', side: 'Side Dish', main: 'Main',
  dessert: 'Dessert', sauce: 'Sauce', drink: 'Drink', other: 'Other',
};
const DIETARY = { vegan: 'Vegan', vegetarian: 'Vegetarian', gluten_free: 'Gluten-Free', dairy_free: 'Dairy-Free' };
const LEGACY_UNITS = { lbs: 'lb', whole: 'each', heads: 'head', cloves: 'clove', bulbs: 'bulb', stalks: 'stalk', sheets: 'sheet' };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const importedDishId = new RegExp('^recipe-' + UUID + '$');
export const importedIngredientId = new RegExp('^ing-' + UUID + '-(?:[1-9]|[1-3][0-9]|40)$');
export const isRecipeFingerprint = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const encoder = new TextEncoder();

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function checkObjectKeys(text) {
  const stack = [];
  for (const match of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:"]+/g)) {
    const token = match[0];
    const current = stack.at(-1);
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? { keys: new Set(), expectsKey: true } : {});
      if (stack.length > 12) throw new Error('The JSON is nested too deeply.');
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (current?.keys) {
      if (token === ',') current.expectsKey = true;
      else if (current.expectsKey && token.startsWith('"')) {
        const key = JSON.parse(token);
        if (current.keys.has(key)) {
          const line = text.slice(0, match.index).split('\n').length;
          throw new Error(`Duplicate field "${key}" on line ${line}.`);
        }
        current.keys.add(key);
        current.expectsKey = false;
      }
    }
  }
}

function schemaMessage(error) {
  const at = error.instancePath.replace(/\/(\d+)/g, '[$1]').replace(/\//g, '.').replace(/^\./, '');
  const field = error.params.missingProperty || error.params.additionalProperty;
  const prefix = [at, field].filter(Boolean).join('.') || 'Recipe';
  if (error.keyword === 'additionalProperties') return prefix + ' is not a supported field.';
  if (error.keyword === 'required') return prefix + ' is required.';
  if (error.keyword === 'enum') return prefix + ' must be one of ' + error.params.allowedValues.join(', ') + '.';
  if (prefix.endsWith('.amount')) {
    return prefix + ' needs a positive number or null with unit to_taste.';
  }
  return prefix + ' ' + error.message + '.';
}

export function readRecipeJson(paste) {
  if (typeof paste !== 'string' || encoder.encode(paste).length > 64 * 1024) throw new Error('Paste a JSON recipe smaller than 64 KiB.');
  let text = paste.trim();
  const fenced = text.match(/^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) text = fenced[1].trim();
  let recipe;
  try {
    recipe = JSON.parse(text);
  } catch (error) {
    const position = /position (\d+)/i.exec(error.message)?.[1];
    if (position !== undefined) {
      const before = text.slice(0, Number(position)).split('\n');
      throw new Error(`Invalid JSON at line ${before.length}, column ${before.at(-1).length + 1}.`);
    }
    throw new Error('Paste one complete JSON object. ' + error.message);
  }
  checkObjectKeys(text);
  if (!validate(recipe)) {
    const useful = validate.errors.filter(error => !['if', 'anyOf'].includes(error.keyword));
    throw new Error([...new Set(useful.map(schemaMessage))].slice(0, 5).join('\n'));
  }
  if (recipe.source_url) {
    let url;
    try { url = new URL(recipe.source_url); } catch { throw new Error('source_url needs a valid HTTPS URL.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      throw new Error('source_url needs an HTTPS address without credentials.');
    }
  }
  const serialized = canonicalJson(recipe);
  if (encoder.encode(serialized).length > 32 * 1024) throw new Error('The normalized recipe is too large. Shorten notes or instructions.');
  return { recipe, serialized };
}

export function ingredientIdentity({ name, unit, aisle }) {
  return JSON.stringify([name.trim().replace(/\s+/g, ' ').toLowerCase(), unit, aisle]);
}

export function legacyGroceryRoster(recipes) {
  const roster = new Map();
  for (const { ingredients } of recipes) {
    for (const { groceryId, name, unit, aisle } of ingredients) {
      if (!roster.has(groceryId)) roster.set(groceryId, {
        key: groceryId,
        name,
        unit: LEGACY_UNITS[unit] ?? unit,
        aisle: Object.keys(AISLE_NAMES).find(key => AISLE_NAMES[key] === aisle) ?? 'other',
      });
    }
  }
  return roster;
}

export function importedRecipeCard(id, recipe, keys) {
  return {
    id, imported: true, course: COURSES[recipe.course], baseServings: recipe.base_servings,
    prepTime: recipe.prep_minutes + ' mins', cookTime: recipe.cook_minutes + ' mins',
    dietary: recipe.dietary_tags.map(tag => DIETARY[tag]),
    allergens: recipe.allergens,
    allergenNotes: recipe.allergen_notes,
    makeAhead: recipe.make_ahead,
    equipment: recipe.equipment,
    notes: recipe.notes ?? '',
    sourceUrl: recipe.source_url,
    ingredients: recipe.ingredients.map((item, index) => ({
      groceryId: keys[index], name: item.name, amount: item.amount,
      unit: item.unit, aisle: AISLE_NAMES[item.aisle], prepNote: item.prep_note,
    })),
    steps: recipe.steps,
  };
}
