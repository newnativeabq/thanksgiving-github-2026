// Complete 7-Dish Thanksgiving Menu Data
export const RECIPES = [
  {
    id: 'cauliflower-wings',
    course: 'Appetizer',
    dietary: ['Vegan', 'Gluten-Free'],
    prepTime: '25 mins',
    cookTime: '20 mins',
    baseServings: 6,
    notes: 'Chickpea flour batter + rice paper wrapper strips create an ultra-shatteringly crisp exterior that holds buffalo glaze without getting soggy.',
    ingredients: [
      { groceryId: 'cauliflower', name: 'Large cauliflower heads (cut into bite-size florets)', amount: 1, unit: 'head', aisle: 'Produce', prepNote: 'cut into 1.5-inch florets' },
      { groceryId: 'chickpea-flour', name: 'Chickpea flour (besan)', amount: 1, unit: 'cup', aisle: 'Pantry & Oils', prepNote: 'sifted if clumpy' },
      { groceryId: 'cold-water', name: 'Cold filtered water', amount: 1, unit: 'cup', aisle: 'Pantry & Oils', prepNote: 'for batter' },
      { groceryId: 'garlic-powder', name: 'Garlic powder', amount: 1.5, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'onion-powder', name: 'Onion powder', amount: 1.5, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'smoked-paprika', name: 'Smoked paprika', amount: 1, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'kosher-salt', name: 'Kosher salt', amount: 1, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'rice-paper', name: '8.5-inch round rice paper wrappers', amount: 8, unit: 'sheets', aisle: 'Pantry & Oils', prepNote: 'cut into 1.5-inch strips' },
      { groceryId: 'vegetable-oil', name: 'Vegetable oil (neutral high-heat, for frying)', amount: 4, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'buffalo-sauce', name: 'Buffalo wing sauce (e.g., Frank’s RedHot)', amount: 0.75, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'vegan-butter', name: 'Vegan butter', amount: 3, unit: 'tbsp', aisle: 'Dairy & Vegan Fridge', prepNote: 'melted into buffalo sauce' },
      { groceryId: 'apple-cider-vinegar', name: 'Apple cider vinegar', amount: 0.333, unit: 'tbsp', aisle: 'Pantry & Oils', prepNote: '1 tsp per base batch' }
    ],
    steps: [
      'Whisk together the chickpea flour, garlic powder, onion powder, smoked paprika, kosher salt, and cold water until a smooth, heavy-cream-consistency batter forms.',
      'Using kitchen shears, cut the dry 8.5-inch rice paper rounds into rough 1.5-inch strips or squares.',
      'Heat 2 inches of vegetable oil in a heavy Dutch oven or deep skillet to 365°F (185°C).',
      'Dip each cauliflower floret into the seasoned chickpea batter, letting excess drip off. Quickly dip a strip of rice paper in water for 2 seconds and wrap it around the battered floret.',
      'Fry in batches for 4–5 minutes until deeply golden and blistered-crisp. Drain on a wire rack set over a sheet pan.',
      'Gently warm the buffalo sauce, vegan butter, and apple cider vinegar in a small saucepan until emulsified. Toss the hot crispy wings in the glaze right before serving!'
    ]
  },
  {
    id: 'fennel-apple-salad',
    course: 'Salad',
    dietary: ['Vegan', 'Gluten-Free', 'Contains Walnuts'],
    prepTime: '20 mins',
    cookTime: '5 mins',
    baseServings: 10,
    notes: 'Adapted from NYT Cooking with shaved vegan Parmesan.',
    ingredients: [
      { groceryId: 'lemon-juice', name: 'Fresh lemon juice', amount: 3, unit: 'tbsp', aisle: 'Produce', prepNote: 'plus more to taste' },
      { groceryId: 'fine-sea-salt', name: 'Fine sea salt', amount: 0.5, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'black-pepper', name: 'Freshly ground black pepper', amount: 0.5, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'olive-oil', name: 'Extra-virgin olive oil', amount: 4, unit: 'tbsp', aisle: 'Pantry & Oils', prepNote: '1/4 cup per base batch' },
      { groceryId: 'fennel-bulbs', name: 'Large fennel bulbs', amount: 3, unit: 'bulbs', aisle: 'Produce', prepNote: 'trimmed & thinly sliced on a mandoline' },
      { groceryId: 'granny-smith-apples', name: 'Granny Smith apples', amount: 2, unit: 'whole', aisle: 'Produce', prepNote: 'halved, cored & thinly sliced' },
      { groceryId: 'celery-stalks', name: 'Celery stalks', amount: 3, unit: 'stalks', aisle: 'Produce', prepNote: 'thinly sliced on a mandoline' },
      { groceryId: 'fennel-fronds', name: 'Fennel fronds or roughly chopped flat-leaf parsley', amount: 0.333, unit: 'cup', aisle: 'Produce' },
      { groceryId: 'walnuts', name: 'Toasted walnuts (halves & pieces)', amount: 0.5, unit: 'cup', aisle: 'Pantry & Oils', prepNote: 'coarsely chopped' },
      { groceryId: 'vegan-parmesan', name: 'Vegan Parmesan block (e.g., Violife wedge)', amount: 2.5, unit: 'oz', aisle: 'Dairy & Vegan Fridge', prepNote: 'shaved into ribbons with a vegetable peeler' }
    ],
    steps: [
      'In a large serving bowl, whisk together the fresh lemon juice, fine sea salt, and freshly ground black pepper. Slowly drizzle in the extra-virgin olive oil while whisking to form a bright vinaigrette.',
      'Using a mandoline or very sharp chef’s knife, paper-thinly slice the fennel bulbs, cored Granny Smith apples, and celery stalks.',
      'Immediately add the sliced apples, fennel, and celery to the bowl with the lemon dressing and toss gently so the lemon juice keeps the apples crisp and bright white.',
      'Just before serving, fold in the chopped fennel fronds (or parsley) and toasted walnuts.',
      'Use a vegetable peeler to shave generous ribbons of vegan Parmesan over the top, finish with extra cracked black pepper, and serve immediately.'
    ]
  },
  {
    id: 'vegan-mashed-potatoes',
    course: 'Side Dish',
    dietary: ['Vegan', 'Gluten-Free'],
    prepTime: '20 mins',
    cookTime: '35 mins',
    baseServings: 6,
    notes: 'Rich and velvety with both sweet roasted garlic cloves AND aromatic fresh rosemary infused directly into warm vegan heavy cream and vegan butter.',
    ingredients: [
      { groceryId: 'yukon-potatoes', name: 'Yukon Gold potatoes', amount: 3, unit: 'lbs', aisle: 'Produce', prepNote: 'peeled & cut into 2-inch chunks' },
      { groceryId: 'garlic-heads', name: 'Whole garlic heads (for roasting + fresh)', amount: 1.5, unit: 'heads', aisle: 'Produce', prepNote: 'tops sliced off for roasting' },
      { groceryId: 'fresh-rosemary', name: 'Fresh rosemary leaves (chopped)', amount: 2, unit: 'tbsp', aisle: 'Produce', prepNote: 'plus whole sprigs for infusion' },
      { groceryId: 'vegan-butter', name: 'Vegan butter', amount: 6, unit: 'tbsp', aisle: 'Dairy & Vegan Fridge', prepNote: 'cut into pieces, room temp' },
      { groceryId: 'vegan-cream', name: 'Vegan heavy whipping cream (e.g., Silk or Country Crock)', amount: 0.75, unit: 'cup', aisle: 'Dairy & Vegan Fridge' },
      { groceryId: 'olive-oil', name: 'Extra-virgin olive oil', amount: 1, unit: 'tbsp', aisle: 'Pantry & Oils', prepNote: 'for roasting garlic heads' },
      { groceryId: 'kosher-salt', name: 'Kosher salt', amount: 1.5, unit: 'tsp', aisle: 'Spices & Seasonings', prepNote: 'plus more for boiling water' },
      { groceryId: 'black-pepper', name: 'Freshly ground black pepper', amount: 0.5, unit: 'tsp', aisle: 'Spices & Seasonings' }
    ],
    steps: [
      'Slice the top ¼ inch off the whole garlic heads to expose the cloves, drizzle with olive oil, wrap tightly in foil, and roast at 400°F (205°C) for 35 minutes until golden and jammy.',
      'Place peeled Yukon Gold potato chunks in a large pot, cover with cold water by 1 inch, and season generously with salt. Bring to a boil and simmer 18–20 minutes until fork-tender.',
      'Meanwhile, gently warm the vegan heavy cream, vegan butter, and chopped fresh rosemary in a small saucepan over low heat for 5 minutes to infuse the rosemary aroma.',
      'Drain the potatoes thoroughly and return them to the warm pot for 1 minute to evaporate excess moisture. Squeeze the sweet roasted garlic cloves right onto the potatoes.',
      'Pass potatoes through a ricer or mash until smooth, folding in the warm rosemary-infused vegan cream, butter, kosher salt, and black pepper until cloud-like.'
    ]
  },
  {
    id: 'green-beans-impossible',
    course: 'Side Dish',
    dietary: ['Vegan', 'Gluten-Free'],
    prepTime: '15 mins',
    cookTime: '15 mins',
    baseServings: 6,
    notes: 'High-heat blistered haricots verts tossed with browned Impossible brand savory sausage crumbles, caramelized shallots, garlic, and bright lemon.',
    ingredients: [
      { groceryId: 'green-beans', name: 'Fresh green beans (haricots verts)', amount: 1.5, unit: 'lbs', aisle: 'Produce', prepNote: 'stem ends trimmed' },
      { groceryId: 'impossible-sausage', name: 'Impossible Savory Ground Sausage (14 oz packs)', amount: 1, unit: 'pack', aisle: 'Meat & Plant-Based Proteins' },
      { groceryId: 'olive-oil', name: 'Extra-virgin olive oil', amount: 1.5, unit: 'tbsp', aisle: 'Pantry & Oils' },
      { groceryId: 'shallots', name: 'Large shallots', amount: 2, unit: 'whole', aisle: 'Produce', prepNote: 'thinly sliced into rings' },
      { groceryId: 'garlic-cloves', name: 'Fresh garlic cloves', amount: 4, unit: 'cloves', aisle: 'Produce', prepNote: 'thinly sliced or minced' },
      { groceryId: 'vegetable-broth', name: 'Low-sodium vegetable broth', amount: 0.25, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'lemon-juice', name: 'Fresh lemon juice', amount: 1, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'red-pepper-flakes', name: 'Crushed red pepper flakes', amount: 0.25, unit: 'tsp', aisle: 'Spices & Seasonings' }
    ],
    steps: [
      'Heat half the olive oil in a large cast-iron skillet or wide sauté pan over medium-high heat. Crumble in the Impossible Savory Sausage and sear undisturbed for 3 minutes, then break up and cook 4–5 minutes until deeply browned and crisp at the edges. Transfer to a bowl.',
      'Add remaining olive oil to the hot skillet. Add trimmed green beans in an even layer and blister without stirring for 2–3 minutes until charred spots appear, then toss for another 3 minutes.',
      'Reduce heat to medium, push green beans aside, and add sliced shallots, garlic cloves, and red pepper flakes. Sauté for 2 minutes until fragrant.',
      'Splash in the vegetable broth to steam-glaze the beans for 1–2 minutes until crisp-tender.',
      'Return the browned Impossible sausage to the pan, toss with fresh lemon juice, adjust salt & pepper, and transfer to a warm platter.'
    ]
  },
  {
    id: 'vegan-stuffing',
    course: 'Side Dish',
    dietary: ['Vegan'],
    prepTime: '25 mins',
    cookTime: '45 mins',
    baseServings: 8,
    notes: 'Golden, custardy inside with crisp herb-toasted sourdough edges—made with fresh sage, rosemary, thyme, and rich vegetable broth.',
    ingredients: [
      { groceryId: 'sourdough-bread', name: 'Crusty sourdough bread loaves (16 oz each)', amount: 1, unit: 'loaf', aisle: 'Bakery & Bread', prepNote: 'cut into 3/4-inch cubes & dried' },
      { groceryId: 'vegan-butter', name: 'Vegan butter', amount: 6, unit: 'tbsp', aisle: 'Dairy & Vegan Fridge' },
      { groceryId: 'yellow-onions', name: 'Medium yellow onions', amount: 2, unit: 'whole', aisle: 'Produce', prepNote: 'finely diced' },
      { groceryId: 'celery-stalks', name: 'Celery stalks', amount: 4, unit: 'stalks', aisle: 'Produce', prepNote: 'finely diced' },
      { groceryId: 'garlic-cloves', name: 'Fresh garlic cloves', amount: 4, unit: 'cloves', aisle: 'Produce', prepNote: 'minced' },
      { groceryId: 'fresh-sage', name: 'Fresh sage leaves (chopped)', amount: 2, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'fresh-rosemary', name: 'Fresh rosemary leaves (chopped)', amount: 1, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'fresh-thyme', name: 'Fresh thyme leaves', amount: 1, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'flat-leaf-parsley', name: 'Fresh flat-leaf parsley (chopped)', amount: 0.25, unit: 'cup', aisle: 'Produce' },
      { groceryId: 'vegetable-broth', name: 'Rich vegetable broth', amount: 2.5, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'poultry-seasoning', name: 'Poultry seasoning (ground sage/thyme blend)', amount: 1.5, unit: 'tsp', aisle: 'Spices & Seasonings' }
    ],
    steps: [
      'Spread cubed sourdough bread onto baking sheets and toast at 300°F (150°C) for 20–25 minutes until dry and crisp (or leave out overnight).',
      'Melt vegan butter in a large Dutch oven over medium heat. Add diced yellow onions and celery and sauté for 10–12 minutes until softened and translucent.',
      'Stir in minced garlic, fresh chopped sage, rosemary, thyme, and poultry seasoning; cook 2 minutes until deeply aromatic.',
      'Add the dried sourdough cubes and fresh parsley to the pot. Slowly pour in the warm vegetable broth, folding gently until bread cubes are evenly moistened without turning mushy.',
      'Transfer to a greased baking dish, cover with foil, and bake at 375°F (190°C) for 25 minutes. Uncover and bake 15–20 minutes longer until the top is golden and crunchy.'
    ]
  },
  {
    id: 'herb-roast-turkey',
    course: 'Main • Poultry',
    dietary: ['Gluten-Free', 'Poultry'],
    prepTime: '35 mins',
    cookTime: '3 hrs 30 mins',
    baseServings: 12,
    notes: 'Scaled at 1 lb per guest. Dry-brined with kosher salt & baking powder for crackling golden skin and juicy herb-basted meat.',
    ingredients: [
      { groceryId: 'whole-turkey', name: 'Whole Thanksgiving turkey (1 lb per guest)', amount: 12, unit: 'lbs', aisle: 'Meat & Plant-Based Proteins', prepNote: 'thawed, neck & giblets removed' },
      { groceryId: 'kosher-salt', name: 'Kosher salt (for dry brine)', amount: 6, unit: 'tsp', aisle: 'Spices & Seasonings', prepNote: '2 tbsp per 12 lb bird' },
      { groceryId: 'baking-powder', name: 'Aluminum-free baking powder (for crispy skin)', amount: 1, unit: 'tsp', aisle: 'Pantry & Oils' },
      { groceryId: 'unsalted-butter', name: 'Unsalted dairy butter (softened)', amount: 8, unit: 'tbsp', aisle: 'Dairy & Vegan Fridge', prepNote: '1 stick per 12 lb bird' },
      { groceryId: 'fresh-sage', name: 'Fresh sage leaves (finely chopped)', amount: 2, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'fresh-rosemary', name: 'Fresh rosemary leaves (finely chopped)', amount: 1, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'fresh-thyme', name: 'Fresh thyme leaves', amount: 1, unit: 'tbsp', aisle: 'Produce' },
      { groceryId: 'garlic-cloves', name: 'Fresh garlic cloves', amount: 6, unit: 'cloves', aisle: 'Produce', prepNote: 'finely minced or grated' },
      { groceryId: 'whole-lemons', name: 'Whole fresh lemons (zested & halved)', amount: 1, unit: 'whole', aisle: 'Produce' },
      { groceryId: 'black-pepper', name: 'Freshly ground black pepper', amount: 1, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'yellow-onions', name: 'Medium yellow onions (for roasting cavity)', amount: 1, unit: 'whole', aisle: 'Produce', prepNote: 'quartered' },
      { groceryId: 'celery-stalks', name: 'Celery stalks (for roasting cavity)', amount: 2, unit: 'stalks', aisle: 'Produce', prepNote: 'halved' },
      { groceryId: 'turkey-stock', name: 'Chicken or turkey stock (for roasting pan)', amount: 1.5, unit: 'cup', aisle: 'Pantry & Oils' }
    ],
    steps: [
      '24–48 hours ahead: Pat the turkey dry inside and out. Mix kosher salt and baking powder, rub all over the skin, and chill uncovered on a wire rack in the fridge.',
      'Remove turkey 1 hour before roasting. Mash softened butter with chopped sage, rosemary, thyme, minced garlic, lemon zest, and black pepper.',
      'Gently loosen the skin over the turkey breast and spread two-thirds of the garlic-sage butter directly onto the meat; rub the rest over the outside skin. Stuff cavity with quartered onion, celery, and halved lemon.',
      'Place turkey on a V-rack in a roasting pan with stock in the bottom. Roast at 425°F (220°C) for 30 minutes to set golden color, then reduce to 325°F (165°C) until breast registers 162°F and thigh registers 175°F (~13–15 mins per lb).',
      'Transfer turkey to a carving board, tent loosely with foil, and rest for at least 45–60 minutes so juices redistribute before carving.'
    ]
  },
  {
    id: 'glazed-spiral-ham',
    course: 'Main • Pork',
    dietary: ['Gluten-Free', 'Dairy-Free', 'Pork'],
    prepTime: '15 mins',
    cookTime: '1 hr 45 mins',
    baseServings: 12,
    notes: 'Scaled at ½ lb bone-in ham per guest. Basted with a sticky-sweet apple cider, pure maple, dark brown sugar & Dijon glaze.',
    ingredients: [
      { groceryId: 'spiral-ham', name: 'Bone-in spiral-cut smoked ham (½ lb per guest)', amount: 6, unit: 'lbs', aisle: 'Meat & Plant-Based Proteins' },
      { groceryId: 'apple-cider', name: 'Spiced or fresh apple cider', amount: 0.75, unit: 'cup', aisle: 'Produce' },
      { groceryId: 'maple-syrup', name: 'Pure grade-A dark maple syrup', amount: 0.5, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'dark-brown-sugar', name: 'Dark brown sugar (packed)', amount: 0.5, unit: 'cup', aisle: 'Pantry & Oils' },
      { groceryId: 'dijon-mustard', name: 'Smooth Dijon mustard', amount: 3, unit: 'tbsp', aisle: 'Pantry & Oils' },
      { groceryId: 'apple-cider-vinegar', name: 'Apple cider vinegar', amount: 2, unit: 'tbsp', aisle: 'Pantry & Oils' },
      { groceryId: 'ground-cinnamon', name: 'Ground cinnamon', amount: 0.5, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'ground-cloves', name: 'Ground cloves', amount: 0.25, unit: 'tsp', aisle: 'Spices & Seasonings' },
      { groceryId: 'black-pepper', name: 'Freshly ground black pepper', amount: 0.5, unit: 'tsp', aisle: 'Spices & Seasonings' }
    ],
    steps: [
      'Preheat oven to 325°F (165°C). Place the spiral-cut ham cut-side down in a heavy roasting pan, pour half of the apple cider into the pan, and cover tightly with foil.',
      'Bake covered for 12–14 minutes per pound until warmed through (internal temperature reaches 130°F).',
      'Meanwhile, simmer remaining apple cider, pure maple syrup, dark brown sugar, Dijon mustard, apple cider vinegar, cinnamon, cloves, and black pepper in a saucepan for 6–8 minutes until syrupy.',
      'Remove foil from the ham, increase oven temperature to 400°F (205°C), and brush half of the maple-Dijon glaze generously between the spiral slices and over the exterior.',
      'Roast uncovered for 15–20 minutes, brushing once more with remaining glaze halfway through until deeply caramelized and glossy. Rest 15 minutes before serving.'
    ]
  }
];

// Master Make-Ahead & Thanksgiving Day Prep Timeline
export const PREP_TIMELINE = [
  {
    phaseId: 'tuesday',
    dayBadge: 'Tuesday • 2 Days Before',
    title: 'Dry-Brine, Bread Drying & Main Grocery Run',
    accent: 'sage',
    tasks: [
      { id: 't1', time: 'Morning', text: 'Complete consolidated supermarket shopping using Tab 2 (verify whole turkey is fully thawed in fridge).' },
      { id: 't2', time: 'Afternoon', text: 'Dry-brine the whole turkey with kosher salt & baking powder; chill uncovered on a wire rack in the fridge for ultra-crispy skin.' },
      { id: 't3', time: 'Evening', text: 'Cube crusty sourdough loaves for vegan stuffing and toast/dry on sheet pans so bread absorbs broth cleanly.' },
      { id: 't4', time: 'Evening', text: 'Toast walnuts in a dry skillet for the Fennel-Apple Salad; store airtight at room temperature.' }
    ]
  },
  {
    phaseId: 'wednesday',
    dayBadge: 'Wednesday • 1 Day Before',
    title: 'Garlic Roasting, Mashed Potatoes & Herb Prep',
    accent: 'honey',
    tasks: [
      { id: 'w1', time: 'Morning', text: 'Roast whole garlic heads and prepare the Vegan Garlic & Rosemary Mashed Potatoes; cool and refrigerate in an oven-safe casserole dish.' },
      { id: 'w2', time: 'Afternoon', text: 'Mix the garlic-sage-rosemary compound butter for the turkey and simmer the maple-Dijon glaze base for the spiral ham.' },
      { id: 'w3', time: 'Late Afternoon', text: 'Dice yellow onions, celery stalks, and chop fresh sage, rosemary, thyme, and parsley into labeled containers.' },
      { id: 'w4', time: 'Evening', text: 'Check Tab 3 (Potluck Guest Board) to confirm oven/fridge space for incoming guest dishes and set the dining table.' }
    ]
  },
  {
    phaseId: 'thursday-am',
    dayBadge: 'Thanksgiving Morning • 8:00 AM – 12:00 PM',
    title: 'Turkey Tempering, Herb Butter & Roasting Start',
    accent: 'terracotta',
    tasks: [
      { id: 'am1', time: '8:00 AM', text: 'Remove turkey from fridge to temper at room temperature for 1 hour.' },
      { id: 'am2', time: '9:00 AM', text: 'Rub garlic-sage butter under and over turkey skin, stuff cavity with onion/celery/lemon, and start roasting at 425°F (drop to 325°F at 9:30 AM).' },
      { id: 'am3', time: '10:30 AM', text: 'Sauté aromatics and assemble the Classic Herb & Sourdough Vegan Stuffing in its baking dish (keep covered until afternoon).' },
      { id: 'am4', time: '11:30 AM', text: 'Set up chilled drink station & clear top fridge shelf for potluck arrivals.' }
    ]
  },
  {
    phaseId: 'thursday-pm',
    dayBadge: 'Early Afternoon • 12:00 PM – 3:15 PM',
    title: 'Salad Mandoline Prep, Turkey Rest & Oven Swap',
    accent: 'honey',
    tasks: [
      { id: 'pm1', time: '12:30 PM', text: 'Thinly slice fennel bulbs, celery, and Granny Smith apples on mandoline; toss immediately with lemon vinaigrette to keep apples bright.' },
      { id: 'pm2', time: '1:00 PM', text: 'Cut cauliflower florets, mix chickpea flour batter, and slice rice paper strips ready for frying.' },
      { id: 'pm3', time: '1:30 PM', text: 'Pull roast turkey from oven (162°F breast / 175°F thigh). Tent loosely with foil to rest for 60+ minutes.' },
      { id: 'pm4', time: '1:45 PM', text: 'Load foil-covered Spiral Ham and Vegan Sourdough Stuffing into the 325°F oven.' }
    ]
  },
  {
    phaseId: 'final-45',
    dayBadge: 'Final 45 Minutes • 3:15 PM – 4:00 PM',
    title: 'Crispy Wings, Impossible Green Beans & Feast Plating',
    accent: 'terracotta',
    tasks: [
      { id: 'f1', time: '3:15 PM', text: 'Fry rice-paper-wrapped cauliflower wings until golden-crisp, toss in warm vegan buffalo butter sauce, and serve appetizers!' },
      { id: 'f2', time: '3:25 PM', text: 'Uncover stuffing & brush spiral ham with maple-Dijon glaze; crank oven to 400°F for 15–20 mins to caramelize.' },
      { id: 'f3', time: '3:30 PM', text: 'Blister green beans in cast-iron skillet and toss with browned Impossible Savory Sausage, shallots, and lemon.' },
      { id: 'f4', time: '3:40 PM', text: 'Reheat vegan mashed potatoes gently with a splash of warm vegan cream; fold toasted walnuts & shaved vegan Parmesan into Fennel-Apple Salad.' },
      { id: 'f5', time: '3:55 PM', text: 'Carve the rested turkey & glazed spiral ham, plate potluck dishes, and gather everyone at the Harvest Table!' }
    ]
  }
];
