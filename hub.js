import { RECIPES, PREP_TIMELINE } from './hub-catalog.js';
import { createHubSheets } from './hub-sheets.js';
import { createFeedback } from './feedback.js';
import { createRecordDialog } from './record-dialog.js';
import { AISLE_NAMES, legacyGroceryRoster } from './recipe-contract.js';
import { createRecipeImportDialog } from './recipe-import-dialog.js';

// Supermarket Aisles Ordering
const AISLE_ORDER = Object.values(AISLE_NAMES);

const AISLE_ICONS = {
  'Produce': '🥬',
  'Meat & Plant-Based Proteins': '🦃',
  'Dairy & Vegan Fridge': '🧈',
  'Bakery & Bread': '🥖',
  'Pantry & Oils': '🫒',
  'Spices & Seasonings': '🌿'
};

// Application State
let state = {
  activeTab: 'menu',
  recipes: [],
  servings: {},
  dietFilter: 'all',
  checkedGrocery: {},
  grocerySearch: '',
  groceryAisleFilter: 'ALL',
  hideCheckedGrocery: false,
  potluckItems: [],
  checkedTimeline: {}
};

let uncheckConfirmPending = false;
let hasData = false;
let pendingSignup;
let openRecipeId;
let sharedViewKey;
let currentSnapshot;
let menuRefreshDeferred = false;
let connection = {};
const element = id => document.getElementById(id);
const recordDialog = createRecordDialog();
const recipeImportDialog = createRecipeImportDialog({
  getSnapshot: () => currentSnapshot,
  saveRecipe: draft => cloud.saveRecipe(draft),
  formatAmount: formatIngredientAmount,
  onOpenGroceries: () => {
    switchTab('grocery');
    element('grocery-search-input').focus();
  },
  onSaved: id => {
    state.dietFilter = 'all';
    renderMenuTab();
    syncControls();
    (document.querySelector(`[data-recipe-id="${id}"] h3`) ?? element('open-recipe-import')).focus();
    showToast('Recipe added to the menu.');
  },
});
const planRecipes = () => state.recipes.filter(recipe => state.servings[recipe.id] !== null);

/**
 * Format decimal numbers into clean culinary fractions (e.g. 0.5 -> ½, 2.25 -> 2 ¼)
 */
function formatFraction(value) {
  if (value === 0) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  const whole = Math.floor(rounded + 0.001);
  const remainder = rounded - whole;

  const fractions = [
    { val: 0, str: '' },
    { val: 1/8, str: '⅛' },
    { val: 1/6, str: '⅙' },
    { val: 1/4, str: '¼' },
    { val: 1/3, str: '⅓' },
    { val: 3/8, str: '⅜' },
    { val: 1/2, str: '½' },
    { val: 5/8, str: '⅝' },
    { val: 2/3, str: '⅔' },
    { val: 3/4, str: '¾' },
    { val: 5/6, str: '⅚' },
    { val: 7/8, str: '⅞' },
    { val: 1, str: 'WHOLE_UP' }
  ];

  let best = fractions[0];
  let minDiff = Math.abs(remainder - fractions[0].val);
  for (let i = 1; i < fractions.length; i++) {
    const diff = Math.abs(remainder - fractions[i].val);
    if (diff < minDiff) {
      minDiff = diff;
      best = fractions[i];
    }
  }

  // If within tolerance of a clean culinary fraction
  if (minDiff <= 0.035) {
    if (whole === 0 && best.val === 0) return String(Number(value.toPrecision(3)));
    if (best.str === 'WHOLE_UP') {
      return String(whole + 1);
    }
    if (whole === 0 && best.str) return best.str;
    if (whole > 0 && best.str) return `${whole} ${best.str}`;
    return String(whole);
  }

  // Fallback clean decimal
  return Number(rounded.toFixed(2)).toString();
}

function formatBatchMultiplier(multiplier) {
  return String(Number(multiplier.toFixed(1)) || Number(multiplier.toFixed(2)));
}

function formatIngredientAmount(amount, unit, factor = 1) {
  if (amount === null) return 'To taste';
  const displayUnit = unit === 'fl_oz' ? 'fl oz' : unit;
  return `${formatFraction(amount * factor)} ${displayUnit}`;
}

/**
 * Smart supermarket package / volume conversion hints for aggregated grocery items
 */
function getConversionHint(groceryId, totalAmount, unit) {
  if (totalAmount === null) return '';
  if (unit === 'tbsp' && totalAmount >= 8) {
    const cups = totalAmount / 16;
    if (groceryId === 'vegan-butter' || groceryId === 'unsalted-butter') {
      const lbs = totalAmount / 32;
      return `≈ ${formatFraction(cups)} cups / ${formatFraction(lbs)} lbs`;
    }
    return `≈ ${formatFraction(cups)} cups`;
  }
  if (unit === 'tsp' && totalAmount >= 6) {
    return `≈ ${formatFraction(totalAmount / 3)} tbsp`;
  }
  if (groceryId === 'vegetable-broth' && totalAmount > 2) {
    const cartons = Math.ceil(totalAmount / 4);
    return `≈ ${cartons} × 32-oz carton${cartons > 1 ? 's' : ''}`;
  }
  if (groceryId === 'celery-stalks' && totalAmount >= 8) {
    const bunches = Math.ceil(totalAmount / 10);
    return `≈ ${bunches} bunch${bunches > 1 ? 'es' : ''}`;
  }
  if (groceryId === 'lemon-juice' && totalAmount >= 3) {
    const lemons = Math.ceil(totalAmount / 2.5);
    return `≈ ${lemons} fresh lemon${lemons > 1 ? 's' : ''}`;
  }
  if ((groceryId === 'fresh-rosemary' || groceryId === 'fresh-positive' || groceryId === 'fresh-thyme') && totalAmount >= 2) {
    const bunches = Math.ceil(totalAmount / 3);
    return `≈ ${bunches} fresh bunch${bunches > 1 ? 'es' : ''}`;
  }
  if (groceryId === 'vegan-parmesan') {
    const wedges = Math.ceil(totalAmount / 5.3);
    return `≈ ${wedges} × 5.3-oz wedge${wedges > 1 ? 's' : ''}`;
  }
  return '';
}

/**
 * Aggregate identical ingredients across active recipes using live serving multipliers
 */
function aggregateGroceries() {
  const map = new Map();

  planRecipes().forEach(recipe => {
    const target = state.servings[recipe.id];
    const multiplier = target / recipe.baseServings;

    recipe.ingredients.forEach(ing => {
      if (state.checkedGrocery[ing.groceryId] === null) return;
      const scaledAmt = ing.amount === null ? null : ing.amount * multiplier;
      if (!map.has(ing.groceryId)) {
        const canonical = currentSnapshot.recipeImport.roster.get(ing.groceryId);
        map.set(ing.groceryId, {
          groceryId: ing.groceryId,
          name: canonical.name,
          unit: recipe.imported ? canonical.unit : ing.unit,
          aisle: AISLE_NAMES[canonical.aisle],
          totalAmount: scaledAmt === null ? null : 0,
          sources: []
        });
      }
      const entry = map.get(ing.groceryId);
      if (scaledAmt !== null) entry.totalAmount += scaledAmt;
      entry.sources.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        amount: scaledAmt,
        unit: ing.unit
      });
    });
  });

  return Array.from(map.values());
}

/**
 * Toast notification helper (replaces alert/confirm)
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-ink text-linen border-positive',
    info: 'bg-linen text-ink border-accent',
    warning: 'bg-warning-light text-ink border-warning'
  };
  const icon = type === 'success' ? '✓' : type === 'warning' ? '!' : '✦';
  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 shadow-warm-lg text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.success}`;
  toast.innerHTML = `
    <span class="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0">${icon}</span>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safe Clipboard Copy using document.execCommand('copy') for iFrame compatibility
 */
function copyTextToClipboard(text, successMsg) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showToast(successMsg, 'success');
    } else {
      showToast('Could not copy automatically — please select and copy manually.', 'warning');
    }
  } catch (err) {
    showToast('Clipboard copy unavailable in this browser view.', 'warning');
  }
  document.body.removeChild(textarea);
}

/**
 * Render KPI Summary Pills & Nav Badges
 */
function renderKPIs() {
  if (!hasData) return;
  const groceries = aggregateGroceries();
  const totalGroceryCount = groceries.length;
  const checkedGroceryCount = groceries.filter(g => state.checkedGrocery[g.groceryId]).length;

  const signupCount = state.potluckItems.length;

  const kpiContainer = document.getElementById('kpi-pills');
  kpiContainer.innerHTML = `
    <div class="bg-parchment border border-warmborder rounded-lg px-3.5 py-2.5">
      <div class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Host Dishes</div>
      <div class="font-serif text-xl font-bold text-accent mt-0.5">${planRecipes().length}</div>
    </div>
    <div class="bg-parchment border border-warmborder rounded-lg px-3.5 py-2.5">
      <div class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Potluck Dishes</div>
      <div class="font-serif text-xl font-bold text-ink mt-0.5">${signupCount}</div>
    </div>
    <div class="bg-parchment border border-warmborder rounded-lg px-3.5 py-2.5">
      <div class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Grocery Checked</div>
      <div class="font-serif text-xl font-bold text-positive-dark mt-0.5">${checkedGroceryCount}<span class="text-sm font-sans text-ink-subtle">/${totalGroceryCount}</span></div>
    </div>
  `;

  // Update Nav Badges
  const navGroceryBadge = document.getElementById('nav-grocery-badge');
  if (navGroceryBadge) {
    navGroceryBadge.textContent = `${checkedGroceryCount}/${totalGroceryCount}`;
  }
  const navPotluckBadge = document.getElementById('nav-potluck-badge');
  if (navPotluckBadge) {
    navPotluckBadge.textContent = String(signupCount);
  }
}

/**
 * Switch Navigation Tabs
 */
function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.setAttribute('aria-pressed', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activePanel) {
    activePanel.classList.remove('hidden');
  }

  updateVisibility();
  if (!hasData) return;
  if (tabName === 'menu') renderMenuTab();
  if (tabName === 'grocery') renderGroceryTab();
  if (tabName === 'potluck') renderPotluckTab();
  if (tabName === 'sync') renderSyncAndTimelineTab();
  syncControls();
}

/**
 * =========================================================================
 * TAB 1: MENU & DYNAMIC SCALER
 * =========================================================================
 */
function setDietFilter(filter) {
  state.dietFilter = filter;
  renderMenuTab();
  syncControls();
}

function servingCount(value) {
  const servings = Number(value);
  return Number.isInteger(servings) && servings >= 1 && servings <= 100 ? servings : undefined;
}

function previewServings(recipeId, value) {
  const recipe = state.recipes.find(entry => entry.id === recipeId);
  const target = servingCount(value);
  if (!recipe || target === undefined) return;
  const multiplier = formatBatchMultiplier(target / recipe.baseServings);
  element(`multiplier-badge-${recipeId}`).textContent = `${target} servings • ${multiplier}x batch`;
  element(`ingredient-preview-${recipeId}`).innerHTML = buildIngredientPreviewHTML(recipe, target);
  const number = element(`serving-input-${recipeId}`);
  const slider = element(`serving-slider-${recipeId}`);
  if (document.activeElement !== number) number.value = target;
  if (document.activeElement !== slider) slider.value = target;
}

function updateRecipeServings(recipeId, value, original) {
  if (state.servings[recipeId] === null) return;
  const servings = servingCount(value);
  if (servings === undefined) {
    showToast('Enter a whole number from 1 to 100.', 'warning');
    renderMenuTab();
    syncControls();
    return;
  }
  const baseline = { [recipeId]: { value: servingCount(original) } };
  void cloud.save({ kind: 'menu', values: { [recipeId]: servings }, baseline })
    .finally(() => {
      renderMenuTab();
      if (openRecipeId && state.servings[openRecipeId] == null) closeRecipeModal();
  else if (openRecipeId) openRecipeModal(openRecipeId, true);
      syncControls();
    });
}

function buildIngredientPreviewHTML(recipe, targetServings) {
  const mult = targetServings / recipe.baseServings;
  return recipe.ingredients.slice(0, 4).map(ing => {
    const amtStr = formatIngredientAmount(ing.amount, ing.unit, mult);
    return `
      <li class="flex items-baseline justify-between gap-2 text-xs py-1 border-b border-warmborder/50 last:border-b-0">
        <span class="text-ink-muted truncate">${escapeHtml(ing.name.split('(')[0].trim())}</span>
        <span class="font-semibold text-ink whitespace-nowrap">${escapeHtml(amtStr)}</span>
      </li>
    `;
  }).join('');
}

function getDietaryBadgeStyle(tag) {
  if (tag === 'Vegan' || tag === 'Gluten-Free') {
    return 'bg-positive-light text-positive-dark border-positive/30';
  }
  if (tag === 'Contains Walnuts') {
    return 'bg-warning-light text-warning-dark border-warning/40';
  }
  if (tag === 'Poultry' || tag === 'Pork') {
    return 'bg-accent-light text-accent-dark border-accent/30';
  }
  return 'bg-parchment text-ink-muted border-warmborder';
}

function renderMenuTab() {
  menuRefreshDeferred = false;
  if (!hasData) return;
  const dishes = planRecipes();
  renderRemoved('menu');
  // Render Dietary Filter Pills
  const veganCount = dishes.filter(r => r.dietary.includes('Vegan')).length;
  const gfCount = dishes.filter(r => r.dietary.includes('Gluten-Free')).length;
  const mainsCount = dishes.filter(r => r.course.startsWith('Main')).length;

  const filters = [
    { id: 'all', label: `All Dishes (${dishes.length})` },
    { id: 'vegan', label: `Tagged vegan (${veganCount})` },
    { id: 'gf', label: `Tagged gluten-free (${gfCount})` },
    { id: 'mains', label: `Mains (${mainsCount})` }
  ];

  const filterBar = document.getElementById('diet-filter-bar');
  filterBar.innerHTML = filters.map(f => {
    const active = state.dietFilter === f.id;
    return `
      <button data-action="setDietFilter" data-key="${f.id}" class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'bg-ink text-linen border-ink shadow-xs'
          : 'bg-parchment text-ink-muted border-warmborder hover:border-ink/40 hover:text-ink'
      }">
        ${f.label}
      </button>
    `;
  }).join('');

  // Filter Recipes
  const filteredRecipes = dishes.filter(r => {
    if (state.dietFilter === 'vegan') return r.dietary.includes('Vegan');
    if (state.dietFilter === 'gf') return r.dietary.includes('Gluten-Free');
    if (state.dietFilter === 'mains') return r.course.startsWith('Main');
    return true;
  });

  const grid = document.getElementById('dish-cards-grid');
  grid.innerHTML = filteredRecipes.length ? filteredRecipes.map(recipe => {
    const target = state.servings[recipe.id];
    const mult = formatBatchMultiplier(target / recipe.baseServings);

    const dietaryBadges = recipe.dietary.map(tag => `
      <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getDietaryBadgeStyle(tag)}">
        ${escapeHtml(tag)}
      </span>
    `).join('');

    return `
      <article data-recipe-id="${recipe.id}" class="bg-linen border border-warmborder rounded-2xl p-5 shadow-warm hover:shadow-warm-lg transition-shadow flex flex-col justify-between">
        <div class="space-y-3.5">
          <!-- Course & Timing Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="px-2.5 py-1 rounded-lg bg-parchment text-ink-muted font-bold">
              ${escapeHtml(recipe.course)}
            </span>
            <span class="text-ink-muted font-medium">
              Prep ${recipe.prepTime} • Cook ${recipe.cookTime}
            </span>
            ${recordActions('menu', recipe.id, recipe.title)}
          </div>

          <!-- Title & Dietary Badges -->
          <div class="space-y-2">
            <h3 tabindex="-1" class="font-serif text-xl font-bold text-ink leading-snug">
              ${escapeHtml(recipe.title)}
            </h3>
            <div class="flex flex-wrap gap-1.5">
              ${dietaryBadges}
              ${recipe.imported && recipe.dietary.length ? '<span class="text-xs text-ink-muted self-center">Guest tags</span>' : ''}
            </div>
          </div>

          <!-- Host Notes -->
          <p class="text-xs text-ink-muted leading-relaxed">
            ${escapeHtml(recipe.notes)}
          </p>

          <!-- Live Serving Adjuster Box -->
          <div class="bg-parchment border border-warmborder rounded-xl p-3.5 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span id="multiplier-badge-${recipe.id}" class="text-xs font-bold text-accent">
                ${target} servings • ${mult}x batch
              </span>
              <span class="text-[11px] text-ink-subtle">
                Base: ${recipe.baseServings}
              </span>
            </div>

            <div class="flex items-center gap-2.5">
              <button type="button" aria-label="Decrease servings" data-action="updateRecipeServings" data-key="${recipe.id}" data-original="${target}" data-value="${target - 1}" data-edit disabled class="w-9 h-9 rounded-xl bg-linen border border-warmborder hover:border-accent text-ink font-bold text-base flex items-center justify-center shrink-0 transition-colors">
                −
              </button>

              <div class="flex-1 flex flex-col gap-1">
                <input
                  id="serving-slider-${recipe.id}"
                  type="range"
                  min="1"
                  max="100"
                  value="${target}"
                  aria-label="Serving slider"
                  data-input="previewServings" data-change="updateRecipeServings" data-key="${recipe.id}" data-edit disabled
                  class="harvest-slider"
                />
              </div>

              <input
                id="serving-input-${recipe.id}"
                type="number"
                min="1"
                max="100"
                value="${target}"
                aria-label="Target servings"
                data-input="previewServings" data-change="updateRecipeServings" data-key="${recipe.id}" data-edit disabled
                class="w-14 h-9 rounded-xl bg-linen border border-warmborder text-center text-sm font-bold text-ink focus:outline-none focus:border-accent"
              />

              <button type="button" aria-label="Increase servings" data-action="updateRecipeServings" data-key="${recipe.id}" data-original="${target}" data-value="${target + 1}" data-edit disabled class="w-9 h-9 rounded-xl bg-linen border border-warmborder hover:border-accent text-ink font-bold text-base flex items-center justify-center shrink-0 transition-colors">
                +
              </button>
            </div>

          </div>

          <!-- Scaled Ingredient Snapshot -->
          <div class="pt-1">
            <div class="text-[11px] font-bold uppercase tracking-wider text-ink-subtle mb-1">
              Key Scaled Ingredients (${recipe.ingredients.length} total)
            </div>
            <ul id="ingredient-preview-${recipe.id}" class="divide-y divide-warmborder/40">
              ${buildIngredientPreviewHTML(recipe, target)}
            </ul>
          </div>
        </div>

        <!-- View Full Recipe Button -->
        <div class="pt-4 mt-4 border-t border-warmborder/70">
          <button data-action="openRecipeModal" data-key="${recipe.id}" class="w-full py-2.5 px-4 rounded-xl bg-ink hover:bg-accent text-linen text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <span>View Full Recipe &amp; Scaled Ingredients</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </article>
    `;
  }).join('') : '<p class="text-sm text-ink-muted">No dishes match this menu filter.</p>';
}

/**
 * Full Recipe & Live Scaled Ingredients Modal
 */
function openRecipeModal(recipeId, noFocus = false) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe || state.servings[recipeId] === null) return;

  openRecipeId = recipeId;
  const modal = document.getElementById('recipe-modal');
  const content = document.getElementById('recipe-modal-content');

  function renderModalBody() {
    const target = state.servings[recipe.id];
    const mult = target / recipe.baseServings;
    const multLabel = formatBatchMultiplier(mult);

    const dietaryBadges = recipe.dietary.map(tag => `
      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getDietaryBadgeStyle(tag)}">
        ${escapeHtml(tag)}
      </span>
    `).join('');

    const ingredientsListHTML = recipe.ingredients.map(ing => {
      const scaledAmt = formatIngredientAmount(ing.amount, ing.unit, mult);
      return `
        <li class="flex items-start justify-between gap-4 py-2.5 border-b border-warmborder/60 last:border-b-0 text-sm">
          <div>
            <span class="font-medium text-ink">${escapeHtml(ing.name)}</span>
            ${ing.prepNote ? `<span class="text-xs text-ink-muted block sm:inline sm:ml-1.5">— ${escapeHtml(ing.prepNote)}</span>` : ''}
          </div>
          <span class="font-bold text-accent whitespace-nowrap shrink-0">
            ${escapeHtml(scaledAmt)}
          </span>
        </li>
      `;
    }).join('');

    const stepsHTML = recipe.steps.map((step, idx) => `
      <li class="flex gap-3.5 text-sm text-ink leading-relaxed">
        <span class="w-6 h-6 rounded-full bg-accent-light text-accent-dark font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
          ${idx + 1}
        </span>
        <span>${escapeHtml(step)}</span>
      </li>
    `).join('');

    const guestDetails = recipe.imported ? [
      ['Guest dietary tags', recipe.dietary.join(', ') || 'None supplied'],
      ['Guest allergen information', recipe.allergens.map(name => name.replaceAll('_', ' ')).join(', ') || 'None identified by contributor'],
      ['Allergen notes', recipe.allergenNotes], ['Notes', recipe.notes],
      ['Make ahead', recipe.makeAhead], ['Equipment', recipe.equipment?.join(', ')],
    ].filter(([, value]) => value) : [];

    content.innerHTML = `
      <!-- Modal Header -->
      <div class="p-5 sm:p-6 border-b border-warmborder bg-parchment/70 flex items-start justify-between gap-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-parchment text-ink-muted text-xs font-bold">${escapeHtml(recipe.course)}</span>
            ${dietaryBadges}
          </div>
          <h2 class="font-serif text-2xl sm:text-3xl font-bold text-ink leading-tight">
            ${escapeHtml(recipe.title)}
          </h2>
          <div class="text-xs text-ink-muted font-medium">
            Prep Time: ${recipe.prepTime} • Cook Time: ${recipe.cookTime} • Base Yield: ${recipe.baseServings} servings
          </div>
        </div>
        <button data-action="closeRecipeModal" aria-label="Close recipe" class="p-2 rounded-xl bg-linen border border-warmborder hover:border-accent text-ink transition-colors shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Modal Scrollable Body -->
      <div class="p-5 sm:p-6 overflow-y-auto space-y-6">
        <!-- Live Scaler Bar inside Modal -->
        <div class="bg-parchment border border-warmborder rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold uppercase tracking-wider text-ink-muted">Live Recipe Scaler</div>
            <div class="text-sm font-bold text-accent mt-0.5">
              Scaled to ${target} servings (${multLabel}x base recipe)
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button data-action="adjustModalServings" data-key="${recipe.id}" data-original="${target}" data-value="-1" data-edit disabled class="w-9 h-9 rounded-xl bg-linen border border-warmborder hover:border-accent font-bold text-ink">−</button>
            <span class="px-3 py-1.5 rounded-xl bg-linen border border-warmborder text-sm font-bold text-ink min-w-[3.5rem] text-center">${target}</span>
            <button data-action="adjustModalServings" data-key="${recipe.id}" data-original="${target}" data-value="1" data-edit disabled class="w-9 h-9 rounded-xl bg-linen border border-warmborder hover:border-accent font-bold text-ink">+</button>
            <button data-action="copySingleScaledRecipe" data-key="${recipe.id}" class="ml-2 px-3.5 py-2 rounded-xl bg-positive hover:bg-positive-dark text-white text-xs font-semibold transition-colors">
              Copy Recipe
            </button>
          </div>
        </div>

        <!-- Scaled Ingredients -->
        <div>
          <h3 class="font-serif text-xl font-bold text-ink mb-3">Scaled Ingredients</h3>
          <ul class="bg-parchment/50 border border-warmborder rounded-xl px-4 py-1">
            ${ingredientsListHTML}
          </ul>
        </div>

        ${guestDetails.length ? `<section class="text-sm space-y-2">
          ${guestDetails.map(([label, value]) => `<p><strong>${label}</strong> · ${escapeHtml(value)}</p>`).join('')}
          ${recipe.sourceUrl ? `<a class="text-accent underline" href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Recipe source</a>` : ''}
        </section>` : ''}

        <!-- Chef Instructions -->
        <div>
          <h3 class="font-serif text-xl font-bold text-ink mb-3">Chef Preparation Steps</h3>
          <ol class="space-y-3.5">
            ${stepsHTML}
          </ol>
        </div>
      </div>
    `;
  }

  renderModalBody();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  syncControls();
  if (!noFocus) modal.querySelector('[data-action="closeRecipeModal"]').focus();
}

function closeRecipeModal() {
  openRecipeId = undefined;
  element('recipe-modal-content').replaceChildren();
  const modal = document.getElementById('recipe-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function copySingleScaledRecipe(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe || state.servings[recipeId] === null) return;
  const target = state.servings[recipe.id];
  const mult = target / recipe.baseServings;

  const lines = [
    `${recipe.title.toUpperCase()} (${target} Servings • ${formatBatchMultiplier(mult)}x Batch)`,
    `${recipe.imported ? 'Guest dietary tags' : 'Dietary'}: ${recipe.dietary.join(', ')} | Prep: ${recipe.prepTime} | Cook: ${recipe.cookTime}`,
    ...(recipe.imported ? [
      ['Guest allergen information', recipe.allergens.map(name => name.replaceAll('_', ' ')).join(', ') || 'None identified by contributor'],
      ['Allergen notes', recipe.allergenNotes], ['Notes', recipe.notes], ['Make ahead', recipe.makeAhead],
      ['Equipment', recipe.equipment?.join(', ')], ['Recipe source', recipe.sourceUrl],
    ].filter(([, value]) => value).map(([label, value]) => label + ' · ' + value) : []),
    '',
    'SCALED INGREDIENTS:',
    ...recipe.ingredients.map(ing => `- ${formatIngredientAmount(ing.amount, ing.unit, mult)} ${ing.name}${ing.prepNote ? ` (${ing.prepNote})` : ''}`),
    '',
    'INSTRUCTIONS:',
    ...recipe.steps.map((s, i) => `${i + 1}. ${s}`)
  ];

  copyTextToClipboard(lines.join('\n'), `Copied scaled "${recipe.title}" recipe to clipboard!`);
}

/**
 * =========================================================================
 * TAB 2: SCALED GROCERY LIST
 * =========================================================================
 */
function updateCheck(kind, id, checked, original) {
  const current = kind === 'grocery' ? state.checkedGrocery : state.checkedTimeline;
  void cloud.save({ kind, values: { [id]: checked }, baseline: { [id]: { value: original } } }).finally(() => {
    if (kind === 'grocery') renderGroceryTab();
    else renderSyncAndTimelineTab();
    syncControls();
  });
  return Boolean(current[id]);
}

let uncheckTimer;

function handleUncheckAllGroceries() {
  const button = element('uncheck-all-btn');
  if (!uncheckConfirmPending) {
    uncheckConfirmPending = true;
    button.textContent = 'Click again to confirm reset';
    uncheckTimer = setTimeout(resetUncheckConfirmation, 3500);
    return;
  }
  resetUncheckConfirmation();
  const active = Object.fromEntries(aggregateGroceries().map(({ groceryId }) => [groceryId, state.checkedGrocery[groceryId]]));
  clearChecks('grocery', active);
}

function resetUncheckConfirmation() {
  clearTimeout(uncheckTimer);
  uncheckConfirmPending = false;
  element('uncheck-all-btn').textContent = 'Uncheck All';
}

function clearChecks(kind, current) {
  const values = Object.fromEntries(Object.keys(current).filter(id => current[id]).map(id => [id, false]));
  if (Object.keys(values).length) void cloud.save({ kind, values, activeGroceriesOnly: kind === 'grocery' });
}

function copyGroceryList() {
  const groceries = aggregateGroceries();
  const lines = [
    'HARVEST TABLE — THANKSGIVING 2026 CONSOLIDATED GROCERY LIST',
    '==========================================================',
    ''
  ];

  AISLE_ORDER.forEach(aisle => {
    const items = groceries.filter(g => g.aisle === aisle);
    if (items.length === 0) return;
    lines.push(`${AISLE_ICONS[aisle] || '•'} ${aisle.toUpperCase()}`);
    items.forEach(item => {
      const check = state.checkedGrocery[item.groceryId] ? '[x]' : '[ ]';
      const qty = formatIngredientAmount(item.totalAmount, item.unit);
      const hint = getConversionHint(item.groceryId, item.totalAmount, item.unit);
      lines.push(`  ${check} ${qty} — ${item.name}${hint ? ` (${hint})` : ''}`);
    });
    lines.push('');
  });

  copyTextToClipboard(lines.join('\n'), 'Copied formatted supermarket list to clipboard!');
}

function renderGroceryTab() {
  if (!hasData) return;
  renderRemoved('grocery');
  const groceries = aggregateGroceries();
  const totalCount = groceries.length;
  const checkedCount = groceries.filter(g => state.checkedGrocery[g.groceryId]).length;
  const pct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  document.getElementById('grocery-progress-label').textContent = `${checkedCount} of ${totalCount} items gathered`;
  document.getElementById('grocery-progress-pct').textContent = `${pct}%`;
  document.getElementById('grocery-progress-bar').value = pct;

  const searchTerm = state.grocerySearch.trim().toLowerCase();
  const aisleFilter = state.groceryAisleFilter;
  const hideChecked = state.hideCheckedGrocery;

  const container = document.getElementById('grocery-aisles-container');
  const aislesToShow = aisleFilter === 'ALL' ? AISLE_ORDER : [aisleFilter];

  const sectionsHTML = aislesToShow.map(aisle => {
    const aisleItems = groceries.filter(item => {
      if (item.aisle !== aisle) return false;
      if (hideChecked && state.checkedGrocery[item.groceryId]) return false;
      if (searchTerm) {
        const matchName = item.name.toLowerCase().includes(searchTerm);
        const matchSource = item.sources.some(s => s.recipeTitle.toLowerCase().includes(searchTerm));
        if (!matchName && !matchSource) return false;
      }
      return true;
    });

    if (aisleItems.length === 0) return '';

    const itemsHTML = aisleItems.map(item => {
      const isChecked = !!state.checkedGrocery[item.groceryId];
      const qtyDisplay = formatIngredientAmount(item.totalAmount, item.unit);
      const conversionHint = getConversionHint(item.groceryId, item.totalAmount, item.unit);

      const sourceTags = item.sources.map(src => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-parchment border border-warmborder/80 text-[11px] text-ink-muted">
          ${escapeHtml(src.recipeTitle)}: <strong class="ml-1 text-ink">${escapeHtml(formatIngredientAmount(src.amount, src.unit))}</strong>
        </span>
      `).join('');

      return `
        <div class="flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
          isChecked
            ? 'bg-positive-light border-warmborder'
            : 'bg-parchment border-warmborder hover:border-accent/50'
        }">
          <input
            type="checkbox" id="grocery-check-${item.groceryId}"
            ${isChecked ? 'checked' : ''}
            data-change="toggleGroceryCheck" data-key="${item.groceryId}" data-edit disabled
            class="mt-1 w-5 h-5 rounded-md accent-positive cursor-pointer shrink-0"
          />
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <label for="grocery-check-${item.groceryId}" class="text-sm font-semibold ${isChecked ? 'line-through text-ink-muted' : 'text-ink'}">
                ${escapeHtml(item.name)}
              </label>
              <div class="text-right shrink-0">
                <span class="text-sm font-bold text-accent">${escapeHtml(qtyDisplay)}</span>
                ${conversionHint ? `<span class="block text-[11px] font-medium text-positive-dark">${conversionHint}</span>` : ''}
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${sourceTags}
            </div>
          </div>
          ${recordActions('grocery', item.groceryId, item.name)}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-linen border border-warmborder rounded-2xl p-5 shadow-warm space-y-3.5">
        <div class="flex items-center justify-between border-b border-warmborder pb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">${AISLE_ICONS[aisle] || '🛒'}</span>
            <h3 class="font-serif text-lg font-bold text-ink">${escapeHtml(aisle)}</h3>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-parchment border border-warmborder text-xs font-bold text-ink-muted">
            ${aisleItems.length} item${aisleItems.length === 1 ? '' : 's'}
          </span>
        </div>
        <div class="space-y-2.5">
          ${itemsHTML}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = sectionsHTML || `
    <div class="col-span-full bg-linen border border-warmborder rounded-2xl p-10 text-center space-y-2">
      <div class="text-2xl">🧺</div>
      <h3 class="font-serif text-xl font-bold text-ink">No matching grocery items</h3>
      <p class="text-sm text-ink-muted">Try clearing your search filter or unchecking "Hide Checked Items".</p>
    </div>
  `;
}

/**
 * =========================================================================
 * TAB 3: POTLUCK GUEST BOARD
 * =========================================================================
 */
async function submitClaim(item) {
  const row = [
    crypto.randomUUID(), item.guestName, '', item.dishName, item.course,
    item.kitchenNeeds, 'claimed', new Date().toISOString(), '',
    item.servings, item.dietary.join(','),
  ];
  pendingSignup = row[0];
  if (await cloud.save({ kind: 'potluck', row }) && pendingSignup === row[0]) finishSignup();
}

function finishSignup() {
  pendingSignup = undefined;
  element('potluck-add-form').reset();
}

function renderPotluckTab() {
  // Kitchen Needs Summary Badges
  if (!hasData) return;
  const claimed = state.potluckItems;
  const ovenCount = claimed.filter(p => p.kitchenNeeds === 'Oven Reheat').length;
  const fridgeCount = claimed.filter(p => p.kitchenNeeds === 'Fridge Space').length;
  const stoveCount = claimed.filter(p => p.kitchenNeeds === 'Stovetop').length;

  document.getElementById('kitchen-needs-summary').innerHTML = `
    <span class="px-3 py-1.5 rounded-xl bg-parchment border border-warmborder text-xs font-semibold text-ink">
      🔥 Oven Reheat: <strong>${ovenCount}</strong>
    </span>
    <span class="px-3 py-1.5 rounded-xl bg-parchment border border-warmborder text-xs font-semibold text-ink">
      ❄️ Fridge Space: <strong>${fridgeCount}</strong>
    </span>
    <span class="px-3 py-1.5 rounded-xl bg-parchment border border-warmborder text-xs font-semibold text-ink">
      🍳 Stovetop: <strong>${stoveCount}</strong>
    </span>
  `;

  const grid = document.getElementById('potluck-cards-grid');
  if (state.potluckItems.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-linen border border-warmborder rounded-2xl p-8 text-center space-y-2">
        <h4 class="font-serif text-lg font-bold text-ink">No potluck dishes listed yet</h4>
        <p class="text-sm text-ink-muted">Use the signup form to add a guest dish.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = claimed.map(item => {
    const overlaps = item.slotId && claimed.filter(claim => claim.slotId === item.slotId).length > 1;

    const dietTagsHTML = (item.dietary || []).map(tag => `
      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getDietaryBadgeStyle(tag)}">
        ${escapeHtml(tag)}
      </span>
    `).join('');

    const kitchenIcon = item.kitchenNeeds === 'Oven Reheat' ? '🔥' :
                        item.kitchenNeeds === 'Fridge Space' ? '❄️' :
                        item.kitchenNeeds === 'Stovetop' ? '🍳' : '✨';

    return `
      <div class="bg-linen border border-warmborder rounded-2xl p-4.5 p-5 shadow-warm flex flex-col justify-between gap-3">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-parchment text-ink-muted text-[11px] font-bold">
              ${escapeHtml(item.course)} • ${item.servings} servings
            </span>
            ${recordActions('potluck', item.id, item.dishName, item.needsReview)}
          </div>

          <h4 class="font-serif text-lg font-bold text-ink leading-snug">
            ${escapeHtml(item.dishName)}
          </h4>
          ${overlaps ? '<p class="text-xs font-semibold text-accent-dark">Multiple guests claimed this slot. Coordinate with the organizer.</p>' : ''}
          ${item.needsReview ? '<p class="text-xs font-semibold text-accent-dark">Duplicate signup needs organizer review.</p>' : ''}

          <div class="flex flex-wrap items-center gap-1.5">
            ${dietTagsHTML}
            <span class="px-2 py-0.5 rounded-md bg-parchment border border-warmborder text-[11px] font-medium text-ink-muted">
              ${kitchenIcon} ${escapeHtml(item.kitchenNeeds)}
            </span>
          </div>
        </div>

        <p class="border-t border-warmborder pt-3 text-sm">Bringing: <strong>${escapeHtml(item.guestName)}</strong></p>
      </div>
    `;
  }).join('');
}

/**
 * =========================================================================
 * TAB 4: GOOGLE SHEETS SYNC & PREP TIMELINE
 * =========================================================================
 */
function resetTimelineChecks() {
  if (window.confirm('Clear the shared prep checklist?')) clearChecks('prep', state.checkedTimeline);
}

function renderSyncAndTimelineTab() {
  if (!hasData) return;
  renderRemoved('prep');
  const container = document.getElementById('prep-timeline-container');
  container.innerHTML = PREP_TIMELINE.map(phase => {
    const tasks = phase.tasks.filter(task => state.checkedTimeline[task.id] !== null);
    if (!tasks.length) return '';
    const tasksHTML = tasks.map(task => {
      const done = !!state.checkedTimeline[task.id];
      return `
        <div class="flex items-start gap-3.5 p-3 rounded-xl border transition-all cursor-pointer select-none ${
          done ? 'bg-positive-light border-warmborder' : 'bg-parchment border-warmborder hover:border-accent/40'
        }">
          <input
            type="checkbox" id="prep-check-${task.id}"
            ${done ? 'checked' : ''}
            data-change="toggleTimelineStep" data-key="${task.id}" data-edit disabled
            class="mt-0.5 w-4 h-4 rounded accent-positive cursor-pointer shrink-0"
          />
          <label for="prep-check-${task.id}" class="flex-1 text-sm leading-relaxed">
            <span class="inline-block px-2 py-0.5 rounded-md bg-linen border border-warmborder text-[11px] font-bold text-accent mr-2">
              ${escapeHtml(task.time)}
            </span>
            <span class="${done ? 'line-through text-ink-muted' : 'text-ink'}">
              ${escapeHtml(task.text)}
            </span>
          </label>
          ${recordActions('prep', task.id, task.text)}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-linen border border-warmborder rounded-2xl p-5 sm:p-6 shadow-warm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-warmborder pb-3">
          <div class="space-y-1">
            <span class="inline-block px-3 py-0.5 rounded-full text-xs font-bold border border-warmborder bg-parchment text-ink">
              ${escapeHtml(phase.dayBadge)}
            </span>
            <h3 class="font-serif text-xl font-bold text-ink">${escapeHtml(phase.title)}</h3>
          </div>
          <span class="text-xs font-semibold text-ink-muted">
            ${tasks.filter(t => state.checkedTimeline[t.id]).length} / ${tasks.length} completed
          </span>
        </div>
        <div class="space-y-2.5">
          ${tasksHTML}
        </div>
      </div>
    `;
  }).join('');
}

function syncControls() {
  const allowEdits = connection.editable && !connection.busy;
  document.querySelectorAll('[data-edit]').forEach(control => { control.disabled = !allowEdits; });
}

const pendingLabels = {
  prep: new Map(PREP_TIMELINE.flatMap(phase => phase.tasks.map(task => [task.id, task.text]))),
};

function recordLabel(kind, id) {
  if (kind === 'menu') return state.recipes.find(recipe => recipe.id === id)?.title ?? id;
  if (kind === 'potluck') return state.potluckItems.find(item => item.id === id)?.dishName ?? id;
  if (kind === 'grocery') return currentSnapshot?.recipeImport.roster.get(id)?.name ?? id;
  return pendingLabels[kind].get(id) ?? id;
}

function recordValues(kind) {
  return { menu: state.servings, grocery: state.checkedGrocery, prep: state.checkedTimeline }[kind];
}

const pencil = '<path d="m15 5 4 4M4 20l4-.8L20 7l-4-4L4 15z"/>';
const trash = '<path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>';

function recordAction(kind, id, title, operation, icon) {
  const verb = { edit: 'Edit', remove: 'Remove', restore: 'Restore' }[operation];
  const label = escapeHtml(`${verb} ${title}`);
  const content = icon
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`
    : verb;
  return `<button type="button" class="record-action" data-action="manageRecord" data-kind="${kind}" data-key="${escapeHtml(id)}" data-operation="${operation}" aria-label="${label}" title="${label}" data-edit disabled>${content}</button>`;
}

function recordActions(kind, id, title, needsReview = false) {
  const edit = needsReview ? '' : recordAction(kind, id, title, 'edit', pencil);
  return `<span class="record-actions">${edit}${recordAction(kind, id, title, 'remove', trash)}</span>`;
}

function renderRemoved(kind) {
  const container = element('removed-' + kind);
  const removed = Object.entries(recordValues(kind)).filter(([, value]) => value === null);
  if (removed.length === 0) {
    container.replaceChildren();
    return;
  }
  const expanded = container.querySelector('details')?.open;
  const rows = removed.map(([id]) => {
    const label = recordLabel(kind, id);
    return `<li class="flex items-center justify-between gap-3 border-t border-warmborder py-2"><span>${escapeHtml(label)}</span>${recordAction(kind, id, label, 'restore')}</li>`;
  }).join('');
  container.innerHTML = `<details class="rounded-xl border border-warmborder bg-linen p-4 text-sm" ${expanded ? 'open' : ''}>
    <summary class="cursor-pointer font-semibold">Removed items (${removed.length})</summary>
    <ul class="mt-2">${rows}</ul></details>`;
}

const choices = values => values.map(value => [value, value]);
const courses = choices(['Appetizer', 'Side', 'Bread', 'Sauce/Relish', 'Dessert', 'Drinks']);
const kitchenOptions = choices(['None', 'Oven Reheat', 'Fridge Space', 'Stovetop']);

function openRecord(kind, id, operation, trigger) {
  if (!hasData || !connection.editable) return;
  const title = recordLabel(kind, id);
  const item = kind === 'potluck' ? state.potluckItems.find(claim => claim.id === id) : undefined;
  if (kind === 'potluck' && !item) return;
  const before = item ?? { title, value: recordValues(kind)[id] };
  const restore = operation === 'restore';
  const remove = operation === 'remove';
  if (!remove && item?.needsReview) return;

  const description = remove
    ? kind === 'potluck'
      ? 'Withdraw this signup from the board. The Sheet keeps all rows with this signup ID.'
      : 'Remove this item from the plan. You can restore it later from Removed items.'
    : kind === 'potluck' ? 'Changes are shared with the invited Editors.' : '';
  const controls = remove ? [] : recordFields(kind, before);
  const heading = (remove ? 'Remove ' : restore ? 'Restore ' : 'Edit ') + title;

  recordDialog.open({
    title: heading,
    description,
    controls,
    label: remove ? 'Remove' : restore ? 'Restore' : 'Save',
    trigger,
    async submit(data) {
      if (!data) return cloud.save();
      if (kind === 'potluck') {
        if (remove) return cloud.save({ kind, id, withdraw: true, baseline: before });
        const changes = {};
        for (const { name } of controls) {
          const input = data.get(name).trim();
          const value = name === 'dietary' ? input.split(',').map(tag => tag.trim()).filter(Boolean)
            : name === 'servings' ? servingCount(input) : input;
          if (value === undefined || (value === '' && item[name] !== '')) return 'Complete all required fields.';
          if (JSON.stringify(value) !== JSON.stringify(item[name])) changes[name] = value;
        }
        if (!Object.keys(changes).length) return true;
        return cloud.save({ kind, id, changes, baseline: before });
      }

      const update = { kind, restore, baseline: { [id]: before }, values: {} };
      if (remove) update.values[id] = null;
      else if (kind === 'menu') {
        const name = data.get('title').trim();
        const servings = servingCount(data.get('value'));
        if (!name || servings === undefined) return 'Enter a dish name and a serving count from 1 to 100.';
        if (name !== before.title) update.titles = { [id]: name };
        if (servings !== before.value) update.values[id] = servings;
      } else {
        update.values[id] = data.get('value') === 'true';
      }
      if (!update.titles && (Object.keys(update.values).length === 0 || update.values[id] === before.value)) return true;
      return cloud.save(update);
    },
  });
}

function recordFields(kind, item) {
  if (kind === 'menu') return [
    { name: 'title', label: 'Dish name', value: item.title, required: true, maxLength: 160 },
    { name: 'value', label: 'Target servings', value: item.value, required: true, type: 'number' },
  ];
  if (kind === 'potluck') return [
    { name: 'guestName', label: 'Guest name', value: item.guestName, required: true, maxLength: 100 },
    { name: 'dishName', label: 'Dish name', value: item.dishName, required: true, maxLength: 160 },
    { name: 'course', label: 'Course', value: item.course, required: Boolean(item.course), options: item.course ? courses : [['', 'Unspecified'], ...courses] },
    { name: 'servings', label: 'Servings', value: item.servings, required: true, type: 'number' },
    { name: 'kitchenNeeds', label: 'Kitchen needs', value: item.kitchenNeeds, required: Boolean(item.kitchenNeeds), options: item.kitchenNeeds ? kitchenOptions : [['', 'Unspecified'], ...kitchenOptions] },
    { name: 'dietary', label: 'Dietary tags (comma-separated)', value: item.dietary.join(', ') },
  ];
  const states = kind === 'grocery' ? ['Not checked', 'Checked'] : ['Incomplete', 'Complete'];
  return [{
    name: 'value', label: 'Status', value: item.value === null ? '' : String(item.value), required: true,
    options: [['', 'Choose a status'], ['false', states[0]], ['true', states[1]]],
  }];
}

function showPendingValues(update) {
  const details = element('hub-pending');
  const list = element('hub-pending-values');
  details.hidden = !update;
  list.replaceChildren();
  if (!update) return;
  if (update.kind === 'potluck') {
    const item = document.createElement('li');
    const action = update.withdraw ? 'Withdraw signup' : 'Edit signup';
    item.textContent = `${recordLabel('potluck', update.id)} · ${action}`;
    list.append(item);
    for (const [field, value] of Object.entries(update.changes ?? {})) {
      const names = { guestName: 'Guest', dishName: 'Dish', course: 'Course', kitchenNeeds: 'Kitchen needs', servings: 'Servings', dietary: 'Dietary tags' };
      const change = document.createElement('li');
      change.textContent = `${names[field]} · ${Array.isArray(value) ? value.join(', ') || 'None' : value}`;
      list.append(change);
    }
    return;
  }
  const ids = new Set([...Object.keys(update.values), ...Object.keys(update.titles ?? {})]);
  for (const id of ids) {
    const item = document.createElement('li');
    const label = recordLabel(update.kind, id);
    const value = update.values[id];
    const proposed = [];
    if (update.titles?.[id]) proposed.push('Rename to ' + update.titles[id]);
    if (value === null) proposed.push('Remove');
    else if (typeof value === 'number') proposed.push(`${value} servings`);
    else if (typeof value === 'boolean') proposed.push(value ? 'Check off' : 'Uncheck');
    item.textContent = `${label} · ${proposed.join(', ')}`;
    list.append(item);
  }
}

function updateVisibility() {
  element('kpi-pills').hidden = !hasData;
  element('hub-nav').hidden = !hasData;
  element('hub-data').hidden = !hasData;
  element('hub-feedback').hidden = !connection.mode || connection.authenticating ||
    (hasData && state.activeTab !== 'feedback');
}

function updateConnection(next) {
  connection = next;
  element('hub-status').textContent = next.notice;
  showPendingValues(next.pendingValues);
  recordDialog.setConnection(next);
  recipeImportDialog.setConnection(next);
  const signIn = element('hub-sign-in');
  signIn.hidden = next.mode === 'edit' && !next.authenticating;
  signIn.disabled = !next.available || next.busy || next.hasPending;
  signIn.textContent = next.authenticating ? 'Connecting…' : 'Sign in with Google';
  element('hub-refresh').hidden = !next.mode || next.authenticating;
  element('hub-refresh').disabled = next.busy || next.refreshing;
  element('hub-disconnect').hidden = !next.mode || next.authenticating;
  element('hub-disconnect').disabled = next.busy || next.hasPending;
  element('hub-retry').hidden = !next.retryable;
  element('hub-discard').hidden = !next.discardable;
  feedback.setEditable(next.feedbackEditable);
  updateVisibility();
  syncControls();
}

function clearSessionDrafts() {
  recipeImportDialog.reset();
  recordDialog.close({ restoreFocus: false });
  pendingSignup = undefined;
  state.grocerySearch = '';
  element('grocery-search-input').value = '';
  element('potluck-add-form').reset();
  feedback.reset();
  resetUncheckConfirmation();
  closeRecipeModal();
}

function updateSharedView(snapshot) {
  currentSnapshot = snapshot;
  hasData = Boolean(snapshot);
  const issues = element('recipe-import-issues');
  const issueCount = snapshot?.recipeImport.issues.length ?? 0;
  issues.hidden = !issueCount;
  issues.textContent = issueCount ? 'Imported Sheet records need organizer review. ' +
    snapshot.recipeImport.issues.slice(0, 5).join(', ') + (issueCount > 5 ? ', and others.' : '.') : '';
  recipeImportDialog.setConnection(connection);
  if (!snapshot) {
    recordDialog.close({ restoreFocus: false });
    sharedViewKey = undefined;
    menuRefreshDeferred = false;
    state.recipes = [];
    state.servings = {};
    state.checkedGrocery = {};
    state.checkedTimeline = {};
    state.potluckItems = [];
    for (const id of ['kpi-pills', 'dish-cards-grid', 'diet-filter-bar', 'grocery-aisles-container',
      'potluck-cards-grid', 'kitchen-needs-summary', 'prep-timeline-container', 'nav-grocery-badge',
      'nav-potluck-badge', 'grocery-progress-label', 'grocery-progress-pct', 'toast-container',
      'removed-menu', 'removed-grocery', 'removed-prep']) {
      element(id).replaceChildren();
    }
    element('grocery-progress-bar').value = 0;
    closeRecipeModal();
    updateVisibility();
    return;
  }

  const values = kind => Object.fromEntries([...snapshot[kind]].map(([id, entry]) => [id, entry.value]));
  const recipes = [...RECIPES, ...snapshot.recipeImport.imported].map(recipe => ({
    ...recipe, title: snapshot.menu.get(recipe.id).title,
  }));
  const menu = values('menu');
  const grocery = values('grocery');
  const prep = values('prep');
  const potluck = [...snapshot.potluck.values()].filter(claim => claim.status === 'claimed');
  const watchingServing = document.activeElement?.dataset.change === 'updateRecipeServings';
  const key = JSON.stringify([recipes, menu, grocery, prep, potluck, [...snapshot.recipeImport.roster]]);

  if (pendingSignup && snapshot.potluck.has(pendingSignup)) finishSignup();
  if (key === sharedViewKey) return;
  sharedViewKey = key;
  state.recipes = recipes;
  state.servings = menu;
  state.checkedGrocery = grocery;
  state.checkedTimeline = prep;
  state.potluckItems = potluck;

  renderKPIs();
  if (watchingServing) menuRefreshDeferred = true;
  else renderMenuTab();
  if (state.activeTab === 'grocery') renderGroceryTab();
  if (state.activeTab === 'potluck') renderPotluckTab();
  if (state.activeTab === 'sync') renderSyncAndTimelineTab();
  if (openRecipeId && state.servings[openRecipeId] == null) closeRecipeModal();
  else if (openRecipeId) openRecipeModal(openRecipeId, true);
  updateVisibility();
  syncControls();
}

const feedback = createFeedback({
  getToken: () => cloud.editToken(),
  onExpired: token => cloud.expireToken(token),
  onAccessDenied: token => cloud.recheckAccess(token),
});

const cloud = createHubSheets({
  keys: {
    menu: new Set(RECIPES.map(recipe => recipe.id)),
    grocery: new Set(RECIPES.flatMap(recipe => recipe.ingredients.map(ingredient => ingredient.groceryId))),
    legacyRoster: legacyGroceryRoster(RECIPES),
    ingredientsByRecipe: new Map(RECIPES.map(recipe => [recipe.id, recipe.ingredients.map(item => item.groceryId)])),
    prep: new Set(PREP_TIMELINE.flatMap(phase => phase.tasks.map(task => task.id))),
  },
  onData: updateSharedView,
  onStatus: updateConnection,
  onSessionReset: clearSessionDrafts,
});

for (const button of document.querySelectorAll('.nav-tab-btn')) {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
}

element('hub-sign-in').addEventListener('click', () => cloud.connect());
element('hub-refresh').addEventListener('click', () => cloud.refresh());
element('hub-disconnect').addEventListener('click', () => cloud.disconnect());
element('hub-retry').addEventListener('click', async () => {
  if (await cloud.save() && pendingSignup) finishSignup();
});
element('hub-discard').addEventListener('click', () => {
  pendingSignup = undefined;
  cloud.discard();
});

element('grocery-search-input').addEventListener('input', event => {
  state.grocerySearch = event.target.value;
  renderGroceryTab();
  syncControls();
});
element('grocery-aisle-select').addEventListener('change', event => {
  state.groceryAisleFilter = event.target.value;
  renderGroceryTab();
  syncControls();
});
element('hide-checked-toggle').addEventListener('change', event => {
  state.hideCheckedGrocery = event.target.checked;
  renderGroceryTab();
  syncControls();
});

element('potluck-add-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!connection.editable || connection.busy) return;
  const guestName = element('pl-guest-name').value.trim();
  const dishName = element('pl-dish-name').value.trim();
  const servings = servingCount(element('pl-servings').value);
  const course = element('pl-course').value;
  const kitchenNeeds = element('pl-kitchen').value;
  if (!guestName || !dishName || guestName.length > 100 || dishName.length > 160) {
    showToast('Enter a guest name and dish name.', 'warning');
    return;
  }
  if (servings === undefined || !course || !kitchenNeeds) return;
  void submitClaim({
    guestName, dishName, course, servings, kitchenNeeds,
    dietary: [...document.querySelectorAll('input[name="pl-diet"]:checked')].map(box => box.value),
  });
});

const actions = {
  setDietFilter,
  updateRecipeServings,
  openRecipeModal: key => openRecipeModal(key),
  closeRecipeModal,
  adjustModalServings: (key, delta, original) => updateRecipeServings(key, Number(original) + Number(delta), original),
  copySingleScaledRecipe,
  copyGroceryList,
  handleUncheckAllGroceries,
  resetTimelineChecks,
};

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control || control.disabled) return;
  const { action, key, value, original } = control.dataset;
  if (action === 'manageRecord') {
    openRecord(control.dataset.kind, key, control.dataset.operation, control);
  } else if (Object.hasOwn(actions, action)) actions[action](key, value, original);
});

document.addEventListener('input', event => {
  const field = event.target;
  if (field.disabled) return;
  if (field.dataset.input === 'previewServings') previewServings(field.dataset.key, field.value);
});

document.addEventListener('change', event => {
  const field = event.target;
  if (field.disabled) return;
  const { change, key } = field.dataset;
  if (change === 'updateRecipeServings') updateRecipeServings(key, field.value, field.defaultValue);
  if (change === 'toggleGroceryCheck') field.checked = updateCheck('grocery', key, field.checked, field.defaultChecked);
  if (change === 'toggleTimelineStep') field.checked = updateCheck('prep', key, field.checked, field.defaultChecked);
});

document.addEventListener('focusout', event => {
  const field = event.target;
  if (field.dataset.change !== 'updateRecipeServings' || !menuRefreshDeferred) return;
  setTimeout(() => {
    if (menuRefreshDeferred && !connection.busy && document.activeElement?.dataset.change !== 'updateRecipeServings') {
      renderMenuTab();
      syncControls();
    }
  }, 0);
});

element('recipe-modal').addEventListener('click', event => {
  if (event.target.id === 'recipe-modal') closeRecipeModal();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeRecipeModal();
});

switchTab('menu');
