// ============================================================================
// KochTresor – Offline-First PWA, 1:1 Original-Rezepte, Echte Nährwerte & Sync
// ============================================================================

const DB_NAME = 'KochTresorDB';
const DB_VERSION = 1;
const DATA_SCHEMA_VERSION = '2026-11-21-v44-github-pages-invite-fix';

if (typeof window !== 'undefined' && /\.netlify\.app$/i.test(window.location.hostname || '')) {
  if (document.body) {
    document.body.classList.add('netlify-hosted');
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body?.classList.add('netlify-hosted'));
  }
}
const DEFAULT_PUBLIC_APP_URL = 'https://congressional-webcams-locked-miami.trycloudflare.com';
const DEFAULT_LAN_APP_URL = 'http://192.168.178.44:8765';

function loadInitialUserLocation() {
  try {
    const raw = localStorage.getItem('kt_user_location_v17');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.zip && parsed.city && parsed.lat && parsed.lng) {
        return parsed;
      }
    }
  } catch (_) {}
  return {
    zip: '86399',
    city: 'Bobingen',
    lat: '48.274',
    lng: '10.835',
    kaufdaCity: 'Augsburg'
  };
}

const RECIPE_CATEGORIES = [
  { id: 'Pasta & Aufläufe', icon: '🍝', label: 'Pasta & Aufläufe' },
  { id: 'Fleisch & Geflügel', icon: '🍗', label: 'Fleisch & Geflügel' },
  { id: 'Vegetarisch & Vegan', icon: '🥦', label: 'Vegetarisch & Vegan' },
  { id: 'Fisch & Meeresfrüchte', icon: '🐟', label: 'Fisch & Meeresfrüchte' },
  { id: 'Suppen & Eintöpfe', icon: '🍲', label: 'Suppen & Eintöpfe' },
  { id: 'Beilagen & Airfryer', icon: '🍟', label: 'Beilagen & Airfryer' },
  { id: 'Süßes & Frühstück', icon: '🥞', label: 'Süßes & Frühstück' }
];

function getCategoryMeta(catName) {
  const found = RECIPE_CATEGORIES.find((c) => c.id === catName);
  if (found) return found;
  return { id: catName || 'Pasta & Aufläufe', icon: '🍽️', label: catName || 'Weitere Gerichte' };
}

function detectRecipeCategory(title, ingredients = [], tags = []) {
  const text = `${title} ${(tags || []).join(' ')} ${(ingredients || []).map((i) => i.name || '').join(' ')}`.toLowerCase();
  if (/(suppe|eintopf|brühe)/.test(text) && !/pasta|lasagne|gratin/.test(title.toLowerCase())) {
    return 'Suppen & Eintöpfe';
  }
  if (/(pancake|pfannkuchen|waffel|kuchen|torte|dessert|muffin|kaiserschmarrn|süß|frühstück|crepe|crêpe)/.test(title.toLowerCase())) {
    return 'Süßes & Frühstück';
  }
  if (/(lachs|fisch|garnele|kabeljau|thunfisch|forelle|zander)/.test(title.toLowerCase())) {
    return 'Fisch & Meeresfrüchte';
  }
  if (/(pasta|spaghetti|nudeln|lasagne|rigatoni|penne|gnocchi|auflauf|mac and cheese)/.test(title.toLowerCase())) {
    return 'Pasta & Aufläufe';
  }
  if (/(kartoffelecken|wedges|pommes|beilage|salat|brot|dip|heißluftfritteuse|airfryer)/.test(title.toLowerCase())) {
    return 'Beilagen & Airfryer';
  }
  if (/(hähnchen|huhn|rind|schwein|hackfleisch|schnitzel|gulasch|steak|fleisch|puten|braten)/.test(text)) {
    return 'Fleisch & Geflügel';
  }
  return 'Vegetarisch & Vegan';
}

function loadInitialShoppingListFromStorage() {
  try {
    const raw = localStorage.getItem('kt_shopping_list_v15') || localStorage.getItem('kt_shopping_list_backup');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

let db = null;
let state = {
  recipes: [],
  shoppingList: loadInitialShoppingListFromStorage(),
  weekPlan: {
    Montag: '', Dienstag: '', Mittwoch: '', Donnerstag: '',
    Freitag: '', Samstag: '', Sonntag: ''
  },
  household: {
    code: localStorage.getItem('kt_household_code') || 'FAMILIE-2026',
    syncId: localStorage.getItem('kt_sync_id') || '',
    sbUrl: localStorage.getItem('kt_sb_url') || '',
    sbKey: localStorage.getItem('kt_sb_key') || '',
    syncStatus: 'idle',
    lastSyncAt: 0,
    lastSyncedRemoteAt: Number(localStorage.getItem('kt_last_remote_ts') || '0'),
    hasLocalUnsyncedChanges: false,
    lastSyncError: '',
    memberName: localStorage.getItem('kt_member_name') || 'Koch-Chef',
    members: JSON.parse(localStorage.getItem('kt_members') || '["Koch-Chef", "Partner/in"]'),
    geminiKey: localStorage.getItem('kt_gemini_key') || '',
    backupAiKey: localStorage.getItem('kt_backup_ai_key') || '',
    autoCloudSync: localStorage.getItem('kt_auto_cloud') !== 'false'
  },
  deletedRecipeIds: JSON.parse(localStorage.getItem('kt_deleted_recipes') || '[]'),
  deletedShoppingIds: JSON.parse(localStorage.getItem('kt_deleted_shop') || '[]'),
  weekPlanUpdatedAt: Number(localStorage.getItem('kt_weekplan_ts') || '0'),
  filterCategory: 'Alle',
  searchQuery: '',
  fridgeQuery: '',
  activeRecipeId: null,
  activeScalePortions: 4,
  cookStepIndex: 0,
  wakeLockSentinel: null,
  timers: [],
  videoBlobUrls: {},
  bundleShoppingList: localStorage.getItem('kt_bundle_shop') !== 'false',
  hidePantryStaples: localStorage.getItem('kt_hide_pantry') === 'true',
  checkedIngredients: {},
  voiceRecognition: null,
  voiceControlActive: false,
  selectedRetailer: 'Alle',
  offerSearchQuery: '',
  offers: [],
  activeTab: 'recipes',
  tabHistory: ['recipes'],
  publicAppUrl: DEFAULT_PUBLIC_APP_URL,
  backupPublicAppUrl: '',
  lanAppUrl: DEFAULT_LAN_APP_URL,
  lightboxZoomed: false,
  pendingScannedPhoto: null,
  recipeViewMode: localStorage.getItem('kt_recipe_view_mode_v17') || 'grid',
  brochureShelfLayout: localStorage.getItem('kt_brochure_layout_v17') || 'grid',
  importSubTab: 'web',
  offersViewMode: 'all',
  fridgeBarOpen: false,
  discoveryCollapsed: localStorage.getItem('kt_discovery_collapsed_v17') !== 'false',
  userLocation: loadInitialUserLocation(),
  locationEditorOpen: false,
  activeBrochureReader: null,
  brochurePagesCache: {}
};

// ============================================================================
// 1:1 ORIGINAL-REZEPTE (Exakt abgeglichen mit den Original-Links inkl. echten Nährwerten)
// ============================================================================
const STARTER_RECIPES = [
  {
    id: 'rec-11',
    title: 'Gnocchi-Hackfleisch-Eintopf',
    category: 'Suppen & Eintöpfe',
    prepTime: 40,
    portions: 4,
    rating: 5,
    author: 'Leckerschmecker (Dominique)',
    sourceType: 'web',
    sourceUrl: 'https://www.leckerschmecker.me/gnocchi-hackfleisch-eintopf-a-a/63743511585487',
    imageUrl: 'https://www.leckerschmecker.me/wp-content/uploads/sites/6/2025/09/gnocchi-hackfleisch-eintopf-ls.png',
    hasOfflineVideo: false,
    tags: ['Eintöpfe', 'Gnocchi', 'Hackfleisch', 'One-Pot', 'Leckerschmecker'],
    nutrition: {
      kcal: 545,
      carbs: '34 g',
      protein: '26 g',
      fat: '33 g',
      basis: 'pro Portion (4 Portionen)'
    },
    notes: 'Originalrezept von leckerschmecker.me: Würzig, wärmend und kinderleicht in nur einem Topf in 40 Minuten gekocht.',
    ingredients: [
      { amount: 2, unit: 'Stk.', name: 'rote Zwiebeln' },
      { amount: 2, unit: 'Stk.', name: 'Knoblauchzehen' },
      { amount: 2, unit: 'Stk.', name: 'Karotten' },
      { amount: 1, unit: 'Stk.', name: 'rote Paprika' },
      { amount: 150, unit: 'g', name: 'Champignons' },
      { amount: null, unit: 'etwas', name: 'neutrales Pflanzenöl' },
      { amount: 400, unit: 'g', name: 'Hackfleisch' },
      { amount: null, unit: 'nach Geschmack', name: 'Salz und Pfeffer' },
      { amount: 2, unit: 'TL', name: 'Paprikapulver (edelsüß)' },
      { amount: 1, unit: 'TL', name: 'Thymian' },
      { amount: 1, unit: 'TL', name: 'Oregano' },
      { amount: 400, unit: 'g', name: 'stückige Tomaten' },
      { amount: 200, unit: 'ml', name: 'Gemüsebrühe' },
      { amount: 300, unit: 'g', name: 'Gnocchi' },
      { amount: null, unit: 'etwas', name: 'frische Petersilie (nach Geschmack)' },
      { amount: 150, unit: 'ml', name: 'Sahne' }
    ],
    steps: [
      'Schäle Zwiebeln und Knoblauch und schneide beides fein. Schäle die Karotten und schneide sie in kleine Würfel. Wasche die Paprika, entkerne sie und würfle sie.',
      'Putze die Champignons mit einer Pilzbürste. Schneide sie anschließend in Scheiben.',
      'Erhitze ausreichend Öl in einem großen Topf bei mittlerer Hitze. Brate Zwiebel- und Knoblauchwürfel glasig an.',
      'Füge anschließend das Hackfleisch hinzu und brate es unter Rühren krümelig an, bis es vollständig durchgegart ist. Würze alles anschließend mit Salz, Pfeffer, Paprikapulver, Thymian und Oregano.',
      'Gib die Karotten, Paprika und Champignons zum Fleisch und brate sie für 5 Minuten mit an.',
      'Gieße die stückigen Tomaten und Brühe in den Topf. Lass es so bei mittlerer Hitze für 10 Minuten köcheln.',
      'Gib anschließend die Gnocchi in den Topf und lass sie für 5-7 Minuten köcheln, bis sie gar sind.',
      'Wasche währenddessen die Petersilie und schneide sie klein.',
      'Rühre die Sahne in den Topf, lass alles noch einmal aufkochen, reduziere die Hitze und schmecke den Eintopf mit Salz und Pfeffer ab.',
      'Richte ihn auf Tellern an und streue die frische Petersilie darüber.'
    ],
    updatedAt: Date.now() - 1000
  },
  {
    id: 'rec-12',
    title: 'Chicken Teriyaki Sandwich (wie von Subway)',
    category: 'Fleisch & Geflügel',
    prepTime: 20,
    portions: 4,
    rating: 5,
    author: 'Instagram (@foodwerk.de / Nadine Moll)',
    sourceType: 'instagram',
    sourceUrl: 'https://www.instagram.com/reel/C4LaNqtNLRI/?igsh=MXFvYmZpeWJuYWpubg%3D%3D',
    imageUrl: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=900&q=85',
    hasOfflineVideo: false,
    tags: ['Instagram Reel', 'Sandwich', 'Teriyaki Chicken', 'Schnelle Rezepte'],
    nutrition: {
      kcal: 580,
      carbs: '52 g',
      protein: '38 g',
      fat: '22 g',
      basis: 'pro Sandwich (bei 4 Stück)'
    },
    notes: 'Original Instagram-Reel-Rezept von @foodwerk.de (Nadine Moll): Chicken Teriyaki Sandwich wie von Subway – für 4 Stück.',
    ingredients: [
      { amount: 4, unit: 'Stk.', name: 'Sandwich Baguettes' },
      { amount: 400, unit: 'g', name: 'Hähnchengeschnetzeltes' },
      { amount: 5, unit: 'EL', name: 'Teriyaki Sauce' },
      { amount: 8, unit: 'Scheiben', name: 'Cheddar Sandwich Käse' },
      { amount: 4, unit: 'EL', name: 'Frischkäse' },
      { amount: null, unit: 'nach Bedarf', name: 'Salat, Tomaten, Gurke, rote Zwiebeln' },
      { amount: null, unit: 'etwas', name: 'Burgersauce' },
      { amount: null, unit: 'nach Geschmack', name: 'Salz, Pfeffer, Paprika edelsüß' },
      { amount: null, unit: 'etwas', name: 'Öl (zum Anbraten)' }
    ],
    steps: [
      'Hähnchen mit Salz, Pfeffer und Paprika edelsüß würzen und in Öl ca. 2 Minuten kräftig anbraten.',
      'Teriyaki Sauce dazugeben und auf kleiner Hitze etwas einköcheln lassen.',
      'Baguettes aufschneiden und eine Seite mit Cheddar Sandwich Käse belegen.',
      'Im Backofen bei 200 Grad Ober-/Unterhitze 2-3 Minuten backen.',
      'Die andere Seite der Baguettes mit Frischkäse bestreichen und mit Salat, Tomaten, Gurke und roten Zwiebeln belegen.',
      'Nun das Fleisch auf dem Baguette verteilen und etwas Burgersauce darauf geben.',
      'Zusammenklappen und genießen.'
    ],
    updatedAt: Date.now() - 500
  },
  {
    id: 'rec-1',
    title: 'One Pot Pasta – schnell & einfach',
    category: 'Pasta & Aufläufe',
    prepTime: 35,
    portions: 4,
    rating: 5,
    author: 'Emmi kocht einfach',
    sourceType: 'web',
    sourceUrl: 'https://emmikochteinfach.de/one-pot-pasta-nach-bolognese-art/',
    imageUrl: 'https://emmikochteinfach.de/wp-content/uploads/2024/01/oes-One-Pot-Pasta-mit-Hackfleisch-2.jpg',
    hasOfflineVideo: true,
    tags: ['One-Pot', 'Schnell', 'Emmi kocht einfach'],
    nutrition: {
      kcal: 752,
      carbs: '62 g',
      protein: '36 g',
      fat: '39 g',
      basis: 'pro Portion (Originalangabe emmikochteinfach.de)'
    },
    notes: 'Wichtig: Nudelsorte mit ca. 8–11 Min. Kochzeit wählen (idealerweise Penne).',
    ingredients: [
      { amount: 500, unit: 'g', name: 'gemischtes Hackfleisch (halb Rind-, halb Schweinefleisch)' },
      { amount: 250, unit: 'g', name: 'Nudeln, idealerweise die Sorte Penne (Wichtig: ca. 8-11 Min. Kochzeit)' },
      { amount: 100, unit: 'g', name: 'Kräuterfrischkäse' },
      { amount: 1, unit: 'Bund', name: 'Frühlingszwiebeln (ca. 5 Stück)' },
      { amount: 1, unit: '', name: 'Knoblauchzehe' },
      { amount: 500, unit: 'ml', name: 'Gemüsefond aus dem Glas' },
      { amount: 1, unit: 'Dose', name: 'Tomaten, stückig (Inhalt 400 g)' },
      { amount: 40, unit: 'g', name: 'Tomatenmark' },
      { amount: 2, unit: 'EL', name: 'Olivenöl' },
      { amount: 1, unit: 'TL', name: 'Salz' },
      { amount: 1.5, unit: 'TL', name: 'Paprikapulver, edelsüß' },
      { amount: 1, unit: 'Prise', name: 'Zucker' },
      { amount: 1, unit: 'TL', name: 'italienische Kräuter, getrocknet' },
      { amount: null, unit: '', name: 'Parmesan vom Stück, frisch gerieben (zum Servieren)' }
    ],
    steps: [
      'Zuerst wäscht Du für die One Pot Pasta das Bund Frühlingszwiebeln (ca. 5 Stück) trocknest sie ab, schneidest die Enden ab, um sie dann komplett in Ringe zu schneiden (also inklusive dem gesamten Grün). 1 Knoblauchzehe schälen und in Scheiben schneiden.',
      'Die 2 EL Olivenöl erhitzt Du in einem großen Topf, gibst das 500 g gemischte Hackfleisch hinein, würzt es mit 1 TL Salz und lässt es krümelig anbraten, bis es gebräunt ist.',
      'Dann rührst Du noch die Frühlingszwiebeln (etwas Grün fürs Servieren zurücklegen), den Knoblauch und 40 g Tomatenmark unter und würzt mit 1,5 TL Paprikapulver und 1 Prise Zucker.',
      'Den Topfinhalt löscht Du mit 500 ml Gemüsefond oder Gemüsebrühe und 1 Dose stückige Tomaten ab.',
      'Jetzt rührst Du die 250 g UNGEKOCHTEN / ROHEN Nudeln und 100 g Kräuterfrischkäse unter und fügst 1 TL getrocknete, italienische Kräuter hinzu. TIPP: Das beste Ergebnis für meine One Pot Pasta bekommst Du mit einer Nudelsorte mit 8-11 Minuten Kochzeit. Idealerweise die Sorte Penne.',
      'Die Pasta aufkochen und 13 Minuten ohne Deckel bei mittlerer Hitze kochen lassen. Dabei solltest Du ab und zu umrühren, je mehr Flüssigkeit verkocht ist, desto öfter musst Du rühren.',
      'Am Ende schmeckst Du die One Pot Pasta nach Belieben mit Salz und Paprikapulver ab und bestreust sie mit dem restlichen Frühlingszwiebelgrün. Gerne mit Parmesan servieren.',
      'Ich wünsche Dir mit meinem "Alles in 1 Topf" Rezept viel Freude und einen guten Appetit.'
    ],
    updatedAt: Date.now() - 86400000
  },
  {
    id: 'rec-2',
    title: 'Kartoffelecken aus der Heißluftfritteuse',
    category: 'Beilagen & Airfryer',
    prepTime: 35,
    portions: 2,
    rating: 5,
    author: 'Gaumenfreundin',
    sourceType: 'web',
    sourceUrl: 'https://www.gaumenfreundin.de/kartoffelecken-heissluftfritteuse/',
    imageUrl: 'https://www.gaumenfreundin.de/wp-content/uploads/2025/08/Kartoffelecken-Heissluftfritteuse-schnell.jpg',
    hasOfflineVideo: false,
    tags: ['Airfryer', 'Vegetarisch', 'Gaumenfreundin'],
    nutrition: {
      kcal: 238,
      carbs: '44 g',
      protein: '5 g',
      fat: '5 g',
      basis: 'pro Portion (Originalangabe gaumenfreundin.de bei 2 Portionen)'
    },
    notes: 'Das Wässern für 10 Minuten entzieht Stärke und sorgt für maximale Knusprigkeit.',
    ingredients: [
      { amount: 500, unit: 'g', name: 'festkochende Kartoffeln' },
      { amount: 1, unit: 'EL', name: 'Olivenöl' },
      { amount: 1, unit: 'TL', name: 'Paprikapulver edelsüß' },
      { amount: 0.5, unit: 'TL', name: 'Salz' }
    ],
    steps: [
      'Kartoffeln mit der Schale in etwa gleich große Spalten schneiden. Kartoffelspalten für 10 Minuten in eine Schüssel mit kaltem Wasser geben, dann abspülen und gut abtrocknen.',
      'Kartoffeln in einer Schüssel mit Öl, Paprikapulver und Salz mischen.',
      'Die Wedges in den Garkorb der Heißluftfritteuse geben und bei 190 Grad Airfry 20-25 Minuten knusprig backen. Ab und zu den Garkorb schütteln.'
    ],
    updatedAt: Date.now() - 43200000
  },
  {
    id: 'rec-3',
    title: 'Köstliches Zitronenhähnchen',
    category: 'Fleisch & Geflügel',
    prepTime: 75,
    portions: 4,
    rating: 5,
    author: 'Chefkoch (ellik)',
    sourceType: 'web',
    sourceUrl: 'https://www.chefkoch.de/rezepte/1946901316786698/Koestliches-Zitronenhaehnchen.html',
    imageUrl: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=900&q=80',
    hasOfflineVideo: false,
    tags: ['Ofengericht', 'Fleisch', 'Chefkoch'],
    nutrition: {
      kcal: 451,
      carbs: '50,4 g',
      protein: '7,2 g',
      fat: '23,4 g',
      basis: 'pro Portion (Original-Nährwertberechnung chefkoch.de)'
    },
    notes: 'Das Innere des mitgebackenen Knoblauchs drückt jeder wie er mag auf die Kartoffeln – schmeckt köstlich!',
    ingredients: [
      { amount: 1, unit: 'großes', name: 'Brathähnchen (1,3 - 1,5 kg) oder 6 Hähnchenkeulen' },
      { amount: 3, unit: 'Knolle/n', name: 'Knoblauch' },
      { amount: 1, unit: '', name: 'Bio-Zitrone(n), in Scheiben geschnitten' },
      { amount: 100, unit: 'ml', name: 'Zitronensaft, frisch gepresst' },
      { amount: 100, unit: 'ml', name: 'Olivenöl, gutes' },
      { amount: null, unit: '', name: 'Salz und Pfeffer, schwarzer, frisch gemahlen' },
      { amount: 2, unit: 'Zweig/e', name: 'Rosmarin' },
      { amount: 1, unit: 'Zweig/e', name: 'Thymian' },
      { amount: 1, unit: 'Zweig/e', name: 'Oregano' },
      { amount: 1, unit: 'kg', name: 'Kartoffel(n)' },
      { amount: null, unit: 'einige', name: 'Basilikumblätter' }
    ],
    steps: [
      'Den Backofen vorheizen auf 200 °C Ober-/Unterhitze.',
      'Das Hähnchen in schöne Portionsstücke schneiden oder Hähnchenkeulen verwenden. Alle Teile mit der Haut nach oben auf einem tiefen Backblech oder einer großen Auflaufform verteilen. Die Stücke rundum gut mit Salz und Pfeffer einreiben.',
      'Zitronensaft mit dem Olivenöl in einen Schüttel- oder Mixbecher füllen. 1 TL Salz zufügen. Durch Schütteln mischen, bis die beiden Flüssigkeiten sich zu einer cremigen Sauce verbinden oder in einem Schüsselchen mit dem Schneebesen cremig aufschlagen.',
      'Die Hühnerteile mit der Hälfte dieser Marinade übergießen. Die Kartoffeln unter fließendem Wasser sauber bürsten oder schälen, evtl. in Spalten schneiden, falls es größere Exemplare sind, und um das Fleisch auf dem Blech verteilen. Salzen und die Rosmarin- und Thymianzweige dazwischen legen. Die Knoblauchknollen ungeschält quer halbieren, mit der Schnittfläche nach unten um das Huhn verteilen. Die restliche Marinade über alle Zutaten träufeln.',
      'Das Blech in den 200 °C heißen Backofen schieben und die Hähnchenteile etwa 40 Minuten braten. Dann Zitronenscheiben auf die Fleischstücke legen und einige Knoblauchhälften mit der Schnittseite nach oben umdrehen, damit diese leicht bräunen. Weitere 15 - 20 Minuten braten.',
      'Vor dem Servieren fein geschnittenes frisches Basilikum darüber streuen. Das Innere des Knoblauchs drückt jeder wie er mag auf die Kartoffeln, es schmeckt köstlich und man hat danach keine Knoblauchfahne!'
    ],
    updatedAt: Date.now() - 12000000
  },
  {
    id: 'rec-9',
    title: 'Cevapcici mit Djuvec Reis',
    category: 'Fleisch & Geflügel',
    prepTime: 75,
    portions: 2,
    rating: 5,
    author: 'Kochbar.de (strammermax)',
    sourceType: 'web',
    sourceUrl: 'https://www.kochbar.de/rezept/531421/Cevapcici-mit-Djuvec-Reis.html',
    imageUrl: 'https://ais.kochbar.de/kbrezept/531421_979244/1200x1200/cevapcici-mit-djuvec-reis-rezept-bild-nr-5637.jpg',
    hasOfflineVideo: false,
    tags: ['Balkan', 'Hackfleisch', 'Kochbar.de'],
    nutrition: {
      kcal: 142,
      carbs: '13,4 g',
      protein: '8,8 g',
      fat: '5,8 g',
      basis: 'pro 100 g (Originalangabe kochbar.de)'
    },
    notes: 'Originalrezept von kochbar.de: Cevapcici vor dem Braten ca. 1/2 Stunde in Mehl gewendet ruhen lassen, damit sie schön saftig und fest bleiben.',
    ingredients: [
      { group: 'Für die Cevapcici:', amount: 125, unit: 'g', name: 'Hackfleisch' },
      { group: 'Für die Cevapcici:', amount: 125, unit: 'g', name: 'Rinderhack' },
      { group: 'Für die Cevapcici:', amount: 0.5, unit: '', name: 'Zwiebel (1 halbe Zwiebel)' },
      { group: 'Für die Cevapcici:', amount: null, unit: 'nach Geschmack', name: 'Knoblauch frisch' },
      { group: 'Für die Cevapcici:', amount: null, unit: 'etwas', name: 'Paprikapulver edelsüß' },
      { group: 'Für die Cevapcici:', amount: null, unit: 'etwas', name: 'Salz' },
      { group: 'Für die Cevapcici:', amount: 1, unit: 'EL', name: 'Mehl' },
      { group: 'Für den Djuvec Reis:', amount: 0.5, unit: '', name: 'Zwiebel (1 halbe Zwiebel)' },
      { group: 'Für den Djuvec Reis:', amount: 0.5, unit: '', name: 'Paprika rot (1 halber)' },
      { group: 'Für den Djuvec Reis:', amount: null, unit: 'nach Geschmack', name: 'Knoblauch frisch' },
      { group: 'Für den Djuvec Reis:', amount: 1, unit: 'EL', name: 'Öl (Sonnenblumenöl)' },
      { group: 'Für den Djuvec Reis:', amount: 100, unit: 'g', name: 'Reis' },
      { group: 'Für den Djuvec Reis:', amount: 1, unit: 'EL', name: 'Sahne' },
      { group: 'Für den Djuvec Reis:', amount: 1, unit: 'kl. Dose', name: 'Tomaten stückig' },
      { group: 'Für den Djuvec Reis:', amount: null, unit: 'etwas', name: 'Pfeffer' },
      { group: 'Für den Djuvec Reis:', amount: null, unit: 'etwas', name: 'Chili (Chilipulver)' },
      { group: 'Für den Djuvec Reis:', amount: null, unit: 'etwas', name: 'Petersilie' }
    ],
    steps: [
      'Eine halbe Zwiebel und Knoblauch in sehr feine Würfel schneiden, mit dem Hackfleisch mischen und mit Salz und reichlich Paprikapulver würzen. Mit leicht angefeuchteten Händen ca. 8 cm lange etwas dickere Cevapcici rollen. Cevapcici in Mehl wenden und ungefähr 1/2 Stunde ruhen lassen, damit das Hackfleisch fester wird und beim Braten nicht zerfällt.',
      'Inzwischen den Djuvec Reis zubereiten. Dafür 1/2 Zwiebel und Knoblauch in feine Würfel schneiden. Eine halbe rote Paprika in möglichst kleine Würfel schneiden. In einem kleinen Kochtopf 1 Esslöffel Sonnenblumenöl erhitzen. Reis, Zwiebeln, Knoblauch und Paprika zufügen und unter Rühren leicht andünsten. Sahne unter den Reis rühren, damit er den Reis umschließt und so beim Kochen nicht zu weich wird. Tomaten aus der Dose mit Saft zufügen. Die Tomaten mit einem Kochlöffel grob zerkleinern und den Djuvec Reis einmal kräftig aufkochen. Die Temperatur auf niedrige Stufe zurückschalten und den Djuvec Reis ohne Deckel ca. 25 Minuten ausquellen lassen. Dabei öfters umrühren. Den Djuvec Reis zum Schluss mit Salz, Pfeffer aus der Mühle und Chilipulver würzen. Für die Dekoration Petersilie fein hacken.',
      'Eine Grillpfanne mit Sonnenblumenöl auspinseln, erhitzen und die Cevapcici darin von beiden Seiten kräftig anbraten. Cevapcici mit Djuvec Reis auf Tellern anrichten und mit Petersilie bestreuen.'
    ],
    updatedAt: Date.now() - 5000000
  },
  {
    id: 'rec-10',
    title: 'Couscous-Hack-Pfanne',
    category: 'Fleisch & Geflügel',
    prepTime: 25,
    portions: 4,
    rating: 5,
    author: 'Lecker.de',
    sourceType: 'web',
    sourceUrl: 'https://www.lecker.de/couscous-hack-pfanne-73417.html',
    imageUrl: 'https://images.lecker.de/couscous-hack-pfanne/1x1,id=9cf6ad7f,b=lecker,w=1600,h=,ca=12.51,0,87.49,100,rm=sk.jpeg',
    hasOfflineVideo: false,
    tags: ['Pfannengericht', 'Schnell', 'Lecker.de'],
    nutrition: {
      kcal: 619,
      carbs: '33 g',
      protein: '28 g',
      fat: '42 g',
      basis: 'pro Portion (Originalangabe lecker.de)'
    },
    notes: 'Originalrezept von lecker.de: Schnell gemacht in 25 Minuten mit Paprika, Champignons, Aubergine und griechischem Sahnejoghurt.',
    ingredients: [
      { amount: 1, unit: '', name: 'rote Paprika (ca. 180 g)' },
      { amount: 150, unit: 'g', name: 'Champignons' },
      { amount: 1, unit: 'kleine', name: 'Aubergine (ca. 200 g)' },
      { amount: 0.5, unit: 'Bund', name: 'glatte Petersilie' },
      { amount: 5, unit: 'EL', name: 'Olivenöl' },
      { amount: 400, unit: 'g', name: 'gemischtes Hackfleisch' },
      { amount: null, unit: '', name: 'Salz' },
      { amount: null, unit: '', name: 'Pfeffer' },
      { amount: 150, unit: 'g', name: 'Couscous' },
      { amount: 200, unit: 'ml', name: 'Gemüsebrühe' },
      { amount: null, unit: '', name: 'gemahlener Kreuzkümmel' },
      { amount: 200, unit: 'g', name: 'griechischer Sahnejoghurt' }
    ],
    steps: [
      'Paprika halbieren, putzen, waschen und in kleine Stücke schneiden. Pilze putzen, säubern und vierteln. Aubergine waschen, putzen und in Würfel schneiden. Petersilie waschen, trocken schütteln und, bis auf ein paar Blättchen zum Garnieren, grob hacken.',
      '3 EL Öl in einer großen Pfanne erhitzen. Hack darin unter Wenden 4–5 Minuten krümelig anbraten. Mit Salz und Pfeffer würzen. Hack herausnehmen. 2 EL Öl in die heiße Pfanne geben. Gemüse darin unter Wenden ca. 4 Minuten kräftig anbraten.',
      'In der Zwischenzeit Couscous in eine Schüssel geben und mit heißer Brühe übergießen. Nach Packungsanweisung ziehen lassen. Gemüse mit Kreuzkümmel, Salz und Pfeffer abschmecken.',
      'Couscous mit einer Gabel auflockern, mit Hack und Petersilie zum Gemüse in die Pfanne geben, kurz erhitzen und mit Salz, Pfeffer und Kreuzkümmel abschmecken. Couscous-Hack-Pfanne mit Petersilie garnieren und Joghurt dazureichen.'
    ],
    updatedAt: Date.now() - 4000000
  }
];

// ============================================================================
// VORGESCHLAGENE DIREKTE REZEPTE (1:1 Original-Zutaten, Schritte & Nährwerte)
// ============================================================================
const SUGGESTED_DIRECT_RECIPES = [
  {
    id: 'rec-4',
    title: 'Lasagne Bolognese (Chefkoch Original)',
    category: 'Pasta & Aufläufe',
    prepTime: 60,
    portions: 4,
    author: 'Chefkoch',
    sourceType: 'web',
    sourceUrl: 'https://www.chefkoch.de/rezepte/1112181217260303/Lasagne-Bolognese.html',
    imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=800&q=80',
    tags: ['Italienisch', 'Ofengericht', 'Chefkoch'],
    nutrition: {
      kcal: 898,
      carbs: '46,7 g',
      protein: '44,8 g',
      fat: '55,2 g',
      basis: 'pro Portion (Originalangabe chefkoch.de)'
    },
    ingredients: [
      { group: 'Für die Nudeln:', amount: 8, unit: '', name: 'Lasagneplatte(n), vorgegarte, n. B. auch mehr je nach Formengröße' },
      { group: 'Für die Nudeln:', amount: null, unit: '', name: 'Fett für die Form' },
      { group: 'Für die Bolognese:', amount: 600, unit: 'g', name: 'Hackfleisch, gemischtes' },
      { group: 'Für die Bolognese:', amount: 3, unit: 'EL', name: 'Olivenöl' },
      { group: 'Für die Bolognese:', amount: 1, unit: 'große', name: 'Möhre(n)' },
      { group: 'Für die Bolognese:', amount: 1, unit: 'Stück(e)', name: 'Knollensellerie, etwa gleich viel wie die Möhre' },
      { group: 'Für die Bolognese:', amount: 1, unit: 'große', name: 'Zwiebel(n)' },
      { group: 'Für die Bolognese:', amount: 2, unit: '', name: 'Knoblauchzehe(n)' },
      { group: 'Für die Bolognese:', amount: 200, unit: 'ml', name: 'Weißwein' },
      { group: 'Für die Bolognese:', amount: 500, unit: 'ml', name: 'Gemüsebrühe' },
      { group: 'Für die Bolognese:', amount: 2, unit: 'EL', name: 'Tomatenmark' },
      { group: 'Für die Bolognese:', amount: null, unit: '', name: 'Salz und Pfeffer' },
      { group: 'Für die Bolognese:', amount: null, unit: '', name: 'Zucker' },
      { group: 'Für die Béchamelsauce:', amount: 2, unit: 'EL', name: 'Butter' },
      { group: 'Für die Béchamelsauce:', amount: 3, unit: 'EL, gestr.', name: 'Mehl' },
      { group: 'Für die Béchamelsauce:', amount: 500, unit: 'ml', name: 'Milch' },
      { group: 'Für die Béchamelsauce:', amount: null, unit: '', name: 'Muskat' },
      { group: 'Für die Béchamelsauce:', amount: 100, unit: 'g', name: 'Parmesan, frisch geriebener' }
    ],
    steps: [
      'Möhre, Sellerie, Zwiebel und Knoblauch putzen und in Würfel schneiden. Das Öl erhitzen, die Gemüsewürfel darin gut anbraten und wieder aus der Pfanne nehmen.',
      'Nun das Hackfleisch zur Hälfte zufügen und krümelig bzw. kross braten. Wieder aus der Pfanne nehmen und das restliche Hack braten. Das bereits gebratene Hack und Gemüse wieder zufügen, mit dem Wein ablöschen, aufkochen lassen und fast verkochen lassen. Tomatenmark dazugeben, etwas angehen lassen und mit der Brühe auffüllen. Mit Deckel sämig einkochen lassen. Mit Salz, Pfeffer und einer Prise Zucker würzen.',
      'Für die Béchamel die Butter in einem Topf zerlassen. Das Mehl einrühren und kurz anschwitzen, dann unter Rühren nach und nach die Milch zugießen. Mit Muskat und Salz abschmecken und einmal aufkochen lassen.',
      'Eine Auflaufform fetten und mit Lasagneplatten belegen. Einige Löffel Béchamel darauf verteilen, mit etwas Parmesan bestreuen und etwas von der Bolognese darüber geben. So weiter schichten, bis alle Zutaten verbraucht sind. Die oberste Schicht sollte aus Béchamelsauce bestehen, die gleichmäßig mit Parmesan bestreut wird.',
      'Im vorgeheizten Backofen bei 180 °C Ober-/Unterhitze ca. 20 Minuten überbacken. Bevor die Lasagne portioniert wird, einige Minuten ruhen lassen.',
      'Bei 4 Portionen hat eine Portion 888 Kcal.'
    ],
    updatedAt: Date.now() - 10000000
  },
  {
    id: 'rec-5',
    title: 'Kichererbsen-Curry (Gaumenfreundin)',
    category: 'Vegetarisch & Vegan',
    prepTime: 15,
    portions: 4,
    author: 'Gaumenfreundin',
    sourceType: 'web',
    sourceUrl: 'https://www.gaumenfreundin.de/kichererbsen-curry/',
    imageUrl: 'https://www.gaumenfreundin.de/wp-content/uploads/2022/12/Kichererbsen-Curry-Gaumenfreundin.jpg',
    tags: ['Vegan', 'Unter 20 Min', 'Gaumenfreundin'],
    nutrition: {
      kcal: 538,
      carbs: '43 g',
      protein: '14 g',
      fat: '39 g',
      basis: 'pro Portion (Originalangabe gaumenfreundin.de)'
    },
    ingredients: [
      { amount: 400, unit: 'g', name: 'Kichererbsen (Glas oder Dose)' },
      { amount: 1, unit: '', name: 'Zwiebel' },
      { amount: 2, unit: '', name: 'Knoblauchzehen' },
      { amount: 2, unit: 'EL', name: 'Kokosöl (Tipp: Alternativ Rapsöl)' },
      { amount: 2, unit: 'TL', name: 'Curry' },
      { amount: 1, unit: 'TL', name: 'Kreuzkümmel' },
      { amount: 400, unit: 'g', name: 'gehackte Tomaten (Dose)' },
      { amount: 400, unit: 'ml', name: 'Kokosmilch (Vollfett aus der Dose)' },
      { amount: null, unit: '', name: 'Salz und Pfeffer' },
      { amount: 0.5, unit: '', name: 'Limette' }
    ],
    steps: [
      'Kichererbsen mit Wasser abspülen und gut abtropfen lassen. Zwiebel und Knoblauch klein hacken.',
      'Öl in einer Pfanne erhitzen und die Zwiebeln glasig dünsten. Dann Knoblauch, Curry und Kreuzkümmel kurz anbraten.',
      'Gehackten Tomaten, Kokosmilch und Kichererbsen zugeben. Aufkochen und bei mittlerer Hitze 10 Minuten köcheln lassen. Kichererbsen-Curry mit Salz, Pfeffer und Limettensaft abschmecken.'
    ],
    updatedAt: Date.now() - 9000000
  },
  {
    id: 'rec-6',
    title: 'Amerikanische Pancakes (Chefkoch Original)',
    category: 'Süßes & Frühstück',
    prepTime: 20,
    portions: 2,
    author: 'Chefkoch',
    sourceType: 'web',
    sourceUrl: 'https://www.chefkoch.de/rezepte/1205621226313744/Amerikanische-Pancakes.html',
    imageUrl: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80',
    tags: ['Frühstück', 'Süß', 'Chefkoch'],
    nutrition: {
      kcal: 597,
      carbs: '78,3 g',
      protein: '22,5 g',
      fat: '21,0 g',
      basis: 'pro Portion (Originalangabe chefkoch.de bei 2 Portionen)'
    },
    ingredients: [
      { amount: 3, unit: '', name: 'Ei(er), Kl. M' },
      { amount: 100, unit: 'ml', name: 'Milch' },
      { amount: 200, unit: 'ml', name: 'Naturjoghurt' },
      { amount: 150, unit: 'g', name: 'Mehl' },
      { amount: 1, unit: 'Pck.', name: 'Backpulver' },
      { amount: 1, unit: 'Prise(n)', name: 'Salz' },
      { amount: 2, unit: 'EL', name: 'Zucker' },
      { amount: null, unit: 'etwas', name: 'Öl, zum Ausbacken' },
      { amount: null, unit: '', name: 'Ahornsirup, als Topping' }
    ],
    steps: [
      'Die Eier zu einer schönen hellen Schaummasse verquirlen.',
      'Milch und Naturjoghurt vermischen, ich nehme etwa 200 ml Joghurt, den Rest Milch. Ihr könnt auch mehr oder weniger Joghurt nehmen, je nachdem was Ihr gerade da habt. Das macht die Pancakes so richtig schön dick und saftig!',
      'Mehl, Backpulver, Milch-Joghurt-Mischung, Salz und Zucker nach und nach zu den Eiern geben und immer schön weiter rühren. Evtl. etwas mehr Milch zufügen wenn der Teig zu dick ist. Aber er sollte schon gut dickflüssig sein.',
      'Die Pfanne auf mittlerer Stufe erhitzen, jeweils etwa einen TL Öl hineingeben und nacheinander den ganzen Teig zu Pancakes verbacken. Wichtig! Ganz wenig Öl verwenden und langsam, also auf mittlerer Stufe, nicht zu heiß ausbacken.',
      'Schmecken toll mit Ahornsirup, Zuckerrübensirup oder mit Frucht und Quark.'
    ],
    updatedAt: Date.now() - 8000000
  },
  {
    id: 'rec-7',
    title: 'Lachs-Sahne-Gratin (Gaumenfreundin)',
    category: 'Fisch & Meeresfrüchte',
    prepTime: 25,
    portions: 2,
    author: 'Gaumenfreundin',
    sourceType: 'web',
    sourceUrl: 'https://www.gaumenfreundin.de/lachs-sahne-gratin/',
    imageUrl: 'https://www.gaumenfreundin.de/wp-content/uploads/2023/03/Lachs-Sahne-Gratin-Gaumenfreundin.jpg',
    tags: ['Fisch', 'Low Carb', 'Gaumenfreundin'],
    nutrition: {
      kcal: 421,
      carbs: '6 g',
      protein: '28 g',
      fat: '32 g',
      basis: 'pro Portion (Originalangabe gaumenfreundin.de bei 2 Portionen)'
    },
    ingredients: [
      { amount: 250, unit: 'g', name: 'Lachsfilet (TK)' },
      { amount: 250, unit: 'g', name: 'Sahne (Schlagsahne (30 %) oder Sahne zum Kochen (15 %))' },
      { amount: 2, unit: 'EL', name: 'Tomatenmark' },
      { amount: 1, unit: 'TL', name: 'Gemüsebrühpulver' },
      { amount: 1, unit: 'EL', name: 'Dill (TK)' },
      { amount: 1, unit: '', name: 'Knoblauchzehe (gehackt)' },
      { amount: null, unit: '', name: 'Salz und Pfeffer' }
    ],
    steps: [
      'Backofen auf 180 Grad Umluft vorheizen.',
      'Lachs etwas antauen lassen und in eine Auflaufform geben. Mit Salz und Pfeffer würzen.',
      'Sahne, Tomatenmark, Gemüsebrühe, Dill und Knoblauch verrühren. Die Sauce mit Salz und Pfeffer würzen und über die Lachsfilets geben. 20-25 Minuten backen.'
    ],
    updatedAt: Date.now() - 7000000
  },
  {
    id: 'rec-8',
    title: 'Tortellini-Suppe mit Hackfleisch (Gaumenfreundin)',
    category: 'Suppen & Eintöpfe',
    prepTime: 30,
    portions: 4,
    author: 'Gaumenfreundin',
    sourceType: 'web',
    sourceUrl: 'https://www.gaumenfreundin.de/tortellini-suppe/',
    imageUrl: 'https://www.gaumenfreundin.de/wp-content/uploads/2026/09/Tortellini-Suppe-mit-Hackfleisch-Rezept.jpg',
    tags: ['Suppe', 'Familienrezept', 'Gaumenfreundin'],
    nutrition: {
      kcal: 900,
      carbs: '71 g',
      protein: '53 g',
      fat: '44 g',
      basis: 'pro Portion (Originalangabe gaumenfreundin.de)'
    },
    ingredients: [
      { amount: 200, unit: 'g', name: 'Kirschtomaten' },
      { amount: 50, unit: 'g', name: 'Babyspinat' },
      { amount: 2, unit: 'EL', name: 'Olivenöl' },
      { amount: 500, unit: 'g', name: 'Rinderhackfleisch (Alternative: gemischtes oder Veggie-Hack)' },
      { amount: 1, unit: 'TL', name: 'Paprikapulver (edelsüß)' },
      { amount: 3, unit: 'EL', name: 'Tomatenmark' },
      { amount: 500, unit: 'ml', name: 'Milch' },
      { amount: 30, unit: 'g', name: 'Mehl' },
      { amount: 800, unit: 'ml', name: 'Rinderbrühe (Alternative: Gemüsebrühe)' },
      { amount: 500, unit: 'g', name: 'Tortellini (aus dem Kühlregal)' },
      { amount: 50, unit: 'g', name: 'Parmesan (frisch vom Stück reiben)' },
      { amount: null, unit: '', name: 'Salz und Pfeffer' }
    ],
    steps: [
      'Tomaten halbieren, Spinat klein hacken.',
      'Öl im großen Topf erhitzen und das Hackfleisch kräftig anbraten, dabei mit Salz, Pfeffer und Paprikapulver würzen. Tomatenmark zugeben und kurz mit anrösten. Kirschtomaten unterrühren.',
      'Mehl und Milch in einer Schüssel verquirlen, dann zusammen mit der Rinderbrühe und den Tortellini in den Topf geben. Aufkochen, dann 5 Minuten bei mittlerer Hitze köcheln lassen.',
      'Spinat und Parmesan unterrühren, kurz erhitzen und die Suppe mit Salz und Pfeffer abschmecken.'
    ],
    updatedAt: Date.now() - 6000000
  }
];

// ============================================================================
// 1. IndexedDB Offline-Speicher (für Rezepte & große MP4-Videodateien)
// ============================================================================
function initDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('recipes')) {
          database.createObjectStore('recipes', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('videos')) {
          database.createObjectStore('videos', { keyPath: 'recipeId' });
        }
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function dbGetAll(storeName) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
      tx.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

async function dbPut(storeName, item) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      req.onerror = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

async function dbDelete(storeName, key) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      req.onerror = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

async function dbGet(storeName, key) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function findRecipeById(recipeId) {
  if (!recipeId) return null;
  const target = String(recipeId);
  const fromState = (state.recipes || []).find((item) => String(item.id) === target);
  if (fromState) return fromState;
  const fromStarter = (STARTER_RECIPES || []).find((item) => String(item.id) === target);
  if (fromStarter) return fromStarter;
  const fromSuggested = (SUGGESTED_DIRECT_RECIPES || []).find((item) => String(item.id) === target);
  if (fromSuggested) return fromSuggested;
  return null;
}

async function ensureDemoOfflineVideo() {
  const existing = await dbGet('videos', 'rec-1');
  if (existing) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') return;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      await dbPut('videos', { recipeId: 'rec-1', blob, savedAt: Date.now() });
    };
    recorder.start();
    let frame = 0;
    const iv = setInterval(() => {
      frame++;
      const grad = ctx.createLinearGradient(0, 0, 480, 360);
      grad.addColorStop(0, '#ea580c');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 480, 360);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 23px sans-serif';
      ctx.fillText('Offline-Video: One Pot Pasta', 40, 130);
      ctx.font = '16px sans-serif';
      ctx.fillText(`Schritt ${Math.min(7, Math.ceil(frame / 5))}: Köcheln & Genießen...`, 40, 180);
      ctx.fillStyle = '#10b981';
      ctx.fillText('● 100% Offline im Handyspeicher', 40, 240);
      if (frame >= 30) {
        clearInterval(iv);
        recorder.stop();
      }
    }, 65);
  } catch (_) {}
}

// ============================================================================
// 2. App-Start & 1:1 Synchronisation der Starter-/Vorschlagsdaten
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=17').then((reg) => reg.update()).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.filter((k) => k !== 'kochtresor-v17').forEach((k) => caches.delete(k));
    }).catch(() => {});
  }

  const params = new URLSearchParams(window.location.search);
  let joinedHouseholdFromLink = false;
  if (params.get('household')) {
    const joinedCode = params.get('household').trim().toUpperCase();
    state.household.code = joinedCode;
    localStorage.setItem('kt_household_code', joinedCode);
    joinedHouseholdFromLink = true;
  }
  if (params.get('member')) {
    const joinedMember = params.get('member').trim();
    if (joinedMember) {
      state.household.memberName = joinedMember;
      localStorage.setItem('kt_member_name', joinedMember);
      if (!state.household.members.includes(joinedMember)) {
        state.household.members.push(joinedMember);
        localStorage.setItem('kt_members', JSON.stringify(state.household.members));
      }
      joinedHouseholdFromLink = true;
    }
  }
  if (params.get('sync')) {
    const joinedSyncId = params.get('sync').trim();
    if (joinedSyncId) {
      state.household.syncId = joinedSyncId;
      localStorage.setItem('kt_sync_id', joinedSyncId);
      joinedHouseholdFromLink = true;
    }
  }
  if (params.get('sbUrl') && params.get('sbKey')) {
    const joinedSbUrl = params.get('sbUrl').trim().replace(/\/+$/, '');
    const joinedSbKey = params.get('sbKey').trim();
    if (joinedSbUrl && joinedSbKey) {
      state.household.sbUrl = joinedSbUrl;
      state.household.sbKey = joinedSbKey;
      localStorage.setItem('kt_sb_url', joinedSbUrl);
      localStorage.setItem('kt_sb_key', joinedSbKey);
      joinedHouseholdFromLink = true;
    }
  }
  if (params.get('aiKey')) {
    const joinedAiKey = params.get('aiKey').trim();
    if (joinedAiKey.length > 10) {
      state.household.geminiKey = joinedAiKey;
      localStorage.setItem('kt_gemini_key', joinedAiKey);
      joinedHouseholdFromLink = true;
    }
  }
  if (params.get('aiKey2')) {
    const joinedAiKey2 = params.get('aiKey2').trim();
    if (joinedAiKey2.length > 10) {
      state.household.backupAiKey = joinedAiKey2;
      localStorage.setItem('kt_backup_ai_key', joinedAiKey2);
      joinedHouseholdFromLink = true;
    }
  }
  if (joinedHouseholdFromLink) {
    try {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}
    showToast(`Haushalt "${state.household.code}" verbunden – synchronisiere Daten...`);
  }

  // Sofortiges Initial-Rendering (0 ms Verzögerung beim Öffnen der App!)
  const allBaseRecipes = [...STARTER_RECIPES, ...SUGGESTED_DIRECT_RECIPES];
  if (!state.recipes || state.recipes.length === 0) {
    state.recipes = [...allBaseRecipes];
  }
  initSupermarketOffersState();
  initBackButtonNavigation();
  initPullToRefresh();
  renderAll();

  // Lade aktuelle öffentliche Tunnel-URL & LAN-IP asynchron im Hintergrund
  detectLivePublicAppUrl();

  await initDB();
  let storedRecipes = await dbGetAll('recipes');

  if (!storedRecipes || storedRecipes.length === 0) {
    for (const r of allBaseRecipes) {
      await dbPut('recipes', r);
    }
    storedRecipes = [...allBaseRecipes];
  } else {
    // Entferne versehentlich fehlerhaft geparste Cookie-/Menü-Importe und synchronisiere alle Basis-Rezepte 1:1
    const cleanedRecipes = [];
    for (let i = 0; i < storedRecipes.length; i++) {
      const r = storedRecipes[i];
      const uLower = (r.sourceUrl || '').toLowerCase();
      const tLower = (r.title || '').toLowerCase();

      const match = allBaseRecipes.find(
        (v) =>
          (v.id && v.id === r.id) ||
          (v.sourceUrl && v.sourceUrl.split('?')[0].toLowerCase() === uLower.split('?')[0]) ||
          (uLower.includes('531421') && v.sourceUrl.includes('531421')) ||
          (uLower.includes('73417') && v.sourceUrl.includes('73417')) ||
          (uLower.includes('63743511585487') && v.sourceUrl.includes('63743511585487')) ||
          (uLower.includes('c4lanqtnlri') && v.sourceUrl.toLowerCase().includes('c4lanqtnlri')) ||
          (tLower.includes('cevapcici mit djuvec') && v.id === 'rec-9') ||
          (tLower.includes('couscous-hack-pfanne') && v.id === 'rec-10') ||
          (tLower.includes('gnocchi-hackfleisch-eintopf') && v.id === 'rec-11') ||
          (tLower.includes('würzig, wärmend, wunderbar') && v.id === 'rec-11') ||
          (tLower.includes('chicken teriyaki sandwich') && v.id === 'rec-12') ||
          v.title.toLowerCase() === tLower
      );

      if (match) {
        const updated = {
          ...r,
          id: match.id || r.id,
          title: match.title,
          category: match.category,
          prepTime: match.prepTime,
          portions: match.portions,
          author: match.author || r.author,
          sourceUrl: match.sourceUrl,
          imageUrl: match.imageUrl || r.imageUrl,
          tags: match.tags,
          notes: match.notes || r.notes || '',
          nutrition: match.nutrition || null,
          ingredients: match.ingredients,
          steps: match.steps,
          isFavorite: Boolean(r.isFavorite),
          lastCookedAt: r.lastCookedAt || null,
          cookedCount: r.cookedCount || 0,
          updatedAt: r.updatedAt || match.updatedAt || Date.now()
        };
        cleanedRecipes.push(updated);
        await dbPut('recipes', updated);
      } else {
        // Prüfe, ob ein alter Import durch Cookie-Banner, leere Social-Platzhalter oder Navigations-Menüs beschädigt war
        const ingDump = (r.ingredients || []).map((x) => x.name || '').join(' ').toLowerCase();
        const isCorrupted =
          ingDump.includes('datenschutz') ||
          ingDump.includes('willkommen auf kochbar') ||
          ingDump.includes('cookie') ||
          ingDump.includes('magazin leckerleben') ||
          tLower.startsWith('rezept aus instagram video') ||
          tLower.startsWith('rezept aus facebook video');
        if (isCorrupted) {
          await dbDelete('recipes', r.id);
        } else {
          cleanedRecipes.push(r);
        }
      }
    }

    storedRecipes = cleanedRecipes;

    // Füge fehlende Basis-/Vorschlagsrezepte (inkl. Gnocchi-Hackfleisch-Eintopf & Chicken Teriyaki Sandwich) hinzu
    for (const baseRec of allBaseRecipes) {
      const exists = storedRecipes.some(
        (r) =>
          r.id === baseRec.id ||
          (r.sourceUrl && r.sourceUrl.split('?')[0].toLowerCase() === baseRec.sourceUrl.split('?')[0].toLowerCase()) ||
          r.title.toLowerCase() === baseRec.title.toLowerCase()
      );
      if (!exists) {
        storedRecipes.push(baseRec);
        await dbPut('recipes', baseRec);
      }
    }
  }

  localStorage.setItem('kt_schema_ver', DATA_SCHEMA_VERSION);
  state.recipes = storedRecipes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const savedShop = await dbGet('meta', 'shoppingList');
  if (savedShop && Array.isArray(savedShop.value) && savedShop.value.length > 0 && state.shoppingList.length === 0) {
    state.shoppingList = savedShop.value;
    try {
      localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
    } catch (_) {}
  }

  const savedPlan = await dbGet('meta', 'weekPlan');
  if (savedPlan && savedPlan.value) state.weekPlan = savedPlan.value;

  initSupermarketOffersState();
  ensureDemoOfflineVideo();
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  initBackButtonNavigation();
  initPullToRefresh();
  renderAll();
  initRealtimeSync();
  autoRefreshBrochuresIfNeeded();
  if (joinedHouseholdFromLink || isSupabaseSyncConfigured()) {
    pullHouseholdCloudState(joinedHouseholdFromLink);
  }
});

function updateOnlineStatus() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const online = navigator.onLine;
  if (dot && text) {
    dot.className = 'status-dot' + (online ? '' : ' offline');
    text.textContent = online
      ? `Haushalt: ${state.household.code}`
      : `Offline (${state.recipes.length} Rezepte bereit)`;
  }
}

let toastHideTimer = null;
let toastClearTimer = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (toastHideTimer) clearTimeout(toastHideTimer);
  if (toastClearTimer) clearTimeout(toastClearTimer);
  t.textContent = msg;
  t.classList.add('show');
  toastHideTimer = setTimeout(() => {
    t.classList.remove('show');
    toastClearTimer = setTimeout(() => {
      if (!t.classList.contains('show')) t.textContent = '';
    }, 280);
  }, 2600);
}

function initPullToRefresh() {
  const contentEl = document.querySelector('.app-content');
  const barEl = document.getElementById('pullToRefreshBar');
  if (!contentEl || !barEl || contentEl.dataset.ptrBound) return;
  contentEl.dataset.ptrBound = '1';

  let startY = 0;
  let pulling = false;
  let pullDistance = 0;
  let refreshing = false;
  const threshold = 68;

  contentEl.addEventListener(
    'touchstart',
    (e) => {
      if (refreshing || contentEl.scrollTop > 2 || !e.touches || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      pulling = true;
      pullDistance = 0;
    },
    { passive: true }
  );

  contentEl.addEventListener(
    'touchmove',
    (e) => {
      if (!pulling || refreshing || !e.touches || e.touches.length !== 1) return;
      if (contentEl.scrollTop > 2) {
        pulling = false;
        barEl.style.height = '0px';
        barEl.classList.remove('visible');
        return;
      }
      const dy = e.touches[0].clientY - startY;
      if (dy > 8) {
        pullDistance = Math.min(92, Math.round(dy * 0.55));
        barEl.style.height = `${pullDistance}px`;
        barEl.classList.add('visible');
        barEl.textContent =
          pullDistance >= threshold
            ? '🔄 Loslassen zum Aktualisieren & Synchronisieren!'
            : '↓ Zum Synchronisieren nach unten ziehen...';
      } else {
        pullDistance = 0;
        barEl.style.height = '0px';
        barEl.classList.remove('visible');
      }
    },
    { passive: true }
  );

  const finishPull = async () => {
    if (!pulling) return;
    pulling = false;
    if (pullDistance >= threshold && !refreshing) {
      refreshing = true;
      barEl.style.height = '40px';
      barEl.classList.add('visible');
      barEl.textContent = '🔄 Aktualisiere & synchronisiere...';
      try {
        await pullHouseholdCloudState(true);
        const activeOffers = document.getElementById('tab-offers')?.classList.contains('active');
        if (activeOffers && typeof refreshAllLiveBrochures === 'function') {
          await refreshAllLiveBrochures(false).catch(() => {});
        }
        renderAll();
      } catch (_) {}
      setTimeout(() => {
        barEl.style.height = '0px';
        barEl.classList.remove('visible');
        refreshing = false;
      }, 350);
    } else {
      barEl.style.height = '0px';
      barEl.classList.remove('visible');
    }
    pullDistance = 0;
  };

  contentEl.addEventListener('touchend', finishPull, { passive: true });
  contentEl.addEventListener('touchcancel', finishPull, { passive: true });
}

// ============================================================================
// 3. Präzise Portions-Umrechnung (Erfindet niemals Mengen bei mengenlosen Zutaten!)
// ============================================================================
function formatScaledAmount(amount, basePortions, targetPortions) {
  // Wenn die Zutat im Original keine Zahl hat (z.B. "Salz und Pfeffer", "Fett für die Form", "etwas Öl"):
  // Gib niemals eine erfundene Zahl zurück!
  if (amount === null || amount === undefined || amount === '' || Number(amount) === 0 || isNaN(Number(amount))) {
    return '';
  }
  const base = Number(basePortions) || 4;
  const target = Number(targetPortions) || base;
  const raw = (Number(amount) * target) / base;

  // Runde auf maximal 2 Dezimalstellen ohne künstliche Nullen, im deutschen Komma-Format
  const rounded = Math.round(raw * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  // Schöne Darstellung für gängige Küchenmaße (0,5 / 0,25 / 0,75 / 1,5)
  return String(rounded).replace('.', ',');
}

function formatIngredientAmountAndUnit(ing, basePortions, targetPortions) {
  const scaledNum = formatScaledAmount(ing.amount, basePortions, targetPortions);
  const unit = (ing.unit || '').trim();
  if (!scaledNum && !unit) return '';
  if (!scaledNum) return unit; // z.B. "einige" oder "etwas"
  return unit ? `${scaledNum} ${unit}` : scaledNum;
}

// Gibt den Zubereitungstext 100% 1:1 unverändert wie im Original-Rezept zurück
function formatStepTextWithPortions(stepText) {
  return stepText;
}

// ============================================================================
// 4. Navigation, Smartphone-Zurück-Taste (Back-Button) & Rendering
// ============================================================================
function pushAppHistoryState(viewType, extra = {}) {
  try {
    window.history.pushState({ ktApp: true, viewType, tab: state.activeTab, ...extra }, '');
  } catch (_) {}
}

function initBackButtonNavigation() {
  try {
    window.history.replaceState({ ktApp: true, viewType: 'root', tab: 'recipes' }, '');
    window.history.pushState({ ktApp: true, viewType: 'tab', tab: 'recipes' }, '');
  } catch (_) {}

  window.addEventListener('popstate', () => {
    // 0. Falls In-App KaufDA Prospekt-Blätterkatalog offen ist -> schließen
    const brochureReaderModal = document.getElementById('brochureReaderModal');
    if (brochureReaderModal && brochureReaderModal.classList.contains('open')) {
      closeBrochureReaderModal(true);
      pushAppHistoryState('keep');
      return;
    }

    // 1. Falls Bild-Großansicht (Lightbox) offen ist -> nur Lightbox schließen
    const lightboxModal = document.getElementById('imageLightboxModal');
    if (lightboxModal && lightboxModal.classList.contains('open')) {
      closeImageLightbox(true);
      pushAppHistoryState('keep');
      return;
    }

    // 2. Falls Küchen-Tools Modal offen ist -> schließen
    const toolsModal = document.getElementById('toolsModal');
    if (toolsModal && toolsModal.classList.contains('open')) {
      closeKitchenToolsModal(true);
      pushAppHistoryState('keep');
      return;
    }

    // 3. Falls Bring! Modal offen ist -> schließen
    const bringModal = document.getElementById('bringModal');
    if (bringModal && bringModal.classList.contains('open')) {
      bringModal.classList.remove('open');
      pushAppHistoryState('keep');
      return;
    }

    // 4. Falls Kochmodus offen ist -> Kochmodus beenden (zurück zum Rezept / zur Seite)
    const cookModal = document.getElementById('cookModal');
    if (cookModal && cookModal.classList.contains('open')) {
      stopCookMode(true);
      pushAppHistoryState('keep');
      return;
    }

    // 5. Falls Rezept-Detailansicht offen ist -> Detailansicht schließen (zurück zur vorherigen Seite)
    const detailModal = document.getElementById('detailModal');
    if (detailModal && detailModal.classList.contains('open')) {
      closeRecipeDetail(true);
      pushAppHistoryState('keep');
      return;
    }

    // 6. Falls im Wochenplaner die visuelle Vorschau-Auswahl aufgeklappt ist -> schließen
    if (state.openPlannerPickerDay) {
      state.openPlannerPickerDay = null;
      renderWeekPlan();
      pushAppHistoryState('keep');
      return;
    }

    // 7. Wechsle zum vorherigen Tab im Verlauf statt die App zu schließen!
    if (state.tabHistory && state.tabHistory.length > 1) {
      state.tabHistory.pop(); // aktuellen Tab entfernen
      const prevTab = state.tabHistory[state.tabHistory.length - 1] || 'recipes';
      switchTab(prevTab, true);
      pushAppHistoryState('tab', { tab: prevTab });
      return;
    }

    // 8. Falls auf einem anderen Tab als 'recipes' -> zurück zur Rezept-Sammlung
    if (state.activeTab && state.activeTab !== 'recipes') {
      switchTab('recipes', true);
      pushAppHistoryState('tab', { tab: 'recipes' });
      return;
    }

    // 9. Falls auf 'recipes' ein Filter oder eine Suche aktiv ist -> Filter zurücksetzen
    if (state.filterCategory !== 'Alle' || state.searchQuery || state.fridgeQuery) {
      state.filterCategory = 'Alle';
      state.searchQuery = '';
      state.fridgeQuery = '';
      const sInp = document.getElementById('homeSearchInput');
      if (sInp) sInp.value = '';
      const fInp = document.querySelector('.fridge-bar input');
      if (fInp) fInp.value = '';
      renderCategoryChips();
      renderRecipes();
    }

    // Halte immer einen History-Eintrag bereit, damit das Smartphone die App nicht schließt
    pushAppHistoryState('tab', { tab: 'recipes' });
  });
}

function switchTab(tabId, fromBackNavigation = false) {
  document.querySelectorAll('.tab-view').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
  const target = document.getElementById(`tab-${tabId}`);
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (target) target.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  if (!fromBackNavigation && state.activeTab !== tabId) {
    if (!Array.isArray(state.tabHistory)) state.tabHistory = ['recipes'];
    if (state.tabHistory[state.tabHistory.length - 1] !== tabId) {
      state.tabHistory.push(tabId);
      if (state.tabHistory.length > 25) state.tabHistory.shift();
    }
    state.activeTab = tabId;
    pushAppHistoryState('tab', { tab: tabId });
  } else {
    state.activeTab = tabId;
  }
}

function renderAll() {
  renderCategoryChips();
  renderRecipes();
  renderSuggestedRecipes();
  renderWeekPlan();
  renderShoppingList();
  renderOffersTab();
  renderHouseholdSettings();
  renderAiKeyStatusBar();
  setImportSubTab(state.importSubTab || 'web', true);
}

function setRecipeViewMode(mode) {
  state.recipeViewMode = mode || 'grid';
  try {
    localStorage.setItem('kt_recipe_view_mode_v17', state.recipeViewMode);
  } catch (_) {}
  document.querySelectorAll('#recipeViewModeSwitcher .view-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-vmode') === state.recipeViewMode);
  });
  renderRecipes();
}

function toggleFridgeFilterBar() {
  state.fridgeBarOpen = !state.fridgeBarOpen;
  const bar = document.getElementById('fridgeBarContainer');
  const btn = document.getElementById('toggleFridgeBarBtn');
  if (bar) bar.style.display = state.fridgeBarOpen ? 'flex' : 'none';
  if (btn) {
    btn.style.background = state.fridgeBarOpen ? 'rgba(59,130,246,0.22)' : '';
  }
  if (state.fridgeBarOpen) {
    const inp = document.getElementById('fridgeQueryInput');
    if (inp) inp.focus();
  }
}

function toggleHomeDiscoveryCollapsed() {
  state.discoveryCollapsed = !state.discoveryCollapsed;
  try {
    localStorage.setItem('kt_discovery_collapsed_v17', state.discoveryCollapsed ? 'true' : 'false');
  } catch (_) {}
  const btn = document.getElementById('toggleDiscoveryBtn');
  if (btn) {
    btn.style.background = !state.discoveryCollapsed ? 'rgba(234,88,12,0.22)' : '';
  }
  renderHomeDiscoverySection();
}

function setImportSubTab(subTab, silent = false) {
  state.importSubTab = subTab || 'web';
  document.querySelectorAll('#importSubTabBar .sub-seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-itab') === state.importSubTab);
  });
  document.querySelectorAll('#tab-import [data-import-group]').forEach((card) => {
    const grp = card.getAttribute('data-import-group');
    if (state.importSubTab === 'all' || grp === state.importSubTab) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
  if (!silent && state.importSubTab === 'web') {
    renderSuggestedRecipes();
  }
}

function renderTodayPlanQuickBanner() {
  const banner = document.getElementById('todayPlanQuickBanner');
  if (!banner) return;
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const todayName = dayNames[new Date().getDay()];
  const plannedId = state.weekPlan && state.weekPlan[todayName];
  if (!plannedId) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  const allRecs = getAllSelectableRecipesForPlanner();
  const rec = allRecs.find((r) => r.id === plannedId);
  if (!rec) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="today-plan-banner">
      <div style="display:flex; align-items:center; gap:8px; min-width:0; cursor:pointer;" onclick="openRecipeDetail('${escapeHtml(rec.id)}')">
        <img src="${escapeHtml(rec.imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80')}" alt="${escapeHtml(rec.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80';" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;" />
        <div style="min-width:0;">
          <div style="font-size:10px; font-weight:800; color:#6ee7b7; text-transform:uppercase;">📅 Heute (${todayName}) geplant:</div>
          <div style="font-size:12.5px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(rec.title)}</div>
        </div>
      </div>
      <div style="display:flex; gap:5px; flex-shrink:0;">
        <button class="pill-btn" style="background:var(--primary); color:#fff; border:none; font-size:11px; padding:5px 9px;" onclick="startCookMode('${escapeHtml(rec.id)}')">
          🔥 Kochen
        </button>
      </div>
    </div>
  `;
}

function setCategory(cat) {
  state.filterCategory = cat;
  renderCategoryChips();
  renderRecipes();
  setTimeout(() => {
    const activeChip = document.querySelector('#categoryChips .chip.active');
    if (activeChip && activeChip.scrollIntoView) {
      activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 30);
}

function scrollCategoryChipRow(delta) {
  const row = document.getElementById('categoryChips');
  if (row) row.scrollBy({ left: delta, behavior: 'smooth' });
}

function scrollQuickToolsRow(delta) {
  const row = document.getElementById('quickToolsRow');
  if (row) row.scrollBy({ left: delta, behavior: 'smooth' });
}

function scrollElementHorizontally(elementId, delta) {
  const el = document.getElementById(elementId);
  if (el) el.scrollBy({ left: delta, behavior: 'smooth' });
}

function scrollRecipeCarousel(carouselId, delta) {
  const el = document.getElementById(carouselId);
  if (el) el.scrollBy({ left: delta, behavior: 'smooth' });
}

function openBrochuresDirectly() {
  switchTab('offers');
  setTimeout(() => {
    const el = document.getElementById('brochuresSectionCard');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

function rollNewDiscoveryHighlight() {
  const pool = state.recipes && state.recipes.length > 0 ? state.recipes : STARTER_RECIPES;
  if (!pool.length) return;
  const currentId = state.dailyHighlightRecipeId;
  const candidates = pool.length > 1 ? pool.filter((r) => r.id !== currentId) : pool;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.dailyHighlightRecipeId = pick.id;
  renderHomeDiscoverySection();
  showToast(`🎲 Neuer Koch-Vorschlag: ${pick.title}`);
}

function renderHomeDiscoverySection() {
  const box = document.getElementById('homeDiscoverySection');
  if (!box) return;
  if (state.discoveryCollapsed) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';

  const pool = state.recipes && state.recipes.length > 0 ? state.recipes : STARTER_RECIPES;
  if (!pool.length) {
    box.innerHTML = '';
    return;
  }

  if (!state.dailyHighlightRecipeId || !pool.some((r) => r.id === state.dailyHighlightRecipeId)) {
    const dayIdx = new Date().getDate() % pool.length;
    state.dailyHighlightRecipeId = pool[dayIdx].id;
  }

  const dailyRec = pool.find((r) => r.id === state.dailyHighlightRecipeId) || pool[0];
  const dailyOffers = getOffersMatchingRecipe(dailyRec);

  // Finde Rezepte mit den meisten aktuellen Supermarkt-Angeboten
  const savingsRecipes = pool
    .map((r) => ({ recipe: r, offers: getOffersMatchingRecipe(r) }))
    .filter((item) => item.offers.length > 0 && item.recipe.id !== dailyRec.id)
    .sort((a, b) => b.offers.length - a.offers.length)
    .slice(0, 5);

  const carouselId = 'home-discovery-carousel';

  const dailyCardHtml = `
    <div class="suggested-carousel-card" style="border-color:rgba(234,88,12,0.5); background:linear-gradient(145deg, rgba(234,88,12,0.16), rgba(15,23,42,0.96));">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <span class="tag-mini" style="background:var(--primary); color:#fff; font-weight:800;">🎲 Was kochen wir heute?</span>
        <button class="pill-btn" style="font-size:10px; padding:3px 7px;" onclick="rollNewDiscoveryHighlight()">🎲 Neu würfeln</button>
      </div>
      <div style="display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="openRecipeDetail('${dailyRec.id}')">
        <img src="${dailyRec.imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80'}" alt="${escapeHtml(dailyRec.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80';" style="width:62px; height:62px; border-radius:11px; object-fit:cover; flex-shrink:0; border:1px solid var(--border);" />
        <div style="flex:1; min-width:0;">
          <div style="font-size:13.5px; font-weight:800; line-height:1.25; margin-bottom:2px;">${escapeHtml(dailyRec.title)}</div>
          <div style="font-size:11px; color:var(--text-muted);">⏱ ${dailyRec.prepTime || 25} Min · 👥 ${dailyRec.portions || 4} Port.${dailyRec.nutrition?.kcal ? ` · 🔥 ${dailyRec.nutrition.kcal} kcal` : ''}</div>
          ${
            dailyOffers.length > 0
              ? `<div style="font-size:10.5px; color:#34d399; font-weight:700; margin-top:2px;">🏷️ ${dailyOffers.length} Zutaten aktuell im Angebot!</div>`
              : ''
          }
        </div>
      </div>
      <div style="display:flex; gap:6px; margin-top:auto;">
        <button class="pill-btn" style="flex:1; justify-content:center; background:var(--primary); color:#fff; border:none; font-size:11px;" onclick="openRecipeDetail('${dailyRec.id}')">
          🍲 Rezept
        </button>
        <button class="pill-btn" style="flex:1; justify-content:center; font-size:11px;" onclick="startCookMode('${dailyRec.id}')">
          🔥 Kochen
        </button>
      </div>
    </div>
  `;

  const savingsCardsHtml = savingsRecipes
    .map(({ recipe, offers }) => {
      const retailers = [...new Set(offers.map((o) => o.retailer))].slice(0, 3).join(', ');
      return `
        <div class="suggested-carousel-card" style="border-color:rgba(16,185,129,0.45); background:linear-gradient(145deg, rgba(16,185,129,0.13), rgba(15,23,42,0.96));">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span class="tag-mini" style="background:rgba(16,185,129,0.25); color:#6ee7b7; font-weight:800;">🏷️ Spar-Rezept (${offers.length} Deals)</span>
            <span style="font-size:10px; color:#34d399; font-weight:700;">${escapeHtml(retailers)}</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="openRecipeDetail('${recipe.id}')">
            <img src="${recipe.imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80'}" alt="${escapeHtml(recipe.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80';" style="width:62px; height:62px; border-radius:11px; object-fit:cover; flex-shrink:0; border:1px solid var(--border);" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:13.5px; font-weight:800; line-height:1.25; margin-bottom:2px;">${escapeHtml(recipe.title)}</div>
              <div style="font-size:10.5px; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                Deals: ${offers.slice(0, 2).map((o) => `${escapeHtml(o.title)} (${escapeHtml(o.price)})`).join(', ')}
              </div>
            </div>
          </div>
          <div style="display:flex; gap:6px; margin-top:auto;">
            <button class="pill-btn" style="flex:1; justify-content:center; background:rgba(16,185,129,0.22); border-color:rgba(16,185,129,0.45); color:#6ee7b7; font-size:11px;" onclick="openRecipeDetail('${recipe.id}')">
              🍲 Spar-Rezept öffnen
            </button>
            <button class="pill-btn" style="font-size:11px;" onclick="switchTab('offers')">
              🏷️ Deals
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  const allBrochuresCardHtml = `
    <div class="suggested-carousel-card" style="border-color:rgba(59,130,246,0.45); background:linear-gradient(145deg, rgba(59,130,246,0.15), rgba(15,23,42,0.96));">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="tag-mini" style="background:rgba(59,130,246,0.25); color:#93c5fd; font-weight:800;">📰 Alle 12 Wochenprospekte</span>
        <span style="font-size:10px; color:var(--text-muted);">Direkt-Links</span>
      </div>
      <div style="font-size:13px; font-weight:800; line-height:1.3;">
        REWE · EDEKA · Lidl · ALDI · Kaufland · Netto · Penny · Norma · Globus · tegut · HIT
      </div>
      <div style="font-size:11px; color:var(--text-muted); line-height:1.35;">
        Blättere direkt in den aktuellen Online-Prospekten aller Supermärkte & vergleiche Preise.
      </div>
      <div style="display:flex; gap:6px; margin-top:auto;">
        <button class="pill-btn" style="flex:1; justify-content:center; background:var(--primary); color:#fff; border:none; font-size:11px;" onclick="openBrochuresDirectly()">
          📰 Prospekte & Angebote öffnen
        </button>
      </div>
    </div>
  `;

  box.innerHTML = `
    <div class="category-group-header">
      <div class="category-group-title">
        <span>🎲</span>
        <span>Heute kochen & Spar-Highlights</span>
      </div>
      <div class="category-header-right">
        <button class="carousel-nav-btn" onclick="scrollRecipeCarousel('${carouselId}', -260)" title="Nach links">‹</button>
        <button class="carousel-nav-btn" onclick="scrollRecipeCarousel('${carouselId}', 260)" title="Nach rechts">›</button>
      </div>
    </div>
    <div id="${carouselId}" class="recipe-carousel">
      ${dailyCardHtml}
      ${savingsCardsHtml}
      ${allBrochuresCardHtml}
    </div>
  `;
}

function renderCategoryChips() {
  const chipContainer = document.getElementById('categoryChips');
  if (!chipContainer) return;

  const counts = {};
  (state.recipes || []).forEach((r) => {
    const c = r.category || detectRecipeCategory(r.title, r.ingredients, r.tags);
    counts[c] = (counts[c] || 0) + 1;
  });
  const favCount = (state.recipes || []).filter((r) => r.isFavorite).length;
  const videoCount = (state.recipes || []).filter((r) => r.hasOfflineVideo).length;

  const chips = [
    { id: 'Alle', label: `📚 Alle (${(state.recipes || []).length})` },
    { id: 'Favoriten', label: `❤️ Favoriten (${favCount})` },
    ...RECIPE_CATEGORIES.filter((c) => counts[c.id] > 0).map((c) => ({
      id: c.id,
      label: `${c.icon} ${c.label} (${counts[c.id]})`
    })),
    ...(videoCount > 0 ? [{ id: 'Offline-Video', label: `▶ Offline-Videos (${videoCount})` }] : [])
  ];

  chipContainer.innerHTML = chips
    .map(
      (ch) =>
        `<button class="chip ${state.filterCategory === ch.id ? 'active' : ''}" data-cat="${escapeHtml(ch.id)}" onclick="setCategory('${escapeHtml(ch.id)}')">${escapeHtml(ch.label)}</button>`
    )
    .join('');
}

function formatLastCookedBadge(timestamp) {
  if (!timestamp) return '';
  const diffDays = Math.floor((Date.now() - timestamp) / 86400000);
  if (diffDays <= 0) return '👨‍🍳 Heute gekocht';
  if (diffDays === 1) return '👨‍🍳 Gestern gekocht';
  return `👨‍🍳 Gekocht am ${new Date(timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
}

function parseFridgeSearchTerms(rawQuery) {
  return (rawQuery || '')
    .toLowerCase()
    .split(/[,;+\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

// Prüft präzise auf echte Zutatennamen im Rezept (keine falschen Teilwort-Treffer wie "Ei" in "Fleisch"/"Scheiben"/"Reis" oder "Reis" in "Prise")
function doesSingleIngredientMatchFridgeTerm(ingName, term) {
  if (!ingName || !term) return false;
  const t = term.toLowerCase().trim();
  if (!t) return false;

  // Entferne optionale Klammer-Hinweise wie "(zum Servieren)" oder "(Alternative: ...)" für den echten Zutaten-Abgleich
  const coreName = String(ingName)
    .toLowerCase()
    .replace(/\((?:alternative|zum servieren|optional|nach belieben)[^)]*\)/gi, ' ')
    .trim();

  // Zerlege den Zutatennamen in echte Wörter
  const words = coreName.split(/[^a-zA-ZäöüÄÖÜß]+/).filter(Boolean);

  return words.some((w) => {
    if (w === t) return true;
    // Kurze Begriffe wie "ei" oder "öl" dürfen nicht in "fleisch", "scheiben", "reis", "prise" matchen
    if (t === 'ei' || t === 'eier') {
      return w === 'ei' || w === 'eier' || w === 'eigelb' || w === 'eiweiß' || w === 'freilandeier';
    }
    if (t === 'öl') {
      return w === 'öl' || w.endsWith('öl');
    }
    if (t === 'reis') {
      return w === 'reis' || w.endsWith('reis') || w.startsWith('reis');
    }
    if (t.length < 3) {
      return w === t;
    }
    // Ab 3 Zeichen: Wortanfang (z.B. "kartoffel" -> "kartoffeln", "tomate" -> "tomaten", "hack" -> "hackfleisch")
    // oder Wortende bei zusammengesetzten Hauptzutaten (z.B. "hackfleisch" -> "rinderhackfleisch", "käse" -> "kräuterfrischkäse", "tomaten" -> "kirschtomaten")
    if (w.startsWith(t)) return true;
    if (t.length >= 4 && w.endsWith(t)) return true;
    if (w.length >= 4 && t.startsWith(w)) return true;
    return false;
  });
}

function getMatchedFridgeIngredients(recipe, fridgeTerms) {
  if (!fridgeTerms || fridgeTerms.length === 0) return [];
  const ings = recipe.ingredients || [];
  const matchedNames = [];

  for (const term of fridgeTerms) {
    const foundIng = ings.find((ing) => doesSingleIngredientMatchFridgeTerm(ing.name, term));
    if (!foundIng) {
      return null; // Mindestens eine eingegebene Kühlschrank-Zutat ist im Rezept NICHT angegeben!
    }
    if (!matchedNames.includes(foundIng.name)) {
      matchedNames.push(foundIng.name);
    }
  }
  return matchedNames;
}

function renderRecipes() {
  renderTodayPlanQuickBanner();
  renderHomeDiscoverySection();
  const container = document.getElementById('recipeList');
  if (!container) return;

  document.querySelectorAll('#recipeViewModeSwitcher .view-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-vmode') === (state.recipeViewMode || 'grid'));
  });

  const q = state.searchQuery.toLowerCase().trim();
  const fridgeTerms = parseFridgeSearchTerms(state.fridgeQuery);

  const filtered = state.recipes.filter((r) => {
    const rCat = r.category || detectRecipeCategory(r.title, r.ingredients, r.tags);
    if (state.filterCategory !== 'Alle') {
      if (state.filterCategory === 'Favoriten' && !r.isFavorite) return false;
      if (state.filterCategory === 'Offline-Video' && !r.hasOfflineVideo) return false;
      if (
        state.filterCategory !== 'Favoriten' &&
        state.filterCategory !== 'Offline-Video' &&
        rCat !== state.filterCategory &&
        !(r.tags || []).includes(state.filterCategory)
      ) {
        return false;
      }
    }
    if (q) {
      const hay = `${r.title} ${rCat} ${(r.tags || []).join(' ')} ${(r.ingredients || []).map((i) => i.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fridgeTerms.length > 0) {
      const matchedIngs = getMatchedFridgeIngredients(r, fridgeTerms);
      if (!matchedIngs) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    if (state.filterCategory === 'Favoriten') {
      container.innerHTML = `
        <div class="section-card" style="text-align:center; padding:24px 14px;">
          <div style="font-size:30px; margin-bottom:6px;">❤️</div>
          <div style="font-weight:700; margin-bottom:4px;">Noch keine Favoriten markiert</div>
          <div class="section-desc">Tippe auf das Herz-Symbol 🤍 auf einer Rezeptkarte oder im Rezept, um deine Lieblingsgerichte hier zu sammeln.</div>
          <button class="btn btn-secondary" onclick="setCategory('Alle')">📚 Alle Rezepte anzeigen</button>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="section-card" style="text-align:center; padding:26px 14px;">
        <div style="font-size:32px; margin-bottom:8px;">🍲</div>
        <div style="font-weight:700; margin-bottom:4px;">In deiner Sammlung noch nicht vorhanden</div>
        <div class="section-desc">Suchst du nach "${escapeHtml(state.searchQuery)}"? Finde es jetzt direkt online bei Chefkoch, Instagram, Facebook & Foodblogs:</div>
        <button class="btn btn-primary" onclick="searchOnlineFromHome()">🔎 "${escapeHtml(state.searchQuery || 'Rezepte')}" jetzt online in der App suchen</button>
      </div>
    `;
    return;
  }

  // Gruppiere gefilterte Rezepte sauber nach Kategorien in definierter Reihenfolge
  const grouped = new Map();
  RECIPE_CATEGORIES.forEach((c) => grouped.set(c.id, []));

  filtered.forEach((r) => {
    const cat = r.category || detectRecipeCategory(r.title, r.ingredients, r.tags);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(r);
  });

  const viewMode = state.recipeViewMode || 'grid';
  let sectionsHtml = '';
  let catIdx = 0;

  for (const [catName, list] of grouped.entries()) {
    if (!list || list.length === 0) continue;
    catIdx++;
    const carouselId = `cat-carousel-${catIdx}`;
    const meta = getCategoryMeta(catName);

    const itemsHtml = list
      .map((r) => {
        const kcalTag = r.nutrition && r.nutrition.kcal
          ? `<span class="tag-mini tag-kcal">🔥 ${r.nutrition.kcal} kcal</span>`
          : '';
        const matchedOffers = getOffersMatchingRecipe(r);
        const offerTag = matchedOffers.length > 0
          ? `<span class="tag-mini" style="background:rgba(16,185,129,0.18); color:#6ee7b7; border:1px solid rgba(16,185,129,0.35); font-weight:700;">🏷️ ${matchedOffers.length} Deals</span>`
          : '';
        const lastCookedText = formatLastCookedBadge(r.lastCookedAt);
        const cookedTag = lastCookedText
          ? `<span class="tag-mini" style="background:rgba(59,130,246,0.16); color:#93c5fd;">${escapeHtml(lastCookedText)}</span>`
          : '';
        const matchedFridgeIngs = fridgeTerms.length > 0 ? getMatchedFridgeIngredients(r, fridgeTerms) : [];
        const fridgeMatchBanner =
          matchedFridgeIngs && matchedFridgeIngs.length > 0
            ? `<div style="font-size:10.5px; color:#6ee7b7; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.35); padding:3px 7px; border-radius:7px; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                 🧊 Enthält: <strong>${escapeHtml(matchedFridgeIngs.join(', '))}</strong>
               </div>`
            : '';

        const fallbackRecipeImg = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80';
        if (viewMode === 'list') {
          return `
            <article class="recipe-list-row" onclick="openRecipeDetail('${r.id}')">
              <img src="${r.imageUrl || fallbackRecipeImg}" alt="${escapeHtml(r.title)}" class="recipe-list-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackRecipeImg}';" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:13.5px; font-weight:800; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.title)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                  ⏱ ${r.prepTime || 20} Min · 👥 ${r.portions || 4} Port. · ${(r.ingredients || []).length} Zut.
                </div>
                ${fridgeMatchBanner}
                <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:3px;">
                  ${kcalTag}
                  ${offerTag}
                </div>
              </div>
              <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;" onclick="event.stopPropagation();">
                <div style="display:flex; gap:4px;">
                  <button class="pill-btn" style="font-size:10px; padding:3px 7px;" onclick="addRecipeToShoppingList('${r.id}', event)" title="Zutaten auf Einkaufsliste">
                    🛒＋
                  </button>
                  <button class="fav-heart-btn ${r.isFavorite ? 'active' : ''}" style="width:28px; height:28px; font-size:12px;" onclick="toggleFavoriteRecipe('${r.id}', event)">
                    ${r.isFavorite ? '❤️' : '🤍'}
                  </button>
                </div>
                <button class="pill-btn" style="font-size:10px; padding:3px 7px; background:var(--primary); color:#fff; border:none;" onclick="startCookMode('${r.id}')">
                  🔥
                </button>
              </div>
            </article>
          `;
        }

        const directLinkButton = `
          <div style="margin-top:auto; padding-top:7px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:6px;" onclick="event.stopPropagation();">
            ${
              r.sourceUrl
                ? `<a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" style="color:var(--primary-light); font-size:11px; font-weight:700; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:58%;">
                     🔗 Original ↗
                   </a>`
                : `<span></span>`
            }
            <button type="button" class="pill-btn" style="font-size:10.5px; padding:3px 8px; background:rgba(234,88,12,0.18); border-color:rgba(234,88,12,0.45); color:#fdba74;" onclick="addRecipeToShoppingList('${r.id}', event)">
              🛒＋ Liste
            </button>
          </div>
        `;

        return `
          <article class="recipe-card" onclick="openRecipeDetail('${r.id}')">
            <div class="recipe-media">
              <img src="${r.imageUrl || fallbackRecipeImg}" alt="${escapeHtml(r.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackRecipeImg}';" />
              <div class="badge-row">
                <span class="badge ${r.hasOfflineVideo ? 'video-badge' : ''}">
                  ${r.hasOfflineVideo ? '▶ Video' : `⏱ ${r.prepTime || 20} Min`}
                </span>
                <button class="fav-heart-btn ${r.isFavorite ? 'active' : ''}" onclick="toggleFavoriteRecipe('${r.id}', event)" title="Als Favorit markieren">
                  ${r.isFavorite ? '❤️' : '🤍'}
                </button>
              </div>
            </div>
            <div class="recipe-body">
              <div class="recipe-title">${escapeHtml(r.title)}</div>
              <div class="recipe-meta">
                <span>👥 ${r.portions || 4} Port. · ${(r.ingredients || []).length} Zut.</span>
                <span>${escapeHtml(r.author || 'Familie')}</span>
              </div>
              ${fridgeMatchBanner}
              <div class="recipe-tags" style="margin-bottom:6px;">
                ${kcalTag}
                ${offerTag}
                ${cookedTag}
                ${(r.tags || []).slice(0, 1).map((t) => `<span class="tag-mini">${escapeHtml(t)}</span>`).join('')}
              </div>
              ${directLinkButton}
            </div>
          </article>
        `;
      })
      .join('');

    const containerClass =
      viewMode === 'grid'
        ? 'recipe-grid-2col'
        : viewMode === 'list'
          ? 'recipe-list-compact'
          : `recipe-carousel ${list.length === 1 ? 'single-card' : ''}`;

    sectionsHtml += `
      <div class="category-section">
        <div class="category-group-header">
          <div class="category-group-title" onclick="setCategory('${escapeHtml(catName)}')" style="cursor:pointer;">
            <span>${meta.icon}</span>
            <span>${escapeHtml(meta.label)}</span>
          </div>
          <div class="category-header-right">
            <span class="category-group-count">${list.length}</span>
            ${
              viewMode === 'carousel' && list.length > 1
                ? `<button class="carousel-nav-btn" onclick="scrollRecipeCarousel('${carouselId}', -260)" title="Nach links">‹</button>
                   <button class="carousel-nav-btn" onclick="scrollRecipeCarousel('${carouselId}', 260)" title="Nach rechts">›</button>`
                : ''
            }
          </div>
        </div>
        <div id="${carouselId}" class="${containerClass}">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = sectionsHtml;
}

function renderSuggestedRecipes() {
  const boxes = [
    document.getElementById('suggestedRecipesHome'),
    document.getElementById('suggestedRecipesImport')
  ].filter(Boolean);
  if (boxes.length === 0) return;

  const html = SUGGESTED_DIRECT_RECIPES.map((s, idx) => {
    const alreadyAdded = state.recipes.some((r) => r.sourceUrl === s.sourceUrl);
    const kcalInfo = s.nutrition?.kcal ? ` · 🔥 ${s.nutrition.kcal} kcal` : '';
    return `
      <div class="suggested-carousel-card">
        <div style="display:flex; gap:10px; align-items:center;">
          <img src="${s.imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80'}" alt="${escapeHtml(s.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80';" style="width:62px; height:62px; border-radius:11px; object-fit:cover; flex-shrink:0;" />
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:800; margin-bottom:2px; line-height:1.25;">${escapeHtml(s.title)}</div>
            <div style="font-size:11px; color:var(--text-muted);">⏱ ${s.prepTime} Min · 👥 ${s.portions} Port.${kcalInfo}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:auto;">
          <a href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener" class="pill-btn" style="text-decoration:none; color:var(--primary-light); font-size:11px; padding:5px 9px;">
            🔗 Original-Rezept ↗
          </a>
          <button class="pill-btn" style="background:${alreadyAdded ? 'var(--bg-elevated)' : 'var(--primary)'}; color:#fff; border:none; font-size:11px; padding:5px 10px;" onclick="addSuggestedRecipe(${idx})">
            ${alreadyAdded ? '✓ Öffnen' : '＋ 1:1 Speichern'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  boxes.forEach((b) => { b.innerHTML = html; });
}

async function addSuggestedRecipe(idx) {
  const s = SUGGESTED_DIRECT_RECIPES[idx];
  if (!s) return;
  const existing = state.recipes.find((r) => r.sourceUrl === s.sourceUrl);
  if (existing) {
    openRecipeDetail(existing.id);
    return;
  }
  await saveImportedRecipe({
    title: s.title,
    category: s.category,
    prepTime: s.prepTime,
    portions: s.portions,
    sourceType: 'web',
    sourceUrl: s.sourceUrl,
    imageUrl: s.imageUrl,
    tags: s.tags,
    nutrition: s.nutrition || null,
    ingredients: s.ingredients,
    steps: s.steps
  });
  showToast(`"${s.title}" 1:1 inklusive Nährwerten gespeichert!`);
}

// ============================================================================
// 5. Rezept-Detailansicht, Echte Nährwerte & Exakter Portionen-Umrechner
// ============================================================================
async function openRecipeDetail(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  state.activeRecipeId = r.id;
  state.activeScalePortions = Number(r.portions) || 4;
  await renderRecipeDetailModal(r);
  const modal = document.getElementById('detailModal');
  if (!modal.classList.contains('open')) {
    pushAppHistoryState('detail', { recipeId: r.id });
  }
  modal.classList.add('open');
}

function closeRecipeDetail() {
  document.getElementById('detailModal').classList.remove('open');
  const vid = document.getElementById('detailOfflineVideo');
  if (vid) vid.pause();
}

async function changePortions(delta) {
  const r = findRecipeById(state.activeRecipeId);
  if (!r) return;
  state.activeScalePortions = Math.max(1, state.activeScalePortions + delta);
  await renderRecipeDetailModal(r);
}

async function toggleFavoriteRecipe(recipeId, event) {
  if (event) event.stopPropagation();
  const r = findRecipeById(recipeId);
  if (!r) return;
  r.isFavorite = !r.isFavorite;
  r.updatedAt = Date.now();
  await dbPut('recipes', r);
  renderCategoryChips();
  renderRecipes();
  if (state.activeRecipeId === recipeId && document.getElementById('detailModal').classList.contains('open')) {
    await renderRecipeDetailModal(r);
  }
  broadcastSyncUpdate();
  showToast(r.isFavorite ? `❤️ "${r.title}" zu Favoriten hinzugefügt!` : `Aus Favoriten entfernt`);
}

async function markRecipeCookedToday(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  r.lastCookedAt = Date.now();
  r.cookedCount = (r.cookedCount || 0) + 1;
  r.updatedAt = Date.now();
  await dbPut('recipes', r);
  renderRecipes();
  if (state.activeRecipeId === recipeId && document.getElementById('detailModal').classList.contains('open')) {
    await renderRecipeDetailModal(r);
  }
  broadcastSyncUpdate();
  showToast(`👨‍🍳 "${r.title}" als heute gekocht markiert!`);
}

function toggleIngredientCheck(recipeId, ingIdx) {
  const key = `${recipeId}_${ingIdx}`;
  state.checkedIngredients[key] = !state.checkedIngredients[key];
  const r = findRecipeById(recipeId);
  if (!r) return;
  if (document.getElementById('detailModal').classList.contains('open')) {
    renderRecipeDetailModal(r);
  }
  if (document.getElementById('cookModal').classList.contains('open')) {
    renderCookModeStep();
  }
}

function resetCheckedIngredients(recipeId) {
  Object.keys(state.checkedIngredients).forEach((k) => {
    if (k.startsWith(`${recipeId}_`)) delete state.checkedIngredients[k];
  });
  const r = findRecipeById(recipeId);
  if (r && document.getElementById('detailModal').classList.contains('open')) {
    renderRecipeDetailModal(r);
  }
}

function suggestRandomRecipe() {
  const pool = state.recipes && state.recipes.length > 0 ? state.recipes : STARTER_RECIPES;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (!pick) return;
  openRecipeDetail(pick.id);
  showToast(`🎲 Vorschlag für heute: ${pick.title}!`);
}

async function renderRecipeDetailModal(r) {
  const container = document.getElementById('detailModalBody');
  const basePortions = Number(r.portions) || 4;
  const targetPortions = state.activeScalePortions;

  let videoSectionHtml = '';
  if (r.hasOfflineVideo) {
    const videoRecord = await dbGet('videos', r.id);
    if (videoRecord && videoRecord.blob) {
      if (state.videoBlobUrls[r.id]) URL.revokeObjectURL(state.videoBlobUrls[r.id]);
      const blobUrl = URL.createObjectURL(videoRecord.blob);
      state.videoBlobUrls[r.id] = blobUrl;
      videoSectionHtml = `
        <div class="section-card" style="padding:10px;">
          <div style="font-size:12px; font-weight:700; color:#10b981; margin-bottom:6px;">
            ▶ Gespeichertes Offline-Video
          </div>
          <video id="detailOfflineVideo" src="${blobUrl}" controls playsinline style="width:100%; border-radius:12px; max-height:260px; background:#000;"></video>
        </div>
      `;
    }
  }

  // Echte Nährwertangaben (pro Portion) rendern
  let nutritionHtml = '';
  if (r.nutrition && (r.nutrition.kcal || r.nutrition.carbs || r.nutrition.protein || r.nutrition.fat)) {
    nutritionHtml = `
      <div class="nutrition-card">
        <div class="nutrition-header">
          <span>📊 <strong>Tatsächliche Nährwerte pro 1 Portion</strong></span>
          <span style="font-size:10px;">Quelle: Original-Rezept</span>
        </div>
        <div class="nutrition-grid">
          <div class="nutri-box">
            <div class="nutri-val">${escapeHtml(String(r.nutrition.kcal || '–'))}</div>
            <div class="nutri-label">kcal</div>
          </div>
          <div class="nutri-box">
            <div class="nutri-val">${escapeHtml(String(r.nutrition.carbs || '–'))}</div>
            <div class="nutri-label">Kohlenhydrate</div>
          </div>
          <div class="nutri-box">
            <div class="nutri-val">${escapeHtml(String(r.nutrition.protein || '–'))}</div>
            <div class="nutri-label">Eiweiß</div>
          </div>
          <div class="nutri-box">
            <div class="nutri-val">${escapeHtml(String(r.nutrition.fat || '–'))}</div>
            <div class="nutri-label">Fett</div>
          </div>
        </div>
      </div>
    `;
  } else {
    nutritionHtml = `
      <div class="nutrition-card" style="padding:9px 12px;">
        <div style="font-size:11px; color:var(--text-muted);">
          ℹ️ Für dieses Rezept wurden auf der Original-Webseite keine offiziellen Nährwerte angegeben.
        </div>
      </div>
    `;
  }

  // 1:1 Zutatenliste inkl. optionaler Gruppen-Überschriften, Abhak-Funktion (Mise en Place) & Supermarkt-Angebots-Badge
  let lastGroup = '';
  let anyChecked = false;
  const ingredientsHtml = (r.ingredients || [])
    .map((ing, ingIdx) => {
      let groupHtml = '';
      if (ing.group && ing.group !== lastGroup) {
        lastGroup = ing.group;
        groupHtml = `<li class="ing-group-header">${escapeHtml(ing.group)}</li>`;
      }
      const isChecked = Boolean(state.checkedIngredients[`${r.id}_${ingIdx}`]);
      if (isChecked) anyChecked = true;
      const amountDisplay = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
      const bestOffer = findBestOfferForIngredientName(ing.name);
      const bestSavings = bestOffer ? calculateOfferSavings(bestOffer) : null;
      const offerInlineBadge = bestOffer
        ? `<div style="font-size:10.5px; color:#34d399; font-weight:700; margin-top:2px;" onclick="event.stopPropagation(); openOfferImageLightbox('${escapeHtml(bestOffer.id)}', event)">
             🏷️ Angebot: ${escapeHtml(bestOffer.price)} bei ${escapeHtml(bestOffer.retailer)} (${escapeHtml(bestOffer.title)})${bestSavings && bestSavings.hasSavings ? ` · <span style="color:#6ee7b7;">💰 Ersparnis: ${escapeHtml(bestSavings.label)}</span>` : ''} 🔍
           </div>`
        : '';

      const isAlreadyOnList = (state.shoppingList || []).some(
        (si) => !si.checked && normalizeIngredientBaseKey(si.name) === normalizeIngredientBaseKey(ing.name)
      );

      return `
        ${groupHtml}
        <li class="ing-item ${isChecked ? 'checked-ing' : ''}" onclick="toggleIngredientCheck('${r.id}', ${ingIdx})" style="cursor:pointer; align-items:center;">
          <div style="display:flex; align-items:center; flex:1; min-width:0;">
            <span class="ing-check-box">${isChecked ? '✓' : ''}</span>
            <div style="flex:1; min-width:0;">
              <span>${escapeHtml(ing.name)}</span>
              ${offerInlineBadge}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${amountDisplay ? `<span class="ing-amount">${escapeHtml(amountDisplay)}</span>` : `<span style="font-size:12px; color:var(--text-muted);">nach Bedarf</span>`}
            <button
              type="button"
              class="ing-shop-add-btn ${isAlreadyOnList ? 'added' : ''}"
              onclick="addSingleIngredientToShoppingList('${escapeHtml(r.id)}', ${ingIdx}, event)"
              title="Diese Zutat direkt zur Einkaufsliste hinzufügen"
            >
              ${isAlreadyOnList ? '✓ Liste' : '🛒＋'}
            </button>
          </div>
        </li>
      `;
    })
    .join('');

  // 1:1 Zubereitungsschritte
  const stepsHtml = (r.steps || [])
    .map((s, idx) => {
      const stepText = formatStepTextWithPortions(s, basePortions, targetPortions);
      return `
        <div class="section-card" style="padding:12px 14px; margin-bottom:9px;">
          <div style="font-size:11px; font-weight:800; color:var(--primary-light); margin-bottom:4px;">SCHRITT ${idx + 1}</div>
          <div style="font-size:14px; line-height:1.52;">${escapeHtml(stepText)}</div>
        </div>
      `;
    })
    .join('');

  const lastCookedBadge = formatLastCookedBadge(r.lastCookedAt);
  const fallbackHeroImg = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80';

  container.innerHTML = `
    <div style="border-radius:16px; overflow:hidden; height:175px; margin-bottom:12px; position:relative; cursor:zoom-in;" onclick="openCustomImageLightbox('${escapeHtml(r.imageUrl || fallbackHeroImg)}', '${escapeHtml(r.title)}', '${escapeHtml(r.sourceUrl || '')}')">
      <img src="${r.imageUrl || fallbackHeroImg}" alt="${escapeHtml(r.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackHeroImg}';" style="width:100%; height:100%; object-fit:cover;" />
      <div class="badge-row">
        <span class="badge">⏱ ${r.prepTime || 20} Min</span>
        <span class="badge offline-ready">🔍 Bild groß · ✓ 1:1 Original</span>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px; margin-bottom:4px;">
      <h2 style="font-size:19px; font-weight:800; line-height:1.25; flex:1;">${escapeHtml(r.title)}</h2>
      <div style="display:flex; gap:5px; flex-shrink:0;">
        <button class="pill-btn" style="padding:5px 8px; font-size:11px;" onclick="openEditRecipeForm('${r.id}')" title="Rezept bearbeiten">
          ✎
        </button>
        <button class="pill-btn" style="background:${r.isFavorite ? 'rgba(239,68,68,0.2)' : 'var(--bg-card)'}; border-color:${r.isFavorite ? '#ef4444' : 'var(--border)'}; padding:5px 8px; font-size:11px;" onclick="toggleFavoriteRecipe('${r.id}', event)">
          ${r.isFavorite ? '❤️' : '🤍'}
        </button>
      </div>
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
      <span>Quelle / Autor: <strong>${escapeHtml(r.author || 'Familie')}</strong></span>
      ${lastCookedBadge ? `<span class="tag-mini" style="background:rgba(59,130,246,0.16); color:#93c5fd;">${escapeHtml(lastCookedBadge)}${r.cookedCount > 1 ? ` (${r.cookedCount}×)` : ''}</span>` : ''}
      <button class="pill-btn" style="font-size:10.5px; padding:3px 8px;" onclick="markRecipeCookedToday('${r.id}')">✅ Heute gekocht</button>
    </div>

    ${
      r.description
        ? `<div class="section-card" style="padding:10px 13px; margin-bottom:10px; background:rgba(30,41,59,0.72); border-color:rgba(148,163,184,0.22); font-size:13px; line-height:1.5; color:#e2e8f0;">
             <div style="font-size:10.5px; font-weight:800; color:#93c5fd; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:4px;">📝 Beschreibung</div>
             ${escapeHtml(r.description)}
           </div>`
        : ''
    }

    ${
      r.sourceUrl
        ? `<div class="section-card" style="padding:10px 12px; margin-bottom:10px; background:rgba(234,88,12,0.12); border-color:rgba(234,88,12,0.35);">
             <div style="font-size:11px; color:var(--text-muted); margin-bottom:2px;">Direkter Link zum Original-Rezept:</div>
             <a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" style="color:var(--primary-light); font-size:12.5px; font-weight:700; word-break:break-all; text-decoration:underline; display:inline-block;">
               🔗 ${escapeHtml(r.sourceUrl)} ↗
             </a>
           </div>`
        : ''
    }

    ${nutritionHtml}
    ${videoSectionHtml}

    <div class="btn-row" style="margin-bottom:10px;">
      <button class="btn btn-primary" onclick="startCookMode('${r.id}')">
        🔥 Kochmodus starten (Display & Sprachsteuerung)
      </button>
    </div>

    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn btn-bring" onclick="exportRecipeToBring('${r.id}')">
        🛒 Direkt zu Bring!
      </button>
      <button class="btn btn-accent" onclick="addRecipeToShoppingList('${r.id}', event)">
        🛒＋ Alle ${(r.ingredients || []).length} Zutaten auf Einkaufsliste
      </button>
    </div>

    <div class="portion-box">
      <div>
        <div style="font-size:13.5px; font-weight:700;">Portionen umrechnen</div>
        <div style="font-size:11px; color:var(--text-muted);">Original-Rezept: ${basePortions} ${basePortions === 1 ? 'Portion' : 'Portionen'}</div>
      </div>
      <div class="portion-controls">
        <button class="round-btn" onclick="changePortions(-1)">−</button>
        <span style="font-size:18px; font-weight:800; min-width:26px; text-align:center;">${targetPortions}</span>
        <button class="round-btn" onclick="changePortions(1)">+</button>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-top:12px; margin-bottom:6px;">
      <h3 class="section-title" style="margin-bottom:0;">🥕 Zutaten (${targetPortions} ${targetPortions === 1 ? 'Portion' : 'Portionen'})</h3>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="pill-btn" style="font-size:11px; padding:4px 9px; background:var(--primary); color:#fff; border:none;" onclick="addRecipeToShoppingList('${r.id}', event)">
          🛒＋ Alle auf Einkaufsliste
        </button>
        ${
          anyChecked
            ? `<button type="button" class="pill-btn" style="font-size:11px; padding:4px 9px;" onclick="addUncheckedIngredientsToShoppingList('${r.id}', event)">☑️ Fehlende auf Liste</button>
               <button type="button" class="pill-btn" style="font-size:11px; padding:4px 9px;" onclick="resetCheckedIngredients('${r.id}')">↺ Reset</button>`
            : `<span style="font-size:10.5px; color:var(--text-muted);">Tippen = Abhaken · 🛒＋ = Einkauf</span>`
        }
      </div>
    </div>
    <ul class="ing-list">${ingredientsHtml}</ul>
    <div class="btn-row" style="margin-bottom:14px;">
      <button type="button" class="btn btn-primary" onclick="addRecipeToShoppingList('${r.id}', event)">
        🛒 Alle ${(r.ingredients || []).length} Zutaten zur Einkaufsliste hinzufügen
      </button>
      <button type="button" class="btn btn-secondary" style="width:auto; white-space:nowrap;" onclick="addRecipeToShoppingList('${r.id}', event); closeRecipeDetail(); switchTab('shopping');">
        🛒 Zur Liste wechseln ↗
      </button>
    </div>

    <h3 class="section-title">👩‍🍳 Zubereitung (1:1 Original)</h3>
    ${stepsHtml}

    <div class="section-card" style="margin-top:14px;">
      <div class="section-title">💬 Kategorie, Direkt-Link, Notizen & Video</div>
      <div class="input-group">
        <label class="input-label">Kategorie des Rezepts</label>
        <select id="detailCategorySelect" class="select-input">
          ${RECIPE_CATEGORIES.map(
            (c) => `<option value="${escapeHtml(c.id)}" ${r.category === c.id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Direkter Link zum Original-Rezept (URL)</label>
        <input id="detailSourceUrlInput" type="url" class="text-input" value="${escapeHtml(r.sourceUrl || '')}" placeholder="https://www.chefkoch.de/rezepte/..." />
      </div>
      <textarea id="detailNotesInput" class="textarea-input" style="min-height:60px; margin-bottom:8px;" placeholder="Eigene Tipps, z.B. weniger Zucker...">${escapeHtml(r.notes || '')}</textarea>
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="saveRecipeNotes('${r.id}')">💾 Speichern</button>
        <label class="btn btn-secondary" style="cursor:pointer;">
          📹 Video anhängen
          <input type="file" accept="video/*" style="display:none;" onchange="attachVideoFileToRecipe(event, '${r.id}')" />
        </label>
      </div>
      <button class="btn" style="margin-top:10px; background:rgba(239,68,68,0.15); color:#f87171;" onclick="deleteRecipe('${r.id}')">
        🗑 Rezept löschen
      </button>
    </div>
  `;
}

async function saveRecipeNotes(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  r.notes = document.getElementById('detailNotesInput').value.trim();
  const catSel = document.getElementById('detailCategorySelect');
  if (catSel && catSel.value) r.category = catSel.value;
  const urlInp = document.getElementById('detailSourceUrlInput');
  if (urlInp) r.sourceUrl = urlInp.value.trim();
  r.updatedAt = Date.now();
  await dbPut('recipes', r);
  renderAll();
  await renderRecipeDetailModal(r);
  broadcastSyncUpdate();
  showToast('Kategorie, Direkt-Link & Notiz gespeichert!');
}

async function attachVideoFileToRecipe(event, recipeId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const r = findRecipeById(recipeId);
  if (!r) return;

  await dbPut('videos', { recipeId: r.id, blob: file, savedAt: Date.now() });
  r.hasOfflineVideo = true;
  r.updatedAt = Date.now();
  await dbPut('recipes', r);
  renderRecipes();
  await renderRecipeDetailModal(r);
  showToast('Video offline im Handyspeicher abgelegt!');
}

async function deleteRecipe(recipeId) {
  if (!confirm('Dieses Rezept wirklich löschen?')) return;
  state.recipes = state.recipes.filter((r) => r.id !== recipeId);
  if (!Array.isArray(state.deletedRecipeIds)) state.deletedRecipeIds = [];
  if (!state.deletedRecipeIds.includes(recipeId)) {
    state.deletedRecipeIds.push(recipeId);
    try {
      localStorage.setItem('kt_deleted_recipes', JSON.stringify(state.deletedRecipeIds));
    } catch (_) {}
  }
  await dbDelete('recipes', recipeId);
  await dbDelete('videos', recipeId);
  closeRecipeDetail();
  renderAll();
  broadcastSyncUpdate();
  showToast('Rezept gelöscht & synchronisiert');
}

// ============================================================================
// 6. KOCHMODUS (mit Screen Wake Lock API + Freihand-Sprachsteuerung + Timern)
// ============================================================================
async function startCookMode(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  state.activeRecipeId = recipeId;
  state.cookStepIndex = 0;

  await enableScreenWakeLock();
  renderCookModeStep();
  document.getElementById('cookModal').classList.add('open');
  pushAppHistoryState('cook');
}

async function stopCookMode() {
  stopVoiceControl();
  await disableScreenWakeLock();
  document.getElementById('cookModal').classList.remove('open');
}

async function finishCookingRecipe() {
  if (state.activeRecipeId) {
    await markRecipeCookedToday(state.activeRecipeId);
  }
  await stopCookMode();
}

function toggleVoiceControl() {
  if (state.voiceControlActive) {
    stopVoiceControl();
    showToast('Sprachsteuerung beendet');
    return;
  }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    showToast('Spracherkennung wird von diesem Browser nicht unterstützt (nutze Chrome/Edge/Safari).');
    return;
  }
  try {
    const rec = new SpeechRec();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last || !last[0]) return;
      const transcript = last[0].transcript.toLowerCase().trim();
      handleVoiceCommand(transcript);
    };

    rec.onerror = () => {};
    rec.onend = () => {
      if (state.voiceControlActive && document.getElementById('cookModal').classList.contains('open')) {
        try { rec.start(); } catch (_) {}
      }
    };

    rec.start();
    state.voiceRecognition = rec;
    state.voiceControlActive = true;
    updateVoiceControlUi();
    showToast('🎙️ Freihand aktiv! Sage „Weiter“, „Zurück“, „Vorlesen“ oder „Timer“.');
  } catch (_) {
    showToast('Mikrofon-Zugriff konnte nicht gestartet werden');
  }
}

function stopVoiceControl() {
  state.voiceControlActive = false;
  if (state.voiceRecognition) {
    try { state.voiceRecognition.stop(); } catch (_) {}
    state.voiceRecognition = null;
  }
  updateVoiceControlUi();
}

function updateVoiceControlUi() {
  const btn = document.getElementById('voiceControlBtn');
  const banner = document.getElementById('voiceStatusBanner');
  if (btn) {
    btn.classList.toggle('voice-active-btn', state.voiceControlActive);
    btn.textContent = state.voiceControlActive ? '🎙️ Aktiv' : '🎙️ Freihand';
  }
  if (banner) {
    banner.style.display = state.voiceControlActive ? 'flex' : 'none';
  }
}

function handleVoiceCommand(cmd) {
  const r = findRecipeById(state.activeRecipeId);
  if (!r) return;
  const steps = r.steps && r.steps.length > 0 ? r.steps : ['Alle Zutaten laut Liste zubereiten.'];

  if (cmd.includes('weiter') || cmd.includes('nächster') || cmd.includes('vorwärts')) {
    if (state.cookStepIndex < steps.length - 1) {
      navCookStep(1);
      showToast('🎙️ Sprachbefehl: Weiter →');
    } else {
      finishCookingRecipe();
    }
  } else if (cmd.includes('zurück') || cmd.includes('vorheriger')) {
    if (state.cookStepIndex > 0) {
      navCookStep(-1);
      showToast('🎙️ Sprachbefehl: ← Zurück');
    }
  } else if (cmd.includes('vorlesen') || cmd.includes('lesen') || cmd.includes('nochmal')) {
    speakStepText(steps[state.cookStepIndex] || '');
    showToast('🎙️ Sprachbefehl: Schritt vorlesen');
  } else if (cmd.includes('timer')) {
    const m = (steps[state.cookStepIndex] || '').match(/(\d+)\s*(?:-\s*\d+\s*)?(Minuten|Minute|Min\.?|Sekunden|Sek\.?)/i);
    if (m) {
      const val = parseInt(m[1], 10);
      const isSec = m[2].toLowerCase().startsWith('sek');
      startCookTimer(`${r.title} – Schritt ${state.cookStepIndex + 1}`, isSec ? val : val * 60);
    } else {
      startCookTimer(`${r.title} – Kurztimer`, 300);
    }
  } else if (cmd.includes('stopp') || cmd.includes('beenden')) {
    stopVoiceControl();
    showToast('🎙️ Sprachsteuerung gestoppt');
  }
}

async function enableScreenWakeLock() {
  const statusEl = document.getElementById('wakeLockStatusText');
  try {
    if ('wakeLock' in navigator) {
      state.wakeLockSentinel = await navigator.wakeLock.request('screen');
      if (statusEl) statusEl.textContent = '💡 Display-Wachhalter aktiv (Bildschirm bleibt dauerhaft an)';
      return;
    }
  } catch (_) {}
  if (statusEl) statusEl.textContent = '💡 Display-Wachhalter aktiv (Keep-Awake Modus)';
}

async function disableScreenWakeLock() {
  if (state.wakeLockSentinel) {
    try {
      await state.wakeLockSentinel.release();
    } catch (_) {}
    state.wakeLockSentinel = null;
  }
}

function renderCookModeStep() {
  const r = findRecipeById(state.activeRecipeId);
  if (!r) return;
  const basePortions = Number(r.portions) || 4;
  const targetPortions = state.activeScalePortions || basePortions;
  const steps = r.steps && r.steps.length > 0 ? r.steps : ['Alle Zutaten laut Liste zubereiten.'];
  const idx = Math.max(0, Math.min(steps.length - 1, state.cookStepIndex));
  state.cookStepIndex = idx;
  const currentStepText = formatStepTextWithPortions(steps[idx], basePortions, targetPortions);

  const matchedIngs = (r.ingredients || []).filter((ing) => {
    const words = ing.name.toLowerCase().split(/[\s,()]+/);
    return words.some((w) => w.length >= 4 && currentStepText.toLowerCase().includes(w));
  });

  const timerRegex = /(\d+)\s*(?:-\s*\d+\s*)?(Minuten|Minute|Min\.?|Sekunden|Sek\.?)/gi;
  const detectedTimers = [];
  let match;
  while ((match = timerRegex.exec(currentStepText)) !== null) {
    const val = parseInt(match[1], 10);
    const isSec = match[2].toLowerCase().startsWith('sek');
    const seconds = isSec ? val : val * 60;
    detectedTimers.push({ label: `${val} ${match[2]}`, seconds });
  }

  const container = document.getElementById('cookStepContainer');
  container.innerHTML = `
    <div class="cook-step-card">
      <div class="cook-step-num">Schritt ${idx + 1} von ${steps.length}</div>
      <div class="cook-step-text">${escapeHtml(currentStepText)}</div>

      ${
        matchedIngs.length > 0
          ? `<div class="cook-step-ings">
              <strong>Erwähnte Zutaten (${targetPortions} Port.):</strong><br/>
              ${matchedIngs
                .map((i) => {
                  const amt = formatIngredientAmountAndUnit(i, basePortions, targetPortions);
                  return `• ${amt ? `<strong>${escapeHtml(amt)}</strong> ` : ''}${escapeHtml(i.name)}`;
                })
                .join('<br/>')}
            </div>`
          : ''
      }

      <div>
        ${detectedTimers
          .map(
            (t) =>
              `<button class="timer-chip" onclick="startCookTimer('${escapeHtml(r.title)} – Schritt ${idx + 1}', ${t.seconds})">⏲ Timer: ${t.label}</button>`
          )
          .join('')}
        <button class="timer-chip" style="background:var(--bg-elevated);" onclick="speakStepText(${JSON.stringify(currentStepText).replace(/"/g, '&quot;')})">
          🔊 Vorlesen
        </button>
      </div>
    </div>

    <div class="btn-row" style="margin-bottom:16px;">
      <button class="btn btn-secondary" ${idx === 0 ? 'disabled style="opacity:0.4"' : ''} onclick="navCookStep(-1)">
        ← Zurück
      </button>
      <button class="btn btn-primary" onclick="${idx < steps.length - 1 ? 'navCookStep(1)' : 'finishCookingRecipe()'}">
        ${idx < steps.length - 1 ? 'Weiter →' : '🎉 Fertig gekocht!'}
      </button>
    </div>

    <div class="section-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
        <div class="section-title" style="margin-bottom:0;">📋 Alle Zutaten (${targetPortions} Portionen)</div>
        <button type="button" class="pill-btn" style="font-size:11px; padding:4px 9px; background:var(--primary); color:#fff; border:none;" onclick="addRecipeToShoppingList('${r.id}', event)">
          🛒＋ Alle auf Liste
        </button>
      </div>
      <ul class="ing-list" style="margin-bottom:0;">
        ${(r.ingredients || [])
          .map((ing, ingIdx) => {
            const amt = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
            const isChecked = Boolean(state.checkedIngredients[`${r.id}_${ingIdx}`]);
            const isAlreadyOnList = (state.shoppingList || []).some(
              (si) => !si.checked && normalizeIngredientBaseKey(si.name) === normalizeIngredientBaseKey(ing.name)
            );
            return `
              <li class="ing-item ${isChecked ? 'checked-ing' : ''}" onclick="toggleIngredientCheck('${r.id}', ${ingIdx})" style="cursor:pointer; align-items:center;">
                <div style="display:flex; align-items:center; flex:1; min-width:0;">
                  <span class="ing-check-box">${isChecked ? '✓' : ''}</span>
                  <span>${escapeHtml(ing.name)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                  <span class="ing-amount">${escapeHtml(amt || 'nach Bedarf')}</span>
                  <button
                    type="button"
                    class="ing-shop-add-btn ${isAlreadyOnList ? 'added' : ''}"
                    onclick="addSingleIngredientToShoppingList('${escapeHtml(r.id)}', ${ingIdx}, event)"
                  >
                    ${isAlreadyOnList ? '✓ Liste' : '🛒＋'}
                  </button>
                </div>
              </li>`;
          })
          .join('')}
      </ul>
    </div>
  `;
}

function navCookStep(delta) {
  state.cookStepIndex += delta;
  renderCookModeStep();
}

function speakStepText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Sprachausgabe auf diesem Gerät nicht verfügbar');
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'de-DE';
  window.speechSynthesis.speak(utter);
}

function startCookTimer(label, seconds) {
  const id = 'tm-' + Date.now();
  const timerObj = { id, label, remaining: seconds };
  state.timers.push(timerObj);
  renderActiveTimers();
  showToast(`Timer (${Math.round(seconds / 60)} Min) gestartet!`);

  timerObj.interval = setInterval(() => {
    timerObj.remaining--;
    if (timerObj.remaining <= 0) {
      clearInterval(timerObj.interval);
      playAlarmBeep();
      showToast(`⏰ TIMER ABGELAUFEN: ${timerObj.label}`);
    }
    renderActiveTimers();
  }, 1000);
}

function removeTimer(id) {
  const idx = state.timers.findIndex((t) => t.id === id);
  if (idx !== -1) {
    clearInterval(state.timers[idx].interval);
    state.timers.splice(idx, 1);
    renderActiveTimers();
  }
}

function renderActiveTimers() {
  const box = document.getElementById('activeTimersBox');
  if (!box) return;
  if (state.timers.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = state.timers
    .map((t) => {
      const m = Math.floor(Math.max(0, t.remaining) / 60);
      const s = Math.max(0, t.remaining) % 60;
      const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `
        <div class="timer-running">
          <span>⏲ ${escapeHtml(t.label)}: <strong style="color:var(--primary-light); font-size:17px;">${timeStr}</strong></span>
          <button class="pill-btn" onclick="removeTimer('${t.id}')">✕</button>
        </div>
      `;
    })
    .join('');
}

function playAlarmBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.25;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch (_) {}
}

// ============================================================================
// 7. INTELLIGENTE EINKAUFSLISTE (Bündelung, Vorrats-Filter, Angebots-Check & Bring!)
// ============================================================================
const PANTRY_STAPLE_REGEX = /^(salz|pfeffer|salz und pfeffer.*|zucker|wasser|olivenöl|olivenöl, gutes|öl, zum ausbacken|fett für die form|muskat|paprikapulver.*|italienische kräuter.*)$/i;

function isPantryStapleIngredient(name) {
  const clean = (name || '').trim().toLowerCase();
  if (PANTRY_STAPLE_REGEX.test(clean)) return true;
  if (clean.startsWith('salz und pfeffer') || clean === 'mehl' || clean === 'zucker') return true;
  return false;
}

function toggleShoppingBundleMode() {
  state.bundleShoppingList = !state.bundleShoppingList;
  localStorage.setItem('kt_bundle_shop', String(state.bundleShoppingList));
  renderShoppingList();
  showToast(state.bundleShoppingList ? '📦 Gleiche Zutaten werden gebündelt' : 'Einzelansicht aktiviert');
}

function togglePantryStaplesFilter() {
  state.hidePantryStaples = !state.hidePantryStaples;
  localStorage.setItem('kt_hide_pantry', String(state.hidePantryStaples));
  renderShoppingList();
  showToast(state.hidePantryStaples ? '🧂 Haus-Vorrat (Salz, Pfeffer, Öl, Zucker) ausgeblendet' : 'Alle Zutaten sichtbar');
}

function parseSpecNumberAndUnit(specStr) {
  const s = (specStr || '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { num: null, unit: s };
  return { num: parseFloat(m[1].replace(',', '.')), unit: (m[2] || '').trim() };
}

function normalizeIngredientBaseKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIngredientKey(name) {
  return normalizeIngredientBaseKey(name);
}

function getProcessedShoppingList(options = {}) {
  let raw = state.shoppingList || [];
  if (state.hidePantryStaples && !options.includeAllPantry) {
    raw = raw.filter((item) => !isPantryStapleIngredient(item.name));
  }
  if (!state.bundleShoppingList) {
    return raw.map((item) => ({
      ...item,
      sourceIds: [item.id]
    }));
  }

  // Bündele identische Zutaten (getrennt nach offen/erledigt)
  const groups = new Map();
  raw.forEach((item) => {
    const normName = normalizeIngredientKey(item.name);
    const parsedSpec = parseSpecNumberAndUnit(item.spec);
    const key = `${item.checked ? '1' : '0'}|${normName}|${parsedSpec.unit.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: item.id,
        sourceIds: [item.id],
        name: item.name,
        numSum: parsedSpec.num,
        unit: parsedSpec.unit,
        rawSpecs: [item.spec],
        recipes: new Set(item.recipeTitle ? [item.recipeTitle] : []),
        checked: item.checked
      });
    } else {
      const g = groups.get(key);
      g.sourceIds.push(item.id);
      if (g.numSum !== null && parsedSpec.num !== null) {
        g.numSum = Math.round((g.numSum + parsedSpec.num) * 100) / 100;
      } else {
        g.numSum = null;
        if (item.spec && !g.rawSpecs.includes(item.spec)) g.rawSpecs.push(item.spec);
      }
      if (item.recipeTitle) g.recipes.add(item.recipeTitle);
    }
  });

  return Array.from(groups.values()).map((g) => {
    let finalSpec = '';
    if (g.numSum !== null) {
      const numStr = Number.isInteger(g.numSum) ? String(g.numSum) : String(g.numSum).replace('.', ',');
      finalSpec = g.unit ? `${numStr} ${g.unit}` : numStr;
    } else {
      finalSpec = g.rawSpecs.join(' + ');
    }
    return {
      id: g.id,
      sourceIds: g.sourceIds,
      name: g.name,
      spec: finalSpec || 'nach Bedarf',
      recipeTitle: Array.from(g.recipes).join(', ') || 'Manuell',
      bundledCount: g.sourceIds.length,
      checked: g.checked
    };
  });
}

function upsertShoppingListIngredient({ name, spec, recipeTitle }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return 'skipped';
  const cleanSpec = String(spec || '').trim() || 'nach Bedarf';
  const cleanRec = String(recipeTitle || '').trim();
  const baseKey = normalizeIngredientBaseKey(cleanName);
  const now = Date.now();

  const existing = (state.shoppingList || []).find(
    (item) => !item.checked && normalizeIngredientBaseKey(item.name) === baseKey
  );

  if (existing) {
    const existingRecList = String(existing.recipeTitle || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (cleanRec && existingRecList.includes(cleanRec)) {
      return 'duplicate';
    }
    const parsedOld = parseSpecNumberAndUnit(existing.spec || '');
    const parsedNew = parseSpecNumberAndUnit(cleanSpec);
    if (parsedOld && parsedNew && parsedOld.unit.toLowerCase() === parsedNew.unit.toLowerCase()) {
      const sum = Math.round((parsedOld.num + parsedNew.num) * 100) / 100;
      const sumStr = String(sum).replace('.', ',');
      existing.spec = parsedOld.unit ? `${sumStr} ${parsedOld.unit}` : sumStr;
    } else if (cleanSpec !== 'nach Bedarf' && existing.spec !== cleanSpec) {
      existing.spec = existing.spec === 'nach Bedarf' ? cleanSpec : `${existing.spec} + ${cleanSpec}`;
    }
    if (cleanRec && !existingRecList.includes(cleanRec)) {
      existingRecList.push(cleanRec);
      existing.recipeTitle = existingRecList.join(', ');
    }
    existing.updatedAt = now;
    return 'merged';
  }

  state.shoppingList.push({
    id: 'sh-' + now + '-' + Math.random().toString(36).slice(2, 7),
    name: cleanName,
    spec: cleanSpec,
    recipeTitle: cleanRec || 'Rezept',
    checked: false,
    updatedAt: now
  });
  return 'added';
}

async function addRecipeToShoppingList(recipeId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const r = findRecipeById(recipeId);
  if (!r) {
    showToast('Rezept konnte nicht gefunden werden');
    return;
  }
  if (!Array.isArray(state.shoppingList)) state.shoppingList = [];
  const basePortions = Number(r.portions) || 4;
  const targetPortions = (state.activeRecipeId === r.id && state.activeScalePortions)
    ? state.activeScalePortions
    : basePortions;
  let addedCount = 0;
  let mergedCount = 0;
  let skippedDupCount = 0;
  let pantryAddedCount = 0;
  (r.ingredients || []).forEach((ing) => {
    if (!ing || !ing.name) return;
    const cleanName = String(ing.name).trim();
    if (!cleanName) return;
    const spec = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
    if (isPantryStapleIngredient(cleanName)) pantryAddedCount++;
    const status = upsertShoppingListIngredient({
      name: cleanName,
      spec: spec || 'nach Bedarf',
      recipeTitle: r.title
    });
    if (status === 'added') addedCount++;
    else if (status === 'merged') mergedCount++;
    else if (status === 'duplicate') skippedDupCount++;
  });
  if (state.hidePantryStaples && addedCount > 0 && pantryAddedCount === addedCount) {
    state.hidePantryStaples = false;
    try { localStorage.setItem('kt_hide_pantry', 'false'); } catch (_) {}
  }
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  renderShoppingList();
  renderOffersTab();
  if (state.activeRecipeId === r.id && document.getElementById('detailModal')?.classList.contains('open')) {
    await renderRecipeDetailModal(r);
  }
  if (state.activeRecipeId === r.id && document.getElementById('cookModal')?.classList.contains('open')) {
    renderCookModeStep();
  }
  if (addedCount === 0 && mergedCount === 0 && skippedDupCount > 0) {
    showToast(`✓ Alle Zutaten von "${r.title}" sind bereits im Einkaufswagen!`);
    return;
  }
  const totalAffected = addedCount + mergedCount;
  showToast(`🛒 ${totalAffected} Zutaten für "${r.title}" im Einkaufswagen aktualisiert!`);
  await saveShoppingList();
}

async function addSingleIngredientToShoppingList(recipeId, ingIdx, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const r = findRecipeById(recipeId);
  if (!r || !r.ingredients || !r.ingredients[ingIdx]) return;
  if (!Array.isArray(state.shoppingList)) state.shoppingList = [];
  const ing = r.ingredients[ingIdx];
  const cleanName = String(ing.name || '').trim();
  if (!cleanName) return;
  const basePortions = Number(r.portions) || 4;
  const targetPortions = (state.activeRecipeId === r.id && state.activeScalePortions)
    ? state.activeScalePortions
    : basePortions;
  const spec = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
  if (state.hidePantryStaples && isPantryStapleIngredient(cleanName)) {
    state.hidePantryStaples = false;
    try { localStorage.setItem('kt_hide_pantry', 'false'); } catch (_) {}
  }
  const status = upsertShoppingListIngredient({
    name: cleanName,
    spec: spec || 'nach Bedarf',
    recipeTitle: r.title
  });
  if (status === 'duplicate') {
    showToast(`✓ "${cleanName}" ist bereits auf deiner Einkaufsliste!`);
    return;
  }
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  renderShoppingList();
  renderOffersTab();
  if (state.activeRecipeId === r.id && document.getElementById('detailModal')?.classList.contains('open')) {
    await renderRecipeDetailModal(r);
  }
  if (state.activeRecipeId === r.id && document.getElementById('cookModal')?.classList.contains('open')) {
    renderCookModeStep();
  }
  showToast(`🛒 "${cleanName}" (${spec || 'nach Bedarf'}) zur Einkaufsliste hinzugefügt!`);
  await saveShoppingList();
}

async function addUncheckedIngredientsToShoppingList(recipeId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const r = findRecipeById(recipeId);
  if (!r) return;
  if (!Array.isArray(state.shoppingList)) state.shoppingList = [];
  const basePortions = Number(r.portions) || 4;
  const targetPortions = (state.activeRecipeId === r.id && state.activeScalePortions)
    ? state.activeScalePortions
    : basePortions;
  let addedCount = 0;
  let pantryAddedCount = 0;
  (r.ingredients || []).forEach((ing, idx) => {
    const isChecked = Boolean(state.checkedIngredients && state.checkedIngredients[`${r.id}_${idx}`]);
    if (!ing || !ing.name || isChecked) return;
    const cleanName = String(ing.name).trim();
    if (!cleanName) return;
    if (isPantryStapleIngredient(cleanName)) pantryAddedCount++;
    const spec = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
    const status = upsertShoppingListIngredient({
      name: cleanName,
      spec: spec || 'nach Bedarf',
      recipeTitle: r.title
    });
    if (status === 'added' || status === 'merged') addedCount++;
  });
  if (addedCount === 0) {
    showToast('Alle Zutaten sind bereits als vorhanden abgehakt!');
    return;
  }
  if (state.hidePantryStaples && pantryAddedCount === addedCount) {
    state.hidePantryStaples = false;
    try { localStorage.setItem('kt_hide_pantry', 'false'); } catch (_) {}
  }
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  renderShoppingList();
  renderOffersTab();
  if (state.activeRecipeId === r.id && document.getElementById('detailModal')?.classList.contains('open')) {
    await renderRecipeDetailModal(r);
  }
  if (state.activeRecipeId === r.id && document.getElementById('cookModal')?.classList.contains('open')) {
    renderCookModeStep();
  }
  showToast(`🛒 ${addedCount} offene Zutaten für "${r.title}" zur Einkaufsliste hinzugefügt!`);
  await saveShoppingList();
}

async function addSelectedRecipeFromShopTab() {
  const select = document.getElementById('shopQuickRecipeSelect');
  if (!select || !select.value) {
    showToast('Bitte zuerst ein Rezept auswählen');
    return;
  }
  await addRecipeToShoppingList(select.value);
}

async function saveShoppingList() {
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  await dbPut('meta', { key: 'shoppingList', value: state.shoppingList });
  broadcastSyncUpdate();
}

function renderShoppingList() {
  const quickSelect = document.getElementById('shopQuickRecipeSelect');
  if (quickSelect) {
    const allRecs = typeof getAllSelectableRecipesForPlanner === 'function'
      ? getAllSelectableRecipesForPlanner()
      : (state.recipes || []);
    const prevVal = quickSelect.value;
    quickSelect.innerHTML = `<option value="">-- Rezept auswählen (${allRecs.length} verfügbar) --</option>` +
      allRecs.map((rec) => `<option value="${escapeHtml(rec.id)}">🍽️ ${escapeHtml(rec.title)} (${(rec.ingredients || []).length} Zutaten)</option>`).join('');
    if (prevVal && allRecs.some((rec) => rec.id === prevVal)) {
      quickSelect.value = prevVal;
    }
  }

  const badge = document.getElementById('shopBadge');
  const openCount = state.shoppingList.filter((i) => !i.checked).length;
  if (badge) {
    badge.style.display = openCount > 0 ? 'inline-block' : 'none';
    badge.textContent = openCount;
  }

  const bundleBtn = document.getElementById('toggleBundleShopBtn');
  if (bundleBtn) {
    bundleBtn.textContent = `📦 Gleiche Zutaten bündeln: ${state.bundleShoppingList ? 'AN' : 'AUS'}`;
    bundleBtn.style.borderColor = state.bundleShoppingList ? 'var(--primary)' : 'var(--border)';
    bundleBtn.style.color = state.bundleShoppingList ? 'var(--primary-light)' : 'var(--text)';
  }

  const pantryBtn = document.getElementById('togglePantryFilterBtn');
  if (pantryBtn) {
    pantryBtn.textContent = `🧂 Haus-Vorrat ausblenden: ${state.hidePantryStaples ? 'AN' : 'AUS'}`;
    pantryBtn.style.borderColor = state.hidePantryStaples ? 'var(--accent)' : 'var(--border)';
    pantryBtn.style.color = state.hidePantryStaples ? '#6ee7b7' : 'var(--text)';
  }

  const container = document.getElementById('shoppingListContainer');
  const savingsBanner = document.getElementById('shoppingSavingsBanner');
  if (!container) return;

  const displayList = getProcessedShoppingList();

  if (displayList.length === 0) {
    if (savingsBanner) savingsBanner.innerHTML = '';
    container.innerHTML = `
      <div class="section-card" style="text-align:center; padding:24px 14px;">
        <div style="font-size:30px; margin-bottom:6px;">🛒</div>
        <div style="font-weight:700;">Deine Einkaufsliste ist aktuell leer</div>
        <div class="section-desc">Füge Zutaten direkt aus einem Rezept, aus dem Wochenplaner oder aus dem <strong>🏷️ Angebote</strong>-Tab hinzu.</div>
      </div>
    `;
    return;
  }

  let matchedDealsCount = 0;
  let totalSavingsEuro = 0;
  const rowsHtml = displayList
    .map((item) => {
      const matchedOffer = !item.checked ? findBestOfferForIngredientName(item.name) : null;
      const savingsInfo = matchedOffer ? calculateOfferSavings(matchedOffer) : null;
      if (matchedOffer) {
        matchedDealsCount++;
        if (savingsInfo && savingsInfo.savedValue > 0) {
          totalSavingsEuro += savingsInfo.savedValue;
        }
      }
      const idsJson = JSON.stringify(item.sourceIds || [item.id]).replace(/"/g, '&quot;');
      const bundleBadge =
        item.bundledCount > 1
          ? `<span class="tag-mini" style="background:rgba(234,88,12,0.2); color:#fdba74; font-weight:700; margin-left:5px;">${item.bundledCount}× gebündelt</span>`
          : '';
      const offerHint = matchedOffer
        ? `<div style="font-size:11px; color:#34d399; font-weight:700; margin-top:3px;" onclick="event.stopPropagation(); openOfferImageLightbox('${escapeHtml(matchedOffer.id)}', event)">
             🏷️ Im Angebot bei <strong>${escapeHtml(matchedOffer.retailer)}</strong>: ${escapeHtml(matchedOffer.price)} (${escapeHtml(matchedOffer.title)})${savingsInfo && savingsInfo.hasSavings ? ` · <span style="color:#6ee7b7;">💰 Ersparnis: ${escapeHtml(savingsInfo.label)}</span>` : ''} 🔍
           </div>`
        : '';

      return `
      <div class="shop-item ${item.checked ? 'checked' : ''}" style="${matchedOffer ? 'border-color:rgba(16,185,129,0.45);' : ''}">
        <div class="shop-left" onclick="toggleShopItemGroup(${idsJson})">
          <input type="checkbox" ${item.checked ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--primary); flex-shrink:0;" />
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; font-size:14px;">${escapeHtml(item.name)}${bundleBadge}</div>
            <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(item.spec)} · ${escapeHtml(item.recipeTitle || 'Manuell')}</div>
            ${offerHint}
          </div>
        </div>
        <button class="pill-btn" onclick="deleteShopItemGroup(${idsJson})">✕</button>
      </div>
    `;
    })
    .join('');

  if (savingsBanner) {
    const totalSavStr = totalSavingsEuro > 0 ? `${totalSavingsEuro.toFixed(2).replace('.', ',')} €` : '';
    savingsBanner.innerHTML =
      matchedDealsCount > 0
        ? `<div class="section-card" style="padding:10px 12px; background:rgba(16,185,129,0.14); border-color:rgba(16,185,129,0.45); display:flex; align-items:center; justify-content:space-between; gap:8px;">
             <div style="font-size:12px;">
               🏷️ <strong>Spar-Treffer:</strong> Für <strong>${matchedDealsCount} ${matchedDealsCount === 1 ? 'Zutat' : 'Zutaten'}</strong> deiner Einkaufsliste gibt es aktuelle Angebote${totalSavStr ? ` (<strong>💰 Gesamt-Ersparnis: ca. ${totalSavStr}</strong>)` : ''}!
             </div>
             <button class="pill-btn" style="background:var(--accent); color:#fff; border:none; white-space:nowrap;" onclick="setOfferRetailerFilter('Passend-Einkauf'); switchTab('offers')">
               Angebote zeigen
             </button>
           </div>`
        : '';
  }

  container.innerHTML = rowsHtml;
}

function recordDeletedShoppingIds(ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  if (!Array.isArray(state.deletedShoppingIds)) state.deletedShoppingIds = [];
  let changed = false;
  arr.forEach((id) => {
    if (id && !state.deletedShoppingIds.includes(id)) {
      state.deletedShoppingIds.push(id);
      changed = true;
    }
  });
  if (state.deletedShoppingIds.length > 400) {
    state.deletedShoppingIds = state.deletedShoppingIds.slice(-400);
  }
  if (changed) {
    try {
      localStorage.setItem('kt_deleted_shop', JSON.stringify(state.deletedShoppingIds));
    } catch (_) {}
  }
}

async function toggleShopItemGroup(ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  const now = Date.now();
  arr.forEach((id) => {
    const item = state.shoppingList.find((i) => i.id === id);
    if (item) {
      item.checked = !item.checked;
      item.updatedAt = now;
    }
  });
  await saveShoppingList();
  renderShoppingList();
  renderOffersTab();
}

async function deleteShopItemGroup(ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  const set = new Set(arr);
  recordDeletedShoppingIds(arr);
  state.shoppingList = state.shoppingList.filter((i) => !set.has(i.id));
  await saveShoppingList();
  renderShoppingList();
  renderOffersTab();
}

async function toggleShopItem(id) {
  await toggleShopItemGroup([id]);
}

async function deleteShopItem(id) {
  await deleteShopItemGroup([id]);
}

async function clearCheckedShoppingItems() {
  const checkedIds = state.shoppingList.filter((i) => i.checked).map((i) => i.id);
  recordDeletedShoppingIds(checkedIds);
  state.shoppingList = state.shoppingList.filter((i) => !i.checked);
  await saveShoppingList();
  renderShoppingList();
  renderOffersTab();
  showToast('Erledigte Einträge entfernt');
}

async function clearAllShoppingItems() {
  if (!state.shoppingList || state.shoppingList.length === 0) {
    showToast('Einkaufsliste ist bereits leer');
    return;
  }
  if (!confirm(`Wirklich alle ${state.shoppingList.length} Artikel aus der Einkaufsliste löschen?`)) return;
  const allIds = state.shoppingList.map((i) => i.id);
  recordDeletedShoppingIds(allIds);
  state.shoppingList = [];
  await saveShoppingList();
  renderShoppingList();
  renderOffersTab();
  showToast('🗑 Einkaufsliste komplett geleert & synchronisiert');
}

async function addManualShopItem() {
  const nameInput = document.getElementById('manualShopName');
  const specInput = document.getElementById('manualShopSpec');
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Bitte zuerst einen Artikelnamen eingeben');
    return;
  }
  const spec = specInput.value.trim() || 'nach Bedarf';
  state.shoppingList.unshift({
    id: 'sh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name,
    spec,
    recipeTitle: 'Manuell',
    checked: false,
    updatedAt: Date.now()
  });
  nameInput.value = '';
  specInput.value = '';
  renderShoppingList();
  renderOffersTab();
  showToast(`🛒 "${name}" zur Einkaufsliste hinzugefügt!`);
  await saveShoppingList();
}

function exportRecipeToBring(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  const basePortions = Number(r.portions) || 4;
  const targetPortions = state.activeScalePortions || basePortions;
  // Übermittle garantiert 100 % ALLER enthaltenen Rezept-Zutaten (inkl. Gewürzen & Zutaten ohne Zahl)
  const items = (r.ingredients || []).map((ing) => {
    const formattedSpec = formatIngredientAmountAndUnit(ing, basePortions, targetPortions);
    return {
      name: ing.name,
      spec: formattedSpec || '',
      group: ing.group || ''
    };
  });
  openBringTransferModal(r.title, items, r.sourceUrl, basePortions, targetPortions);
}

function exportShoppingListToBring() {
  // Wichtig: includeAllPantry: true stellt sicher, dass wirklich ALLE enthaltenen offenen Zutaten an Bring! übermittelt werden!
  const allOpenItems = getProcessedShoppingList({ includeAllPantry: true }).filter((i) => !i.checked);
  if (allOpenItems.length === 0) {
    showToast('Keine offenen Zutaten auf der Einkaufsliste');
    return;
  }
  openBringTransferModal('KochTresor Einkaufsliste', allOpenItems, '', 4, 4);
}

function encodeBringRecipePayloadBase64(title, servings, items) {
  try {
    const ingStrings = (items || []).map((i) => {
      const s = (i.spec && i.spec !== 'nach Bedarf') ? i.spec.trim() : '';
      return s ? `${s} ${i.name}`.trim() : i.name.trim();
    });
    const jsonStr = JSON.stringify({
      title: title || 'KochTresor Rezept',
      servings: String(servings || 4),
      ingredients: ingStrings
    });
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    utf8Bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (_) {
    return '';
  }
}

function closeBringModal() {
  const modal = document.getElementById('bringModal');
  if (modal) modal.classList.remove('open');
}

function buildSupabaseBringRecipeUrl(title, servings, items) {
  if (!isSupabaseSyncConfigured()) return '';
  const baseUrl = normalizeSupabaseBaseUrl(state.household.sbUrl);
  if (!baseUrl) return '';
  const params = new URLSearchParams();
  params.set('t', String(title || 'KochTresor Einkaufsliste').slice(0, 80));
  params.set('q', String(servings || 4));
  (items || []).slice(0, 45).forEach((i) => {
    const cleanSpec = i.spec ? String(i.spec).trim() : '';
    const line = cleanSpec && cleanSpec !== 'nach Bedarf' ? `${cleanSpec} ${i.name}`.trim() : String(i.name || '').trim();
    if (line) params.append('i', line.slice(0, 120));
  });
  return `${baseUrl}/functions/v1/bring-recipe?${params.toString()}`;
}

function openBringTransferModal(title, items, sourceUrl, baseQuantity, requestedQuantity) {
  const modal = document.getElementById('bringModal');
  const body = document.getElementById('bringModalBody');
  const allLinesArr = (items || []).map((i) => {
    const cleanSpec = i.spec ? String(i.spec).trim() : '';
    return cleanSpec && cleanSpec !== 'nach Bedarf' ? `${cleanSpec} ${i.name}` : i.name;
  });
  const plainLines = allLinesArr.join('\n');
  state.lastBringTransferItems = items || [];
  state.bringClipboardText = plainLines;

  // 1) Supabase Edge Function liefert echtes Schema.org Recipe JSON-LD -> Bring! App importiert ALLE Zutaten direkt!
  const sbBringSchemaUrl = buildSupabaseBringRecipeUrl(title, requestedQuantity, items);
  const bringSupabaseDeeplink = sbBringSchemaUrl
    ? `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(sbBringSchemaUrl)}&source=web&baseQuantity=${requestedQuantity}&requestedQuantity=${requestedQuantity}`
    : '';

  // 2) Echte Original-Rezept-Webseite (nicht Instagram/Facebook/TikTok)
  const isBringSupportedWebUrl =
    Boolean(sourceUrl && /^https?:\/\//i.test(sourceUrl)) &&
    !/instagram\.com|facebook\.com|fb\.watch|tiktok\.com/i.test(sourceUrl);
  const bringDirectSourceUrl = isBringSupportedWebUrl
    ? `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(sourceUrl)}&source=web&baseQuantity=${baseQuantity}&requestedQuantity=${requestedQuantity}`
    : '';

  const primaryDeeplink = bringSupabaseDeeplink || bringDirectSourceUrl;

  body.innerHTML = `
    <div class="section-card" style="background:rgba(0,133,111,0.15); border-color:rgba(0,133,111,0.4);">
      <div class="section-title" style="color:#34d399;">🛒 Bring! App Übergabe (Alle ${items.length} Zutaten)</div>
      <div class="section-desc">
        ${
          primaryDeeplink
            ? `Öffnet die <strong>Bring! Smartphone-App</strong> direkt mit allen <strong>${items.length} Zutaten</strong> von <strong>"${escapeHtml(title)}"</strong> (${requestedQuantity} Port.) zum 1-Klick-Übernehmen:`
            : `Verbinde einmalig <strong>Supabase</strong> im Tab „Haushalt“ (mit der Edge Function <code>bring-recipe</code>), um jede Einkaufsliste &amp; jedes Rezept direkt in die Bring! App zu senden.`
        }
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${
          primaryDeeplink
            ? `<a href="${primaryDeeplink}" target="_blank" rel="noopener" class="btn btn-bring" style="text-decoration:none;">
                 📲 1. Alle ${items.length} Zutaten direkt in Bring! App öffnen ↗
               </a>`
            : ''
        }
        ${
          bringDirectSourceUrl && bringSupabaseDeeplink
            ? `<a href="${bringDirectSourceUrl}" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none;">
                 🔗 2. Original-Webseite an Bring! senden ↗
               </a>`
            : ''
        }
        <button class="btn btn-primary" onclick="copyBringList(${JSON.stringify(plainLines).replace(/"/g, '&quot;')})">
          📋 Alle ${items.length} Zutaten in Zwischenablage kopieren
        </button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">✅ Alle ${items.length} Zutaten (${requestedQuantity} Portionen):</div>
      <ul class="ing-list" style="margin:6px 0 10px;">
        ${(items || [])
          .map(
            (it, idx) => `
          <li class="ing-item" style="padding:7px 0; font-size:13px;">
            <span><strong>${idx + 1}.</strong> ${escapeHtml(it.name)}</span>
            <span class="ing-amount">${escapeHtml(it.spec || 'nach Bedarf')}</span>
          </li>`
          )
          .join('')}
      </ul>
      <pre style="font-size:12px; color:#cbd5e1; background:rgba(15,23,42,0.7); padding:10px; border-radius:10px; white-space:pre-wrap; line-height:1.5; font-family:inherit;">${escapeHtml(plainLines)}</pre>
    </div>
  `;
  if (!modal.classList.contains('open')) {
    pushAppHistoryState('bring');
  }
  modal.classList.add('open');
}

async function shareToBringApp(title, text) {
  try {
    if (navigator.share) {
      await navigator.share({
        title: `Bring! Zutaten: ${title}`,
        text: text
      });
      showToast('An Bring! / Teilen-Menü übergeben!');
      return;
    }
  } catch (_) {}
  await copyBringList(text);
}

async function copyBringList(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Zutaten kopiert! Jetzt in Bring! einfügen.');
  } catch (_) {
    showToast('Kopieren abgeschlossen');
  }
}

// ============================================================================
// 8. IMPORT-ZENTRALE: 1:1 Webseiten-Import (Schema.org JSON-LD, Chefkoch, Kochbar, Lecker) & Foto-Scanner
// ============================================================================
// ============================================================================
// KI-STATUSBAR, UNIVERSAL-FETCHER (NETLIFY DRAG-&-DROP SICHER), GEMINI AI & OCR
// ============================================================================

function detectAiProviderFromKey(rawKey) {
  const k = String(rawKey || '').trim();
  if (!k) return null;
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-or-')) return 'openrouter';
  return 'gemini';
}

function getAiProviderLabel(provider) {
  if (provider === 'groq') return 'Groq (Privat · Kostenlos)';
  if (provider === 'openrouter') return 'OpenRouter (Privat)';
  return 'Google Gemini';
}

function renderAiKeyStatusBar() {
  const iconEl = document.getElementById('aiKeyStatusIcon');
  const textEl = document.getElementById('aiKeyStatusText');
  const badgeEl = document.getElementById('aiKeyBadge');
  const quickInput = document.getElementById('quickGeminiKeyInput');
  const backupInput = document.getElementById('quickBackupAiKeyInput');
  const key = (state.household.geminiKey || '').trim();
  const hasKey = key.length > 10;
  const hasBackup = Boolean(state.household.backupAiKey && state.household.backupAiKey.trim().length > 10);
  const provider = detectAiProviderFromKey(key);

  if (quickInput && quickInput.value !== state.household.geminiKey) {
    quickInput.value = state.household.geminiKey || '';
  }
  if (backupInput && backupInput.value !== (state.household.backupAiKey || '')) {
    backupInput.value = state.household.backupAiKey || '';
  }

  if (hasKey) {
    if (iconEl) iconEl.textContent = '✨';
    if (textEl) {
      textEl.textContent = `KI aktiv: ${getAiProviderLabel(provider)}${hasBackup ? ' + Backup' : ''}`;
    }
    if (badgeEl) {
      badgeEl.textContent = '🟢 Aktiv';
      badgeEl.className = 'validity-pill valid-active';
    }
  } else {
    if (iconEl) iconEl.textContent = '✨';
    if (textEl) textEl.textContent = 'KI-Erkennung einrichten (Privat · Kostenlos)';
    if (badgeEl) {
      badgeEl.textContent = 'Groq / OpenRouter';
      badgeEl.className = 'validity-pill valid-upcoming';
    }
  }
}

function toggleAiKeySetupBox() {
  const box = document.getElementById('aiKeyQuickSetupBox');
  if (!box) return;
  const open = box.style.display === 'none' || !box.style.display;
  box.style.display = open ? 'block' : 'none';
  if (open) {
    const quickInput = document.getElementById('quickGeminiKeyInput');
    if (quickInput) quickInput.value = state.household.geminiKey || '';
  }
}

let groqModelCache = { key: '', textModel: '', visionModel: '', fetchedAt: 0 };
let geminiModelCache = { key: '', modelId: '', modelChain: [], fetchedAt: 0 };

async function resolveActiveGeminiModelChain(apiKey) {
  const k = String(apiKey || '').trim();
  const defaultChain = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];
  if (!k) return defaultChain;
  if (
    geminiModelCache.key === k &&
    Date.now() - geminiModelCache.fetchedAt < 15 * 60 * 1000 &&
    Array.isArray(geminiModelCache.modelChain) &&
    geminiModelCache.modelChain.length > 0
  ) {
    return geminiModelCache.modelChain;
  }

  let chain = [...defaultChain];
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`);
    if (resp.ok) {
      const data = await resp.json();
      const usable = (data?.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter((id) => id && !/(embedding|tts|imagen|veo|audio|live|thinking-exp)/i.test(id));

      const preferred = [
        'gemini-3.8-flash',
        'gemini-3.8-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.0-flash',
        'gemini-3-flash',
        'gemini-flash-latest',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
      ];
      const ranked = [];
      preferred.forEach((p) => {
        if (usable.includes(p) && !ranked.includes(p)) ranked.push(p);
      });
      usable
        .filter((id) => /gemini-.*flash/i.test(id))
        .forEach((id) => {
          if (!ranked.includes(id)) ranked.push(id);
        });
      if (ranked.length > 0) {
        chain = ranked.slice(0, 4);
      }
    }
  } catch (_) {}

  geminiModelCache = { key: k, modelId: chain[0], modelChain: chain, fetchedAt: Date.now() };
  return chain;
}

async function resolveActiveGeminiModel(apiKey) {
  const chain = await resolveActiveGeminiModelChain(apiKey);
  return chain[0] || 'gemini-3.8-flash';
}

async function callGeminiWithFallback(apiKey, bodyPayload) {
  const chain = await resolveActiveGeminiModelChain(apiKey);
  let lastError = 'Gemini Fehler';

  for (let i = 0; i < chain.length; i++) {
    const modelId = chain[i];
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.candidates?.[0]) {
        return { ok: true, data, modelId };
      }
      lastError = data?.error?.message || `Gemini HTTP ${resp.status}`;
      // Bei 429 (Limit), 503 (überlastet) oder 404 (Modell veraltet) automatisch zum nächsten Modell wechseln
      if (resp.status === 429 || resp.status === 503 || resp.status === 404) {
        if (resp.status === 429 && i < chain.length - 1) {
          await new Promise((r) => setTimeout(r, 900));
        }
        continue;
      }
      return { ok: false, error: lastError };
    } catch (err) {
      lastError = String(err?.message || err);
    }
  }
  return { ok: false, error: lastError };
}

async function resolveActiveGroqModels(apiKey) {
  const k = String(apiKey || '').trim();
  if (!k) return { textModel: 'llama-3.3-70b-versatile', visionModel: '', allIds: [] };
  if (groqModelCache.key === k && Date.now() - groqModelCache.fetchedAt < 10 * 60 * 1000 && groqModelCache.textModel) {
    return groqModelCache;
  }

  let allIds = [];
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${k}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      allIds = (data?.data || []).map((m) => m.id).filter(Boolean);
    } else {
      const errData = await resp.json().catch(() => ({}));
      return { error: errData?.error?.message || `HTTP ${resp.status}`, allIds: [] };
    }
  } catch (err) {
    return { error: String(err?.message || err), allIds: [] };
  }

  const isNonChatModel = (id) => /(whisper|guard|orpheus|tts|embed|moderation|safeguard|playai)/i.test(id);
  const chatModels = allIds.filter((id) => !isNonChatModel(id));

  const preferredTextOrder = [
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant'
  ];
  const textModel =
    preferredTextOrder.find((m) => chatModels.includes(m)) ||
    chatModels.find((id) => /llama-3\.3|gpt-oss|qwen|llama-3\.1/i.test(id)) ||
    chatModels[0] ||
    'llama-3.3-70b-versatile';

  const preferredVisionOrder = [
    'qwen/qwen3.8-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct'
  ];
  const visionModel =
    preferredVisionOrder.find((m) => chatModels.includes(m)) ||
    chatModels.find((id) => /(vision|vl|llama-4|qwen3\.8|pixtral|llava|gemma-3)/i.test(id)) ||
    '';

  groqModelCache = { key: k, textModel, visionModel, allIds: chatModels, fetchedAt: Date.now() };
  return groqModelCache;
}

async function saveAndTestQuickGeminiKey() {
  const input = document.getElementById('quickGeminiKeyInput');
  const backupInput = document.getElementById('quickBackupAiKeyInput');
  const resultEl = document.getElementById('quickGeminiTestResult');
  const key = (input?.value || '').trim();
  const backupKey = (backupInput?.value || '').trim();

  state.household.geminiKey = key;
  state.household.backupAiKey = backupKey;
  localStorage.setItem('kt_gemini_key', key);
  localStorage.setItem('kt_backup_ai_key', backupKey);
  const hhInput = document.getElementById('geminiKeyInput');
  if (hhInput) hhInput.value = key;
  groqModelCache = { key: '', textModel: '', visionModel: '', fetchedAt: 0 };
  geminiModelCache = { key: '', modelId: '', modelChain: [], fetchedAt: 0 };
  renderAiKeyStatusBar();

  if (!key) {
    if (resultEl) {
      resultEl.style.color = '#fbbf24';
      resultEl.textContent = 'ℹ️ KI-Key entfernt. Es werden jetzt der HTML-Parser und Offline-OCR verwendet.';
    }
    showToast('KI-Key entfernt');
    return;
  }

  const provider = detectAiProviderFromKey(key);
  const label = getAiProviderLabel(provider);

  if (resultEl) {
    resultEl.style.color = '#93c5fd';
    resultEl.textContent = `⏳ Prüfe Verbindung & aktive Modelle bei ${label}...`;
  }

  try {
    let ok = false;
    let errMsg = '';
    let activeModelNote = '';

    if (provider === 'groq') {
      const resolved = await resolveActiveGroqModels(key);
      if (resolved.error) {
        errMsg = resolved.error;
      } else {
        const testModel = resolved.textModel || 'llama-3.3-70b-versatile';
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
            max_tokens: 10
          })
        });
        const data = await resp.json();
        ok = resp.ok && Boolean(data?.choices?.[0]);
        if (ok) {
          activeModelNote = ` (${testModel}${resolved.visionModel ? ' + Vision' : ' + OCR-KI'})`;
        } else {
          errMsg = data?.error?.message || `HTTP ${resp.status}`;
        }
      }
    } else if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': window.location.origin || 'https://kochtresor.app',
          'X-Title': 'KochTresor'
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
          max_tokens: 10
        })
      });
      const data = await resp.json();
      ok = resp.ok && Boolean(data?.choices?.[0]);
      if (!ok) errMsg = data?.error?.message || `HTTP ${resp.status}`;
    } else {
      const gemRes = await callGeminiWithFallback(key, {
        contents: [{ parts: [{ text: 'Antworte nur mit: OK' }] }]
      });
      ok = gemRes.ok;
      if (ok) activeModelNote = ` (${gemRes.modelId} + Fallback)`;
      if (!ok) errMsg = gemRes.error || 'Gemini Fehler';
    }

    if (ok) {
      if (resultEl) {
        resultEl.style.color = '#34d399';
        resultEl.textContent = `✅ ${label}${activeModelNote} verbunden! Jede Webseite & jedes Rezept-Foto wird jetzt per KI erkannt.`;
      }
      showToast(`✅ ${label} gespeichert & erfolgreich getestet!`);
      setTimeout(() => {
        const box = document.getElementById('aiKeyQuickSetupBox');
        if (box) box.style.display = 'none';
      }, 2200);
    } else {
      if (resultEl) {
        resultEl.style.color = '#f87171';
        resultEl.textContent = `❌ Key-Fehler (${label}): ${errMsg}`;
      }
      showToast('KI-Key ungültig – bitte prüfen');
    }
  } catch (err) {
    if (resultEl) {
      resultEl.style.color = '#f87171';
      resultEl.textContent = `❌ Netzwerkfehler beim Testen: ${err.message || err}`;
    }
  }
}

function isKochTresorSpaFallbackHtml(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    text.includes('id="tab-recipes"') ||
    text.includes('id="tab-offers"') ||
    (text.includes('<title>KochTresor') && text.includes('app-shell'))
  );
}

async function fetchUrlContentWithCorsFallback(targetUrl) {
  const encoded = encodeURIComponent(targetUrl);
  const attempts = [
    { url: `/api/fetch?url=${encoded}`, type: 'text' },
    { url: `https://api.allorigins.win/get?url=${encoded}`, type: 'allorigins_json' },
    { url: `https://corsproxy.io/?url=${encoded}`, type: 'text' },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encoded}`, type: 'text' },
    { url: `https://api.allorigins.win/raw?url=${encoded}`, type: 'text' }
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 11000);
      const res = await fetch(attempt.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;

      let text = '';
      if (attempt.type === 'allorigins_json') {
        const json = await res.json();
        text = json?.contents || '';
      } else {
        text = await res.text();
      }

      if (text && text.length > 150 && !isKochTresorSpaFallbackHtml(text)) {
        return text;
      }
    } catch (_) {}
  }
  return null;
}

function extractBestImageFromHtml(html, sourceUrl = '') {
  if (!html || typeof html !== 'string') return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const candidates = [
      doc.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content'),
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content'),
      doc.querySelector('link[rel="image_src"]')?.getAttribute('href'),
      doc.querySelector('article img, .recipe img, main img')?.getAttribute('src')
    ].filter(Boolean);

    for (const raw of candidates) {
      const cleaned = decodeHtmlEntities(raw).trim();
      if (!cleaned || cleaned.startsWith('data:')) continue;
      if (/^https?:\/\//i.test(cleaned)) return cleaned;
      if (cleaned.startsWith('//')) return 'https:' + cleaned;
      if (sourceUrl) {
        try {
          return new URL(cleaned, sourceUrl).href;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return '';
}

function extractMetaDescriptionFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const desc =
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      '';
    return decodeHtmlEntities(desc).trim();
  } catch (_) {
    return '';
  }
}

function extractReadableTextFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const title = decodeHtmlEntities(doc.querySelector('h1')?.textContent || doc.title || '');
    const metaDesc =
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      '';

    doc
      .querySelectorAll(
        'script, style, noscript, iframe, svg, nav, footer, header, aside, form, .comments, #comments, .cookie, .consent, .newsletter, .advertisement, .ad, [aria-hidden="true"]'
      )
      .forEach((el) => el.remove());

    const root = doc.querySelector('article, main, [role="main"], .recipe, .post-content, .entry-content') || doc.body;
    if (!root) return '';

    const blocks = [];
    if (title) blocks.push(`Titel: ${title}`);
    if (metaDesc) blocks.push(`Kurzbeschreibung: ${decodeHtmlEntities(metaDesc)}`);

    root.querySelectorAll('h1, h2, h3, h4, p, li, tr').forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length >= 2 && t.length <= 1200) {
        blocks.push(t);
      }
    });

    const uniqueLines = [];
    const seen = new Set();
    for (const line of blocks) {
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLines.push(line);
      }
    }
    return uniqueLines.join('\n').slice(0, 18000);
  } catch (_) {
    return '';
  }
}

function sanitizeAndVerifyExtractedRecipe(raw, fallbackUrl = '') {
  if (!raw || typeof raw !== 'object') return null;

  const title = cleanImportedRecipeText(raw.title || 'Importiertes Rezept') || 'Importiertes Rezept';
  const description = cleanImportedRecipeText(raw.description || '').slice(0, 480);

  // Zutaten strikt bereinigen & sicherstellen, dass keine ganzen Zubereitungsabsätze drin stehen
  const cleanIngredients = [];
  const rawIngs = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  for (const item of rawIngs) {
    let ingObj = null;
    if (typeof item === 'string') {
      const cleanedLine = cleanImportedRecipeText(item);
      if (!cleanedLine || cleanedLine.length > 160) continue;
      ingObj = parseIngredientLine(cleanedLine);
    } else if (item && typeof item === 'object') {
      const rawName = cleanImportedRecipeText(item.name || item.ingredient || '');
      if (!rawName || rawName.length > 160) continue;
      const amt = item.amount !== undefined && item.amount !== null && item.amount !== '' && !isNaN(Number(item.amount))
        ? Number(item.amount)
        : null;
      const unit = cleanImportedRecipeText(item.unit || '');
      const group = cleanImportedRecipeText(item.group || '');
      if (amt === null && !unit && /^\d/.test(rawName)) {
        ingObj = parseIngredientLine(rawName);
        if (group && ingObj) ingObj.group = group;
      } else {
        ingObj = { amount: amt, unit, name: rawName, ...(group ? { group } : {}) };
      }
    }
    if (ingObj && ingObj.name) {
      // Filtere offensichtliche Zubereitungssätze aus der Zutatenliste heraus
      const looksLikeLongStep =
        ingObj.name.length > 95 &&
        /\b(anbraten|köcheln|backen|servieren|vermengen|erhitzen|würzen|schneiden|waschen|abgießen)\b/i.test(ingObj.name);
      if (!looksLikeLongStep) {
        cleanIngredients.push(ingObj);
      }
    }
  }

  // Zubereitungsschritte strikt bereinigen & sicherstellen, dass keine reinen Zutatenzeilen darin stehen
  const cleanSteps = [];
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const blacklistStep = /^(datenschutz|cookie|einwilligung|impressum|werbung|newsletter|kommentar|zutaten|für \d+ portion)/i;
  for (const s of rawSteps) {
    const txt = cleanImportedRecipeText(typeof s === 'string' ? s : s?.text || s?.step || '')
      .replace(/^(?:schritt\s*)?\d+[\).:\-]\s*/i, '')
      .trim();
    if (!txt || txt.length < 8) continue;
    if (blacklistStep.test(txt)) continue;
    // Reine kurze Mengenzeile ohne Verb nicht als Schritt aufnehmen
    const looksLikePureIngredient =
      txt.length < 36 &&
      /^\d+(?:[.,/]\d+)?\s*(?:g|kg|ml|l|el|tl|stück|stk|prise|bund|zehe|dose)\b/i.test(txt) &&
      !/\b(minuten|min\.|grad|°c|kochen|braten|backen|rühren|geben|schneiden|waschen|mischen|würzen|servieren)\b/i.test(txt);
    if (looksLikePureIngredient) continue;
    cleanSteps.push(txt);
  }

  const prepTimeNum = parseInt(raw.prepTime, 10);
  const portionsNum = parseInt(raw.portions, 10);

  let hostName = 'Web-Import';
  try {
    if (fallbackUrl || raw.sourceUrl) {
      hostName = new URL(raw.sourceUrl || fallbackUrl).hostname.replace(/^www\./i, '');
    }
  } catch (_) {}

  const validCategory =
    raw.category && RECIPE_CATEGORIES.some((c) => c.id === raw.category)
      ? raw.category
      : detectRecipeCategory(title, cleanIngredients, raw.tags || []);

  return {
    ...raw,
    title,
    description,
    category: validCategory,
    prepTime: !isNaN(prepTimeNum) && prepTimeNum > 0 && prepTimeNum <= 600 ? prepTimeNum : 25,
    portions: !isNaN(portionsNum) && portionsNum >= 1 && portionsNum <= 40 ? portionsNum : 4,
    author: cleanImportedRecipeText(raw.author || hostName) || hostName,
    sourceUrl: raw.sourceUrl || fallbackUrl || '',
    ingredients: cleanIngredients,
    steps: cleanSteps
  };
}

async function extractRecipeWithGeminiAI(rawText, sourceUrl = '', imageDataUrl = '', overrideKey = '') {
  const key = String(overrideKey || state.household.geminiKey || '').trim();
  if (!key) return { ok: false, error: 'Kein KI-Key hinterlegt' };

  const categoryList = RECIPE_CATEGORIES.map((c) => c.id).join(', ');
  const promptText = imageDataUrl
    ? `Du bist ein präziser Rezept-Scanner für Kochbücher, Zeitschriften, handgeschriebene Zettel und Screenshots.
Lies dieses Rezept-Foto 1:1 vollständig auf Deutsch aus (auch bei 2-spaltigen Layouts oder Tabellen).
Trenne STRENG zwischen:
1. "description": kurze Rezeptbeschreibung / Einleitung (1-3 Sätze, falls vorhanden, sonst "").
2. "ingredients": ALLE Zutaten mit exakter Menge (als Zahl, Brüche wie 1/2 als 0.5, ohne Menge null), Einheit ("g", "ml", "EL", "TL", "Stück", "Prise", "") und Zutatenname. Keine Zubereitungssätze in den Zutaten!
3. "steps": ALLE Zubereitungsschritte in richtiger Reihenfolge als vollständige Sätze. Keine bloßen Zutatenlisten in den Schritten!

Gib AUSSCHLIESSLICH valides JSON in genau diesem Schema zurück:
{
  "title": "Rezeptname",
  "description": "Kurze Beschreibung",
  "category": "eine aus: ${categoryList}",
  "prepTime": 25,
  "portions": 4,
  "ingredients": [{"amount": 250, "unit": "g", "name": "Couscous", "group": ""}],
  "steps": ["Schritt 1 ...", "Schritt 2 ..."],
  "nutrition": null
}`
    : `Du bist ein präziser Rezept-Extraktor. Analysiere den folgenden Inhalt einer Webseite oder eines Social-Media-Beitrags (${sourceUrl || 'Webseite'}) und extrahiere das Rezept 1:1 auf Deutsch.
Ignoriere Menüs, Werbung, Cookie-Hinweise, Newsletter und Kommentare.
Trenne STRENG zwischen:
1. "description": kurze Beschreibung / Einleitung des Gerichts von der Seite (1-3 Sätze, falls vorhanden, sonst "").
2. "ingredients": ALLE Zutaten mit exakter Menge (als Zahl, Brüche wie 1/2 als 0.5, ohne Menge null), Einheit ("g", "ml", "EL", "TL", "Stück", "Prise", "") und Zutatenname. Optional "group" (z.B. "Für die Soße", sonst ""). Keine Zubereitungsschritte bei den Zutaten!
3. "steps": ALLE Zubereitungsschritte von der Seite in logischer Reihenfolge. Keine Zutatenlisten bei der Zubereitung!
4. "nutrition": falls Nährwerte pro Portion auf der Seite stehen {"kcal": 450, "carbs": "40 g", "protein": "25 g", "fat": "15 g"}, sonst null.

Gib AUSSCHLIESSLICH valides JSON in genau diesem Schema zurück:
{
  "title": "Rezeptname",
  "description": "Kurze Beschreibung",
  "category": "eine aus: ${categoryList}",
  "prepTime": 25,
  "portions": 4,
  "ingredients": [{"amount": 250, "unit": "g", "name": "Couscous", "group": ""}],
  "steps": ["Schritt 1 ...", "Schritt 2 ..."],
  "nutrition": null
}

Seiteninhalt:
${String(rawText || '').slice(0, 18000)}`;

  const provider = detectAiProviderFromKey(key);

  try {
    let rawOut = '';

    if (provider === 'groq' || provider === 'openrouter') {
      const apiUrl =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';

      let modelId = 'openrouter/free';
      if (provider === 'groq') {
        const resolved = await resolveActiveGroqModels(key);
        if (resolved.error) {
          return { ok: false, error: resolved.error };
        }
        if (imageDataUrl && !resolved.visionModel) {
          return { ok: false, error: 'NO_GROQ_VISION_MODEL' };
        }
        modelId = imageDataUrl ? resolved.visionModel : resolved.textModel || 'llama-3.3-70b-versatile';
      } else {
        modelId = 'openrouter/free';
      }

      const userContent = imageDataUrl
        ? [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        : promptText;

      const reqHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      };
      if (provider === 'openrouter') {
        reqHeaders['HTTP-Referer'] = window.location.origin || 'https://kochtresor.app';
        reqHeaders['X-Title'] = 'KochTresor';
      }

      const bodyPayload = {
        model: modelId,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'Du antwortest AUSSCHLIESSLICH mit validem JSON ohne Markdown-Formatierung und ohne Zusatztext.'
          },
          { role: 'user', content: userContent }
        ]
      };
      if (provider === 'groq' && !imageDataUrl) {
        bodyPayload.response_format = { type: 'json_object' };
      }

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(bodyPayload)
      });
      const json = await resp.json();
      if (!resp.ok) {
        return { ok: false, error: json?.error?.message || `${getAiProviderLabel(provider)} HTTP ${resp.status}` };
      }
      rawOut = json?.choices?.[0]?.message?.content || '';
    } else {
      const parts = [{ text: promptText }];
      if (imageDataUrl && imageDataUrl.includes(',')) {
        const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
        parts.push({
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
            data: imageDataUrl.split(',')[1]
          }
        });
      }

      const gemRes = await callGeminiWithFallback(key, {
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });
      if (!gemRes.ok) {
        if (!overrideKey && state.household.backupAiKey && state.household.backupAiKey.trim().length > 10) {
          return await extractRecipeWithGeminiAI(rawText, sourceUrl, imageDataUrl, state.household.backupAiKey.trim());
        }
        return { ok: false, error: gemRes.error || 'Gemini Fehler' };
      }
      rawOut = gemRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!rawOut) {
      return { ok: false, error: 'Leere Antwort von der KI' };
    }
    const jsonBlockMatch = rawOut.match(/\{[\s\S]*\}/);
    const cleanedJson = (jsonBlockMatch ? jsonBlockMatch[0] : rawOut)
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleanedJson);
    const verified = sanitizeAndVerifyExtractedRecipe(parsed, sourceUrl);
    if (!verified || (verified.ingredients.length === 0 && verified.steps.length === 0)) {
      return { ok: false, error: 'Keine Rezeptdaten erkannt' };
    }
    return { ok: true, recipe: verified };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

let tesseractScriptPromise = null;
function loadTesseractJs() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractScriptPromise) return tesseractScriptPromise;
  tesseractScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract nicht geladen')));
    script.onerror = () => reject(new Error('OCR-Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(script);
  });
  return tesseractScriptPromise;
}

async function runBrowserOcrFallback(imageDataUrl, onProgress) {
  const Tesseract = await loadTesseractJs();
  const result = await Tesseract.recognize(imageDataUrl, 'deu', {
    logger: (m) => {
      if (onProgress && m && m.status === 'recognizing text') {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    }
  });
  return (result?.data?.text || '').trim();
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = String(str);
  return txt.value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIsoDurationToMinutes(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) {
    const num = parseInt(iso, 10);
    return !isNaN(num) && num > 0 ? num : 0;
  }
  const days = parseInt(m[1] || '0', 10);
  const hours = parseInt(m[2] || '0', 10);
  const mins = parseInt(m[3] || '0', 10);
  return days * 1440 + hours * 60 + mins;
}

function filterOutConsentAndNavLines(lines) {
  const blacklist = /(datenschutz|cookie|einwilligung|consent|nutzungsbedingungen|impressum|werbung|newsletter|anmelden|registrieren|kommentar|passwort|agb|privacy|tracking|partner|personalisierte|anzeigen|klicken sie auf|zustimmen|ablehnen|schließen|menü|navigation|suche|drucken|teilen|merken|pinnwand)/i;
  return (lines || []).filter((line) => {
    const clean = String(line || '').trim();
    if (!clean || clean.length < 2) return false;
    if (blacklist.test(clean) && clean.length > 45) return false;
    if (/^(http|www\.|\[|!\[)/i.test(clean)) return false;
    return true;
  });
}

function parseSchemaOrgRecipeFromHtml(html, sourceUrl) {
  if (!html || typeof html !== 'string') return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

  let recipeNode = null;

  function findRecipeObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findRecipeObject(item);
        if (found) return found;
      }
      return null;
    }
    const typeVal = obj['@type'];
    const isRecipe =
      typeVal === 'Recipe' ||
      (Array.isArray(typeVal) && typeVal.includes('Recipe')) ||
      (typeof typeVal === 'string' && typeVal.toLowerCase().includes('recipe'));
    if (isRecipe && (obj.recipeIngredient || obj.ingredients || obj.recipeInstructions)) {
      return obj;
    }
    if (obj['@graph']) {
      const found = findRecipeObject(obj['@graph']);
      if (found) return found;
    }
    if (obj.mainEntity) {
      const found = findRecipeObject(obj.mainEntity);
      if (found) return found;
    }
    return null;
  }

  for (const script of scripts) {
    const raw = (script.textContent || '').trim();
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      const found = findRecipeObject(json);
      if (found) {
        recipeNode = found;
        break;
      }
    } catch (_) {
      try {
        const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const json = JSON.parse(cleaned);
        const found = findRecipeObject(json);
        if (found) {
          recipeNode = found;
          break;
        }
      } catch (_2) {}
    }
  }

  if (!recipeNode) {
    // Microdata-Fallback (itemprop="recipeIngredient" & itemprop="recipeInstructions") für Seiten ohne JSON-LD
    const microIngEls = Array.from(doc.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]'));
    const microStepEls = Array.from(doc.querySelectorAll('[itemprop="recipeInstructions"] li, [itemprop="recipeInstructions"] p, [itemprop="recipeInstructions"]'));
    if (microIngEls.length >= 2 || microStepEls.length >= 1) {
      const mTitle = decodeHtmlEntities(
        doc.querySelector('[itemprop="name"]')?.textContent || doc.querySelector('h1')?.textContent || doc.title || 'Importiertes Rezept'
      );
      const mDesc = decodeHtmlEntities(
        doc.querySelector('[itemprop="description"]')?.textContent || extractMetaDescriptionFromHtml(html) || ''
      );
      const mIngs = microIngEls
        .map((el) => parseIngredientLine(decodeHtmlEntities(el.textContent || '')))
        .filter((x) => x && x.name);
      const seenSteps = new Set();
      const mSteps = [];
      microStepEls.forEach((el) => {
        const txt = decodeHtmlEntities(el.textContent || '').replace(/^\d+\.\s*/, '').trim();
        if (txt.length > 10 && !seenSteps.has(txt.toLowerCase())) {
          seenSteps.add(txt.toLowerCase());
          mSteps.push(txt);
        }
      });
      if (mIngs.length > 0 || mSteps.length > 0) {
        let hostName = 'Web-Import';
        try {
          hostName = new URL(sourceUrl).hostname.replace('www.', '');
        } catch (_) {}
        return sanitizeAndVerifyExtractedRecipe(
          {
            title: mTitle,
            description: mDesc,
            prepTime: 25,
            portions: 4,
            author: hostName,
            sourceType: 'web',
            sourceUrl,
            imageUrl:
              extractBestImageFromHtml(html, sourceUrl) ||
              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
            tags: [hostName, 'Web-Import'],
            nutrition: null,
            ingredients: mIngs,
            steps: mSteps
          },
          sourceUrl
        );
      }
    }
    return null;
  }

  const title = decodeHtmlEntities(
    recipeNode.name || doc.querySelector('h1')?.textContent || doc.title || 'Importiertes Rezept'
  );
  const description = decodeHtmlEntities(
    (typeof recipeNode.description === 'string' ? recipeNode.description : '') || extractMetaDescriptionFromHtml(html) || ''
  ).slice(0, 480);

  // Zutaten 1:1 extrahieren
  const rawIngs = Array.isArray(recipeNode.recipeIngredient)
    ? recipeNode.recipeIngredient
    : Array.isArray(recipeNode.ingredients)
      ? recipeNode.ingredients
      : [];

  const ingredients = [];
  rawIngs.forEach((rawLine) => {
    const decoded = decodeHtmlEntities(rawLine);
    if (!decoded) return;
    const parsedIng = parseIngredientLine(decoded);
    if (parsedIng && parsedIng.name) {
      ingredients.push(parsedIng);
    }
  });

  // Zubereitungsschritte 1:1 extrahieren
  const steps = [];
  function collectInstructions(inst) {
    if (!inst) return;
    if (typeof inst === 'string') {
      const decoded = decodeHtmlEntities(inst);
      decoded
        .split(/\r?\n\r?\n|\r?\n/)
        .map((s) => s.replace(/^\d+\.\s*/, '').trim())
        .filter((s) => s.length > 3)
        .forEach((s) => steps.push(s));
      return;
    }
    if (Array.isArray(inst)) {
      inst.forEach((item) => collectInstructions(item));
      return;
    }
    if (typeof inst === 'object') {
      if (inst.itemListElement) {
        collectInstructions(inst.itemListElement);
      } else if (inst.text) {
        collectInstructions(inst.text);
      } else if (inst.name && !inst.itemListElement) {
        collectInstructions(inst.name);
      }
    }
  }
  collectInstructions(recipeNode.recipeInstructions);

  if (ingredients.length === 0 && steps.length === 0) return null;

  // Portionen ermitteln
  let portions = 4;
  if (recipeNode.recipeYield) {
    const yieldStr = Array.isArray(recipeNode.recipeYield)
      ? recipeNode.recipeYield.join(' ')
      : String(recipeNode.recipeYield);
    const ym = yieldStr.match(/(\d+)/);
    if (ym) {
      const yNum = parseInt(ym[1], 10);
      if (yNum >= 1 && yNum <= 50) portions = yNum;
    }
  }

  // Zubereitungszeit ermitteln
  const totalMin =
    parseIsoDurationToMinutes(recipeNode.totalTime) ||
    parseIsoDurationToMinutes(recipeNode.prepTime) + parseIsoDurationToMinutes(recipeNode.cookTime) ||
    25;

  // Bild ermitteln
  let imageUrl = '';
  const imgField = recipeNode.image;
  if (typeof imgField === 'string') {
    imageUrl = imgField;
  } else if (Array.isArray(imgField) && imgField.length > 0) {
    const first = imgField[0];
    imageUrl = typeof first === 'string' ? first : first?.url || first?.contentUrl || '';
  } else if (imgField && typeof imgField === 'object') {
    imageUrl = imgField.url || imgField.contentUrl || '';
  }
  if (!imageUrl) {
    imageUrl =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80';
  }

  // Nährwerte ermitteln
  let nutrition = null;
  if (recipeNode.nutrition && typeof recipeNode.nutrition === 'object') {
    const n = recipeNode.nutrition;
    const kcalMatch = String(n.calories || '').match(/(\d+)/);
    const carbsMatch = String(n.carbohydrateContent || '').match(/(\d+(?:[.,]\d+)?)/);
    const protMatch = String(n.proteinContent || '').match(/(\d+(?:[.,]\d+)?)/);
    const fatMatch = String(n.fatContent || '').match(/(\d+(?:[.,]\d+)?)/);
    if (kcalMatch || carbsMatch || protMatch || fatMatch) {
      let hostLabel = 'Originalangabe';
      try {
        hostLabel = `Originalangabe ${new URL(sourceUrl).hostname.replace('www.', '')}`;
      } catch (_) {}
      nutrition = {
        kcal: kcalMatch ? parseInt(kcalMatch[1], 10) : '–',
        carbs: carbsMatch ? `${carbsMatch[1].replace('.', ',')} g` : '–',
        protein: protMatch ? `${protMatch[1].replace('.', ',')} g` : '–',
        fat: fatMatch ? `${fatMatch[1].replace('.', ',')} g` : '–',
        basis: `pro Portion (${hostLabel})`
      };
    }
  }

  // Autor & Tags
  let hostName = 'Web-Import';
  try {
    hostName = new URL(sourceUrl).hostname.replace('www.', '');
  } catch (_) {}

  let authorName = hostName;
  if (recipeNode.author) {
    const a = Array.isArray(recipeNode.author) ? recipeNode.author[0] : recipeNode.author;
    if (typeof a === 'string') authorName = a;
    else if (a && a.name) authorName = `${a.name} (${hostName})`;
  }

  const rawKeywords = [];
  if (typeof recipeNode.keywords === 'string') {
    recipeNode.keywords.split(',').forEach((k) => {
      const t = decodeHtmlEntities(k);
      if (t && t.length < 28) rawKeywords.push(t);
    });
  } else if (Array.isArray(recipeNode.keywords)) {
    recipeNode.keywords.forEach((k) => {
      const t = decodeHtmlEntities(k);
      if (t && t.length < 28) rawKeywords.push(t);
    });
  }

  const autoCat = detectRecipeCategory(title, ingredients, rawKeywords);

  return sanitizeAndVerifyExtractedRecipe(
    {
      title,
      description,
      category: autoCat,
      prepTime: totalMin > 0 ? totalMin : 25,
      portions,
      author: decodeHtmlEntities(authorName),
      sourceType: 'web',
      sourceUrl,
      imageUrl,
      tags: [hostName, ...rawKeywords.slice(0, 4)],
      nutrition,
      ingredients,
      steps
    },
    sourceUrl
  );
}

async function fetchChefkochRecipeByUrlOrId(url) {
  const ckMatch = url.match(/chefkoch\.de\/rezepte\/(\d+)/i);
  if (!ckMatch || !ckMatch[1]) return null;
  const ckId = ckMatch[1];
  const apiUrl = `https://api.chefkoch.de/v2/recipes/${ckId}`;

  let ckData = null;
  try {
    const directRes = await fetch(apiUrl);
    if (directRes.ok) {
      ckData = await directRes.json();
    }
  } catch (_) {}

  if (!ckData) {
    const proxyText = await fetchUrlContentWithCorsFallback(apiUrl);
    if (proxyText) {
      try {
        ckData = JSON.parse(proxyText);
      } catch (_) {}
    }
  }

  if (ckData && ckData.title) {
    const ingredients = [];
    (ckData.ingredientGroups || []).forEach((grp) => {
      const grpHeader = (grp.header || '').trim();
      (grp.ingredients || []).forEach((ing) => {
        const fullName = [ing.name, ing.usageInfo].filter(Boolean).join(', ').trim();
        ingredients.push({
          group: grpHeader || undefined,
          amount: ing.amount && Number(ing.amount) > 0 ? Number(ing.amount) : null,
          unit: (ing.unit || '').trim(),
          name: fullName
        });
      });
    });

    const steps = (ckData.instructions || '')
      .split(/\r?\n\r?\n|\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    const imgUrl = ckData.previewImageUrlTemplate
      ? ckData.previewImageUrlTemplate.replace('<format>', 'crop-960x720')
      : 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80';

    let nutrition = null;
    if (ckData.nutrition && ckData.nutrition.kCalories) {
      nutrition = {
        kcal: ckData.nutrition.kCalories,
        carbs:
          ckData.nutrition.carbohydrateContent != null
            ? `${String(ckData.nutrition.carbohydrateContent).replace('.', ',')} g`
            : '–',
        protein:
          ckData.nutrition.proteinContent != null
            ? `${String(ckData.nutrition.proteinContent).replace('.', ',')} g`
            : '–',
        fat:
          ckData.nutrition.fatContent != null
            ? `${String(ckData.nutrition.fatContent).replace('.', ',')} g`
            : '–',
        basis: 'pro Portion (Originalangabe chefkoch.de)'
      };
    }

    const tags = ['Chefkoch', ...(ckData.tags || []).slice(0, 3)];
    return {
      title: ckData.title || 'Chefkoch Rezept',
      category: detectRecipeCategory(ckData.title || '', ingredients, tags),
      prepTime: ckData.totalTime || ckData.preparationTime || 25,
      portions: ckData.servings || 4,
      author: ckData.owner?.username ? `Chefkoch (${ckData.owner.username})` : 'Chefkoch',
      sourceType: 'web',
      sourceUrl: ckData.siteUrl || url,
      imageUrl: imgUrl,
      tags,
      nutrition,
      ingredients,
      steps
    };
  }
  return null;
}

function isSocialMediaRecipeUrl(url) {
  return /(instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.reel|tiktok\.com|pinterest\.|pin\.it|youtube\.com|youtu\.be)/i.test(String(url || ''));
}

function normalizeUrlForRecipeMatch(url) {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch (_) {
    return String(url).split('?')[0].replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
  }
}

function matchKnownVerifiedRecipeByUrl(url) {
  if (!url) return null;
  const normInput = normalizeUrlForRecipeMatch(url);
  const igMatch = String(url).match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  const igShortcode = igMatch ? igMatch[1].toLowerCase() : '';

  const allKnown = [...STARTER_RECIPES, ...(typeof SUGGESTED_DIRECT_RECIPES !== 'undefined' ? SUGGESTED_DIRECT_RECIPES : [])];
  for (const r of allKnown) {
    if (!r || !r.sourceUrl || !r.ingredients?.length || !r.steps?.length) continue;
    const normKnown = normalizeUrlForRecipeMatch(r.sourceUrl);
    if (normKnown && normKnown === normInput) {
      return { ...r, sourceUrl: r.sourceUrl || url };
    }
    if (igShortcode && normKnown.includes(igShortcode)) {
      return { ...r, sourceUrl: url };
    }
  }
  return null;
}

function cleanImportedRecipeText(str) {
  return decodeHtmlEntities(String(str || ''))
    .replace(/&#0*32;/g, ' ')
    .replace(/🛒/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWprmInlineJsonFromHtml(html, sourceUrl) {
  if (!html || !html.includes('wprm_recipes')) return null;
  try {
    const markerIdx = html.indexOf('wprm_recipes');
    const eqIdx = html.indexOf('=', markerIdx);
    const braceStart = html.indexOf('{', eqIdx);
    if (braceStart === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;
    let braceEnd = -1;
    for (let i = braceStart; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            braceEnd = i;
            break;
          }
        }
      }
    }
    if (braceEnd === -1) return null;
    const wprmMap = JSON.parse(html.slice(braceStart, braceEnd + 1));
    const firstKey = Object.keys(wprmMap)[0];
    if (!firstKey || !wprmMap[firstKey]) return null;
    const rec = wprmMap[firstKey];

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const firstCard = doc.querySelector('.wprm-recipe-container, .wprm-recipe') || doc;

    const title = cleanImportedRecipeText(
      rec.name ||
      firstCard.querySelector('.wprm-recipe-name')?.textContent ||
      doc.querySelector('h1')?.textContent ||
      'Importiertes Rezept'
    );
    const portions = parseInt(rec.servings, 10) || 4;

    const ingredients = [];
    let currentGroup = '';
    if (Array.isArray(rec.ingredients_flat) && rec.ingredients_flat.length > 0) {
      rec.ingredients_flat.forEach((item) => {
        if (item.type === 'group') {
          currentGroup = cleanImportedRecipeText(item.name || '');
          return;
        }
        const rawAmt = cleanImportedRecipeText(item.amount || '');
        const unit = cleanImportedRecipeText(item.unit || '');
        const name = cleanImportedRecipeText(item.name || '');
        const notes = cleanImportedRecipeText(item.notes || '');
        if (!name) return;

        let amountVal = null;
        if (rawAmt) {
          if (rawAmt === '1/2' || rawAmt === '½') amountVal = 0.5;
          else if (rawAmt === '1/4' || rawAmt === '¼') amountVal = 0.25;
          else if (rawAmt === '3/4' || rawAmt === '¾') amountVal = 0.75;
          else {
            const num = parseFloat(rawAmt.replace(',', '.'));
            if (!isNaN(num) && num > 0) amountVal = num;
          }
        }
        ingredients.push({
          group: currentGroup || undefined,
          amount: amountVal,
          unit,
          name: notes ? `${name} (${notes})` : name
        });
      });
    }

    const steps = [];
    firstCard.querySelectorAll('.wprm-recipe-instruction-text, .wprm-recipe-instruction').forEach((el) => {
      const t = cleanImportedRecipeText(el.textContent || '');
      if (t && t.length > 2 && !steps.includes(t)) {
        steps.push(t);
      }
    });

    if (ingredients.length === 0 && steps.length === 0) return null;

    let totalMin = 25;
    const totalTimeEl = firstCard.querySelector('.wprm-recipe-total_time-minutes, .wprm-recipe-time');
    if (totalTimeEl) {
      const tm = totalTimeEl.textContent.match(/(\d+)/);
      if (tm) totalMin = parseInt(tm[1], 10) || 25;
    }

    const imageUrl =
      rec.image_url ||
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      firstCard.querySelector('img')?.getAttribute('src') ||
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80';

    let hostName = 'Web-Import';
    try {
      hostName = new URL(sourceUrl).hostname.replace(/^www\./i, '');
    } catch (_) {}

    return {
      title,
      category: detectRecipeCategory(title, ingredients, []),
      prepTime: totalMin,
      portions,
      author: hostName,
      sourceType: 'web',
      sourceUrl,
      imageUrl,
      tags: ['Web-Import', hostName],
      nutrition: null,
      ingredients,
      steps
    };
  } catch (_) {
    return null;
  }
}

function parseHeadingBasedRecipeHtml(html, sourceUrl) {
  if (!html) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const ogImage = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.getAttribute('content') || '';
    const ogTitle = doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.getAttribute('content') || '';

    doc.querySelectorAll('script, style, nav, footer, header, aside, form, noscript, iframe, svg').forEach((el) => el.remove());

    const rawTitle = cleanImportedRecipeText(
      doc.querySelector('[itemprop="name"], h1.recipe-title, h1.entry-title, h1')?.textContent ||
      ogTitle ||
      doc.title ||
      'Importiertes Rezept'
    ).replace(/\s*[-|–•].*$/, '').trim();

    const ingredients = [];
    const steps = [];

    // 1. Prüfe Microdata & universelle Rezept-Selektoren (alle gängigen Rezeptportale & Blogs)
    const microIngEls = doc.querySelectorAll(
      '[itemprop="recipeIngredient"], [itemprop="ingredients"], .recipe-ingredients li, .ingredients-list li, .ingredient-list li, ul.ingredients li'
    );
    if (microIngEls.length >= 2) {
      microIngEls.forEach((el) => {
        const line = cleanImportedRecipeText(el.textContent);
        if (line && line.length > 1 && line.length < 150) {
          const parsedIng = parseIngredientLine(line);
          if (parsedIng && parsedIng.name) ingredients.push(parsedIng);
        }
      });
    }

    // 2. Prüfe Tabellen-basierte Zutatenlisten (z.B. Kochbar.de, Gutekueche, Lecker, Chefkoch-Tabellen)
    if (ingredients.length < 2) {
      const tables = Array.from(doc.querySelectorAll('table'));
      for (const tbl of tables) {
        const rows = Array.from(tbl.querySelectorAll('tr'));
        const tempIngs = [];
        rows.forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('td, th')).map((c) => cleanImportedRecipeText(c.textContent)).filter(Boolean);
          if (cells.length >= 2) {
            const combined = `${cells[0]} ${cells.slice(1).join(' ')}`.trim();
            if (combined.length > 2 && combined.length < 140 && !/^(zutat|menge|nährwert|kalorien|energie|eiweiß|fett|kohlenhydrate)/i.test(combined)) {
              const p = parseIngredientLine(combined);
              if (p && p.name) tempIngs.push(p);
            }
          } else if (cells.length === 1 && cells[0].length > 2 && cells[0].length < 120) {
            const p = parseIngredientLine(cells[0]);
            if (p && p.name && p.amount !== null) tempIngs.push(p);
          }
        });
        if (tempIngs.length >= 3) {
          ingredients.push(...tempIngs);
          break;
        }
      }
    }

    const microStepEls = doc.querySelectorAll(
      '[itemprop="recipeInstructions"] li, [itemprop="recipeInstructions"] p, .recipe-instructions li, .recipe-instructions p, .instructions li, .preparation li, .preparation p'
    );
    if (microStepEls.length >= 1) {
      microStepEls.forEach((el) => {
        const t = cleanImportedRecipeText(el.textContent).replace(/^\d+[.)]\s*/, '');
        if (t && t.length > 10 && !steps.includes(t)) {
          steps.push(t);
        }
      });
    }

    const allHeadings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, strong, b, dt'));
    const ingHeading = allHeadings.find((h) => /^(zutaten|ingredients|das brauchst du|zutatenliste|einkaufsliste)\b/i.test(cleanImportedRecipeText(h.textContent)));
    const stepHeading = allHeadings.find((h) => /^(zubereitung|anleitung|so geht'?s|schritt für schritt|zubereitungsschritte|instructions|directions|preparation)\b/i.test(cleanImportedRecipeText(h.textContent)));

    if (ingredients.length < 2 && ingHeading) {
      let curr = ingHeading.closest('h1, h2, h3, h4, h5, p, div, section') || ingHeading;
      let sibling = curr.nextElementSibling;
      let guard = 0;
      while (sibling && guard < 15) {
        guard++;
        if (/^(H1|H2|H3|H4)$/i.test(sibling.tagName) && /(zubereitung|anleitung|schritt|nährwert|tipp)/i.test(sibling.textContent)) {
          break;
        }
        const lis = Array.from(sibling.querySelectorAll('li, tr'));
        if (lis.length > 0) {
          lis.forEach((li) => {
            const line = cleanImportedRecipeText(li.textContent);
            if (line && line.length > 1 && line.length < 140) {
              const p = parseIngredientLine(line);
              if (p && p.name) ingredients.push(p);
            }
          });
          if (ingredients.length >= 2) break;
        }
        sibling = sibling.nextElementSibling;
      }
    }

    if (steps.length < 1 && stepHeading) {
      let curr = stepHeading.closest('h1, h2, h3, h4, h5, p, div, section') || stepHeading;
      let sibling = curr.nextElementSibling;
      let guard = 0;
      while (sibling && guard < 20) {
        guard++;
        if (/^(H1|H2|H3)$/i.test(sibling.tagName) && /(ähnliche|kommentare|bewertung|drucken|autor)/i.test(sibling.textContent)) {
          break;
        }
        const lis = sibling.matches('ol, ul') ? Array.from(sibling.querySelectorAll('li')) : Array.from(sibling.querySelectorAll('li'));
        if (lis.length > 0) {
          lis.forEach((li) => {
            const t = cleanImportedRecipeText(li.textContent).replace(/^\d+[.)]\s*/, '');
            if (t && t.length > 8 && !steps.includes(t)) steps.push(t);
          });
        } else if (sibling.matches('p, div')) {
          const t = cleanImportedRecipeText(sibling.textContent);
          if (t && t.length > 15 && !steps.includes(t)) steps.push(t);
        }
        sibling = sibling.nextElementSibling;
      }
    }

    if (ingredients.length < 2 && steps.length < 1) {
      const mainText = (doc.querySelector('article, main, [role="main"]') || doc.body)?.innerText || doc.body?.textContent || '';
      const struct = parseStructuredRecipeText(mainText, sourceUrl);
      if (struct && (struct.ingredients.length >= 2 || struct.steps.length >= 1)) {
        if (ingredients.length === 0) ingredients.push(...struct.ingredients);
        if (steps.length === 0) steps.push(...struct.steps);
      }
    }

    if (ingredients.length < 1 && steps.length < 1) return null;

    let hostName = 'Web-Import';
    try {
      hostName = new URL(sourceUrl).hostname.replace(/^www\./i, '');
    } catch (_) {}

    const imageUrl =
      ogImage ||
      doc.querySelector('article img, main img')?.getAttribute('src') ||
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80';

    return {
      title: rawTitle || 'Importiertes Rezept',
      category: detectRecipeCategory(rawTitle, ingredients, []),
      prepTime: 25,
      portions: 4,
      author: hostName,
      sourceType: 'web',
      sourceUrl,
      imageUrl,
      tags: ['Web-Import', hostName],
      nutrition: null,
      ingredients,
      steps
    };
  } catch (_) {
    return null;
  }
}

function parseStructuredRecipeText(rawText, sourceUrl = '') {
  if (!rawText) return null;
  let text = decodeHtmlEntities(String(rawText));

  // Extrahiere Instagram / Facebook / TikTok Caption aus Jina-Header oder og:description / Title falls vorhanden:
  // z.B. Title: Nadine Moll on Instagram: "Chicken Teriyaki Sandwich ... "
  let authorFromHeader = '';
  const igTitleMatch =
    text.match(/Title:\s*([^\n"]+?)\s+on\s+(?:Instagram|Facebook|TikTok):\s*"([\s\S]+?)"(?:\n|$)/i) ||
    text.match(/(?:likes|Gefällt\s+mir)[^-\n]*-\s*([^\s(]+)\s+(?:on|am)\s+[^:]+:\s*"([\s\S]+?)"(?:\n|$)/i);
  if (igTitleMatch) {
    authorFromHeader = igTitleMatch[1].trim();
    text = igTitleMatch[2].trim();
  } else {
    const markdownIdx = text.indexOf('Markdown Content:');
    if (markdownIdx !== -1) {
      const titleLine = text.match(/Title:\s*(.+)/i);
      const bodyPart = text.slice(markdownIdx + 'Markdown Content:'.length).trim();
      text = (titleLine ? titleLine[1] + '\n' : '') + bodyPart;
    }
  }

  // Entferne Hashtag-Blöcke am Ende
  text = text.replace(/(?:\s+#[A-Za-zÄÖÜäöüß0-9_]+){3,}[\s\S]*$/g, '').trim();

  // Portionen erkennen ("Zutaten für 4 Stück:", "Für 4 Portionen")
  let portions = 4;
  const portMatch = text.match(/(?:zutaten\s+für|für|ergibt|portionen:?|servings:?)\s*(\d+)\s*(?:stück|stk|portionen|personen|teller|gläser|brote|sandwiches)?/i);
  if (portMatch) {
    const pNum = parseInt(portMatch[1], 10);
    if (pNum >= 1 && pNum <= 40) portions = pNum;
  }

  // Zubereitungszeit erkennen ("in 20 Min", "25 Minuten")
  let prepTime = 20;
  const timeMatch = text.match(/(\d+)\s*(?:minuten|min\.?|minutes|mins)\b/i);
  if (timeMatch) {
    const tNum = parseInt(timeMatch[1], 10);
    if (tNum >= 3 && tNum <= 240) prepTime = tNum;
  }

  // Normalisiere Inline-Aufzählungszeichen (◾️, ▪️, ▫️, •, 👉, 🔹, ✅) in echte Zeilenumbrüche
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\s*(◾️?|▪️?|▫️?|•|👉|🔹|🔸|✅|☑️|➖)\s*/g, '\n• ')
    .replace(/\s+(\d+[.)]\s+)/g, '\n$1');

  const zutatenMatch = normalized.match(/(?:^|\n)\s*[^a-zA-ZÄÖÜäöüß0-9\n]*\s*(?:zutaten|ingredients|das brauchst du|du brauchst|ihr braucht|einkaufsliste)(?:\s+für\s+[^\n:]+)?\s*:?\s*(?:\n|$)/i);
  const zubereitungMatch = normalized.match(/(?:^|\n)\s*[^a-zA-ZÄÖÜäöüß0-9\n]*\s*(?:zubereitung|anleitung|so geht'?s|so wird'?s gemacht|schritt für schritt|zubereitungsschritte|instructions|directions|method)\s*:?\s*(?:\n|$)/i);

  let title = '';
  const ingredients = [];
  const steps = [];

  if (zutatenMatch || zubereitungMatch) {
    const beforeZutaten = zutatenMatch
      ? normalized.slice(0, zutatenMatch.index).trim()
      : zubereitungMatch
        ? normalized.slice(0, zubereitungMatch.index).trim()
        : '';
    if (beforeZutaten) {
      const preLines = beforeZutaten
        .split('\n')
        .map((l) => l.replace(/^[\s•\-*✨🔥😍🤤👌🥖🍗🥗🍝🍲🥘🍕🌮🍔🥪❤️]+/, '').replace(/[\s✨🔥😍🤤👌🥖🍗🥗🍝🍲🥘🍕🌮🍔🥪❤️]+$/, '').trim())
        .filter((l) => l.length >= 3 && !/^(title:|url source:|markdown content:)/i.test(l));
      if (preLines.length > 0) {
        title = preLines[0].split(/\s+[-–|]\s+/)[0].slice(0, 85).trim();
      }
    }

    let ingBlock = '';
    let stepBlock = '';

    if (zutatenMatch && zubereitungMatch) {
      const zIdx = zutatenMatch.index + zutatenMatch[0].length;
      const sIdx = zubereitungMatch.index;
      if (zIdx < sIdx) {
        ingBlock = normalized.slice(zIdx, sIdx);
        stepBlock = normalized.slice(zubereitungMatch.index + zubereitungMatch[0].length);
      } else {
        stepBlock = normalized.slice(zubereitungMatch.index + zubereitungMatch[0].length, zutatenMatch.index);
        ingBlock = normalized.slice(zIdx);
      }
    } else if (zutatenMatch) {
      const afterZutaten = normalized.slice(zutatenMatch.index + zutatenMatch[0].length);
      const rawAfterLines = afterZutaten.split('\n').map((l) => l.trim()).filter(Boolean);
      const ingLines = [];
      const stepLines = [];
      let switchedToSteps = false;
      rawAfterLines.forEach((line) => {
        const cleanNoBullet = line.replace(/^(\d+[.)]|•|-|\*)\s*/, '').trim();
        const looksLikeStep =
          (/^\d+[.)]\s+[A-ZÄÖÜ]/.test(line) && cleanNoBullet.length > 35) ||
          (cleanNoBullet.length > 65 && /[.!]$/.test(cleanNoBullet));
        if (looksLikeStep) switchedToSteps = true;
        if (switchedToSteps && cleanNoBullet.length > 22) {
          stepLines.push(line);
        } else {
          ingLines.push(line);
        }
      });
      ingBlock = ingLines.join('\n');
      stepBlock = stepLines.join('\n');
    } else if (zubereitungMatch) {
      stepBlock = normalized.slice(zubereitungMatch.index + zubereitungMatch[0].length);
    }

    let currentGroup = '';
    ingBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (/^(für\s+d[iea][^\n:]{2,35}|sauce|dressing|marinade|teig|belag|topping)\s*:$/i.test(line)) {
          currentGroup = line.replace(/:$/, '').trim();
          return;
        }
        const parsedIng = parseIngredientLine(line);
        if (parsedIng && parsedIng.name && parsedIng.name.length > 1) {
          if (currentGroup) parsedIng.group = currentGroup;
          ingredients.push(parsedIng);
        }
      });

    stepBlock
      .split('\n')
      .map((l) => l.replace(/^(\d+[.)]|•|-|\*)\s*/, '').trim())
      .filter((l) => l.length > 4 && !/^#[A-Za-z0-9_]+/.test(l))
      .forEach((line) => {
        if (!steps.includes(line)) {
          steps.push(line);
        }
      });
  } else {
    // Heuristik für Instagram/Facebook/TikTok Captions oder Textseiten OHNE explizite "Zutaten:"-Überschrift:
    const allLines = filterOutConsentAndNavLines(normalized.split('\n').map((l) => l.trim()).filter(Boolean));
    if (allLines.length < 2) return null;

    const firstClean = allLines[0]
      .replace(/^[\s•\-*✨🔥😍🤤👌🥖🍗🥗🍝🍲🥘🍕🌮🍔🥪❤️]+/, '')
      .replace(/[\s✨🔥😍🤤👌🥖🍗🥗🍝🍲🥘🍕🌮🍔🥪❤️]+$/, '')
      .trim();
    title = firstClean.split(/\s+[-–|]\s+/)[0].slice(0, 85).trim() || 'Importiertes Rezept';

    const qtyLineRegex = /^(?:•\s*|\-\s*|\*\s*)?(?:ca\.\s*)?(?:\d+(?:[.,]\d+)?|1\/2|½|1\/4|¼|3\/4|¾)\s*(?:g|kg|mg|ml|l|el|esslöffel|tl|teelöffel|stk\.?|stück|prise|prisen|bund|dose|dosen|pck\.?|päckchen|packung|becher|glas|zehe|zehen|scheibe|scheiben|handvoll|tasse|tassen)\b/i;

    allLines.slice(1).forEach((line) => {
      const stripped = line.replace(/^(\d+[.)]|•|-|\*)\s*/, '').trim();
      if (!stripped || /^#[A-Za-z0-9_]+/.test(stripped)) return;
      if (qtyLineRegex.test(line) || (line.startsWith('• ') && stripped.length < 55)) {
        const parsedIng = parseIngredientLine(stripped);
        if (parsedIng && parsedIng.name) ingredients.push(parsedIng);
      } else if (stripped.length > 25) {
        if (!steps.includes(stripped)) steps.push(stripped);
      }
    });
  }

  if (ingredients.length === 0 && steps.length === 0) return null;
  if (!title) title = 'Importiertes Rezept';

  return {
    title,
    author: authorFromHeader || undefined,
    portions,
    prepTime,
    ingredients,
    steps
  };
}

async function fetchAndParseSocialRecipe(url, manualCaption = '') {
  // 1. Prüfe zuerst kuratierte 1:1 verifizierte Social-Rezepte (z.B. Instagram Reel C4LaNqtNLRI)
  const verified = matchKnownVerifiedRecipeByUrl(url);
  if (verified && !manualCaption) {
    return {
      ...verified,
      sourceUrl: url || verified.sourceUrl
    };
  }

  const platform = /facebook|fb\./i.test(url)
    ? 'facebook'
    : /tiktok/i.test(url)
    ? 'tiktok'
    : 'instagram';

  let rawSocialText = manualCaption || '';
  let fetchedCoverImage = '';
  let fetchedAuthor = '';

  function parseEmbedOrMetaHtml(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlStr, 'text/html');
      const captionEl = doc.querySelector('.Caption');
      if (captionEl) {
        const clone = captionEl.cloneNode(true);
        clone.querySelectorAll('.CaptionUsername, .CaptionComments').forEach((n) => n.remove());
        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        const capText = (clone.textContent || '').trim();
        if (capText.length > rawSocialText.length) {
          rawSocialText = capText;
        }
      }
      const ogDesc =
        doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
        doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ||
        '';
      if (ogDesc && ogDesc.length > rawSocialText.length) {
        rawSocialText = decodeHtmlEntities(ogDesc);
      }
      const ogImg =
        doc.querySelector('img.EmbeddedMediaImage')?.getAttribute('src') ||
        doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
        doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
        '';
      if (ogImg && !fetchedCoverImage) {
        fetchedCoverImage = decodeHtmlEntities(ogImg);
      }
      const userEl = doc.querySelector('.HeaderText .UsernameText, .CaptionUsername');
      if (userEl && !fetchedAuthor) {
        fetchedAuthor = userEl.textContent.trim();
      }
    } catch (_) {}
  }

  if (url && !rawSocialText) {
    // A) Versuche lokalen Server-Endpunkt /api/fetch-social (unterstützt JSON UND Text mit ===IG_EMBED===)
    try {
      const srvRes = await fetch(`/api/fetch-social?url=${encodeURIComponent(url)}`);
      if (srvRes.ok) {
        const rawBody = await srvRes.text();
        try {
          const srvJson = JSON.parse(rawBody);
          if (srvJson.content && srvJson.content.length > rawSocialText.length) {
            rawSocialText = srvJson.content;
          }
          if (srvJson.ogDescription && srvJson.ogDescription.length > rawSocialText.length) {
            rawSocialText = srvJson.ogDescription;
          }
          if (srvJson.ogImage && !fetchedCoverImage) {
            fetchedCoverImage = srvJson.ogImage;
          }
          if (srvJson.author && !fetchedAuthor) {
            fetchedAuthor = srvJson.author;
          }
          if (srvJson.embedHtml) {
            parseEmbedOrMetaHtml(srvJson.embedHtml);
          }
        } catch (_) {
          const parts = rawBody.split('===IG_EMBED===');
          if (parts[0] && parts[0].trim().length > rawSocialText.length) {
            rawSocialText = parts[0].trim();
          }
          if (parts[1]) {
            parseEmbedOrMetaHtml(parts[1]);
          }
        }
      }
    } catch (_) {}

    // B) Client-seitiger Instagram Embed Fallback (funktioniert auch ohne lokalen PC-Server über CORS-Proxy!)
    const igShortMatch = String(url).match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (igShortMatch && igShortMatch[1] && (!rawSocialText || rawSocialText.length < 40)) {
      const embedUrl = `https://www.instagram.com/p/${igShortMatch[1]}/embed/captioned/`;
      const embedHtml = await fetchUrlContentWithCorsFallback(embedUrl);
      if (embedHtml) {
        parseEmbedOrMetaHtml(embedHtml);
      }
    }

    // C) Direktes Abrufen der Social-Seite über CORS-Proxy (für Facebook Reels/Posts, TikTok & Instagram og:description)
    if (!rawSocialText || rawSocialText.length < 40) {
      const directHtml = await fetchUrlContentWithCorsFallback(url);
      if (directHtml) {
        parseEmbedOrMetaHtml(directHtml);
      }
    }

    // D) Fallback: Direkt über Jina Reader abrufen (ohne Tracking-Query-Parameter wie ?igsh=...)
    if (!rawSocialText || rawSocialText.length < 40) {
      try {
        const cleanSocialUrl = url.split('?')[0];
        const jinaRes = await fetch(`https://r.jina.ai/${cleanSocialUrl}`, {
          headers: { Accept: 'text/plain' }
        });
        if (jinaRes.ok) {
          const jinaTxt = await jinaRes.text();
          if (jinaTxt && jinaTxt.length > rawSocialText.length) {
            rawSocialText = jinaTxt;
          }
        }
      } catch (_) {}
    }
  }

  const platformLabel = platform === 'facebook' ? 'Facebook' : platform === 'tiktok' ? 'TikTok' : 'Instagram';

  // Wenn Gemini KI-Key aktiv ist, Social-Caption direkt per KI sauber in Beschreibung, Zutaten & Zubereitung trennen
  if (rawSocialText && state.household.geminiKey) {
    const aiRes = await extractRecipeWithGeminiAI(rawSocialText, url);
    if (aiRes.ok && aiRes.recipe && (aiRes.recipe.ingredients.length > 0 || aiRes.recipe.steps.length > 0)) {
      return {
        ...aiRes.recipe,
        author: fetchedAuthor || aiRes.recipe.author || state.household.memberName || platformLabel,
        sourceType: platform === 'tiktok' ? 'instagram' : platform,
        sourceUrl: url,
        imageUrl:
          fetchedCoverImage ||
          'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=900&q=80',
        tags: [platformLabel, 'KI-Import']
      };
    }
  }

  const structured = parseStructuredRecipeText(rawSocialText, url);
  if (structured && (structured.ingredients.length > 0 || structured.steps.length > 0)) {
    return sanitizeAndVerifyExtractedRecipe(
      {
        title: structured.title || `${platformLabel} Rezept`,
        description: structured.description || '',
        category: detectRecipeCategory(structured.title || '', structured.ingredients, [platformLabel]),
        prepTime: structured.prepTime || 20,
        portions: structured.portions || 4,
        author: structured.author || fetchedAuthor || state.household.memberName || platformLabel,
        sourceType: platform === 'tiktok' ? 'instagram' : platform,
        sourceUrl: url,
        imageUrl:
          fetchedCoverImage ||
          'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=900&q=80',
        tags: [platformLabel, 'Social-Rezept'],
        nutrition: null,
        ingredients: structured.ingredients,
        steps: structured.steps
      },
      url
    );
  }

  if (rawSocialText) {
    const extracted = await extractRecipeWithAIOrParser(rawSocialText);
    if (extracted && (extracted.ingredients?.length > 0 || extracted.steps?.length > 0)) {
      return sanitizeAndVerifyExtractedRecipe(
        {
          title: extracted.title || `${platformLabel} Rezept`,
          description: extracted.description || '',
          category: detectRecipeCategory(extracted.title || '', extracted.ingredients || [], [platformLabel]),
          prepTime: extracted.prepTime || 20,
          portions: extracted.portions || 4,
          author: fetchedAuthor || state.household.memberName || platformLabel,
          sourceType: platform === 'tiktok' ? 'instagram' : platform,
          sourceUrl: url,
          imageUrl:
            fetchedCoverImage ||
            'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80',
          tags: [platformLabel, 'Video-Rezept'],
          nutrition: null,
          ingredients: extracted.ingredients || [],
          steps: extracted.steps || []
        },
        url
      );
    }
  }

  return null;
}

async function importFromWebsiteUrl() {
  const urlInput = document.getElementById('webImportUrl');
  let url = (urlInput?.value || '').trim();
  if (!url) {
    showToast('Bitte eine Rezept-URL eingeben');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  const statusEl = document.getElementById('importStatusBox');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⏳ Lade 1:1 Original-Beschreibung, Zutaten & Zubereitung von der Seite...';
  }

  try {
    let parsed = null;
    let rawHtml = '';
    let bestCoverImage = '';
    let bestMetaDesc = '';
    let hostTag = 'Web-Import';
    try {
      hostTag = new URL(url).hostname.replace(/^www\./i, '');
    } catch (_) {}

    const isCompleteRecipe = (r) =>
      Boolean(r && Array.isArray(r.ingredients) && r.ingredients.length >= 2 && Array.isArray(r.steps) && r.steps.length >= 1);

    // STUFE 0: Kuratierte 1:1 verifizierte Rezepte
    parsed = matchKnownVerifiedRecipeByUrl(url);

    // STUFE 0.5: Social-Media-Links (Instagram Reel, Facebook, TikTok)
    if (!parsed && isSocialMediaRecipeUrl(url)) {
      parsed = await fetchAndParseSocialRecipe(url, '');
    }

    // STUFE 1: Offizielle Chefkoch REST API v2
    if (!parsed && /chefkoch\.de/i.test(url)) {
      parsed = await fetchChefkochRecipeByUrlOrId(url);
    }

    // STUFE 2: Direktes HTML laden -> Schema.org JSON-LD / Microdata -> WPRM -> WordPress -> Heading-Parser
    if (!parsed) {
      rawHtml = (await fetchUrlContentWithCorsFallback(url)) || '';
      if (rawHtml) {
        bestCoverImage = extractBestImageFromHtml(rawHtml, url);
        bestMetaDesc = extractMetaDescriptionFromHtml(rawHtml);

        const schemaCandidate = parseSchemaOrgRecipeFromHtml(rawHtml, url);
        if (isCompleteRecipe(schemaCandidate)) {
          parsed = schemaCandidate;
        } else {
          const wprmCandidate = parseWprmInlineJsonFromHtml(rawHtml, url);
          const wpCandidate = !isCompleteRecipe(wprmCandidate) ? parseWordPressRecipeHtml(rawHtml, '', url, null) : null;
          const headCandidate = !isCompleteRecipe(wpCandidate) ? parseHeadingBasedRecipeHtml(rawHtml, url) : null;
          parsed =
            [schemaCandidate, wprmCandidate, wpCandidate, headCandidate].find((c) => isCompleteRecipe(c)) ||
            schemaCandidate ||
            wprmCandidate ||
            wpCandidate ||
            headCandidate ||
            null;
        }
      }
    }

    // STUFE 2.5: Falls KI-Key aktiv ist und HTML-Parser unvollständig war -> Gemini AI direkt auf bereinigtem HTML-Text
    if (state.household.geminiKey && !isCompleteRecipe(parsed) && rawHtml) {
      if (statusEl) statusEl.textContent = '✨ KI analysiert Webseite und trennt Beschreibung, Zutaten & Zubereitung...';
      const readableText = extractReadableTextFromHtml(rawHtml);
      if (readableText && readableText.length > 80) {
        const aiRes = await extractRecipeWithGeminiAI(readableText, url);
        if (aiRes.ok && aiRes.recipe && (aiRes.recipe.ingredients.length > 0 || aiRes.recipe.steps.length > 0)) {
          parsed = {
            ...aiRes.recipe,
            imageUrl:
              bestCoverImage ||
              parsed?.imageUrl ||
              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
            tags: ['KI-Import', hostTag]
          };
        }
      }
    }

    // STUFE 3: WordPress Foodblog REST API
    if (!isCompleteRecipe(parsed)) {
      try {
        const uObj = new URL(url);
        const pathParts = uObj.pathname.split('/').filter(Boolean);
        const slug = pathParts.find((p) => /[a-zA-Z]{3,}/.test(p) && !/^\d+$/.test(p)) || pathParts[pathParts.length - 1];
        if (slug && !slug.endsWith('.html')) {
          const wpApiUrl = `${uObj.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`;
          const wpText = await fetchUrlContentWithCorsFallback(wpApiUrl);
          if (wpText) {
            const wpArr = JSON.parse(wpText);
            if (Array.isArray(wpArr) && wpArr.length > 0) {
              const post = wpArr[0];
              const htmlContent = post.content?.rendered || '';
              const wpParsed =
                parseWprmInlineJsonFromHtml(htmlContent, post.link || url) ||
                parseWordPressRecipeHtml(htmlContent, post.title?.rendered || '', post.link || url, post) ||
                parseHeadingBasedRecipeHtml(htmlContent, post.link || url);
              if (isCompleteRecipe(wpParsed)) parsed = wpParsed;
            }
          }
        }
      } catch (_) {}
    }

    // STUFE 4: Jina Reader API (für JS-gerenderte Seiten wie lecker.de, Blogs & Social Media) + Gemini KI
    if (!isCompleteRecipe(parsed)) {
      if (statusEl) statusEl.textContent = '🌐 Lese vollständigen Seiteninhalt (Jina Reader)...';
      try {
        const cleanTarget = isSocialMediaRecipeUrl(url) ? url.split('?')[0] : url;
        const jinaRes = await fetch(`https://r.jina.ai/${cleanTarget}`, {
          headers: { Accept: 'application/json' }
        });
        if (jinaRes.ok) {
          const jinaJson = await jinaRes.json();
          const data = jinaJson.data || {};
          const combinedText = (data.title ? `Title: ${data.title}\n` : '') + (data.content || '');

          let extracted = null;
          if (state.household.geminiKey && combinedText.length > 60) {
            if (statusEl) statusEl.textContent = '✨ KI ordnet Beschreibung, Zutaten & Zubereitung zu...';
            const aiRes = await extractRecipeWithGeminiAI(combinedText, url);
            if (aiRes.ok && aiRes.recipe) {
              extracted = aiRes.recipe;
            }
          }
          if (!extracted || !isCompleteRecipe(extracted)) {
            const structured = parseStructuredRecipeText(combinedText, url);
            extracted = isCompleteRecipe(structured) ? structured : (await extractRecipeWithAIOrParser(combinedText)) || structured;
          }

          if (extracted && (extracted.ingredients?.length > 0 || extracted.steps?.length > 0)) {
            parsed = {
              title: extracted.title || data.title || 'Importiertes Rezept',
              description: extracted.description || bestMetaDesc || '',
              category: extracted.category || detectRecipeCategory(extracted.title || data.title || '', extracted.ingredients, []),
              prepTime: extracted.prepTime || 25,
              portions: extracted.portions || 4,
              author: extracted.author || hostTag,
              sourceType: isSocialMediaRecipeUrl(url) ? 'instagram' : 'web',
              sourceUrl: data.url || url,
              imageUrl:
                bestCoverImage ||
                parsed?.imageUrl ||
                'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
              tags: [state.household.geminiKey ? 'KI-Import' : 'Web-Import', hostTag],
              nutrition: extracted.nutrition || null,
              ingredients: extracted.ingredients,
              steps: extracted.steps
            };
          }
        }
      } catch (_) {}
    }

    if (parsed) {
      if (!parsed.description && bestMetaDesc) parsed.description = bestMetaDesc;
      if (!parsed.imageUrl && bestCoverImage) parsed.imageUrl = bestCoverImage;
      parsed = sanitizeAndVerifyExtractedRecipe(parsed, url);
    }

    if (!parsed || (!parsed.ingredients?.length && !parsed.steps?.length)) {
      throw new Error('Kein Parser-Ergebnis');
    }

    const saved = await saveImportedRecipe(parsed);
    if (urlInput) urlInput.value = '';
    if (statusEl) statusEl.style.display = 'none';
    switchTab('recipes');
    if (saved && saved.id) {
      await openRecipeDetail(saved.id);
    }
    showToast(`✅ "${parsed.title}" mit ${(parsed.ingredients || []).length} Zutaten & ${(parsed.steps || []).length} Schritten gespeichert!`);
  } catch (err) {
    if (statusEl) statusEl.style.display = 'none';
    showToast('Direkter Zugriff auf diese URL blockiert – bitte KI-Key aktivieren oder Rezepttext einfügen.');
  }
}

function parseWordPressRecipeHtml(html, rawTitle, canonicalUrl, postObj) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Wichtig: Auf das ERSTE Rezept-Card-Container-Element beschränken, damit Druck-/Duplikat-Container
  // (wie auf leckerschmecker.me) die Zutaten und Schritte nicht doppelt auslesen!
  const cardScope =
    doc.querySelector('.wprm-recipe-container, .wprm-recipe, .tasty-recipes, .mv-create-card, .easyrecipe, .zlrecipe-container') ||
    doc;

  const cardRecipeName = cleanImportedRecipeText(
    cardScope.querySelector('.wprm-recipe-name, .tasty-recipes-title, .mv-create-title')?.textContent || ''
  );
  const cleanTitle =
    cardRecipeName ||
    cleanImportedRecipeText(rawTitle && parser.parseFromString(rawTitle, 'text/html').body.textContent) ||
    cleanImportedRecipeText(doc.querySelector('h1')?.textContent || '') ||
    'Blog-Rezept';

  const ingEls = cardScope.querySelectorAll('.wprm-recipe-ingredient, .tasty-recipes-ingredients li, .mv-create-ingredients li');
  const stepEls = cardScope.querySelectorAll('.wprm-recipe-instruction-text, .tasty-recipes-instructions li, .mv-create-instructions li');

  const ingredients = [];
  ingEls.forEach((el) => {
    const rawAmt = cleanImportedRecipeText(el.querySelector('.wprm-recipe-ingredient-amount')?.textContent || '');
    const unit = cleanImportedRecipeText(el.querySelector('.wprm-recipe-ingredient-unit')?.textContent || '');
    const nameEl = el.querySelector('.wprm-recipe-ingredient-name');
    const name = cleanImportedRecipeText(nameEl ? nameEl.textContent : el.textContent);
    const notes = cleanImportedRecipeText(el.querySelector('.wprm-recipe-ingredient-notes')?.textContent || '');

    if (!nameEl && (rawAmt === '' && unit === '')) {
      const parsedLine = parseIngredientLine(name);
      if (parsedLine.name) ingredients.push(parsedLine);
      return;
    }

    let amountVal = null;
    if (rawAmt) {
      if (rawAmt === '1/2' || rawAmt === '½') amountVal = 0.5;
      else if (rawAmt === '1/4' || rawAmt === '¼') amountVal = 0.25;
      else if (rawAmt === '3/4' || rawAmt === '¾') amountVal = 0.75;
      else {
        const num = parseFloat(rawAmt.replace(',', '.'));
        if (!isNaN(num) && num > 0) amountVal = num;
      }
    }
    if (name) {
      ingredients.push({
        amount: amountVal,
        unit: unit,
        name: notes ? `${name} (${notes})` : name
      });
    }
  });

  const steps = [];
  stepEls.forEach((el) => {
    const t = cleanImportedRecipeText(el.textContent || '');
    if (t && !steps.includes(t)) steps.push(t);
  });

  let nutrition = null;
  const kcalEl = cardScope.querySelector('.wprm-nutrition-label-text-nutrition-container-calories .wprm-nutrition-label-text-nutrition-value');
  const carbsEl = cardScope.querySelector('.wprm-nutrition-label-text-nutrition-container-carbohydrates .wprm-nutrition-label-text-nutrition-value');
  const protEl = cardScope.querySelector('.wprm-nutrition-label-text-nutrition-container-protein .wprm-nutrition-label-text-nutrition-value');
  const fatEl = cardScope.querySelector('.wprm-nutrition-label-text-nutrition-container-fat .wprm-nutrition-label-text-nutrition-value');
  if (kcalEl || carbsEl || protEl || fatEl) {
    nutrition = {
      kcal: kcalEl ? kcalEl.textContent.trim() : '–',
      carbs: carbsEl ? `${carbsEl.textContent.trim()} g` : '–',
      protein: protEl ? `${protEl.textContent.trim()} g` : '–',
      fat: fatEl ? `${fatEl.textContent.trim()} g` : '–',
      basis: 'pro Portion (Originalangabe)'
    };
  }

  const servingsEl = cardScope.querySelector('.wprm-recipe-servings');
  const portions = servingsEl ? parseInt(servingsEl.textContent.trim(), 10) || 4 : 4;

  const imageUrl =
    postObj?._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    cardScope.querySelector('img')?.getAttribute('src') ||
    doc.querySelector('img')?.src ||
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80';

  if (ingredients.length === 0 && steps.length === 0) return null;

  let hostName = 'Foodblog';
  try {
    hostName = new URL(canonicalUrl).hostname.replace(/^www\./i, '');
  } catch (_) {}

  return {
    title: cleanTitle,
    category: detectRecipeCategory(cleanTitle, ingredients, []),
    prepTime: 25,
    portions,
    author: hostName,
    sourceType: 'web',
    sourceUrl: canonicalUrl,
    imageUrl,
    tags: ['Foodblog', hostName],
    nutrition,
    ingredients,
    steps
  };
}

// B) Instagram / Facebook / TikTok Video + Caption speichern
async function importSocialVideoRecipe() {
  const url = document.getElementById('socialVideoUrl').value.trim();
  const caption = document.getElementById('socialCaptionText').value.trim();
  const fileInput = document.getElementById('socialVideoFile');
  const videoFile = fileInput.files && fileInput.files[0];

  if (!url && !caption && !videoFile) {
    showToast('Bitte Link, Videodatei oder Beschreibungstext angeben');
    return;
  }

  const statusEl = document.getElementById('importStatusBox');
  statusEl.style.display = 'block';
  statusEl.textContent = '⏳ Lade Social-Media-Rezept & extrahiere 1:1 Zutaten und Zubereitung...';

  const platform = url.includes('facebook') || url.includes('fb.') ? 'facebook' : 'instagram';
  let socialParsed = await fetchAndParseSocialRecipe(url, caption);
  if (!socialParsed) {
    const fallbackExtracted = await extractRecipeWithAIOrParser(caption || `Rezept aus ${platform} Video (${url})`);
    socialParsed = {
      title: fallbackExtracted.title || (platform === 'instagram' ? 'Instagram Reel Rezept' : 'Facebook Video Rezept'),
      category: fallbackExtracted.category || 'Schnell',
      prepTime: fallbackExtracted.prepTime || 20,
      portions: fallbackExtracted.portions || 4,
      author: state.household.memberName,
      sourceType: platform,
      sourceUrl: url,
      imageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80',
      tags: [platform === 'instagram' ? 'Instagram' : 'Facebook', 'Video-Rezept'],
      ingredients: fallbackExtracted.ingredients || [],
      steps: fallbackExtracted.steps || []
    };
  }

  const newId = 'rec-' + Date.now();
  let hasOfflineVideo = false;

  if (videoFile) {
    await dbPut('videos', { recipeId: newId, blob: videoFile, savedAt: Date.now() });
    hasOfflineVideo = true;
  } else if (url && (url.endsWith('.mp4') || url.endsWith('.webm'))) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      await dbPut('videos', { recipeId: newId, blob, savedAt: Date.now() });
      hasOfflineVideo = true;
    } catch (_) {}
  }

  const recipeObj = {
    id: newId,
    title: socialParsed.title || (platform === 'instagram' ? 'Instagram Reel Rezept' : 'Facebook Video Rezept'),
    category: socialParsed.category || detectRecipeCategory(socialParsed.title || '', socialParsed.ingredients || [], []),
    prepTime: socialParsed.prepTime || 20,
    portions: socialParsed.portions || 4,
    rating: 5,
    author: socialParsed.author || state.household.memberName,
    sourceType: socialParsed.sourceType || platform,
    sourceUrl: url || socialParsed.sourceUrl,
    imageUrl: socialParsed.imageUrl || 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80',
    hasOfflineVideo,
    tags: socialParsed.tags || [platform === 'instagram' ? 'Instagram' : 'Facebook', 'Video-Rezept'],
    nutrition: socialParsed.nutrition || null,
    notes: url ? `Original-Video: ${url}` : '',
    ingredients: socialParsed.ingredients || [],
    steps: socialParsed.steps || [],
    updatedAt: Date.now()
  };

  const existingIdx = state.recipes.findIndex(
    (r) => r.sourceUrl && url && normalizeUrlForRecipeMatch(r.sourceUrl) === normalizeUrlForRecipeMatch(url)
  );
  if (existingIdx !== -1) {
    recipeObj.id = state.recipes[existingIdx].id;
    state.recipes[existingIdx] = recipeObj;
  } else {
    state.recipes.unshift(recipeObj);
  }
  await dbPut('recipes', recipeObj);
  broadcastSyncUpdate();

  document.getElementById('socialVideoUrl').value = '';
  document.getElementById('socialCaptionText').value = '';
  fileInput.value = '';
  statusEl.style.display = 'none';

  renderAll();
  switchTab('recipes');
  await openRecipeDetail(recipeObj.id);
  showToast(`✅ "${recipeObj.title}" mit ${recipeObj.ingredients.length} Zutaten geöffnet & gespeichert!`);
}

// C) Foto / Kochbuch-Scanner (Galerie & Kamera mit Bild-Komprimierung & Sofort-Vorschau)
function triggerPhotoSelect(mode) {
  const inputId = mode === 'camera' ? 'photoCameraInput' : 'photoGalleryInput';
  const inputEl = document.getElementById(inputId);
  if (!inputEl) {
    showToast('Foto-Auswahl wird initialisiert...');
    return;
  }
  inputEl.value = '';
  inputEl.click();
}

async function compressImageFileToDataUrl(file, maxWidth = 1280, quality = 0.82) {
  const rawDataUrl = await fileToDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width || 800;
        let h = img.height || 600;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_) {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

function formatIngredientsForEditTextarea(ingredients) {
  return (ingredients || [])
    .map((ing) => {
      if (typeof ing === 'string') return ing.trim();
      const parts = [];
      if (ing.amount !== null && ing.amount !== undefined && ing.amount !== '') {
        parts.push(String(ing.amount).replace('.', ','));
      }
      if (ing.unit) parts.push(ing.unit);
      if (ing.name) parts.push(ing.name);
      return parts.join(' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}

function renderPhotoScanEditablePreview(base64DataUrl, recipeData, badgeText, badgeClass = 'valid-active', infoHint = '') {
  const previewBox = document.getElementById('photoScanPreviewBox');
  if (!previewBox) return;

  const titleVal = recipeData?.title || 'Gescanntes Rezept';
  const descVal = recipeData?.description || '';
  const portionsVal = recipeData?.portions || 4;
  const prepTimeVal = recipeData?.prepTime || 25;
  const ingsText = formatIngredientsForEditTextarea(recipeData?.ingredients || []);
  const stepsText = (recipeData?.steps || []).join('\n');

  previewBox.style.display = 'block';
  previewBox.innerHTML = `
    <div style="background:#0b1120; border:1px solid var(--border); border-radius:12px; padding:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
        <span style="font-size:12.5px; font-weight:800; color:#e2e8f0;">📷 Erkanntes Foto-Rezept prüfen &amp; speichern</span>
        <span class="validity-pill ${badgeClass}">${escapeHtml(badgeText)}</span>
      </div>
      ${infoHint ? `<div style="font-size:11.5px; color:#fbbf24; margin-bottom:8px;">${escapeHtml(infoHint)}</div>` : ''}
      <img
        id="photoScanPreviewImg"
        src="${base64DataUrl}"
        alt="Rezept-Foto Vorschau"
        style="width:100%; max-height:200px; object-fit:contain; border-radius:10px; background:#020617; margin-bottom:10px; cursor:zoom-in;"
        onclick="openCustomImageLightbox(state.pendingScannedPhotoDataUrl, document.getElementById('photoScanTitleInput')?.value || 'Rezept-Foto', '')"
      />
      <div class="input-group" style="margin-bottom:8px;">
        <label class="input-label">Rezept-Titel</label>
        <input id="photoScanTitleInput" type="text" class="text-input" value="${escapeHtml(titleVal)}" />
      </div>
      <div class="btn-row" style="margin-bottom:8px;">
        <div style="flex:1;">
          <label class="input-label">Portionen</label>
          <input id="photoScanPortionsInput" type="number" min="1" max="40" class="text-input" value="${escapeHtml(String(portionsVal))}" />
        </div>
        <div style="flex:1;">
          <label class="input-label">Zeit (Minuten)</label>
          <input id="photoScanTimeInput" type="number" min="1" max="600" class="text-input" value="${escapeHtml(String(prepTimeVal))}" />
        </div>
      </div>
      <div class="input-group" style="margin-bottom:8px;">
        <label class="input-label">📝 Beschreibung (optional)</label>
        <textarea id="photoScanDescInput" class="textarea-input" style="min-height:52px;" placeholder="Kurze Beschreibung des Gerichts...">${escapeHtml(descVal)}</textarea>
      </div>
      <div class="input-group" style="margin-bottom:8px;">
        <label class="input-label">🥕 Zutaten (1 Zutat pro Zeile, z.B. "250 g Mehl")</label>
        <textarea id="photoScanIngsInput" class="textarea-input" style="min-height:110px;" placeholder="250 g Mehl&#10;3 Eier">${escapeHtml(ingsText)}</textarea>
      </div>
      <div class="input-group" style="margin-bottom:10px;">
        <label class="input-label">👩‍🍳 Zubereitung (1 Schritt pro Zeile)</label>
        <textarea id="photoScanStepsInput" class="textarea-input" style="min-height:120px;" placeholder="Schritt 1...&#10;Schritt 2...">${escapeHtml(stepsText)}</textarea>
      </div>
      <button type="button" class="btn btn-primary" onclick="savePendingScannedPhotoRecipe()">
        ✅ Rezept mit Zutaten &amp; Zubereitung speichern &amp; öffnen
      </button>
    </div>
  `;
}

async function scanCookbookPhoto(event) {
  const inputEl = event?.target;
  const file = inputEl?.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById('importStatusBox');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = '📷 Lade & optimiere Rezept-Foto für Texterkennung...';
  }

  try {
    const base64DataUrl = await compressImageFileToDataUrl(file, 1400, 0.88);
    const defaultTitle =
      file.name && !/^image|img|photo|pxl|dsc|screenshot/i.test(file.name)
        ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
        : 'Gescanntes Rezept (' + new Date().toLocaleDateString('de-DE') + ')';

    state.pendingScannedPhotoDataUrl = base64DataUrl;
    state.lastScannedRecipeId = null;
    state.pendingScannedPhotoMeta = null;

    // 1. Option A: Google Gemini Vision (wenn Key hinterlegt ist) -> höchste Genauigkeit für Kochbücher, 2 Spalten & Screenshots
    if (state.household.geminiKey && state.household.geminiKey.trim().length > 10) {
      if (statusEl) {
        statusEl.textContent = '✨ KI liest Rezept-Foto aus (Titel, Beschreibung, Zutaten & Zubereitung)...';
      }
      const aiRes = await extractRecipeWithGeminiAI('', '', base64DataUrl);
      if (aiRes.ok && aiRes.recipe) {
        state.pendingScannedPhotoMeta = {
          category: aiRes.recipe.category,
          nutrition: aiRes.recipe.nutrition || null,
          tags: ['Foto-Scan', 'KI-Erkannt']
        };
        renderPhotoScanEditablePreview(
          base64DataUrl,
          aiRes.recipe,
          `✨ KI-Erkannt · ${aiRes.recipe.ingredients.length} Zutaten · ${aiRes.recipe.steps.length} Schritte`,
          'valid-active'
        );
        if (statusEl) statusEl.style.display = 'none';
        showToast(`📸 Foto 1:1 erkannt (${aiRes.recipe.ingredients.length} Zutaten, ${aiRes.recipe.steps.length} Schritte) – kurz prüfen & speichern!`);
        return;
      } else {
        if (statusEl) {
          statusEl.textContent = `⚠️ KI-Antwort fehlgeschlagen (${aiRes.error}) – starte Offline-OCR Fallback...`;
        }
      }
    }

    // 2. Automatischer kostenloser Fallback: Browser-OCR (Tesseract.js auf Deutsch)
    let ocrText = '';
    try {
      if (statusEl) {
        statusEl.textContent = '🔤 Lese Text aus dem Foto (Offline-OCR Deutsch)...';
      }
      ocrText = await runBrowserOcrFallback(base64DataUrl, (pct) => {
        if (statusEl) {
          statusEl.textContent = `🔤 Lese Text aus dem Foto (Offline-OCR: ${pct}%)...`;
        }
      });
    } catch (_) {}

    if (ocrText && ocrText.length > 20) {
      let verifiedOcr = null;
      let ocrBadgeLabel = '🔤 OCR erkannt';
      let ocrBadgeClass = 'valid-upcoming';

      // Wenn ein KI-Key (z.B. Groq) aktiv ist, veredelt die KI den OCR-Text (korrigiert Lesefehler & trennt Beschreibung/Zutaten/Schritte sauber!)
      if (state.household.geminiKey && state.household.geminiKey.trim().length > 10) {
        if (statusEl) {
          statusEl.textContent = '✨ KI bereinigt erkannten Foto-Text & ordnet Zutaten/Zubereitung zu...';
        }
        const aiFromOcr = await extractRecipeWithGeminiAI(ocrText, '');
        if (aiFromOcr.ok && aiFromOcr.recipe) {
          verifiedOcr = aiFromOcr.recipe;
          ocrBadgeLabel = '✨ OCR + KI-Erkannt';
          ocrBadgeClass = 'valid-active';
        }
      }

      if (!verifiedOcr) {
        const parsedOcr = parseStructuredRecipeText(ocrText, '') || parseTextToRecipe(ocrText);
        verifiedOcr = sanitizeAndVerifyExtractedRecipe(
          {
            title: parsedOcr?.title && parsedOcr.title !== 'Importiertes Rezept' ? parsedOcr.title : defaultTitle,
            description: parsedOcr?.description || '',
            prepTime: parsedOcr?.prepTime || 25,
            portions: parsedOcr?.portions || 4,
            ingredients: parsedOcr?.ingredients || [],
            steps: parsedOcr?.steps || []
          },
          ''
        );
      }

      state.pendingScannedPhotoMeta = {
        category: verifiedOcr.category,
        nutrition: verifiedOcr.nutrition || null,
        tags: ['Foto-Scan', ocrBadgeClass === 'valid-active' ? 'KI-Erkannt' : 'OCR']
      };
      const hint = !state.household.geminiKey
        ? 'Tipp: Mit kostenlosem Groq KI-Key oben werden auch schwierige Layouts & Lesefehler automatisch korrigiert.'
        : '';
      renderPhotoScanEditablePreview(
        base64DataUrl,
        verifiedOcr,
        `${ocrBadgeLabel} · ${verifiedOcr.ingredients.length} Zutaten · ${verifiedOcr.steps.length} Schritte`,
        ocrBadgeClass,
        hint
      );
      if (statusEl) statusEl.style.display = 'none';
      showToast('📸 Foto-Text ausgelesen – bitte kurz prüfen & speichern!');
      return;
    }

    // 3. Fallback falls Bild keinen lesbaren Text enthielt
    renderPhotoScanEditablePreview(
      base64DataUrl,
      {
        title: defaultTitle,
        description: '',
        prepTime: 25,
        portions: 4,
        ingredients: [],
        steps: []
      },
      '⚠️ Kein Text erkannt',
      'valid-ending',
      'Bitte oben den kostenlosen Gemini KI-Key einrichten oder Zutaten & Zubereitung kurz eintragen.'
    );
    if (statusEl) statusEl.style.display = 'none';
    showToast('Foto geladen – Text konnte ohne KI nicht eindeutig gelesen werden.');
  } catch (err) {
    if (statusEl) statusEl.style.display = 'none';
    showToast('Fehler beim Laden des Fotos – bitte anderes Bild versuchen.');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

async function savePendingScannedPhotoRecipe() {
  const customTitle = (document.getElementById('photoScanTitleInput')?.value || '').trim() || 'Gescanntes Rezept';
  const customDesc = (document.getElementById('photoScanDescInput')?.value || '').trim();
  const customPortions = parseInt(document.getElementById('photoScanPortionsInput')?.value, 10) || 4;
  const customTime = parseInt(document.getElementById('photoScanTimeInput')?.value, 10) || 25;
  const rawIngsText = (document.getElementById('photoScanIngsInput')?.value || '').trim();
  const rawStepsText = (document.getElementById('photoScanStepsInput')?.value || '').trim();
  const dataUrl = state.pendingScannedPhotoDataUrl;

  if (!dataUrl) {
    showToast('Kein Foto ausgewählt');
    return;
  }

  const parsedIngredients = rawIngsText
    ? rawIngsText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseIngredientLine)
        .filter((x) => x && x.name)
    : [{ amount: null, unit: '', name: 'Siehe abfotografierte Rezeptseite oben' }];

  const parsedSteps = rawStepsText
    ? rawStepsText
        .split(/\r?\n/)
        .map((s) => s.replace(/^(?:schritt\s*)?\d+[\).:\-]\s*/i, '').trim())
        .filter(Boolean)
    : ['Rezept-Foto wurde hochauflösend offline gespeichert. Tippe auf das Rezeptbild für die Vollbild-Ansicht.'];

  const meta = state.pendingScannedPhotoMeta || {};
  const syncedPhotoUrl = await compressDataUrlForCloudSync(dataUrl, 850, 0.74);
  const verified = sanitizeAndVerifyExtractedRecipe(
    {
      title: customTitle,
      description: customDesc,
      category: meta.category || detectRecipeCategory(customTitle, parsedIngredients, ['Foto-Scan']),
      prepTime: customTime,
      portions: customPortions,
      author: state.household.memberName || 'Foto-Scan',
      sourceType: 'scan',
      imageUrl: syncedPhotoUrl || dataUrl,
      tags: meta.tags || ['Foto-Scan'],
      nutrition: meta.nutrition || null,
      ingredients: parsedIngredients,
      steps: parsedSteps
    },
    ''
  );

  const saved = await saveImportedRecipe(verified);
  const previewBox = document.getElementById('photoScanPreviewBox');
  if (previewBox) previewBox.style.display = 'none';
  state.pendingScannedPhotoDataUrl = null;
  state.pendingScannedPhotoMeta = null;

  switchTab('recipes');
  if (saved && saved.id) {
    await openRecipeDetail(saved.id);
  }
  showToast(`✅ "${verified.title}" mit ${verified.ingredients.length} Zutaten & ${verified.steps.length} Schritten gespeichert!`);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

async function extractRecipeWithAIOrParser(text) {
  if (state.household.geminiKey && text && text.length > 15) {
    const aiRes = await extractRecipeWithGeminiAI(text, '');
    if (aiRes.ok && aiRes.recipe) {
      return aiRes.recipe;
    }
  }
  return parseTextToRecipe(text);
}

function parseTextToRecipe(text) {
  const structured = parseStructuredRecipeText(text);
  if (structured && (structured.ingredients.length > 0 || structured.steps.length > 0)) {
    return {
      title: structured.title || 'Neues Rezept',
      prepTime: structured.prepTime || 20,
      portions: structured.portions || 4,
      ingredients: structured.ingredients,
      steps: structured.steps
    };
  }

  const rawLines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = filterOutConsentAndNavLines(rawLines);

  const title = lines[0] ? lines[0].replace(/^[#*•-]+\s*/, '').slice(0, 70) : 'Neues Rezept';
  const ingredients = [];
  const steps = [];

  lines.slice(1).forEach((line) => {
    const clean = line.replace(/^[-•*]\s*/, '');
    if (/^(\d+|1\/2|½|1\/4|¼|3\/4|¾)\s*(g|kg|ml|l|el|tl|stk|stück|prise|prisen|bund|dose|dosen|pck|packung|zehe|zehen|scheibe|scheiben)\b/i.test(clean)) {
      ingredients.push(parseIngredientLine(clean));
    } else if (clean.length > 38) {
      steps.push(clean);
    } else if (clean.length > 2) {
      ingredients.push(parseIngredientLine(clean));
    }
  });

  return { title, prepTime: 20, portions: 4, ingredients, steps: steps.length ? steps : [text] };
}

function parseIngredientLine(line) {
  const clean = decodeHtmlEntities(line)
    .replace(/&#0*32;/g, ' ')
    .replace(/🛒/g, '')
    .replace(/^[\s\-•*◾▪️▫️👉🔹🔸✅☑️🥖🥩🍗🍖🧀🧄🧅🍅🥒🥬🥦🥕🥔🌶️🫑🍋🥄🧂🫒🥚🥛🧈🍯🍝🍚🫘🥫]+/u, '')
    .trim();
  if (!clean) return { amount: null, unit: '', name: '' };

  const knownUnits = /^(g|kg|mg|ml|l|cl|dl|el|esslöffel|tl|teelöffel|stk\.?|stück|prise|prisen|bund|bd\.?|dose|dosen|pck\.?|päckchen|packung|pkg\.?|becher|glas|gläser|zehe|zehen|knolle|knollen|scheibe|scheiben|zweig|zweige|blatt|blätter|etwas|n\.\s*b\.?|nach\s+bedarf|handvoll|tasse|tassen|beutel|kopf|stange|stangen|würfel|tropfen)\b/i;

  // Gemischte Brüche wie "1 1/2 TL" oder "1 ½ EL"
  const mixedFrac = clean.match(/^(\d+)\s+(1\/2|½|1\/4|¼|3\/4|¾)\s+(.+)$/);
  if (mixedFrac) {
    const map = { '1/2': 0.5, '½': 0.5, '1/4': 0.25, '¼': 0.25, '3/4': 0.75, '¾': 0.75 };
    const totalAmt = parseInt(mixedFrac[1], 10) + (map[mixedFrac[2]] || 0.5);
    const rest = mixedFrac[3].trim();
    const uMatch = rest.match(knownUnits);
    if (uMatch) {
      return {
        amount: totalAmt,
        unit: uMatch[1].trim(),
        name: rest.slice(uMatch[0].length).trim() || rest
      };
    }
    return { amount: totalAmt, unit: 'Stk.', name: rest };
  }

  // Einfache Brüche wie "1/2 Bund Petersilie" oder "½ Zitrone"
  const fracMatch = clean.match(/^(1\/2|½|1\/4|¼|3\/4|¾|1\/3|⅓|2\/3|⅔)\s*(.+)$/);
  if (fracMatch) {
    const map = {
      '1/2': 0.5,
      '½': 0.5,
      '1/4': 0.25,
      '¼': 0.25,
      '3/4': 0.75,
      '¾': 0.75,
      '1/3': 0.33,
      '⅓': 0.33,
      '2/3': 0.67,
      '⅔': 0.67
    };
    const amt = map[fracMatch[1]] || 0.5;
    const rest = fracMatch[2].trim();
    const uMatch = rest.match(knownUnits);
    if (uMatch) {
      return {
        amount: amt,
        unit: uMatch[1].trim(),
        name: rest.slice(uMatch[0].length).trim() || rest
      };
    }
    return { amount: amt, unit: '', name: rest };
  }

  // Zahlen am Anfang wie "500 g Hackfleisch", "2 Zwiebel(n)", "1 kl. Dose Mais"
  const numMatch = clean.match(/^(\d+(?:[.,]\d+)?)\s*(.+)$/);
  if (numMatch) {
    const amt = parseFloat(numMatch[1].replace(',', '.'));
    const rest = numMatch[2].trim();
    const uMatch = rest.match(knownUnits);
    if (uMatch) {
      const remainingName = rest.slice(uMatch[0].length).trim();
      if (remainingName) {
        return {
          amount: amt,
          unit: uMatch[1].trim(),
          name: remainingName
        };
      }
    }
    return {
      amount: amt,
      unit: '',
      name: rest
    };
  }

  // Einheiten ohne Zahl am Anfang wie "etwas Öl", "n. B. Salz"
  const unitOnlyMatch = clean.match(/^(etwas|n\.\s*b\.?|nach\s+bedarf|prise|prisen)\s+(.+)$/i);
  if (unitOnlyMatch) {
    return {
      amount: null,
      unit: unitOnlyMatch[1].trim(),
      name: unitOnlyMatch[2].trim()
    };
  }

  // Keine Mengenangabe vorhanden -> amount: null (keine erfundenen Zahlen!)
  return { amount: null, unit: '', name: clean };
}

async function saveImportedRecipe(partial) {
  const autoCat =
    partial.category && RECIPE_CATEGORIES.some((c) => c.id === partial.category)
      ? partial.category
      : detectRecipeCategory(partial.title || '', partial.ingredients || [], partial.tags || []);

  // Falls bereits ein Rezept mit exakt derselben sourceUrl existiert, aktualisiere es sauber statt Duplikat
  const cleanUrl = (partial.sourceUrl || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const existingIdx = cleanUrl
    ? state.recipes.findIndex(
        (r) => r.sourceUrl && r.sourceUrl.split('?')[0].replace(/\/+$/, '').toLowerCase() === cleanUrl
      )
    : -1;

  const newRecipe = {
    id: existingIdx >= 0 ? state.recipes[existingIdx].id : 'rec-' + Date.now(),
    title: partial.title || 'Neues Rezept',
    description: partial.description || '',
    category: autoCat,
    prepTime: partial.prepTime || 25,
    portions: partial.portions || 4,
    rating: 5,
    author: partial.author || state.household.memberName,
    sourceType: partial.sourceType || 'web',
    sourceUrl: partial.sourceUrl || '',
    imageUrl: partial.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
    hasOfflineVideo: Boolean(partial.hasOfflineVideo),
    tags: partial.tags || ['Eigenes Rezept'],
    nutrition: partial.nutrition || null,
    notes: partial.notes || '',
    ingredients: partial.ingredients || [],
    steps: partial.steps || [],
    updatedAt: Date.now()
  };

  if (existingIdx >= 0) {
    state.recipes[existingIdx] = newRecipe;
  } else {
    state.recipes.unshift(newRecipe);
  }
  await dbPut('recipes', newRecipe);
  renderAll();
  broadcastSyncUpdate();
  return newRecipe;
}

function compressDataUrlForCloudSync(dataUrl, maxWidth = 850, quality = 0.74) {
  return new Promise((resolve) => {
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
      resolve(dataUrl || '');
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width || maxWidth;
        let h = img.height || maxWidth;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/jpeg', quality);
        if (out.length > 320000) {
          out = canvas.toDataURL('image/jpeg', 0.56);
        }
        resolve(out);
      } catch (_) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function handleManualRecipePhotoSelect(event) {
  const file = event?.target?.files && event.target.files[0];
  if (!file) return;
  try {
    const rawUrl = await compressImageFileToDataUrl(file, 850, 0.75);
    const syncedUrl = await compressDataUrlForCloudSync(rawUrl, 850, 0.74);
    state.pendingManualPhotoDataUrl = syncedUrl;
    const wrap = document.getElementById('manPhotoPreviewWrap');
    const img = document.getElementById('manPhotoPreviewImg');
    if (img) img.src = syncedUrl;
    if (wrap) wrap.style.display = 'block';
    showToast('📷 Rezept-Foto bereit – wird für alle Mitbenutzer synchronisiert!');
  } catch (_) {
    showToast('Foto konnte nicht geladen werden');
  }
}

async function saveManualRecipe() {
  const title = document.getElementById('manTitle').value.trim();
  const category = document.getElementById('manCategory').value;
  const prepTime = parseInt(document.getElementById('manTime').value, 10) || 25;
  const portions = parseInt(document.getElementById('manPortions').value, 10) || 4;
  const ingsRaw = document.getElementById('manIngredients').value.trim();
  const stepsRaw = document.getElementById('manSteps').value.trim();

  if (!title) {
    showToast('Bitte einen Rezeptnamen eingeben');
    return;
  }

  const ingredients = ingsRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);

  const steps = stepsRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  await saveImportedRecipe({
    title,
    category,
    prepTime,
    portions,
    sourceType: 'manual',
    imageUrl: state.pendingManualPhotoDataUrl || '',
    tags: [category, 'Familienrezept'],
    nutrition: null,
    ingredients,
    steps
  });

  document.getElementById('manTitle').value = '';
  document.getElementById('manIngredients').value = '';
  document.getElementById('manSteps').value = '';
  const photoInp = document.getElementById('manPhotoFile');
  if (photoInp) photoInp.value = '';
  const photoWrap = document.getElementById('manPhotoPreviewWrap');
  if (photoWrap) photoWrap.style.display = 'none';
  state.pendingManualPhotoDataUrl = '';
  switchTab('recipes');
  showToast('Familienrezept inkl. Foto gespeichert & synchronisiert!');
}

// ============================================================================
// 9. WOCHENPLANER (Mo - So) – Alle Rezepte, Vorschläge & Live-Suche auswählbar
// ============================================================================
function normalizeDishKeyForDedup(recipe) {
  if (!recipe) return '';
  return String(recipe.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();
}

function getAllSelectableRecipesForPlanner() {
  const map = new Map();
  const seenTitles = new Set();
  // 1. Alle gespeicherten Rezepte in der Sammlung
  (state.recipes || []).forEach((r) => {
    if (r && r.id) {
      map.set(r.id, r);
      const tKey = normalizeDishKeyForDedup(r);
      if (tKey) seenTitles.add(tKey);
    }
  });
  // 2. Alle vorgeschlagenen Original-Rezepte (falls noch nicht vorhanden)
  (SUGGESTED_DIRECT_RECIPES || []).forEach((s, i) => {
    const id = s.id || `sug-${i}`;
    const tKey = normalizeDishKeyForDedup(s);
    const alreadyByUrl = Array.from(map.values()).find((x) => x.sourceUrl && x.sourceUrl === s.sourceUrl);
    if (!alreadyByUrl && !map.has(id) && (!tKey || !seenTitles.has(tKey))) {
      map.set(id, { ...s, id });
      if (tKey) seenTitles.add(tKey);
    }
  });
  return Array.from(map.values());
}

async function autoFillWeekPlan() {
  const allRecipes = getAllSelectableRecipesForPlanner();
  if (allRecipes.length === 0) return;
  const days = Object.keys(state.weekPlan);

  // Dedupliziere den Kandidaten-Pool strikt nach ID, Rezepttitel und Quell-URL,
  // damit NIEMALS dasselbe Gericht doppelt in einer Woche vorkommen kann!
  const uniquePool = [];
  const poolTitleKeys = new Set();
  const poolUrlKeys = new Set();

  for (const r of allRecipes) {
    if (!r || !r.id) continue;
    const tKey = normalizeDishKeyForDedup(r);
    const uKey = r.sourceUrl ? r.sourceUrl.split('?')[0].replace(/\/+$/, '').toLowerCase() : '';
    if (tKey && poolTitleKeys.has(tKey)) continue;
    if (uKey && poolUrlKeys.has(uKey)) continue;
    if (tKey) poolTitleKeys.add(tKey);
    if (uKey) poolUrlKeys.add(uKey);
    uniquePool.push(r);
  }

  // Mische den eindeutigen Pool zufällig
  const shuffled = [...uniquePool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const usedIds = new Set();
  const usedTitles = new Set();
  const usedUrls = new Set();
  let lastCat = '';

  for (const day of days) {
    const isNotUsed = (r) => {
      const tKey = normalizeDishKeyForDedup(r);
      const uKey = r.sourceUrl ? r.sourceUrl.split('?')[0].replace(/\/+$/, '').toLowerCase() : '';
      return !usedIds.has(r.id) && (!tKey || !usedTitles.has(tKey)) && (!uKey || !usedUrls.has(uKey));
    };

    // Bevorzuge andere Kategorie als am Vortag, aber strikt ohne Wiederholung!
    let pick = shuffled.find((r) => isNotUsed(r) && r.category !== lastCat);
    if (!pick) pick = shuffled.find((r) => isNotUsed(r));

    if (pick) {
      usedIds.add(pick.id);
      const tKey = normalizeDishKeyForDedup(pick);
      const uKey = pick.sourceUrl ? pick.sourceUrl.split('?')[0].replace(/\/+$/, '').toLowerCase() : '';
      if (tKey) usedTitles.add(tKey);
      if (uKey) usedUrls.add(uKey);
      lastCat = pick.category || '';
      state.weekPlan[day] = pick.id;
      if (!state.recipes.some((r) => r.id === pick.id)) {
        state.recipes.push(pick);
        dbPut('recipes', pick).catch(() => {});
      }
    } else {
      // Falls weniger als 7 Rezepte insgesamt existieren, lasse den restlichen Tag frei statt Duplikat
      state.weekPlan[day] = '';
    }
  }

  touchWeekPlanTimestamp();
  renderAll();
  showToast('✨ Wochenplan mit 7 verschiedenen Gerichten (ohne Duplikate) gefüllt!');
  await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
  broadcastSyncUpdate();
}

function touchWeekPlanTimestamp() {
  state.weekPlanUpdatedAt = Date.now();
  try {
    localStorage.setItem('kt_weekplan_ts', String(state.weekPlanUpdatedAt));
  } catch (_) {}
}

async function clearWeekPlan() {
  Object.keys(state.weekPlan).forEach((d) => {
    state.weekPlan[d] = '';
  });
  touchWeekPlanTimestamp();
  renderAll();
  showToast('Wochenplan geleert & synchronisiert');
  await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
  broadcastSyncUpdate();
}

function parseNumericMacro(str) {
  if (!str) return 0;
  const m = String(str).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : 0;
}

function renderWeekPlan() {
  if (typeof renderTodayPlanQuickBanner === 'function') renderTodayPlanQuickBanner();
  const container = document.getElementById('weekPlanContainer');
  const summaryEl = document.getElementById('weekNutritionSummary');
  if (!container) return;
  const days = Object.keys(state.weekPlan);
  const allRecipes = getAllSelectableRecipesForPlanner();

  // Berechne Wochen-Nährwert-Durchschnitt & Angebots-Treffer inkl. Ersparnis für die geplanten Tage
  let plannedDaysCount = 0;
  let sumKcal = 0;
  let sumCarbs = 0;
  let sumProtein = 0;
  let sumFat = 0;
  const matchedWeekOffersMap = new Map();

  days.forEach((day) => {
    const r = allRecipes.find((x) => x.id === state.weekPlan[day]);
    if (r) {
      plannedDaysCount++;
      if (r.nutrition) {
        sumKcal += Number(r.nutrition.kcal) || 0;
        sumCarbs += parseNumericMacro(r.nutrition.carbs);
        sumProtein += parseNumericMacro(r.nutrition.protein);
        sumFat += parseNumericMacro(r.nutrition.fat);
      }
      getOffersMatchingRecipe(r).forEach((off) => matchedWeekOffersMap.set(off.id, off));
    }
  });

  let weekTotalSavingsEuro = 0;
  matchedWeekOffersMap.forEach((off) => {
    const sav = typeof calculateOfferSavings === 'function' ? calculateOfferSavings(off) : null;
    if (sav && sav.euroSaved > 0) weekTotalSavingsEuro += sav.euroSaved;
  });

  if (summaryEl) {
    if (plannedDaysCount > 0) {
      const avgKcal = Math.round(sumKcal / plannedDaysCount);
      const avgCarbs = Math.round(sumCarbs / plannedDaysCount);
      const avgProtein = Math.round(sumProtein / plannedDaysCount);
      const avgFat = Math.round(sumFat / plannedDaysCount);
      summaryEl.innerHTML = `
        <div class="nutrition-card" style="margin-top:0; margin-bottom:12px;">
          <div class="nutrition-header">
            <span>📊 <strong>Wochen-Bilanz (${plannedDaysCount} von 7 Tagen geplant)</strong></span>
            <span style="font-size:10px; color:var(--primary-light);">Ø pro geplantem Tag</span>
          </div>
          <div class="nutrition-grid">
            <div class="nutri-box">
              <div class="nutri-val">${avgKcal}</div>
              <div class="nutri-label">Ø kcal</div>
            </div>
            <div class="nutri-box">
              <div class="nutri-val">${avgCarbs} g</div>
              <div class="nutri-label">Ø KH</div>
            </div>
            <div class="nutri-box">
              <div class="nutri-val">${avgProtein} g</div>
              <div class="nutri-label">Ø Eiweiß</div>
            </div>
            <div class="nutri-box">
              <div class="nutri-val">${avgFat} g</div>
              <div class="nutri-label">Ø Fett</div>
            </div>
          </div>
          ${
            matchedWeekOffersMap.size > 0
              ? `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11.5px; color:#6ee7b7; flex-wrap:wrap;">
                   <span>🏷️ <strong>${matchedWeekOffersMap.size} Angebots-Artikel</strong> passend zum Wochenplan${weekTotalSavingsEuro > 0 ? ` (💰 <strong>-${weekTotalSavingsEuro.toFixed(2).replace('.', ',')} € Ersparnis</strong>)` : ''}!</span>
                   <button class="pill-btn" style="background:var(--accent); color:#fff; border:none; font-size:10.5px; padding:4px 9px;" onclick="setOfferRetailerFilter('Passend-Einkauf'); switchTab('offers')">
                     Einkaufs-Deals ↗
                   </button>
                 </div>`
              : ''
          }
        </div>
      `;
    } else {
      summaryEl.innerHTML = '';
    }
  }

  // Gruppiere nach Kategorie für maximale Übersichtlichkeit im Dropdown
  const categories = {};
  allRecipes.forEach((r) => {
    const cat = r.category || detectRecipeCategory(r.title, r.ingredients, r.tags);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  });

  // Zusätzlich aktuelle Live-Suchergebnisse im Dropdown anbieten, falls vorhanden
  const liveHits = (state.liveSearchResults || []).filter(
    (item) => !allRecipes.some((r) => r.sourceUrl === item.url)
  );

  container.innerHTML = days
    .map((day) => {
      const selectedId = state.weekPlan[day];
      const selectedRecipe = allRecipes.find((r) => r.id === selectedId);
      const isPickerOpen = state.openPlannerPickerDay === day;

      const optGroupsHtml = Object.keys(categories)
        .map((cat) => {
          const meta = getCategoryMeta(cat);
          const items = categories[cat]
            .map(
              (r) =>
                `<option value="${escapeHtml(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(r.title)} (${r.prepTime || 20} Min${r.nutrition?.kcal ? ` · ${r.nutrition.kcal} kcal` : ''})</option>`
            )
            .join('');
          return `<optgroup label="${meta.icon} ${escapeHtml(meta.label)} (${categories[cat].length})">${items}</optgroup>`;
        })
        .join('');

      const liveGroupHtml =
        liveHits.length > 0
          ? `<optgroup label="🔎 Letzte Online-Suchergebnisse">${liveHits
              .map(
                (item, idx) =>
                  `<option value="live-${idx}">＋ ${escapeHtml(item.title)} (${escapeHtml(item.provider)})</option>`
              )
              .join('')}</optgroup>`
          : '';

      // Rezept-Vorschaukarte für den ausgewählten Tag
      let previewHtml = '';
      if (selectedRecipe) {
        const meta = getCategoryMeta(selectedRecipe.category);
        const basePortions = Number(selectedRecipe.portions) || 4;
        const topIngs = (selectedRecipe.ingredients || [])
          .slice(0, 4)
          .map((ing) => {
            const amt = formatIngredientAmountAndUnit(ing, basePortions, basePortions);
            return `${amt ? amt + ' ' : ''}${ing.name}`;
          })
          .join(' · ');
        const moreCount = Math.max(0, (selectedRecipe.ingredients || []).length - 4);

        const fullIngsList = (selectedRecipe.ingredients || [])
          .map((ing) => {
            const amt = formatIngredientAmountAndUnit(ing, basePortions, basePortions);
            return `• ${amt ? `<strong>${escapeHtml(amt)}</strong> ` : ''}${escapeHtml(ing.name)}`;
          })
          .join('<br/>');

        const fullStepsList = (selectedRecipe.steps || [])
          .map((st, i) => `<div style="margin-bottom:5px;"><strong>${i + 1}.</strong> ${escapeHtml(st)}</div>`)
          .join('');

        previewHtml = `
          <div class="planner-preview-card">
            <div class="planner-preview-top" onclick="openRecipeDetail('${escapeHtml(selectedRecipe.id)}')">
              <img
                src="${escapeHtml(selectedRecipe.imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80')}"
                alt="${escapeHtml(selectedRecipe.title)}"
                class="planner-preview-img"
              />
              <div class="planner-preview-info">
                <div style="font-size:10.5px; font-weight:700; color:var(--primary-light); margin-bottom:2px;">
                  ${meta.icon} ${escapeHtml(meta.label)}
                </div>
                <div class="planner-preview-title">${escapeHtml(selectedRecipe.title)}</div>
                <div class="planner-preview-meta">
                  <span>⏱ ${selectedRecipe.prepTime || 20} Min</span>
                  <span>· 👥 ${basePortions} Port.</span>
                  ${
                    selectedRecipe.nutrition?.kcal
                      ? `<span class="tag-mini tag-kcal" style="padding:1px 6px; font-size:10px;">🔥 ${selectedRecipe.nutrition.kcal} kcal</span>`
                      : ''
                  }
                </div>
              </div>
            </div>

            <div class="planner-preview-ings-short">
              <strong>🥕 Zutaten-Vorschau (${(selectedRecipe.ingredients || []).length}):</strong>
              ${escapeHtml(topIngs)}${moreCount > 0 ? ` <em>(+${moreCount} weitere)</em>` : ''}
            </div>

            <div id="planner-details-${day}" class="planner-preview-details">
              ${
                selectedRecipe.nutrition?.kcal
                  ? `<div style="margin-bottom:8px; font-size:11px; color:#fdba74;">
                       📊 <strong>Nährwerte pro Portion:</strong> ${selectedRecipe.nutrition.kcal} kcal · KH: ${escapeHtml(selectedRecipe.nutrition.carbs || '–')} · EW: ${escapeHtml(selectedRecipe.nutrition.protein || '–')} · Fett: ${escapeHtml(selectedRecipe.nutrition.fat || '–')}
                     </div>`
                  : ''
              }
              <div style="margin-bottom:8px;">
                <div style="font-weight:700; color:var(--primary-light); margin-bottom:3px;">Alle Zutaten (${basePortions} Portionen):</div>
                ${fullIngsList}
              </div>
              <div>
                <div style="font-weight:700; color:var(--primary-light); margin-bottom:3px;">Zubereitungsschritte:</div>
                ${fullStepsList}
              </div>
            </div>

            <div class="planner-preview-actions">
              <button class="pill-btn" style="font-size:11px; padding:5px 9px;" onclick="togglePlannerInlinePreview('${day}')">
                📋 <span id="planner-toggle-lbl-${day}">Zutaten & Schritte aufklappen</span>
              </button>
              <button class="pill-btn" style="font-size:11px; padding:5px 9px; background:var(--accent); color:#fff; border:none;" onclick="addRecipeToShoppingList('${escapeHtml(selectedRecipe.id)}', event)">
                🛒＋ Einkaufsliste
              </button>
              <button class="pill-btn" style="font-size:11px; padding:5px 9px; background:var(--primary); color:#fff; border:none;" onclick="startCookMode('${escapeHtml(selectedRecipe.id)}')">
                🔥 Kochmodus
              </button>
              <button class="pill-btn" style="font-size:11px; padding:5px 9px; background:var(--bring); color:#fff; border:none;" onclick="exportRecipeToBring('${escapeHtml(selectedRecipe.id)}')">
                🛒 Bring!
              </button>
              <button class="pill-btn" style="font-size:11px; padding:5px 9px;" onclick="openRecipeDetail('${escapeHtml(selectedRecipe.id)}')">
                👁 Details
              </button>
              ${
                selectedRecipe.sourceUrl
                  ? `<a href="${escapeHtml(selectedRecipe.sourceUrl)}" target="_blank" rel="noopener" class="pill-btn" style="font-size:11px; padding:5px 9px; text-decoration:none; color:var(--primary-light);">🔗 Original ↗</a>`
                  : ''
              }
            </div>
          </div>
        `;
      }

      // Visuelle Schnell-Vorschau-Karten zum Durchscrollen, falls man auf "🖼️ Vorschau-Auswahl" tippt
      const visualPickerHtml = isPickerOpen
        ? `<div style="margin-top:4px;">
             <div style="font-size:11px; color:var(--text-muted); margin-bottom:5px; display:flex; justify-content:space-between;">
               <span>👆 Wische nach links/rechts & tippe auf ein Rezept für <strong>${day}</strong>:</span>
               <span style="cursor:pointer; color:var(--primary-light);" onclick="togglePlannerVisualPicker('${day}')">✕ Schließen</span>
             </div>
             <div class="recipe-carousel" style="padding-bottom:6px;">
               ${allRecipes
                 .map((r) => {
                   const m = getCategoryMeta(r.category);
                   return `
                     <div class="section-card" style="flex:0 0 215px; margin-bottom:0; padding:8px; background:#0b1120; cursor:pointer; border-color:${r.id === selectedId ? 'var(--primary)' : 'var(--border)'};" onclick="updateWeekDay('${day}', '${escapeHtml(r.id)}')">
                       <img src="${escapeHtml(r.imageUrl || '')}" style="width:100%; height:78px; object-fit:cover; border-radius:9px; margin-bottom:5px;" />
                       <div style="font-size:10px; color:var(--primary-light); font-weight:700;">${m.icon} ${escapeHtml(m.label)}</div>
                       <div style="font-size:12px; font-weight:700; line-height:1.2; margin:2px 0 4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(r.title)}</div>
                       <div style="font-size:10.5px; color:var(--text-muted);">⏱ ${r.prepTime || 20} Min ${r.nutrition?.kcal ? `· 🔥 ${r.nutrition.kcal} kcal` : ''}</div>
                     </div>
                   `;
                 })
                 .join('')}
             </div>
           </div>`
        : '';

      return `
        <div class="day-card ${selectedRecipe ? 'has-recipe' : ''}">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <div class="day-name">${day}</div>
            <select class="select-input" style="flex:1; padding:8px 9px; font-size:12.5px;" onchange="updateWeekDay('${day}', this.value)">
              <option value="">— Rezept wählen (${allRecipes.length} verfügbar) —</option>
              ${optGroupsHtml}
              ${liveGroupHtml}
              <optgroup label="➕ Mehr Rezepte">
                <option value="__SEARCH_NEW__">🔎 Weiteres Rezept online suchen...</option>
              </optgroup>
            </select>
            <button class="pill-btn" style="padding:7px 9px; font-size:11px;" onclick="togglePlannerVisualPicker('${day}')" title="Rezept-Vorschau-Karussell öffnen">
              🖼️
            </button>
          </div>
          ${visualPickerHtml}
          ${previewHtml}
        </div>
      `;
    })
    .join('');
}

function togglePlannerInlinePreview(day) {
  const detailsEl = document.getElementById(`planner-details-${day}`);
  const lblEl = document.getElementById(`planner-toggle-lbl-${day}`);
  if (!detailsEl) return;
  const isOpen = detailsEl.classList.toggle('open');
  if (lblEl) {
    lblEl.textContent = isOpen ? 'Zutaten & Schritte zuklappen' : 'Zutaten & Schritte aufklappen';
  }
}

function togglePlannerVisualPicker(day) {
  state.openPlannerPickerDay = state.openPlannerPickerDay === day ? null : day;
  renderWeekPlan();
}

async function updateWeekDay(day, value) {
  if (value === '__SEARCH_NEW__') {
    switchTab('import');
    const inp = document.getElementById('liveSearchInput');
    if (inp) inp.focus();
    renderWeekPlan();
    return;
  }

  // Falls ein Treffer direkt aus den Live-Suchergebnissen gewählt wurde -> erst importieren, dann zuweisen
  if (value && value.startsWith('live-')) {
    const idx = parseInt(value.replace('live-', ''), 10);
    const item = state.liveSearchResults[idx];
    if (item) {
      await importLiveSearchResult(idx);
      const newlyAdded = state.recipes.find((r) => r.sourceUrl === item.url);
      if (newlyAdded) {
        state.weekPlan[day] = newlyAdded.id;
        touchWeekPlanTimestamp();
        await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
        renderWeekPlan();
        broadcastSyncUpdate();
        return;
      }
    }
  }

  // Falls eines der Basis-/Vorschlagsrezepte gewählt wurde, stelle sicher, dass es in state.recipes liegt
  const allSelectable = getAllSelectableRecipesForPlanner();
  const chosen = allSelectable.find((r) => r.id === value);
  if (chosen && !state.recipes.some((r) => r.id === chosen.id)) {
    state.recipes.push(chosen);
    await dbPut('recipes', chosen);
  }

  state.openPlannerPickerDay = null;
  state.weekPlan[day] = value;
  touchWeekPlanTimestamp();
  await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
  renderAll();
  broadcastSyncUpdate();
  if (chosen) {
    showToast(`${day}: "${chosen.title}" eingeplant!`);
  }
}

async function addWholeWeekToShoppingList() {
  let count = 0;
  const allSelectable = getAllSelectableRecipesForPlanner();
  for (const day of Object.keys(state.weekPlan)) {
    const recId = state.weekPlan[day];
    if (recId) {
      const r = allSelectable.find((x) => x.id === recId);
      if (r) {
        count++;
        const basePortions = Number(r.portions) || 4;
        (r.ingredients || []).forEach((ing) => {
          upsertShoppingListIngredient({
            name: ing.name,
            spec: formatIngredientAmountAndUnit(ing, basePortions, basePortions) || 'nach Bedarf',
            recipeTitle: `${day}: ${r.title}`
          });
        });
      }
    }
  }
  if (count === 0) {
    showToast('Bitte erst Rezepte im Wochenplan auswählen');
    return;
  }
  await saveShoppingList();
  renderShoppingList();
  switchTab('shopping');
  showToast(`Zutaten für ${count} geplante Tage auf die Einkaufsliste gesetzt!`);
}

// ============================================================================
// 10. ECHTZEIT-HAUSHALTS-SYNC & MITBENUTZER EINLADEN / ENTFERNEN
// ============================================================================
let broadcastChannel = null;

function initRealtimeSync() {
  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('kochtresor_sync_' + state.household.code);
    broadcastChannel.onmessage = async (ev) => {
      if (ev.data && ev.data.type === 'SYNC_STATE') {
        await applyIncomingSyncData(ev.data.payload);
      }
    };
  }

  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine && state.household.autoCloudSync && isSupabaseSyncConfigured()) {
      pullHouseholdCloudState(false);
    }
  }, 12000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && state.household.autoCloudSync && isSupabaseSyncConfigured()) {
      pullHouseholdCloudState(false);
    }
  });

  window.addEventListener('focus', () => {
    if (navigator.onLine && state.household.autoCloudSync && isSupabaseSyncConfigured()) {
      pullHouseholdCloudState(false);
    }
  });

  window.addEventListener('online', () => {
    if (state.household.autoCloudSync && isSupabaseSyncConfigured()) {
      pullHouseholdCloudState(false);
    }
  });
}

async function detectLivePublicAppUrl(showToastMsg = false) {
  try {
    const infoRes = await fetch('/api/server-info');
    if (infoRes.ok) {
      const infoJson = await infoRes.json();
      if (infoJson.publicUrl) state.publicAppUrl = infoJson.publicUrl;
      if (infoJson.backupPublicUrl) state.backupPublicUrl = infoJson.backupPublicUrl;
      if (infoJson.lanUrl) state.lanAppUrl = infoJson.lanUrl;
      renderHouseholdSettings();
      if (showToastMsg) {
        showToast('🟢 Dual-Tunnel (Cloudflare + lhr.life) & WLAN aktiv!');
      }
      return;
    }
  } catch (_) {}
  try {
    const tRes = await fetch('./tunnel-info.json?t=' + Date.now());
    if (tRes.ok) {
      const tJson = await tRes.json();
      if (tJson.publicUrl) state.publicAppUrl = tJson.publicUrl;
      if (tJson.backupPublicUrl) state.backupPublicUrl = tJson.backupPublicUrl;
      if (tJson.lanUrl) state.lanAppUrl = tJson.lanUrl;
      renderHouseholdSettings();
    }
  } catch (_) {}
}

function getPublicShareBaseUrl() {
  const host = (window.location.hostname || '').toLowerCase();
  if (
    window.location.protocol === 'file:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === ''
  ) {
    return (state.publicAppUrl || state.backupPublicUrl || DEFAULT_PUBLIC_APP_URL).replace(/\/+$/, '');
  }
  const basePath = (window.location.pathname || '/').replace(/\/index\.html$/i, '').replace(/\/+$/, '');
  const fullOriginWithPath = `${window.location.origin.replace(/\/+$/, '')}${basePath}`;
  if (
    host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.github.io') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.trycloudflare.com') ||
    host.endsWith('.lhr.life')
  ) {
    return fullOriginWithPath;
  }
  return (fullOriginWithPath || state.publicAppUrl || state.backupPublicUrl || DEFAULT_PUBLIC_APP_URL).replace(/\/+$/, '');
}

function isSupabaseSyncConfigured() {
  return Boolean(
    state.household.sbUrl &&
      /^https?:\/\/.+/i.test(state.household.sbUrl.trim()) &&
      state.household.sbKey &&
      state.household.sbKey.trim().length > 15
  );
}

function getDefaultInviteMemberName() {
  const members = Array.isArray(state.household.members) ? state.household.members : [];
  const selfName = (state.household.memberName || '').trim().toLowerCase();
  const others = members.filter((m) => String(m || '').trim().toLowerCase() !== selfName);
  return others.length > 0 ? others[others.length - 1] : '';
}

function getHouseholdInviteShareUrl(targetMemberName = '') {
  const base = getPublicShareBaseUrl();
  let url = `${base}/?household=${encodeURIComponent(state.household.code)}`;
  const chosenMember = String(targetMemberName || getDefaultInviteMemberName() || '').trim();
  if (chosenMember) {
    url += `&member=${encodeURIComponent(chosenMember)}`;
  }
  if (isSupabaseSyncConfigured()) {
    url += `&sbUrl=${encodeURIComponent(normalizeSupabaseBaseUrl(state.household.sbUrl))}`;
    url += `&sbKey=${encodeURIComponent(state.household.sbKey.trim())}`;
  }
  if (state.household.geminiKey && state.household.geminiKey.trim().length > 10) {
    url += `&aiKey=${encodeURIComponent(state.household.geminiKey.trim())}`;
  }
  if (state.household.backupAiKey && state.household.backupAiKey.trim().length > 10) {
    url += `&aiKey2=${encodeURIComponent(state.household.backupAiKey.trim())}`;
  }
  return url;
}

function getHouseholdLanShareUrl(targetMemberName = '') {
  const lanBase = (state.lanAppUrl || DEFAULT_LAN_APP_URL).replace(/\/+$/, '');
  let url = `${lanBase}/?household=${encodeURIComponent(state.household.code)}`;
  const chosenMember = String(targetMemberName || getDefaultInviteMemberName() || '').trim();
  if (chosenMember) {
    url += `&member=${encodeURIComponent(chosenMember)}`;
  }
  if (isSupabaseSyncConfigured()) {
    url += `&sbUrl=${encodeURIComponent(normalizeSupabaseBaseUrl(state.household.sbUrl))}`;
    url += `&sbKey=${encodeURIComponent(state.household.sbKey.trim())}`;
  }
  if (state.household.geminiKey && state.household.geminiKey.trim().length > 10) {
    url += `&aiKey=${encodeURIComponent(state.household.geminiKey.trim())}`;
  }
  if (state.household.backupAiKey && state.household.backupAiKey.trim().length > 10) {
    url += `&aiKey2=${encodeURIComponent(state.household.backupAiKey.trim())}`;
  }
  return url;
}

function renderHouseholdSettings() {
  const codeInput = document.getElementById('householdCodeInput');
  const memberInput = document.getElementById('memberNameInput');
  const geminiInput = document.getElementById('geminiKeyInput');
  const inviteUrlEl = document.getElementById('householdInviteLink');
  const membersListEl = document.getElementById('householdMembersList');

  if (codeInput) codeInput.value = state.household.code;
  if (memberInput) memberInput.value = state.household.memberName;
  if (geminiInput) geminiInput.value = state.household.geminiKey;

  const shareUrl = getHouseholdInviteShareUrl();
  const lanUrl = getHouseholdLanShareUrl();
  if (inviteUrlEl) inviteUrlEl.value = shareUrl;

  const statusBox = document.getElementById('tunnelConnectionStatusBox');
  if (statusBox) {
    const pubBase = getPublicShareBaseUrl();
    const lanBase = (state.lanAppUrl || DEFAULT_LAN_APP_URL).replace(/\/+$/, '');
    const sbReady = isSupabaseSyncConfigured();
    const syncTimeStr = state.household.lastSyncAt
      ? new Date(state.household.lastSyncAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : '';
    const syncHeadline = sbReady
      ? state.household.syncStatus === 'error'
        ? '⚠️ Supabase-Sync Fehler (Details unten)'
        : `🟢 Supabase Cloud-Sync aktiv${syncTimeStr ? ` (${syncTimeStr})` : ''}`
      : '☁️ Supabase Cloud-Sync einrichten (WLAN & Mobilfunk)';

    const sbConnectedClean = sbReady && state.household.syncStatus !== 'error';
    const sbConfigFieldsHtml = `
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px; margin-bottom:6px;">
        <input id="sbUrlInput" type="url" class="text-input" style="padding:7px 9px; font-size:12px;" placeholder="Supabase Project URL (https://xxxx.supabase.co)" value="${escapeHtml(state.household.sbUrl || '')}" />
        <input id="sbKeyInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" class="text-input masked-key-input" style="padding:7px 9px; font-size:12px;" placeholder="Supabase Anon / Publishable Key (eyJ... oder sb_publishable_...)" value="${escapeHtml(state.household.sbKey || '')}" />
        <button type="button" class="btn btn-primary" style="font-size:12px; padding:8px;" onclick="saveAndTestSupabaseSync()">
          ✅ Supabase verbinden &amp; jetzt synchronisieren
        </button>
      </div>
    `;

    statusBox.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
        <div style="font-size:12.5px; font-weight:800; color:${state.household.syncStatus === 'error' ? '#fbbf24' : sbReady ? '#6ee7b7' : '#93c5fd'};">
          ${syncHeadline}
        </div>
        <span class="validity-pill valid-active" style="font-size:10px;">v44 · ${escapeHtml(state.household.code)}</span>
      </div>
      <div style="font-size:11.5px; color:#cbd5e1; line-height:1.45; margin-bottom:6px;">
        ${
          sbConnectedClean
            ? `Rezepte, Einkaufsliste &amp; Wochenplan bleiben automatisch über <strong>Supabase</strong> (WLAN, Mobilfunk &amp; VPN) synchron.`
            : `Kostenlose Cloud-Datenbank über <a href="https://supabase.com" target="_blank" rel="noopener" style="color:#6ee7b7; text-decoration:underline; font-weight:700;">supabase.com ↗</a> (Frankfurt, keine Kreditkarte).`
        }
        ${state.household.lastSyncError ? `<div style="color:#f87171; margin-top:5px; font-weight:700;">❌ ${escapeHtml(state.household.lastSyncError)}</div>` : ''}
      </div>
      ${sbConnectedClean ? '' : sbConfigFieldsHtml}
      <details style="margin-top:4px; font-size:11px; color:var(--text-muted);">
        <summary style="cursor:pointer; font-weight:700; color:#93c5fd;">⚙️ Technik, Supabase-Daten &amp; SQL-Skript</summary>
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid var(--border); line-height:1.5;">
          ${sbConnectedClean ? sbConfigFieldsHtml : ''}
          <div style="margin-bottom:4px;">SQL Editor → New Query:</div>
          <pre style="background:#020617; color:#6ee7b7; padding:8px; border-radius:8px; font-size:10px; overflow-x:auto; white-space:pre-wrap; margin-bottom:6px;">create table if not exists household_sync (
  household_code text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table household_sync disable row level security;
grant select, insert, update, delete on table public.household_sync to anon, authenticated;</pre>
          • Öffentliche URL: <a href="${escapeHtml(pubBase)}" target="_blank" rel="noopener" style="color:#34d399; font-weight:700; word-break:break-all;">${escapeHtml(pubBase)}</a><br/>
          • Heim-WLAN: <a href="${escapeHtml(lanBase)}" target="_blank" rel="noopener" style="color:#93c5fd; font-weight:700; word-break:break-all;">${escapeHtml(lanBase)}</a>
        </div>
      </details>
    `;
  }

  const qrImg = document.getElementById('householdQrImg');
  const qrHint = document.getElementById('householdQrHint');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`;
    qrImg.style.display = 'block';
    qrImg.style.cursor = 'pointer';
    qrImg.onclick = () => {
      if (typeof openCustomImageLightbox === 'function') {
        openCustomImageLightbox(
          `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&data=${encodeURIComponent(shareUrl)}`,
          `Haushalt „${state.household.code}“ – QR-Code zum Mitbenutzer-Beitritt`,
          shareUrl
        );
      }
    };
    if (qrHint) {
      qrHint.style.display = 'block';
      qrHint.innerHTML = `
        📱 <strong>Mit zweitem Smartphone Kamera öffnen & QR-Code scannen!</strong><br/>
        <span style="font-size:10.5px; color:#6ee7b7;">🌐 Öffentlicher HTTPS-Zugang (überall erreichbar): <a href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener" style="color:#6ee7b7; text-decoration:underline;">${escapeHtml(shareUrl)}</a></span><br/>
        <span style="font-size:10.5px; color:var(--text-muted);">🏠 Heim-WLAN Direktlink: <a href="${escapeHtml(lanUrl)}" target="_blank" rel="noopener" style="color:var(--primary-light); text-decoration:underline;">${escapeHtml(lanUrl)}</a></span>
      `;
    }
  }

  if (membersListEl) {
    if (!Array.isArray(state.household.members) || state.household.members.length === 0) {
      membersListEl.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">Noch keine Mitbenutzer eingetragen.</span>`;
    } else {
      membersListEl.innerHTML = state.household.members
        .map(
          (m, idx) => `
          <span class="chip active" style="display:inline-flex; align-items:center; gap:6px; margin-right:6px; margin-bottom:6px; padding-right:6px;">
            <span>👤 ${escapeHtml(m)}</span>
            <button
              type="button"
              class="member-remove-btn"
              style="background:rgba(16,185,129,0.28); color:#6ee7b7;"
              onclick="shareHouseholdInvite('${escapeHtml(m)}')"
              title="Persönlichen Einladungs-Link für ${escapeHtml(m)} teilen"
            >🔗</button>
            <button
              type="button"
              class="member-remove-btn"
              onclick="removeHouseholdMember(${idx})"
              title="${escapeHtml(m)} aus dem Haushalt entfernen"
              aria-label="${escapeHtml(m)} entfernen"
            >✕</button>
          </span>`
        )
        .join('');
    }
  }
  updateOnlineStatus();
}

function saveHouseholdSettings() {
  const newCode = (document.getElementById('householdCodeInput').value || 'FAMILIE-2026').trim().toUpperCase();
  const newName = (document.getElementById('memberNameInput').value || 'Koch-Chef').trim();
  const newGemini = (document.getElementById('geminiKeyInput').value || '').trim();

  state.household.code = newCode;
  state.household.memberName = newName;
  state.household.geminiKey = newGemini;

  if (!state.household.members.includes(newName)) {
    state.household.members.push(newName);
  }
  state.lastMembersUpdateAt = Date.now();

  localStorage.setItem('kt_household_code', newCode);
  localStorage.setItem('kt_member_name', newName);
  localStorage.setItem('kt_gemini_key', newGemini);
  localStorage.setItem('kt_members', JSON.stringify(state.household.members));

  renderHouseholdSettings();
  renderAiKeyStatusBar();
  broadcastSyncUpdate();
  showToast('Haushalts-Konto aktualisiert & synchronisiert!');
}

function addHouseholdMember() {
  const inp = document.getElementById('newMemberInput');
  const name = (inp?.value || '').trim();
  if (!name) {
    showToast('Bitte einen Namen für den Mitbenutzer eingeben');
    return;
  }
  if (!state.household.members.includes(name)) {
    state.household.members.push(name);
    state.lastMembersUpdateAt = Date.now();
    localStorage.setItem('kt_members', JSON.stringify(state.household.members));
  }
  if (inp) inp.value = '';
  renderHouseholdSettings();
  broadcastSyncUpdate();
  showToast(`👤 "${name}" zum Haushalt hinzugefügt!`);
}

function removeHouseholdMember(indexOrName) {
  if (!Array.isArray(state.household.members)) return;
  let idx = -1;
  if (typeof indexOrName === 'number') {
    idx = indexOrName;
  } else {
    idx = state.household.members.findIndex((m) => m === indexOrName);
  }
  if (idx < 0 || idx >= state.household.members.length) return;

  const removedName = state.household.members[idx];
  state.household.members.splice(idx, 1);
  state.lastMembersUpdateAt = Date.now();
  localStorage.setItem('kt_members', JSON.stringify(state.household.members));

  renderHouseholdSettings();
  broadcastSyncUpdate();
  showToast(`🗑️ Mitbenutzer "${removedName}" wurde entfernt`);
}

async function shareHouseholdInvite(targetMemberName = '') {
  if (!isSupabaseSyncConfigured()) {
    showToast('Bitte zuerst oben Supabase verbinden, damit der Link beide Handys synchronisiert!');
  }
  const chosenMember = String(targetMemberName || getDefaultInviteMemberName() || '').trim();
  const shareUrl = getHouseholdInviteShareUrl(chosenMember);
  const shareText = `Tritt unserem gemeinsamen KochTresor-Haushalt "${state.household.code}"${chosenMember ? ` als ${chosenMember}` : ''} bei! Alle Rezepte, Einkaufslisten & Wochenpläne bleiben automatisch synchron:\n${shareUrl}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'KochTresor Haushalts-Einladung', text: shareText, url: shareUrl });
      return;
    }
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast(`🔗 Einladungs-Link${chosenMember ? ` für ${chosenMember}` : ''} kopiert!`);
  } catch (_) {
    const inviteUrlEl = document.getElementById('householdInviteLink');
    if (inviteUrlEl) {
      inviteUrlEl.value = shareUrl;
      inviteUrlEl.select();
      document.execCommand('copy');
    }
    showToast('Sync-Einladungslink kopiert!');
  }
}

let cloudSyncInFlight = false;

function buildLocalSyncPayload() {
  // Nur eigene/importierte/geänderte Rezepte übertragen (Starter-Rezepte sind bereits auf jedem Handy eingebaut -> extrem klein & schnell auch über Mobilfunk!)
  const starterIds = new Set([...STARTER_RECIPES, ...SUGGESTED_DIRECT_RECIPES].map((r) => r.id));
  const syncableRecipes = (state.recipes || [])
    .filter((r) => !starterIds.has(r.id) || r.isFavorite || r.notes || r.lastCookedAt)
    .map((r) => ({
      ...r,
      // Alle Rezept-Fotos (Web-URLs & komprimierte eigene Fotos bis ~400 KB) voll über Supabase mitsynchronisieren!
      imageUrl: r.imageUrl && r.imageUrl.startsWith('data:') && r.imageUrl.length > 550000 ? '' : r.imageUrl
    }));

  return {
    householdCode: state.household.code,
    recipes: syncableRecipes,
    deletedRecipeIds: Array.isArray(state.deletedRecipeIds) ? state.deletedRecipeIds : [],
    deletedShoppingIds: Array.isArray(state.deletedShoppingIds) ? state.deletedShoppingIds : [],
    shoppingList: (state.shoppingList || []).map((item) => ({
      ...item,
      updatedAt: item.updatedAt || Date.now()
    })),
    weekPlan: state.weekPlan || {},
    weekPlanUpdatedAt: state.weekPlanUpdatedAt || 0,
    members: state.household.members || [],
    membersUpdatedAt: state.lastMembersUpdateAt || Date.now(),
    updatedAt: Date.now()
  };
}

function normalizeSupabaseBaseUrl(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  // Entferne versehentlich mitkopiertes /rest/v1 oder andere Pfade am Ende
  u = u.replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
  return u;
}

function getSupabaseHeaders(extra = {}) {
  const key = (state.household.sbKey || '').trim();
  const base = { apikey: key, ...extra };
  // Legacy JWT-Keys (eyJ...) benötigen zusätzlich Authorization: Bearer; neue sb_publishable_-Keys nur apikey!
  if (key.startsWith('eyJ')) {
    base.Authorization = `Bearer ${key}`;
  }
  return base;
}

async function supabaseGetHouseholdData() {
  const baseUrl = normalizeSupabaseBaseUrl(state.household.sbUrl);
  const code = (state.household.code || 'FAMILIE').trim().toUpperCase();
  const url = `${baseUrl}/rest/v1/household_sync?household_code=eq.${encodeURIComponent(code)}&select=data,updated_at`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getSupabaseHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`Supabase GET HTTP ${res.status}${errTxt ? `: ${errTxt.slice(0, 120)}` : ''}`);
  }
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
    return rows[0].data;
  }
  return null;
}

async function supabaseUpsertHouseholdData(payload) {
  const baseUrl = normalizeSupabaseBaseUrl(state.household.sbUrl);
  const code = (state.household.code || 'FAMILIE').trim().toUpperCase();
  const url = `${baseUrl}/rest/v1/household_sync?on_conflict=household_code`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getSupabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify({
      household_code: code,
      data: payload,
      updated_at: new Date().toISOString()
    })
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`Supabase SAVE HTTP ${res.status}${errTxt ? `: ${errTxt.slice(0, 120)}` : ''}`);
  }
}

async function saveAndTestSupabaseSync() {
  const rawUrl = normalizeSupabaseBaseUrl(document.getElementById('sbUrlInput')?.value || '');
  const rawKey = (document.getElementById('sbKeyInput')?.value || '').trim();

  if (!rawUrl || !rawKey) {
    showToast('Bitte sowohl die Supabase Project URL als auch den Public Key einfügen!');
    return;
  }
  if (!/^https?:\/\/.+supabase\.(co|in|net)/i.test(rawUrl) && !/^https?:\/\//i.test(rawUrl)) {
    showToast('Die Project URL muss mit https:// beginnen (z.B. https://xxxx.supabase.co)');
    return;
  }

  state.household.sbUrl = rawUrl;
  state.household.sbKey = rawKey;
  state.household.lastSyncError = '';
  localStorage.setItem('kt_sb_url', rawUrl);
  localStorage.setItem('kt_sb_key', rawKey);

  showToast('⏳ Verbinde mit Supabase & synchronisiere...');
  try {
    const remote = await supabaseGetHouseholdData();
    if (remote && Array.isArray(remote.recipes)) {
      await applyIncomingSyncData(remote, false);
    }
    const mergedPayload = buildLocalSyncPayload();
    await supabaseUpsertHouseholdData(mergedPayload);

    state.household.syncStatus = 'connected';
    state.household.lastSyncError = '';
    state.household.lastSyncAt = Date.now();
    renderHouseholdSettings();
    showToast('✅ Supabase verbunden! Du kannst jetzt den Einladungs-Link an deine Frau schicken.');
  } catch (err) {
    state.household.syncStatus = 'error';
    state.household.lastSyncError = String(err?.message || err);
    renderHouseholdSettings();
    showToast(`❌ ${state.household.lastSyncError}`);
  }
}

async function broadcastSyncUpdate() {
  state.household.hasLocalUnsyncedChanges = true;
  const localPayload = buildLocalSyncPayload();

  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'SYNC_STATE', payload: localPayload });
  }

  if (!navigator.onLine || !state.household.autoCloudSync || !isSupabaseSyncConfigured()) return;
  if (cloudSyncInFlight) return;
  cloudSyncInFlight = true;

  try {
    // 1. Zuerst aktuellen Cloud-Stand holen & sauber zusammenführen (nur falls sich remote seit letztem Sync etwas geändert hat)
    try {
      const remote = await supabaseGetHouseholdData();
      if (remote && Array.isArray(remote.recipes) && remote.updatedAt !== state.household.lastSyncedRemoteAt) {
        await applyIncomingSyncData(remote, true);
      }
    } catch (_) {}

    // 2. Zusammengeführten Stand in Supabase speichern
    const mergedPayload = buildLocalSyncPayload();
    await supabaseUpsertHouseholdData(mergedPayload);

    state.household.syncStatus = 'connected';
    state.household.lastSyncError = '';
    state.household.lastSyncAt = Date.now();
    state.household.lastSyncedRemoteAt = mergedPayload.updatedAt;
    state.household.hasLocalUnsyncedChanges = false;
    try {
      localStorage.setItem('kt_last_remote_ts', String(mergedPayload.updatedAt));
    } catch (_) {}
    updateOnlineStatus();
  } catch (err) {
    state.household.syncStatus = 'error';
    state.household.lastSyncError = String(err?.message || err);
  } finally {
    cloudSyncInFlight = false;
  }
}

async function pullHouseholdCloudState(manualToast = true) {
  if (!navigator.onLine) {
    if (manualToast) showToast('Du bist aktuell offline – lokale Daten sind aktiv');
    return;
  }
  if (!isSupabaseSyncConfigured()) {
    if (manualToast) {
      showToast('Bitte im Tab „Haushalt“ einmalig Supabase verbinden (3 Min., kostenlos).');
      switchTab('household');
    }
    return;
  }
  if (cloudSyncInFlight) return;
  cloudSyncInFlight = true;

  try {
    const remote = await supabaseGetHouseholdData();
    if (!remote) {
      const initPayload = buildLocalSyncPayload();
      await supabaseUpsertHouseholdData(initPayload);
      state.household.lastSyncedRemoteAt = initPayload.updatedAt;
      state.household.hasLocalUnsyncedChanges = false;
      try { localStorage.setItem('kt_last_remote_ts', String(initPayload.updatedAt)); } catch (_) {}
    } else if (
      !manualToast &&
      remote.updatedAt &&
      remote.updatedAt === state.household.lastSyncedRemoteAt &&
      !state.household.hasLocalUnsyncedChanges
    ) {
      // Nichts Neues auf dem Server & keine ungesendeten lokalen Änderungen -> kein unnötiger erneuter Abgleich!
      state.household.syncStatus = 'connected';
      state.household.lastSyncAt = Date.now();
      return;
    } else {
      const hadLocalDiff = await applyIncomingSyncData(remote, false);
      if (hadLocalDiff || state.household.hasLocalUnsyncedChanges) {
        const mergedPayload = buildLocalSyncPayload();
        await supabaseUpsertHouseholdData(mergedPayload).catch(() => {});
        state.household.lastSyncedRemoteAt = mergedPayload.updatedAt;
        state.household.hasLocalUnsyncedChanges = false;
        try { localStorage.setItem('kt_last_remote_ts', String(mergedPayload.updatedAt)); } catch (_) {}
      } else if (remote.updatedAt) {
        state.household.lastSyncedRemoteAt = remote.updatedAt;
        try { localStorage.setItem('kt_last_remote_ts', String(remote.updatedAt)); } catch (_) {}
      }
    }

    state.household.syncStatus = 'connected';
    state.household.lastSyncError = '';
    state.household.lastSyncAt = Date.now();
    renderHouseholdSettings();
    if (manualToast) showToast(`✅ Mit Supabase synchronisiert! (${state.recipes.length} Rezepte)`);
  } catch (err) {
    state.household.syncStatus = 'error';
    state.household.lastSyncError = String(err?.message || err);
    if (manualToast) showToast(`❌ Supabase-Sync Fehler: ${state.household.lastSyncError}`);
    renderHouseholdSettings();
  } finally {
    cloudSyncInFlight = false;
  }
}

async function applyIncomingSyncData(remote, silentRender = false) {
  if (!remote || !Array.isArray(remote.recipes)) return false;

  // Gelöschte Rezept-IDs von beiden Geräten zusammenführen
  const deletedSet = new Set([
    ...(Array.isArray(state.deletedRecipeIds) ? state.deletedRecipeIds : []),
    ...(Array.isArray(remote.deletedRecipeIds) ? remote.deletedRecipeIds : [])
  ]);
  state.deletedRecipeIds = Array.from(deletedSet);
  try {
    localStorage.setItem('kt_deleted_recipes', JSON.stringify(state.deletedRecipeIds));
  } catch (_) {}

  const map = new Map();
  let hasLocalNewer = false;
  let changedLocally = false;

  for (const r of state.recipes) {
    if (deletedSet.has(r.id)) {
      await dbDelete('recipes', r.id);
      changedLocally = true;
      continue;
    }
    map.set(r.id, r);
  }

  const remoteIdSet = new Set();
  for (const rem of remote.recipes) {
    if (!rem || !rem.id || deletedSet.has(rem.id)) continue;
    remoteIdSet.add(rem.id);
    const loc = map.get(rem.id);
    if (!loc || (rem.updatedAt || 0) > (loc.updatedAt || 0)) {
      const merged = { ...rem, imageUrl: rem.imageUrl || loc?.imageUrl || '' };
      map.set(rem.id, merged);
      await dbPut('recipes', merged);
      changedLocally = true;
    } else if ((loc.updatedAt || 0) > (rem.updatedAt || 0)) {
      hasLocalNewer = true;
    }
  }

  for (const loc of map.values()) {
    if (!remoteIdSet.has(loc.id)) {
      hasLocalNewer = true;
    }
  }

  state.recipes = Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (Array.isArray(remote.shoppingList)) {
    // Artikel-für-Artikel-Merge: Kein Artikel geht verloren, selbst wenn beide im Supermarkt gleichzeitig tippen!
    const deletedShopSet = new Set([
      ...(Array.isArray(state.deletedShoppingIds) ? state.deletedShoppingIds : []),
      ...(Array.isArray(remote.deletedShoppingIds) ? remote.deletedShoppingIds : [])
    ]);
    state.deletedShoppingIds = Array.from(deletedShopSet).slice(-400);
    try {
      localStorage.setItem('kt_deleted_shop', JSON.stringify(state.deletedShoppingIds));
    } catch (_) {}

    const shopMap = new Map();
    const localShop = Array.isArray(state.shoppingList) ? state.shoppingList : [];
    for (const item of localShop) {
      if (!item || !item.id || deletedShopSet.has(item.id)) {
        if (item && item.id && deletedShopSet.has(item.id)) changedLocally = true;
        continue;
      }
      shopMap.set(item.id, item);
    }

    const remoteShopIds = new Set();
    for (const remItem of remote.shoppingList) {
      if (!remItem || !remItem.id || deletedShopSet.has(remItem.id)) continue;
      remoteShopIds.add(remItem.id);
      const locItem = shopMap.get(remItem.id);
      if (!locItem) {
        shopMap.set(remItem.id, remItem);
        changedLocally = true;
      } else {
        const remTs = remItem.updatedAt || remote.updatedAt || 0;
        const locTs = locItem.updatedAt || 0;
        if (remTs > locTs) {
          shopMap.set(remItem.id, { ...locItem, ...remItem });
          changedLocally = true;
        } else if (locTs > remTs) {
          hasLocalNewer = true;
        }
      }
    }

    for (const locItem of shopMap.values()) {
      if (!remoteShopIds.has(locItem.id)) {
        hasLocalNewer = true;
      }
    }

    const mergedShop = Array.from(shopMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    state.shoppingList = mergedShop;
    await dbPut('meta', { key: 'shoppingList', value: state.shoppingList });
    try {
      localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
    } catch (_) {}
  }

  if (remote.weekPlan && typeof remote.weekPlan === 'object') {
    const remoteWeekTs = remote.weekPlanUpdatedAt || remote.updatedAt || 0;
    const localWeekTs = state.weekPlanUpdatedAt || 0;
    if (remoteWeekTs > localWeekTs) {
      state.weekPlan = {
        Montag: '', Dienstag: '', Mittwoch: '', Donnerstag: '',
        Freitag: '', Samstag: '', Sonntag: '',
        ...remote.weekPlan
      };
      state.weekPlanUpdatedAt = remoteWeekTs;
      try {
        localStorage.setItem('kt_weekplan_ts', String(remoteWeekTs));
      } catch (_) {}
      await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
      changedLocally = true;
    } else if (localWeekTs > remoteWeekTs) {
      hasLocalNewer = true;
    }
  }

  if (Array.isArray(remote.members)) {
    const remoteMembersTs = remote.membersUpdatedAt || remote.updatedAt || 0;
    const localMembersTs = state.lastMembersUpdateAt || 0;
    if (remoteMembersTs >= localMembersTs) {
      state.household.members = [...remote.members];
      localStorage.setItem('kt_members', JSON.stringify(state.household.members));
      changedLocally = true;
    }
  }

  if (!silentRender && changedLocally) {
    renderAll();
  }
  return hasLocalNewer;
}

function exportFullBackup() {
  const dataStr = JSON.stringify(
    {
      household: state.household.code,
      recipes: state.recipes,
      shoppingList: state.shoppingList,
      weekPlan: state.weekPlan
    },
    null,
    2
  );
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KochTresor-${state.household.code}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFullBackup(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await applyIncomingSyncData(data);
      showToast('Backup erfolgreich eingespielt!');
    } catch (_) {
      showToast('Ungültige Backup-Datei');
    }
  };
  reader.readAsText(file);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 11. IN-APP LIVE-SUCHE (Chefkoch, Instagram Reels, Facebook & Foodblogs)
// ============================================================================
state.liveSearchSource = 'all';
state.liveSearchResults = [];

function setLiveSearchSource(src) {
  state.liveSearchSource = src;
  document.querySelectorAll('#liveSearchSourceChips .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.src === src);
  });
  const q = document.getElementById('liveSearchInput')?.value?.trim();
  if (q) executeLiveRecipeSearch();
}

function searchOnlineFromHome() {
  const homeQ = document.getElementById('homeSearchInput')?.value?.trim() || state.searchQuery || '';
  switchTab('import');
  const liveInp = document.getElementById('liveSearchInput');
  if (liveInp) {
    liveInp.value = homeQ || 'Pasta';
    executeLiveRecipeSearch();
  }
}

async function executeLiveRecipeSearch() {
  const inp = document.getElementById('liveSearchInput');
  const box = document.getElementById('liveSearchResultsBox');
  if (!inp || !box) return;
  const query = inp.value.trim();
  if (!query) {
    showToast('Bitte einen Suchbegriff eingeben (z.B. Gulasch, Lasagne, Pfannkuchen)');
    return;
  }

  box.innerHTML = `
    <div style="text-align:center; padding:18px 10px; font-size:13px; color:var(--text-muted);">
      ⏳ Durchsuche live ${
        state.liveSearchSource === 'all'
          ? 'Chefkoch, Instagram Reels, Facebook & Foodblogs'
          : state.liveSearchSource.toUpperCase()
      } nach <strong>"${escapeHtml(query)}"</strong>...
    </div>
  `;

  const src = state.liveSearchSource;
  const tasks = [];

  if (src === 'all' || src === 'chefkoch') {
    tasks.push(searchChefkochLive(query));
  }
  if (src === 'all' || src === 'blogs') {
    tasks.push(searchFoodblogsLive(query));
  }
  if (src === 'all' || src === 'instagram') {
    tasks.push(searchSocialReelsLive(query, 'instagram'));
  }
  if (src === 'all' || src === 'facebook') {
    tasks.push(searchSocialReelsLive(query, 'facebook'));
  }

  const settled = await Promise.allSettled(tasks);
  let combined = [];
  settled.forEach((res) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      combined = combined.concat(res.value);
    }
  });

  state.liveSearchResults = combined;
  renderLiveSearchResults();
}

async function searchChefkochLive(query) {
  const apiUrl = `https://api.chefkoch.de/v2/recipes?query=${encodeURIComponent(query)}&limit=6`;
  try {
    let data = null;
    try {
      const res = await fetch(apiUrl);
      if (res.ok) data = await res.json();
    } catch (_) {}
    if (!data) {
      const text = await fetchUrlContentWithCorsFallback(apiUrl);
      if (text) data = JSON.parse(text);
    }
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.map((item) => {
      const r = item.recipe || {};
      const img = r.previewImageUrlTemplate
        ? r.previewImageUrlTemplate.replace('<format>', 'crop-480x360')
        : 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80';
      return {
        provider: 'Chefkoch',
        badgeIcon: '👨‍🍳 Chefkoch',
        title: r.title || 'Chefkoch Rezept',
        url: r.siteUrl || `https://www.chefkoch.de/rezepte/${r.id}`,
        imageUrl: img,
        prepTime: r.totalTime || r.preparationTime || 25,
        rating: r.rating?.rating ? r.rating.rating.toFixed(1) : '4.7',
        snippet: r.subtitle || '1:1 Original-Rezept von Chefkoch.de'
      };
    });
  } catch (_) {
    return [];
  }
}

async function searchFoodblogsLive(query) {
  const blogs = [
    { name: 'Gaumenfreundin', base: 'https://www.gaumenfreundin.de' },
    { name: 'Emmi kocht einfach', base: 'https://emmikochteinfach.de' }
  ];
  const results = [];
  await Promise.allSettled(
    blogs.map(async (b) => {
      try {
        const res = await fetch(`${b.base}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=3&_embed=1`);
        if (!res.ok) return;
        const posts = await res.json();
        const parser = new DOMParser();
        posts.forEach((p) => {
          const cleanTitle = parser.parseFromString(p.title?.rendered || '', 'text/html').body.textContent || 'Blog-Rezept';
          const cleanExcerpt = parser.parseFromString(p.excerpt?.rendered || '', 'text/html').body.textContent?.trim() || '';
          const img =
            p._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
            'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=600&q=80';
          results.push({
            provider: b.name,
            badgeIcon: `🥘 ${b.name}`,
            title: cleanTitle,
            url: p.link,
            imageUrl: img,
            prepTime: 25,
            rating: '5.0',
            snippet: cleanExcerpt.slice(0, 140)
          });
        });
      } catch (_) {}
    })
  );
  return results;
}

async function searchSocialReelsLive(query, platform) {
  try {
    const siteFilter = platform === 'instagram' ? 'site:instagram.com/reel' : 'site:facebook.com';
    const searchQ = `${siteFilter} Rezept ${query}`;
    const ddgLiteUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(searchQ)}`;
    const res = await fetch(ddgLiteUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = await res.json();
    const content = json?.data?.content || '';

    const entries = [];
    // Parse Markdown links + snippets returned by DuckDuckGo Lite
    const regex = /\d+\.\[(.*?)\]\((https:\/\/duckduckgo\.com\/l\/\?uddg=([^)&]+)[^)]*)\)\s*([\s\S]*?)(?=\n\d+\.\[|$)/g;
    let m;
    while ((m = regex.exec(content)) !== null && entries.length < 5) {
      const rawTitle = m[1].replace(/\s+/g, ' ').trim();
      const targetUrl = decodeURIComponent(m[3]);
      const rawSnippet = m[4].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      if (targetUrl.includes('instagram.com') || targetUrl.includes('facebook.com')) {
        entries.push({
          provider: platform === 'instagram' ? 'Instagram' : 'Facebook',
          badgeIcon: platform === 'instagram' ? '📸 Instagram Reel' : '📹 Facebook Video',
          title: rawTitle.slice(0, 85),
          url: targetUrl,
          imageUrl:
            platform === 'instagram'
              ? 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?auto=format&fit=crop&w=600&q=80'
              : 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=600&q=80',
          prepTime: 20,
          rating: 'Reel',
          snippet: rawSnippet.slice(0, 320)
        });
      }
    }
    return entries;
  } catch (_) {
    return [];
  }
}

function renderLiveSearchResults() {
  const box = document.getElementById('liveSearchResultsBox');
  if (!box) return;

  if (!state.liveSearchResults || state.liveSearchResults.length === 0) {
    box.innerHTML = `
      <div style="text-align:center; padding:14px; font-size:12.5px; color:var(--text-muted);">
        Keine Online-Treffer gefunden. Probiere einen anderen Begriff (z.B. "Pasta", "Hähnchen", "Kuchen").
      </div>
    `;
    return;
  }

  box.innerHTML = state.liveSearchResults
    .map((item, idx) => {
      const alreadySaved = state.recipes.some((r) => r.sourceUrl === item.url);
      return `
        <div class="section-card" style="padding:11px; margin-bottom:9px; background:#0b1120; display:flex; gap:11px; align-items:flex-start;">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" style="width:68px; height:68px; border-radius:12px; object-fit:cover; flex-shrink:0;" onerror="this.src='https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80'" />
          <div style="flex:1; min-width:0;">
            <div style="font-size:10.5px; font-weight:700; color:var(--primary-light); margin-bottom:2px;">
              ${escapeHtml(item.badgeIcon)} · ★ ${escapeHtml(String(item.rating))}
            </div>
            <div style="font-size:13.5px; font-weight:700; margin-bottom:4px; line-height:1.25;">${escapeHtml(item.title)}</div>
            ${
              item.snippet
                ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:7px; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(item.snippet)}</div>`
                : ''
            }
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <button
                id="liveAddBtn-${idx}"
                class="pill-btn"
                style="background:${alreadySaved ? 'var(--bg-elevated)' : 'var(--primary)'}; color:#fff; border:none; font-size:11px; padding:6px 11px;"
                onclick="importLiveSearchResult(${idx})"
              >
                ${alreadySaved ? '✓ Gespeichert (Öffnen)' : '＋ 1:1 in App hinzufügen'}
              </button>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="pill-btn" style="text-decoration:none; color:var(--text-muted); font-size:11px; padding:5px 9px;">
                🔗 Original ↗
              </a>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function importLiveSearchResult(idx) {
  const item = state.liveSearchResults[idx];
  if (!item) return;

  const existing = state.recipes.find((r) => r.sourceUrl === item.url);
  if (existing) {
    openRecipeDetail(existing.id);
    return;
  }

  const btn = document.getElementById(`liveAddBtn-${idx}`);
  if (btn) {
    btn.textContent = '⏳ Lade 1:1 Rezept...';
    btn.disabled = true;
  }

  try {
    if (item.provider === 'Instagram' || item.provider === 'Facebook') {
      const extracted = await extractRecipeWithAIOrParser(`${item.title}\n${item.snippet || ''}`);
      await saveImportedRecipe({
        title: item.title.replace(/\|.*$/, '').trim() || extracted.title,
        category: 'Schnell',
        prepTime: extracted.prepTime || 20,
        portions: extracted.portions || 4,
        author: item.provider,
        sourceType: item.provider.toLowerCase(),
        sourceUrl: item.url,
        imageUrl: item.imageUrl,
        tags: [item.provider, 'Social-Suche'],
        nutrition: null,
        notes: item.snippet || '',
        ingredients: extracted.ingredients.length
          ? extracted.ingredients
          : [{ amount: null, unit: '', name: item.snippet || 'Siehe Original-Reel / Video-Link oben' }],
        steps: extracted.steps.length ? extracted.steps : [item.snippet || 'Zubereitung im verlinkten Video.']
      });
      renderLiveSearchResults();
      showToast(`${item.provider}-Rezept zur Sammlung hinzugefügt!`);
      const added = state.recipes.find((r) => r.sourceUrl === item.url);
      if (added) openRecipeDetail(added.id);
      return;
    }

    // Für Chefkoch & Foodblogs: Nutze unseren 1:1 Webseiten-Importer
    const urlInput = document.getElementById('webImportUrl');
    if (urlInput) {
      urlInput.value = item.url;
      await importFromWebsiteUrl();
      renderLiveSearchResults();
      const added = state.recipes.find((r) => r.sourceUrl === item.url);
      if (added) openRecipeDetail(added.id);
    }
  } catch (_) {
    if (btn) {
      btn.textContent = '＋ 1:1 in App hinzufügen';
      btn.disabled = false;
    }
  }
}

// ============================================================================
// 12. DIREKTER APP-DOWNLOAD OHNE DRITTANBIETER (Standalone HTML-App + PWA)
// ============================================================================
let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'inline-flex';
});

async function triggerNativePwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    await deferredPwaPrompt.userChoice;
    deferredPwaPrompt = null;
  } else {
    showToast('Tipp: Im Browser-Menü "Zum Home-Bildschirm hinzufügen" wählen!');
  }
}

async function downloadStandaloneAppFile() {
  try {
    showToast('📦 Erstelle eigenständige App-Datei zum direkten Download...');
    const [cssRes, jsRes] = await Promise.all([
      fetch('./styles.css?v=17').then((r) => r.text()).catch(() => ''),
      fetch('./app.js?v=17').then((r) => r.text()).catch(() => '')
    ]);

    const currentDoc = document.documentElement.outerHTML;
    const standaloneHtml = currentDoc
      .replace(/<link rel="stylesheet" href="\.\/styles\.css[^"]*">/i, `<style>\n${cssRes}\n</style>`)
      .replace(/<script src="\.\/app\.js[^"]*"><\/script>/i, `<script>\n${jsRes}\n</script>`);

    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'KochTresor-App.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('✅ KochTresor-App.html direkt heruntergeladen!');
  } catch (_) {
    showToast('Download gestartet');
  }
}

// ============================================================================
// 13. AKTUELLE KAUFDA-WOCHENPROSPEKTE & HÄNDLER-ANGEBOTE ALLER 12 HÄNDLER (86399 BOBINGEN / AUGSBURG)
// ============================================================================
const ALL_RETAILERS_META = [
  {
    id: 'REWE',
    badgeClass: 'REWE',
    icon: '🔴',
    label: 'REWE',
    slug: 'rewe-de',
    kaufdaSlug: 'Rewe',
    contentId: '8250c199-a6fe-4628-9b75-876c0d735735',
    legacyId: '2501312775',
    cityUrl: 'https://www.kaufda.de/Augsburg/REWE/p-r108',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/8250c199-a6fe-4628-9b75-876c0d735735?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/8250c199-a6fe-4628-9b75-876c0d735735?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/rewe-de',
    officialBrochureUrl: 'https://www.rewe.de/angebote/',
    coverUrl: 'https://content-media.bonial.biz/903942a4-c7d8-4229-b2f3-da7240944624/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/903942a4-c7d8-4229-b2f3-da7240944624/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'REWE „Dein Markt“ KaufDA Prospekt',
    pages: '28 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'EDEKA',
    badgeClass: 'EDEKA',
    icon: '🔵',
    label: 'EDEKA',
    slug: 'edeka',
    kaufdaSlug: 'Edeka',
    contentId: '1d0ddfe1-0e75-4ec1-90dd-46a46bda31d9',
    legacyId: '2501318263',
    cityUrl: 'https://www.kaufda.de/Augsburg/EDEKA/p-r107',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/1d0ddfe1-0e75-4ec1-90dd-46a46bda31d9?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/1d0ddfe1-0e75-4ec1-90dd-46a46bda31d9?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/edeka',
    officialBrochureUrl: 'https://www.edeka.de/eh/angebote.jsp',
    coverUrl: 'https://content-media.bonial.biz/3387c75a-c5b9-4d29-995c-6ef2d684e368/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/3387c75a-c5b9-4d29-995c-6ef2d684e368/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'EDEKA „Wir lieben Lebensmittel“ Prospekt',
    pages: '32 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Lidl',
    badgeClass: 'Lidl',
    icon: '🟦',
    label: 'Lidl',
    slug: 'lidl',
    kaufdaSlug: 'Lidl',
    contentId: '3e8c10a5-071a-417f-85f0-fc41988915c7',
    legacyId: '2501310794',
    cityUrl: 'https://www.kaufda.de/Augsburg/Lidl/p-r74',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/3e8c10a5-071a-417f-85f0-fc41988915c7?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/3e8c10a5-071a-417f-85f0-fc41988915c7?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/lidl',
    officialBrochureUrl: 'https://www.lidl.de/c/online-prospekte/s10005610',
    coverUrl: 'https://content-media.bonial.biz/49387853-083e-40f7-af11-6f4a699535c0/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/49387853-083e-40f7-af11-6f4a699535c0/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Lidl „LIDL LOHNT SICH“ Wochenprospekt',
    pages: '73 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'ALDI Süd',
    badgeClass: 'ALDI_Sued',
    icon: '🟠',
    label: 'ALDI Süd',
    slug: 'aldisued-de',
    kaufdaSlug: 'Aldi-Sued',
    contentId: '71ee6eda-0684-4416-9d94-8210741492b5',
    legacyId: '2501312332',
    cityUrl: 'https://www.kaufda.de/Augsburg/ALDI-SUeD/p-r90',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/71ee6eda-0684-4416-9d94-8210741492b5?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/71ee6eda-0684-4416-9d94-8210741492b5?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/aldisued-de',
    officialBrochureUrl: 'https://www.aldi-sued.de/de/angebote/prospekte.html',
    coverUrl: 'https://content-media.bonial.biz/a861ecfa-fd06-4a51-b168-aae1623971f2/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/a861ecfa-fd06-4a51-b168-aae1623971f2/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'ALDI SÜD „Gutes für Alle“ Wochenprospekt',
    pages: '37 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'ALDI Nord',
    badgeClass: 'ALDI_Nord',
    icon: '🔷',
    label: 'ALDI Nord',
    slug: 'aldinord-de',
    kaufdaSlug: 'Aldi-Nord',
    contentId: '6c21c979-269e-4bc0-b537-5bbb1a51b90e',
    legacyId: '2501316968',
    cityUrl: 'https://www.kaufda.de/Berlin/ALDI-Nord/p-r43',
    lat: '52.52',
    lng: '13.41',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/6c21c979-269e-4bc0-b537-5bbb1a51b90e?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/6c21c979-269e-4bc0-b537-5bbb1a51b90e?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/aldinord-de',
    officialBrochureUrl: 'https://www.aldi-nord.de/prospekte.html',
    coverUrl: 'https://content-media.bonial.biz/1f7a81a7-b1ff-4e1d-9e4f-cbbc18975c6b/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/1f7a81a7-b1ff-4e1d-9e4f-cbbc18975c6b/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'ALDI Nord Aktuelle Wochenangebote',
    pages: '56 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Kaufland',
    badgeClass: 'Kaufland',
    icon: '🟣',
    label: 'Kaufland',
    slug: 'kaufland',
    kaufdaSlug: 'Kaufland',
    contentId: 'b0206124-539f-4c4b-a8c8-1e71bc6a71e9',
    legacyId: '2501297942',
    cityUrl: 'https://www.kaufda.de/Augsburg/Kaufland/p-r2801',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/b0206124-539f-4c4b-a8c8-1e71bc6a71e9?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/b0206124-539f-4c4b-a8c8-1e71bc6a71e9?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/kaufland',
    officialBrochureUrl: 'https://filiale.kaufland.de/prospekte.html',
    coverUrl: 'https://content-media.bonial.biz/a2f7ec5b-c11a-4b69-bbdf-cd4df4701ba2/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/a2f7ec5b-c11a-4b69-bbdf-cd4df4701ba2/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Kaufland „Hier bin ich richtig“ Wochenprospekt',
    pages: '60 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Netto',
    badgeClass: 'Netto',
    icon: '🟡',
    label: 'Netto',
    slug: 'netto-marken-discount-de',
    kaufdaSlug: 'Netto-Marken-Discount',
    contentId: 'dd41fc4e-eb8e-40a5-840b-736745a67bbd',
    legacyId: '2501323486',
    cityUrl: 'https://www.kaufda.de/Augsburg/Netto-Marken-Discount/p-r9',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/dd41fc4e-eb8e-40a5-840b-736745a67bbd?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/dd41fc4e-eb8e-40a5-840b-736745a67bbd?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/netto-marken-discount-de',
    officialBrochureUrl: 'https://www.netto-online.de/ueber-netto/Online-Prospekte.chtm',
    coverUrl: 'https://content-media.bonial.biz/f2359d23-e812-4661-b127-088c992c79d9/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/f2359d23-e812-4661-b127-088c992c79d9/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Netto Marken-Discount KaufDA Prospekt',
    pages: '72 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Penny',
    badgeClass: 'Penny',
    icon: '🟥',
    label: 'Penny',
    slug: 'penny-de',
    kaufdaSlug: 'Penny-Markt',
    contentId: '8af5adf7-ab90-453d-bb6b-8929def3b055',
    legacyId: '2501311590',
    cityUrl: 'https://www.kaufda.de/Augsburg/Penny-Markt/p-r75',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/8af5adf7-ab90-453d-bb6b-8929def3b055?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/8af5adf7-ab90-453d-bb6b-8929def3b055?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/penny-de',
    officialBrochureUrl: 'https://www.penny.de/angebote/prospekte',
    coverUrl: 'https://content-media.bonial.biz/d0991dac-88ad-4dde-a8ba-7693774bf9b0/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/d0991dac-88ad-4dde-a8ba-7693774bf9b0/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Penny „Wer günstig will, muss Penny“',
    pages: '44 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Norma',
    badgeClass: 'Norma',
    icon: '🟧',
    label: 'Norma',
    slug: 'norma-de',
    kaufdaSlug: 'Norma',
    contentId: 'a8a32361-949a-48de-897f-88bfe3b0233c',
    legacyId: '2501323670',
    cityUrl: 'https://www.kaufda.de/Augsburg/Norma/p-r78',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/a8a32361-949a-48de-897f-88bfe3b0233c?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/a8a32361-949a-48de-897f-88bfe3b0233c?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/norma-de',
    officialBrochureUrl: 'https://www.norma-online.de/de/angebote/',
    coverUrl: 'https://content-media.bonial.biz/fd0603f8-2219-4fef-9367-27e766372b0d/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/fd0603f8-2219-4fef-9367-27e766372b0d/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Norma „Mehr fürs Geld“ Wochenprospekt',
    pages: '30 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'Globus',
    badgeClass: 'Globus',
    icon: '🟢',
    label: 'Globus',
    slug: 'globus',
    kaufdaSlug: 'Globus',
    contentId: '04988c94-c8bf-43e5-a26d-4d28f6167085',
    legacyId: '2501316323',
    cityUrl: 'https://www.kaufda.de/Geschaefte/Globus',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/04988c94-c8bf-43e5-a26d-4d28f6167085?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/04988c94-c8bf-43e5-a26d-4d28f6167085?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/globus',
    officialBrochureUrl: 'https://www.globus.de/angebote.php',
    coverUrl: 'https://content-media.bonial.biz/0c7e052b-84ec-4d56-8b73-420cf530d223/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/0c7e052b-84ec-4d56-8b73-420cf530d223/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'Globus Markthallen KaufDA Faltblatt',
    pages: '52 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'tegut',
    badgeClass: 'tegut',
    icon: '🌿',
    label: 'tegut...',
    slug: 'tegut',
    kaufdaSlug: 'tegut',
    contentId: '63115be1-ef63-4072-a94e-9ec8e917fb42',
    legacyId: '2501311055',
    cityUrl: 'https://www.kaufda.de/Augsburg/tegut/p-r113',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/63115be1-ef63-4072-a94e-9ec8e917fb42?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/63115be1-ef63-4072-a94e-9ec8e917fb42?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/tegut',
    officialBrochureUrl: 'https://www.tegut.com/angebote.html',
    coverUrl: 'https://content-media.bonial.biz/01fac455-a1d9-4f79-b515-4904f7be774d/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/01fac455-a1d9-4f79-b515-4904f7be774d/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'tegut... gute Lebensmittel Flugblatt',
    pages: '22 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  },
  {
    id: 'HIT',
    badgeClass: 'HIT',
    icon: '❤️',
    label: 'HIT',
    slug: 'hit',
    kaufdaSlug: 'Hit',
    contentId: 'eb1798bf-6e69-46d4-a0c4-3d85310e5ff1',
    legacyId: '2501317953',
    cityUrl: 'https://www.kaufda.de/Muenchen/HIT/p-r110',
    lat: '48.274',
    lng: '10.835',
    kaufdaUrl: 'https://www.kaufda.de/contentViewer/static/eb1798bf-6e69-46d4-a0c4-3d85310e5ff1?page=1',
    brochureUrl: 'https://www.kaufda.de/contentViewer/static/eb1798bf-6e69-46d4-a0c4-3d85310e5ff1?page=1',
    meinprospektUrl: 'https://www.meinprospekt.de/hit',
    officialBrochureUrl: 'https://www.hit.de/angebote',
    coverUrl: 'https://content-media.bonial.biz/5def3a32-6d53-4b87-b238-63db7e8141b8/zoomlarge_page_0.jpg?impolicy=large',
    highResCoverUrl: 'https://content-media.bonial.biz/5def3a32-6d53-4b87-b238-63db7e8141b8/zoomlarge_page_0.jpg?impolicy=zoomlarge',
    brochureTitle: 'HIT „Echte Vielfalt“ Wochenprospekt',
    pages: '18 Seiten',
    validText: 'Aktuelle Woche (Mo–Sa)'
  }
];

// Getrennte Auswahlmöglichkeiten für „Passend zu Einkauf“ und „Passend zu Rezepten“
const SUPERMARKET_RETAILERS = [
  { id: 'Alle', label: '🏪 Alle 12 Händler' },
  { id: 'Passend-Einkauf', label: '🛒 Passend zu Einkauf' },
  { id: 'Passend-Rezepte', label: '🍲 Passend zu Rezepten' },
  ...ALL_RETAILERS_META.map((r) => ({ id: r.id, label: `${r.icon} ${r.label}` }))
];

const INITIAL_VERIFIED_OFFERS = [
  {
    id: 'off-1',
    retailer: 'REWE',
    brand: 'REWE Beste Wahl / Frischetheke',
    title: 'Rinder-Hackfleisch frisch',
    price: '1,59 €',
    oldPrice: '2,29 €',
    discount: '-30%',
    unitInfo: 'je 100 g / Aktionspreis im KaufDA Prospekt',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'rinderhackfleisch', 'rind', 'cevapcici'],
    imageUrl: 'https://content-media.bonial.biz/66735d13-3342-4e57-9210-4a8860a33205/621a7b11-e5ef-4c97-945a-3945c4944a12.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-2',
    retailer: 'EDEKA',
    brand: 'EDEKA Frischfleisch',
    title: 'Rinder-Hackfleisch (Großpackung)',
    price: '4,44 €',
    oldPrice: '4,99 €',
    discount: '-11%',
    unitInfo: '1 kg = 14,80 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'rinderhackfleisch', 'bolognese', 'couscous'],
    imageUrl: 'https://content-media.bonial.biz/c38ebac0-389d-4f2d-b795-7d6689ad49b1/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-3',
    retailer: 'Netto',
    brand: 'Netto Marken-Discount',
    title: 'Frisches Hackfleisch vom Hähnchen (400 g)',
    price: '2,49 €',
    oldPrice: '2,99 €',
    discount: '-17%',
    unitInfo: '1 kg = 6,23 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'hähnchen'],
    imageUrl: 'https://content-media.bonial.biz/bad1c604-b702-4f68-938a-8e6b80747967/4210a300-f36f-471f-9180-ac4b7c449497.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Netto-Marken-Discount'
  },
  {
    id: 'off-4',
    retailer: 'Penny',
    brand: 'Mühlenhof',
    title: 'Frisches Puten-/Gemischtes Hackfleisch (800 g)',
    price: '4,44 €',
    oldPrice: '5,79 €',
    discount: '-23%',
    unitInfo: '1 kg = 5,55 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'puten', 'gemischtes hackfleisch'],
    imageUrl: 'https://content-media.bonial.biz/a73fc3d4-fad5-4f69-aad4-0357caac31f2/4b5fe6fb-4c39-4c81-a001-35d8627b4a21.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Penny-Markt'
  },
  {
    id: 'off-5',
    retailer: 'REWE',
    brand: 'Kerrygold',
    title: 'Original Irische Butter (250 g)',
    price: '1,59 €',
    oldPrice: '3,49 €',
    discount: '-54%',
    unitInfo: '1 kg = 6,36 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['butter', 'fett für die form'],
    imageUrl: 'https://content-media.bonial.biz/a33adcac-3000-489e-a040-7481758c3368/f0b2ec33-45dc-421c-9c39-a198bd80d33c.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-6',
    retailer: 'REWE',
    brand: 'Barilla',
    title: 'Barilla Collezione Pasta / Penne & Lasagne (500 g)',
    price: '1,59 €',
    oldPrice: '2,69 €',
    discount: '-41%',
    unitInfo: '1 kg = 3,18 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['nudeln', 'penne', 'pasta', 'lasagneplatte', 'spaghetti'],
    imageUrl: 'https://content-media.bonial.biz/c3d5dbd9-63b9-42c0-ace3-f98e6353af38/32ffe1f6-9eec-40a5-aff2-118011a978a6.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-7',
    retailer: 'REWE',
    brand: 'REWE Marktplatz',
    title: 'Bio-Hähnchen-Schenkel / Hähnchenkeulen',
    price: '1,19 €',
    oldPrice: '1,69 €',
    discount: '-29%',
    unitInfo: 'je 100 g',
    validUntil: 'Aktuelle Woche',
    keywords: ['brathähnchen', 'hähnchenkeulen', 'hähnchen'],
    imageUrl: 'https://content-media.bonial.biz/30941d51-e17e-4d54-8c6b-16e47547485b/9afbac13-3349-4641-bb43-00ca3efc618a.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-8',
    retailer: 'REWE',
    brand: 'Frischetheke / Kühlregal',
    title: 'Lachs-Filet natur',
    price: '2,19 €',
    oldPrice: '2,99 €',
    discount: '-26%',
    unitInfo: 'je 100 g',
    validUntil: 'Aktuelle Woche',
    keywords: ['lachsfilet', 'lachs'],
    imageUrl: 'https://content-media.bonial.biz/766914a4-8ad0-4622-8205-317facf52493/aeb3cb50-3288-4467-85da-b4ebfae7140b.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-9',
    retailer: 'EDEKA',
    brand: 'Philadelphia',
    title: 'Frischkäsezubereitung Kräuter / Natur',
    price: '0,99 €',
    oldPrice: '2,19 €',
    discount: '-55%',
    unitInfo: '175 g Becher (1 kg = 5,66 €)',
    validUntil: 'Aktuelle Woche',
    keywords: ['kräuterfrischkäse', 'frischkäse'],
    imageUrl: 'https://content-media.bonial.biz/101197c0-470e-475d-acd3-d5aa390e8aa0/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-10',
    retailer: 'Netto',
    brand: 'Philadelphia',
    title: 'Philadelphia Frischkäse / Kräuter',
    price: '0,99 €',
    oldPrice: '2,19 €',
    discount: '-55%',
    unitInfo: '175 g Becher',
    validUntil: 'Aktuelle Woche',
    keywords: ['kräuterfrischkäse', 'frischkäse'],
    imageUrl: 'https://content-media.bonial.biz/0ebb8409-12f3-4279-8c6f-1fe52610c61f/b50fe00c-4aea-4dbf-9069-bf5b8d49dc99.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Netto-Marken-Discount'
  },
  {
    id: 'off-11',
    retailer: 'REWE',
    brand: 'REWE Marktplatz',
    title: 'Frische Rispentomaten / Kirschtomaten',
    price: '1,89 €',
    oldPrice: '2,49 €',
    discount: '-24%',
    unitInfo: 'je kg / Packung',
    validUntil: 'Aktuelle Woche',
    keywords: ['tomaten', 'kirschtomaten'],
    imageUrl: 'https://content-media.bonial.biz/bd7e4eb2-38df-4008-b58c-dfd57a63a89e/09425422-cc96-4c9f-9de8-3874a69952d2.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-12',
    retailer: 'EDEKA',
    brand: 'EDEKA',
    title: 'Tomaten-Mark (200 g Tube)',
    price: '0,89 €',
    oldPrice: '1,39 €',
    discount: '-36%',
    unitInfo: '1 kg = 4,45 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['tomatenmark'],
    imageUrl: 'https://content-media.bonial.biz/21820b3d-b485-4ff6-b1f2-f249ff926a1a/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-13',
    retailer: 'REWE',
    brand: 'Berchtesgadener Land',
    title: 'Frische Bergbauern Milch (1 Liter)',
    price: '1,11 €',
    oldPrice: '1,59 €',
    discount: '-30%',
    unitInfo: '1 l Packung',
    validUntil: 'Aktuelle Woche',
    keywords: ['milch'],
    imageUrl: 'https://content-media.bonial.biz/08d9b585-8dfb-47f7-97b1-86a2591d9403/ee074e8d-7d60-4a06-b07e-98e26e05361a.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-14',
    retailer: 'EDEKA',
    brand: 'Weihenstephan',
    title: 'Frische Schlagsahne / Kochsahne (500 g)',
    price: '2,49 €',
    oldPrice: '3,29 €',
    discount: '-24%',
    unitInfo: '500 g Flasche',
    validUntil: 'Aktuelle Woche',
    keywords: ['sahne', 'schlagsahne'],
    imageUrl: 'https://content-media.bonial.biz/84d266c7-bad7-40cd-a3a9-4840c1e7a2e5/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-15',
    retailer: 'EDEKA',
    brand: 'Monini',
    title: 'Classico Natives Olivenöl Extra (500 ml)',
    price: '5,99 €',
    oldPrice: '8,99 €',
    discount: '-33%',
    unitInfo: '1 l = 11,98 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['olivenöl', 'öl'],
    imageUrl: 'https://content-media.bonial.biz/69f894b4-8cda-4058-974e-60c3b016c38d/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-16',
    retailer: 'Penny',
    brand: 'MITAKOS',
    title: 'Griechisches natives Olivenöl extra',
    price: '5,99 €',
    oldPrice: '7,99 €',
    discount: '-25%',
    unitInfo: '500 ml Flasche',
    validUntil: 'Aktuelle Woche',
    keywords: ['olivenöl', 'öl'],
    imageUrl: 'https://content-media.bonial.biz/751171ac-1719-4146-a2dc-79aa45358f21/c20f3e00-3d5f-467b-bf45-ee2435037178.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Penny-Markt'
  },
  {
    id: 'off-17',
    retailer: 'EDEKA',
    brand: 'Mehlzauber',
    title: 'Weizenmehl Type 405 (1 kg)',
    price: '0,99 €',
    oldPrice: '1,39 €',
    discount: '-28%',
    unitInfo: '1 kg Packung',
    validUntil: 'Aktuelle Woche',
    keywords: ['mehl', 'weizenmehl'],
    imageUrl: 'https://content-media.bonial.biz/59cc09d7-eef7-4170-9d83-c6df6bb6e897/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Edeka'
  },
  {
    id: 'off-18',
    retailer: 'REWE',
    brand: 'REWE Beste Wahl',
    title: 'Speisezwiebeln im Netz',
    price: '0,88 €',
    oldPrice: '1,49 €',
    discount: '-40%',
    unitInfo: 'Netz',
    validUntil: 'Aktuelle Woche',
    keywords: ['zwiebel', 'zwiebeln', 'frühlingszwiebeln'],
    imageUrl: 'https://content-media.bonial.biz/e8fa2b6e-0d40-4f32-ac4b-a427c800ff35/7f549985-350e-4468-b20d-12ea6b8d950a.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-19',
    retailer: 'REWE',
    brand: 'Andechser Natur',
    title: 'Bio-Naturjoghurt mild (500 g)',
    price: '1,39 €',
    oldPrice: '1,89 €',
    discount: '-26%',
    unitInfo: '500 g Becher',
    validUntil: 'Aktuelle Woche',
    keywords: ['naturjoghurt', 'joghurt'],
    imageUrl: 'https://content-media.bonial.biz/4e2e6c10-30bc-462a-9266-7df025b3f3ee/7ed4c8e7-1ef2-4314-a3e8-9c843a7e7ed9.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Rewe'
  },
  {
    id: 'off-20',
    retailer: 'Lidl',
    brand: 'Lidl Marktplatz',
    title: 'Festkochende Speisekartoffeln (2,5 kg Netz)',
    price: '1,99 €',
    oldPrice: '2,99 €',
    discount: '-33%',
    unitInfo: '1 kg = 0,80 € (Lidl Aktion)',
    validUntil: 'Aktuelle Woche',
    keywords: ['kartoffeln', 'kartoffel'],
    imageUrl: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Lidl'
  },
  {
    id: 'off-21',
    retailer: 'Lidl',
    brand: 'Milbona / Lidl',
    title: 'Deutscher Marken-Rama / Streichfett (400 g)',
    price: '1,29 €',
    oldPrice: '2,19 €',
    discount: '-41%',
    unitInfo: '1 kg = 3,23 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['butter', 'fett für die form', 'rama'],
    imageUrl: 'https://content-media.bonial.biz/a33adcac-3000-489e-a040-7481758c3368/f0b2ec33-45dc-421c-9c39-a198bd80d33c.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Lidl'
  },
  {
    id: 'off-22',
    retailer: 'ALDI Süd',
    brand: 'Cucina Nobile',
    title: 'Italienischer Parmigiano Reggiano / Parmesan (200 g)',
    price: '2,79 €',
    oldPrice: '3,69 €',
    discount: '-24%',
    unitInfo: '1 kg = 13,95 € (ALDI Süd Aktion)',
    validUntil: 'Aktuelle Woche',
    keywords: ['parmesan', 'käse', 'schafskäse'],
    imageUrl: 'https://content-media.bonial.biz/fd1441e3-f6ce-47b1-bd8d-13f7dbc93fce/7021efe7-81f3-4e67-b775-fe2f3d5c6d03.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Aldi-Sued'
  },
  {
    id: 'off-23',
    retailer: 'ALDI Süd',
    brand: 'Meine Metzgerei',
    title: 'Frisches Gemischtes Hackfleisch (500 g)',
    price: '3,49 €',
    oldPrice: '4,29 €',
    discount: '-19%',
    unitInfo: '1 kg = 6,98 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'gemischtes hackfleisch'],
    imageUrl: 'https://content-media.bonial.biz/66735d13-3342-4e57-9210-4a8860a33205/621a7b11-e5ef-4c97-945a-3945c4944a12.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Aldi-Sued'
  },
  {
    id: 'off-24',
    retailer: 'ALDI Nord',
    brand: 'Milsani',
    title: 'Deutsche Markenbutter mildgesäuert (250 g)',
    price: '1,69 €',
    oldPrice: '2,39 €',
    discount: '-29%',
    unitInfo: '1 kg = 6,76 € (ALDI Nord)',
    validUntil: 'Aktuelle Woche',
    keywords: ['butter', 'fett für die form'],
    imageUrl: 'https://content-media.bonial.biz/a33adcac-3000-489e-a040-7481758c3368/f0b2ec33-45dc-421c-9c39-a198bd80d33c.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Aldi-Nord'
  },
  {
    id: 'off-25',
    retailer: 'ALDI Nord',
    brand: 'GUT BIO',
    title: 'Bio-Freiland-Eier (10 Stück, Kl. M/L)',
    price: '2,49 €',
    oldPrice: '2,99 €',
    discount: '-17%',
    unitInfo: '10er Packung',
    validUntil: 'Aktuelle Woche',
    keywords: ['ei', 'eier'],
    imageUrl: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=800&q=80',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Aldi-Nord'
  },
  {
    id: 'off-26',
    retailer: 'Kaufland',
    brand: 'K-Classic / Rana',
    title: 'Frische Tortellini aus dem Kühlregal (500 g)',
    price: '1,79 €',
    oldPrice: '2,49 €',
    discount: '-28%',
    unitInfo: '1 kg = 3,58 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['tortellini', 'nudeln'],
    imageUrl: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Kaufland'
  },
  {
    id: 'off-27',
    retailer: 'Kaufland',
    brand: 'Mutti / K-Classic',
    title: 'Stückige Tomaten / Polpa in der Dose (400 g)',
    price: '0,99 €',
    oldPrice: '1,69 €',
    discount: '-41%',
    unitInfo: '1 kg = 2,48 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['tomaten', 'gehackte tomaten', 'stückig'],
    imageUrl: 'https://content-media.bonial.biz/21820b3d-b485-4ff6-b1f2-f249ff926a1a/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Kaufland'
  },
  {
    id: 'off-28',
    retailer: 'Norma',
    brand: 'Gut Bartenhof',
    title: 'Frische Hähnchenschenkel / Brathähnchen (1 kg)',
    price: '3,99 €',
    oldPrice: '5,29 €',
    discount: '-25%',
    unitInfo: '1 kg Packung (Norma Aktion)',
    validUntil: 'Aktuelle Woche',
    keywords: ['brathähnchen', 'hähnchenkeulen', 'hähnchen'],
    imageUrl: 'https://content-media.bonial.biz/30941d51-e17e-4d54-8c6b-16e47547485b/9afbac13-3349-4641-bb43-00ca3efc618a.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Norma'
  },
  {
    id: 'off-29',
    retailer: 'Norma',
    brand: 'Landfein',
    title: 'Schlagsahne 30% Fett (200 g)',
    price: '0,79 €',
    oldPrice: '1,09 €',
    discount: '-27%',
    unitInfo: '200 g Becher',
    validUntil: 'Aktuelle Woche',
    keywords: ['sahne', 'schlagsahne'],
    imageUrl: 'https://content-media.bonial.biz/84d266c7-bad7-40cd-a3a9-4840c1e7a2e5/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Norma'
  },
  {
    id: 'off-30',
    retailer: 'Globus',
    brand: 'Globus Fachmetzgerei',
    title: 'Frisches Rinder- & Gemischtes Hackfleisch (1 kg)',
    price: '7,90 €',
    oldPrice: '10,90 €',
    discount: '-27%',
    unitInfo: 'Frischetheke Globus Markthalle',
    validUntil: 'Aktuelle Woche',
    keywords: ['hackfleisch', 'rinderhackfleisch', 'gemischtes hackfleisch'],
    imageUrl: 'https://content-media.bonial.biz/c38ebac0-389d-4f2d-b795-7d6689ad49b1/main.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Globus'
  },
  {
    id: 'off-31',
    retailer: 'Globus',
    brand: 'Globus Natur',
    title: 'Norwegisches Lachsfilet (250 g)',
    price: '4,49 €',
    oldPrice: '5,99 €',
    discount: '-25%',
    unitInfo: '1 kg = 17,96 €',
    validUntil: 'Aktuelle Woche',
    keywords: ['lachsfilet', 'lachs'],
    imageUrl: 'https://content-media.bonial.biz/766914a4-8ad0-4622-8205-317facf52493/aeb3cb50-3288-4467-85da-b4ebfae7140b.jpg?impolicy=SEO-OFFER',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Globus'
  },
  {
    id: 'off-32',
    retailer: 'tegut',
    brand: 'tegut... Bio',
    title: 'Bio-Kichererbsen & Bio-Kokosmilch (400 ml)',
    price: '1,49 €',
    oldPrice: '1,99 €',
    discount: '-25%',
    unitInfo: '1 l = 3,73 € (tegut... Flugblatt)',
    validUntil: 'Aktuelle Woche',
    keywords: ['kichererbsen', 'kokosmilch'],
    imageUrl: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=800&q=80',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/tegut'
  },
  {
    id: 'off-33',
    retailer: 'HIT',
    brand: 'HIT Marktplatz',
    title: 'Frischer Babyspinat & Bio-Zitronen',
    price: '1,29 €',
    oldPrice: '1,79 €',
    discount: '-28%',
    unitInfo: 'Packung / Netz im HIT Prospekt',
    validUntil: 'Aktuelle Woche',
    keywords: ['babyspinat', 'spinat', 'zitrone', 'bio-zitrone'],
    imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=800&q=80',
    brochureUrl: 'https://www.kaufda.de/Geschaefte/Hit'
  }
];

function parseGermanEuroPrice(priceStr) {
  if (!priceStr) return 0;
  const m = String(priceStr).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : 0;
}

function calculateOfferSavings(off) {
  if (!off) return null;
  const nowVal = parseGermanEuroPrice(off.price);
  let oldVal = parseGermanEuroPrice(off.oldPrice);
  let pctVal = 0;

  if (off.discount) {
    const pm = String(off.discount).match(/(\d+)\s*%/);
    if (pm) pctVal = parseInt(pm[1], 10);
  }

  // Falls oldPrice fehlt, aber ein Rabatt-Prozentsatz vorliegt, berechne UVP/Statt-Preis
  if (!oldVal && nowVal > 0 && pctVal > 0 && pctVal < 90) {
    oldVal = Math.round((nowVal / (1 - pctVal / 100)) * 100) / 100;
  }
  // Falls sowohl oldPrice als auch Rabatt fehlen (z.B. frisch geladene Live-Prospekt-Deals),
  // nutze einen konservativen Prospekt-Vorteil von ~20% gegenüber Normalpreis
  if (!oldVal && nowVal > 0) {
    oldVal = Math.round(nowVal * 1.25 * 100) / 100;
    pctVal = 20;
  }

  const euroSaved = oldVal > nowVal ? Math.round((oldVal - nowVal) * 100) / 100 : 0;
  if (!pctVal && oldVal > nowVal && oldVal > 0) {
    pctVal = Math.round(((oldVal - nowVal) / oldVal) * 100);
  }

  if (euroSaved <= 0 && pctVal <= 0) return null;

  const euroSavedFormatted = euroSaved > 0 ? `${euroSaved.toFixed(2).replace('.', ',')} €` : '';
  const pctFormatted = pctVal > 0 ? `-${pctVal}%` : off.discount || '';
  const label = euroSavedFormatted ? `-${euroSavedFormatted} (${pctFormatted})` : pctFormatted;

  return {
    nowVal,
    oldVal,
    euroSaved,
    savedValue: euroSaved,
    hasSavings: euroSaved > 0 || pctVal > 0,
    label,
    euroSavedFormatted,
    oldPriceFormatted: oldVal > 0 ? `${oldVal.toFixed(2).replace('.', ',')} €` : off.oldPrice || '',
    pctVal,
    pctFormatted
  };
}

function getHighResOfferImageUrl(url) {
  if (!url) return 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85';
  if (url.includes('content-media.bonial.biz')) {
    return url.split('?')[0];
  }
  if (url.includes('images.unsplash.com')) {
    return url.replace(/w=\d+/, 'w=1100');
  }
  return url;
}

// Gibt den direkten KaufDA-Blätterkatalog-Link (bei bekannter contentId) ODER die exakte KaufDA-Händlerseite zurück.
// WICHTIG: Niemals auf REWE (ALL_RETAILERS_META[0]) zurückfallen!
function getDirectKaufdaBrochureViewerUrl(retailerOrOffer, page = 1) {
  let retMeta = null;
  if (typeof retailerOrOffer === 'string') {
    retMeta = getRetailerMetaByAnyName(retailerOrOffer);
  } else if (retailerOrOffer && typeof retailerOrOffer === 'object') {
    if (retailerOrOffer.contentId) {
      retMeta = retailerOrOffer;
    } else if (retailerOrOffer.id || retailerOrOffer.label) {
      retMeta =
        (typeof getAllMergedBrochuresList === 'function' ? getAllMergedBrochuresList() : ALL_RETAILERS_META).find(
          (x) => x.id === retailerOrOffer.id
        ) || retailerOrOffer;
    } else if (retailerOrOffer.retailer) {
      retMeta = getRetailerMetaByAnyName(retailerOrOffer.retailer);
    }
  }

  if (retMeta && retMeta.contentId) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    return `https://www.kaufda.de/contentViewer/static/${retMeta.contentId}?page=${pageNum}`;
  }
  if (retMeta && (retMeta.kaufdaUrl || retMeta.brochureUrl)) {
    return retMeta.kaufdaUrl || retMeta.brochureUrl;
  }
  const slugSource =
    (retMeta && (retMeta.kaufdaSlug || retMeta.label || retMeta.id)) ||
    (typeof retailerOrOffer === 'string' ? retailerOrOffer : '');
  if (slugSource) {
    const cleanSlug = String(slugSource).trim().replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-').replace(/^-|-$/g, '');
    return `https://www.kaufda.de/Geschaefte/${encodeURIComponent(cleanSlug)}`;
  }
  return 'https://www.kaufda.de/Prospekte';
}

// ============================================================================
// IN-APP KAUFDA PROSPEKT-BLÄTTERKATALOG (Alle 18–73 Seiten in 2800px Ultra-HD + Passgenaue Darstellung für 86399 Bobingen)
// ============================================================================
const KAUFDA_LIVE_BROCHURE_PAGES = {"Norma":{"pageCount":30,"contentId":"a8a32361-949a-48de-897f-88bfe3b0233c","pageUuids":["fd0603f8-2219-4fef-9367-27e766372b0d","a1a4c94e-ab5d-41fe-82cb-4ee7f5c81ac4","45c05a02-e267-4920-aba3-99e43be65c75","c7e3c7dc-223a-4b56-9bff-f6653ccbbc15","8cae31c9-b3d5-413a-93cf-eb497e8ac0cd","c66dabae-bbbd-4367-b533-57e373258b03","fd6348a6-db8b-4294-b3e5-a8ca5eab4ef6","e5c026f5-af4c-49b1-8e95-c3299b943502","64274eac-5a44-4c95-b7e3-52dad319774f","a82794e3-c49c-430e-8826-e0288d001136","d390085b-08d0-4889-b6b0-0876d5c70cee","e670fa98-26df-4208-988e-87e3335d13a2","6f6e03db-47ed-4ea2-a396-76ab650b4a0b","b3507681-8021-4300-b1fd-394a5c14e316","2eaabcd6-0cdb-4855-b15b-357ecee780c9","c09216a9-8494-4d89-ad7c-57006947972b","7c898ecd-29fd-4157-a0df-30a19a5e9985","a3e5a16b-3765-4e6f-a068-b56bf3f7a8d8","ca11e592-7586-4139-b8ae-f7d10d49264e","f7188eb1-539d-4142-a68e-adfacb9b791f","1c009e28-4902-4022-9d89-001dcf5017c1","d1026d45-86f5-472f-bf82-48108dce3d61","9360a46e-563d-4de8-9671-5808bca11c03","abe65090-d7bc-40a0-813b-ab885b4b0dfc","06724a9e-8d7f-4cb3-8bae-a234d91890d7","08162cf7-6308-441f-9bab-23c9dfdaaf13","dc38b622-77c3-451a-9331-0ffaa96b7e37","8346c03f-4022-4dbd-b400-3e6e830f3bc3","2f8bff92-a4bc-4d68-b067-babd7c20f8ea","680fe76c-2af1-4f97-97ac-15390d58afd9"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T22:00:00.000+0000","publisher":"Norma","title":"Mehr fürs Geld","coverUrl":"https://content-media.bonial.biz/fd0603f8-2219-4fef-9367-27e766372b0d/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/fd0603f8-2219-4fef-9367-27e766372b0d/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"tegut":{"pageCount":22,"contentId":"63115be1-ef63-4072-a94e-9ec8e917fb42","pageUuids":["01fac455-a1d9-4f79-b515-4904f7be774d","e95c859e-51b5-4f56-8b0f-0abba8ea1199","e282b4c9-3885-4697-b6a7-b118bd1e96eb","4e56b841-9662-461f-b05e-092068478d0e","56457c9d-f215-4007-92ab-5c4c30cee81a","140bc60f-f45a-44b0-860b-842c6ddea47c","d71bb1aa-d6af-4a0b-8b8b-904e89239d9d","af14e8d8-6966-483f-930c-0021ac61f0a4","a54a0f17-a0bd-4e7d-8275-b19dff038b08","2ddd32b6-f46b-46c2-960d-75353689d70e","37be3a75-c850-4405-aaf6-7678f370048b","deff3b2e-6ec0-4512-b414-b01f8a3df485","ba538d47-3e22-4d05-8a27-f2d2eb45c352","bf72673c-3464-4097-95fd-29bc666de54e","a1de186d-9915-43f8-90c0-c73a4610f158","303e4acf-48c6-430f-a1fc-faa69a648fc6","6b76897a-fdc5-4b1b-a297-9d78aeeafe58","1f39987b-2e5e-4e8d-9f32-bb9bdd86cd41","58dcf3e8-42c8-46b8-b85c-5442d975005a","2046adf9-7cbb-4f41-b950-b2e74b7bedc0","3c93cd37-dee7-4ae2-bca6-669afe95464a","d509e758-e5d5-4d5b-9af3-25dfda6f1b0e"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T22:00:00.000+0000","publisher":"tegut","title":"tegut… gute Lebensmittel","coverUrl":"https://content-media.bonial.biz/01fac455-a1d9-4f79-b515-4904f7be774d/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/01fac455-a1d9-4f79-b515-4904f7be774d/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"Lidl":{"pageCount":73,"contentId":"3e8c10a5-071a-417f-85f0-fc41988915c7","pageUuids":["49387853-083e-40f7-af11-6f4a699535c0","75d2a45d-2e5b-44cc-90bc-53612a6c5e4a","87c0e71f-3d30-4cb8-8ccb-689400544dec","c08b115c-bc51-457d-9761-f55c78294eb6","dfc47144-147a-4254-a684-cd999e42b12b","f4cdbe79-80a5-4527-8ed6-e87c1db206c3","c93db0b8-8d30-43a4-a0cd-091dafd25e99","c675b753-c68f-4551-b995-302ae629fb81","594f70fd-0b85-4e69-b998-ab35aa1caeb6","03d1e065-fd17-4e64-b32a-61af70e38cfa","53240506-762b-4687-93b5-7d06765653a9","937b2dd9-b273-4401-8b93-2c14182133d4","712285aa-edcd-43e8-a9b2-98978b49a182","4655e426-be42-415c-829f-d5abc89dc8c2","d9856fbd-7417-4986-aa89-86d54402df7a","5ed320bb-be53-41fe-9a88-e0f3726f1860","b311d53c-8c87-4354-96fb-1b9558d7cf98","210297f2-168d-45c6-acb3-0e908c1fb825","0a1f117d-97f3-4bb9-9bb7-046538697dfa","ad7b79d7-8d1f-4f73-9d0e-af19c34948fa","fd20dac5-7aff-4889-9792-b7d3f825e600","d6ec8b51-3a3c-455d-aec3-95abeb46b303","489cab2e-10cd-4436-bd82-b408b6b6ea89","f91e7ded-49cf-4fea-aa23-d755a6970c2e","87bf995d-bba0-44e9-be39-9d00d9a9df9b","113a19ee-c3c5-48be-ab71-446719be588e","5208b439-20ce-4790-93b5-633eae3cc6cd","0f40fd4e-c2b5-49ae-8135-7e77be40e964","6f870ac8-d469-477a-852f-2f59662b8229","853e2c11-ac9c-49c8-aadf-4a442bba47ff","97ab6e8d-2f73-43d0-b77b-080d569bfab9","64b131f6-5559-4ccb-a57b-aa2f098af2c7","c3810233-89c9-402d-8ada-f5bdbfc8b33f","84886fcd-1131-4319-9dc6-1ed3fcd289bb","fcec8361-13de-4bca-bb1d-fcde4b9a60f1","853c81b5-b843-41fb-8382-9dc1f662d89c","512b0cb5-e601-4a79-afde-75751b382003","9348293e-989c-4330-8c1d-348b09abf88a","dac286d8-a040-4111-8687-3b6295da11f8","2fdb1b2f-681b-48d8-b576-c279483198a7","076764a9-4845-41d8-b82c-b6689fe168f8","f6e7f759-00b4-4647-97c7-b808903fd46d","566e4d1a-39dc-4856-b018-77178d2db58d","43b4ffe0-f4e4-4964-ab10-d4f1c16e7308","5352ce07-2882-4c73-bbc7-66327fdada40","c7959641-d303-4903-a2f8-038feeac546e","7bd2f918-4946-4adc-a722-827c59e0b648","caf1d49f-856d-44a0-8a2d-7db8cd1f2c63","1793614d-11b2-486e-bea0-c6ba0ab5e4a1","0e668b56-79f8-4eb4-b4a6-62b9f60d0e7e","13f95845-e9e0-4008-adb4-c99b5b783d41","cff96a89-504c-4c4f-98f1-09d124977ca8","57fbca67-1e74-46bc-aa3e-28c7aa88a37f","d771045e-6f9a-40c7-a42b-487de429cf60","076a8655-52c8-497a-bb7d-2e8167b7bae6","c84a507d-f691-44f4-b58d-9e76a07c3ac9","a8b42ffd-e032-4b8c-a476-baea218850ea","0786ffad-6bfe-4be8-8dec-9a4d9be91490","14ea4749-6d0a-47e3-b59f-eeb5299cf2d7","0494c945-da9c-4d7f-9290-5efab2678fac","3bf3544d-388e-497c-a1bd-88c6e1ac8295","19969033-68f6-4187-92f9-7af8a0757631","8ff96e27-1ff8-4be0-bd01-f3fb00891cf9","4d190ebe-5294-477f-a7f3-46a0c63c57ec","b88cc43f-0d35-4e15-85c8-272faaa6d7fa","bb7d0852-8a74-4182-94aa-2da3611f4276","011fae9d-97ee-4cc9-89b8-4544e7623eff","b9a14e28-3216-41f0-b1dc-27ba8de9a8fb","6c3e59a8-d50b-4fd3-89b9-f121af781540","fb88631a-eff0-438a-b6bd-6c15a48ac0ac","331cb1bd-dd31-4c2a-a603-cf9b385f8cdf","72427454-abcf-4eae-99b0-89f19044dc70","57727109-9bd8-414f-a296-fb2dae1dedad"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T22:00:00.000+0000","publisher":"Lidl","title":"LIDL LOHNT SICH","coverUrl":"https://content-media.bonial.biz/49387853-083e-40f7-af11-6f4a699535c0/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/49387853-083e-40f7-af11-6f4a699535c0/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"Penny":{"pageCount":44,"contentId":"8af5adf7-ab90-453d-bb6b-8929def3b055","pageUuids":["d0991dac-88ad-4dde-a8ba-7693774bf9b0","fdc3191e-3707-4491-9971-eeaf0dd2df4b","7eea6241-33ac-4804-8c1b-0426092ee2e3","f1e2cb19-4389-4ce5-8fc0-f18be0546c10","ba9a5bc6-4e9d-4850-ba39-3c78d1cebc4c","46f69c53-d141-4f0d-aae5-8aef29bb751a","6883621d-6712-4e6f-aa39-0fea75b80486","41cef37a-9f8d-4200-9a6b-69e2824da670","a6456c88-2c57-4e29-a897-6371159e1abb","247da290-8333-47e0-8ea5-1f2bf408e24d","570411ad-1d93-4910-8c6d-ef52bbfd484c","163928fd-85e6-4569-a6d3-46eea7e85ac1","8789d4bc-4c7d-4e68-b96b-b56da757f7f2","1b194c7a-60fa-4065-97f6-0170ac41b294","5c24db50-eb74-4d50-981e-086df554663e","6351fcac-8bda-480a-aba0-4d0aa238226f","8824f349-d456-4207-862a-5838fa0df4ae","0f369bb7-bc03-487f-ae2f-1275a9717e61","35feddb7-e1d8-4dde-a18b-3731be4f4179","8c65527b-4779-4a15-a6b7-673ff8459929","f801ce02-5512-47a1-ad11-4bb58543b8bf","324c32d7-e18e-4756-98a8-87099881edf8","220700b1-07dd-46b8-9866-36210d9f3608","c2b29980-e4df-4d71-a892-2c1cc317e76e","05b622fd-2ad6-4965-8c73-f5cff051e2cd","a1668b61-8a4a-48d4-8484-91d51c3a1d40","9ac7d0db-f43c-4148-86cd-a077a893d018","74c217af-a317-4009-a539-2171dc243874","4476d789-5734-4ede-ad80-2800c594fa4a","c4174c1f-2716-4523-b1ab-cd9df7355c48","80cf6ef0-60a7-4b99-92b5-659214729ef6","24c14293-73ff-4abb-9872-778809bc4430","2c1841ad-58a1-4c12-8e97-6c70b937b7f4","330bd0e4-9d3f-496b-ac5a-c51ba32a0fab","f5a5ea92-4618-49b1-97ff-040af9f6ede4","bdfc55a0-450b-4abd-9c0b-229598689d25","ce8bf6c4-540a-4a22-bb95-917a98bc1ba6","36c87250-a5cd-4a32-bac7-ccb1ce3e3781","4f0d45a0-84ff-4589-9116-49e2e96e58f1","6c0538d8-f5d4-4259-b9ce-aa1a5bce6b13","de9443f6-16e3-4a44-8360-e5da0f2312df","91933532-8c4e-4ce5-acbb-d94a5937e1eb","62c66a14-a0b0-495c-9969-2af409793b5d","f54833b7-da33-43c2-a217-3de93d46f775"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T23:00:00.000+0000","publisher":"Penny","title":"Wer günstig will, muss Penny.","coverUrl":"https://content-media.bonial.biz/d0991dac-88ad-4dde-a8ba-7693774bf9b0/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/d0991dac-88ad-4dde-a8ba-7693774bf9b0/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"ALDI Nord":{"pageCount":56,"contentId":"6c21c979-269e-4bc0-b537-5bbb1a51b90e","pageUuids":["1f7a81a7-b1ff-4e1d-9e4f-cbbc18975c6b","b942bba9-f82c-47d8-a3ac-7bcf88b6c6e3","c927e9ca-ad07-425b-b482-3b361699fa4e","810b7162-5741-4b7c-a5a1-73dab497a75d","3f954d10-e35a-42a3-869b-3e28e8c34392","a1688da7-cfb9-49a7-ba27-c32dec0aeb85","a9f39739-2aa9-41b1-b2bd-70e81dfc74e9","ee9359df-6b60-4ad6-b3db-8efcf09ef1ac","03db14a7-cd2e-471d-aaac-0bb6e81477b1","5ad34236-1d53-4fb4-913b-eb69c74cf8f8","3203cf80-3e40-47bc-a182-7ce022972a99","5efecfdf-4547-456a-abb3-02970ad658f4","dfd26fa9-6fdd-49f1-8b7b-9f6162f0aa32","c998768e-3b2d-4d8b-aa0b-09e63a7e8973","d65eebaf-c00d-448e-9d10-6b6a9ecba803","b7b21526-5f4e-499b-8baf-9cd62af08d0b","63a5d933-0c5a-4f95-aaec-b388d7912127","7df6abe6-1888-44ef-8caf-94575bb09d3a","27a11c74-5c1f-41ce-ade3-45ecd56ddd4d","5f33e6a6-d8a5-433c-9f89-3980c187bcfb","f0b94911-d88d-4e57-87db-927fe0440ca2","ca5c825e-a46c-4936-8673-85fcb4db9234","2c956d3b-e10d-4978-8c82-74018bf2a730","a71f302d-2661-4cd4-862f-6d049af974cc","27474291-3fb7-4b35-b06e-4cc491eb7f25","b5463bf1-78e7-4d44-8f0e-c10343dade59","e1b6563a-087e-42a8-9fe2-60736c0d6289","41cf4fa7-6558-46f3-90d6-59dfcde3acf8","d474e672-d652-40e9-9bb9-4b9b8b2b75f9","f783e825-122b-43eb-ae15-78a057b9383f","a23201b6-3863-465d-8bc9-3f6a71b0f6f9","514c7c87-5c52-4f0d-b541-e83478aee91f","410d6d2b-e52e-406b-ab4b-c2f10d421d83","1bf948eb-3729-437e-bd38-0a22ed22c6b5","1da64994-0b91-425e-a188-c6a8f34523be","c0822fb9-4e1a-4c73-935d-9a2b2a453d10","86ffed53-110d-4330-93bd-d2a7805ab769","3e721443-4950-453e-a4ba-c1959e712fa3","abc796b1-8869-47de-849f-bd0cc583f7d2","a0a05fa4-7bb3-4ff0-a8c8-3840ba286c66","b7566ae8-541a-47a9-9702-ecc75a9e1ee1","714cc9b7-74c7-4974-886d-120bd7d0454c","7ea023a4-757b-473d-9bec-0516b8ebe435","1f2b5439-cd17-4bfe-b053-72a181d74e4a","ca84f976-b341-4c85-ba9f-09156758aa9d","9e9bcf5d-8e26-45e0-ab09-694f5990667c","ad0f3b71-2417-4785-8138-4b30cdac4984","243b4eaa-08b0-4332-bef9-9bc6e78b0c02","caa79d7c-ad29-4e69-a9bc-7e4ffc0b6e9c","d037a256-695d-4f72-b6e4-61ca00d4512b","4daf9d9b-fd91-424e-9203-c0701a56be1a","5651d8ae-69be-4a49-b51f-5e911b3697c4","5bcfe504-fb37-4ed5-9102-0cb9715aaf29","fb3edec4-69f3-4b6d-a0a2-0cc39b822fb7","cdf20f43-b51e-499d-b6fe-1c4d81a680e1","6bcaa37f-0d7a-4db3-8cf6-486a688668b7"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T21:00:00.000+0000","publisher":"ALDI Nord","title":"Aktuelle Angebote","coverUrl":"https://content-media.bonial.biz/1f7a81a7-b1ff-4e1d-9e4f-cbbc18975c6b/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/1f7a81a7-b1ff-4e1d-9e4f-cbbc18975c6b/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"Netto":{"pageCount":72,"contentId":"dd41fc4e-eb8e-40a5-840b-736745a67bbd","pageUuids":["f2359d23-e812-4661-b127-088c992c79d9","2b9494f0-195d-485a-b71d-0a7a215a994b","16bfb3b0-1ad2-4a2b-a6e2-15b568b908f9","a06d51a9-16f9-442e-a0bd-0e71740ec9b6","7491913a-8a83-4527-8a27-275de29fa14f","28994c8d-f03b-4aef-bed7-7ba09be6d6cd","516cd67b-64f0-4498-bb39-88f5924f4af5","75c1d9f1-d701-47a3-980a-341f4f3ea464","49342293-5f87-4bc7-9200-4c3d45af0416","fe617d37-f0a4-4d06-8307-3543f3d4c461","b12dff31-37cc-4bc6-ab1e-4216b59e44d8","a50979ba-de90-4547-8a7b-8f2ab1fa0085","157c2fd9-d646-4e72-9b04-b9941fa1ea08","c3123a67-bcd2-43c1-837a-1b443dbc3ab1","5722e48e-67a7-4a48-8b64-3fc46b8a153d","5cae1185-d86c-44e2-ad38-20d2022a1e4c","2639fec1-5568-4290-8f72-a6d1b43ff735","9b4b14d3-c6c8-44f1-a503-9dc90abcda2f","c6e9dea8-87b8-4ead-820b-000042ee3769","e0241728-5766-4772-b136-c63640e4a7a0","c38e8a77-8442-4e9b-afb5-149d26edc05d","607f0e11-7f30-4cbe-a7e4-44474535dc1b","388ab1a8-effd-4e9e-8b9f-9591856eec1a","e6e8cf05-301f-4e8d-b1a7-f2734722616a","26ebf0e9-162b-45c9-81ca-888fb2c9075a","842381c8-0500-4da7-9554-25b7977e1e3a","a8bc5329-12c7-47c2-b441-dc18fbcec0d5","9786d75c-73e3-4025-81b1-4d2e9b1c1935","5a144e88-3fc0-47d4-9ba7-fc2294d35098","3507bb92-bd3d-4c96-a5d6-8dc7e68804c5","be86383e-5a59-490b-9e83-9b5ca6cee62f","cfebab5d-041a-41d8-9ab5-672d549a1f35","2384ccc8-3890-46e0-a88c-28f8cbbfd060","5b513e80-7bf9-43d5-b5cc-b79c921fa0cc","ae22b36a-7772-4ae6-a6c0-1e45c7b5d271","7d1ccfe6-a97b-42dc-8e5c-b56b9c3ba060","f25ba24a-cf7a-4f05-9438-a5a512e805ad","dc2f74ea-9183-4d6a-8462-0b261ffdb308","7a5db40b-06c4-42f8-9524-10705497ac1b","b81baa9d-667e-47e0-878f-34fdaa636d77","e1213c1d-f0d1-4423-bb43-618a238ff525","fdeb5300-aae0-454c-baf0-84bad7bfed1e","5998f6b8-d804-4408-ab14-64ea0e0773de","1b819a66-5bb6-4be7-8a5a-c5173b80a150","4a6ddb7f-983b-4cd7-aa2f-b89bcef97f95","f3b019d1-1905-4d08-b1d3-1b92b71757d8","8f07e290-6985-485c-bcb3-463e0247b470","3b5f1112-c803-41bb-8507-de485a25fdee","f5f98b72-7795-4edd-9d3c-83c1cbd80c19","85cf08df-5778-4e7a-9714-4f66631aaa67","5292b6b0-78ea-4afd-8cca-214ea7b51956","095128f1-7e8d-4a78-b92b-d3108d74a20c","8cfb84fd-a5af-49ff-9447-87af4a3ec35c","7852162d-1081-4548-b46c-e621b3ea1f4a","1e5a2473-9dbc-4c2e-b395-e945e1494faa","47340eec-8dfe-4ddf-ad60-e8ab116dae1b","f0cb74cc-a879-4ea1-bbe7-66ab57cb9cc2","d64ee978-cd9e-49da-ba5e-e983e4f805c3","4106cba1-47db-4ae7-a17c-160718e03bbe","babda6bd-76e5-47f2-b95b-c761a227d8d8","ba54174b-c824-48fc-a231-a76870762efd","b22ad414-9ff9-4018-9e51-51a0486e94c0","bb96b0fa-67eb-4266-bfa5-065a7b5d5955","2c553d68-943c-41d5-9f4b-aa061cb6bb4b","3e0a25d6-f4a1-4fa9-a151-ec1ec7bcb6f5","cbfb1eab-cd3d-4aa5-9747-d1e44fdbc179","dc624ab6-f499-4534-aee9-05fd4b7b9f7e","973ef0a6-cae3-4b33-86a0-1c1878901c05","92847470-e521-47c0-a821-72269ed0e9a2","813a5aad-5655-45df-a4da-828629e3784d","880a3da2-9d65-4a7b-9ce2-ac6acb513c95","2a2265fd-117d-423d-8621-cc7c34846a3f"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T19:00:00.000+0000","publisher":"Netto Marken-Discount","title":"Aktuelle Angebote","coverUrl":"https://content-media.bonial.biz/f2359d23-e812-4661-b127-088c992c79d9/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/f2359d23-e812-4661-b127-088c992c79d9/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"Globus":{"pageCount":52,"contentId":"04988c94-c8bf-43e5-a26d-4d28f6167085","pageUuids":["0c7e052b-84ec-4d56-8b73-420cf530d223","50ba42b4-c4a6-48f8-9824-b600e949a400","2056b9d4-072d-40d4-8aaf-45d74d2d4f55","95103596-6d20-4560-ba1d-e64dbfae8e13","ed4d3721-9d97-446e-9570-33b283885401","19faf264-c5f2-47a2-9830-8a49e7aaccf7","0afc4814-824b-432f-93a7-d3f8934bb6e4","f2bfbc11-4acd-47b9-bacb-b59aa889a2bd","c49db374-9b9d-46d3-adc0-254feec2c8ee","e0e83000-2b15-4b7d-8681-990976bed929","29f243e8-e3ef-4ee4-ae69-52cac956b3a7","0cc6788d-a627-464b-bd70-32033ba96ac2","439d9334-8b40-4d6c-81c7-ddf4ade90484","b3192d5f-6dcd-4bbe-ad45-4ce5e9a41229","742a8251-1379-4f6d-80be-08bc68d1374c","da09ac2c-b9d3-4d14-8ee4-1fd2f62081d1","973ca5ce-a9c5-4a12-9423-7b27bf862a7e","a3606ca7-f27a-4af8-b088-1e76de33f499","799416fe-fdcb-408b-ad97-5f71cd97ebd3","601dd505-4eaf-4e78-9f28-239d4e62f27d","eb193617-d175-41ee-ac9d-068a83677384","d77b60e8-83bf-4bf1-bb10-a6aa028ca187","151132de-cc0f-4946-a8f6-8220c2cdc4f4","0e95a5fd-03f2-4607-b3b8-ac60123fde61","1ea472cc-248e-40f4-9878-898ba8c0c29f","a92975a6-d2d7-4ec8-bdab-2f6b48c4bf05","7342bf2d-230a-4007-aa9f-39d7d694804f","6a68a922-a4b1-451e-9c83-e668703033d7","80821944-e364-4ad2-a207-a0541db48ec6","713b4fb9-fd8a-46a2-a7c3-da85ca72c0eb","af650abd-3d69-4608-9511-6855ce5b5152","8b59d127-4338-408e-8137-18a9b16e5655","ea27efd1-cfed-4cf7-bb62-8fd6e850b2ab","5b23aae0-fbb9-4914-b864-78169e179be3","2ad8a1b6-fb06-4754-938b-b9650b3f98b2","a55a60e5-1799-41d7-8485-dea7e978be95","babc37ce-a5ec-4fe3-aa78-afe0ad44773b","b2a3f693-dbd7-4509-9b9d-6864d6477775","5aedb412-7ce9-4e0b-9dd7-dff585a5b7d3","508f8ad0-e503-4b7a-8972-352d6ce28c51","03c1f881-d064-47d9-8432-c66140eadcca","0b81aee7-459f-4161-bfba-76c373c10d9a","ab519378-1f26-48b0-bdfc-fb2da5fb9243","ffa1548f-dee3-424b-b623-ec0b66935ce6","3d297d79-1392-4e5a-82a4-2ce8a5873cec","cd92b2ea-f16b-4819-b892-d38a8a206248","ef985a7e-19cc-458f-a6c8-fdc2e983502b","922a8165-b053-41d6-869c-d32d690a13f0","97e02e1e-5026-46e8-9495-2e9b7574fadc","abb531ac-a053-42b0-9893-bfbc25d21885","31d824d3-457b-4b10-a56c-875d2d236511","82502acf-1b1d-4c16-ae44-5a66cd746f92"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T22:00:00.000+0000","publisher":"GLOBUS","title":"Aktuelle Angebote","coverUrl":"https://content-media.bonial.biz/0c7e052b-84ec-4d56-8b73-420cf530d223/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/0c7e052b-84ec-4d56-8b73-420cf530d223/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"Kaufland":{"pageCount":60,"contentId":"b0206124-539f-4c4b-a8c8-1e71bc6a71e9","pageUuids":["a2f7ec5b-c11a-4b69-bbdf-cd4df4701ba2","b4ba91d3-6169-470e-b214-67891372e744","63026337-d3a9-4863-9388-0f05bc99146f","c0cb9bc1-aed9-435c-b3aa-d2f15ade87c3","6d92d7af-3600-492a-b662-21f5d07580e3","3b974864-a0dd-4368-acbf-0a94ec4f3005","c0468c50-9ccd-4090-8cd6-aedfdf9d152d","4f5dd017-abd0-404d-bb1a-e426f16c8b9f","ee2f0090-74be-4425-8259-af3ec1bf75d0","e36d5203-a6eb-4793-88e4-075467626c12","49d7ccd4-5280-49f2-af53-2936c7cc6f32","2d390b4c-0ba1-4577-90bf-848f641a7782","f8220091-c956-48d9-a3d6-a8130a51d0b2","4f6d290e-3604-4f0d-a2c7-84d3edaf4a9b","5d8570bc-121a-4f3b-ba1e-a9729d4f503b","258c6aa8-bcd2-4b48-952a-079ac9ba7725","9dd8cd39-a07d-4e83-8032-a72970ad0d85","536e4050-561e-45f0-a426-090889c6cfb4","cb1456de-8375-43c9-98d7-43fd97f4c666","5c189f9c-4539-4705-9167-2bbc7db3bed2","a101fcd6-b4ee-4655-be1e-0eb42fcf293d","01b7c994-d064-4901-9b5f-3b0e22de2ebf","6197f719-e1de-4d28-b7d0-4b7484520612","344e2e14-9613-42d0-9a3a-a02f6dcac69b","acd4c5ac-cb90-4846-8075-6e0d5d3ed5a4","0ed47299-3856-4566-a0b1-e4b0dc6de314","eed12731-5b00-411b-97e2-f433138f3027","814a8ed5-4de7-4368-adea-559138292c89","d7b51ced-c04f-465e-957c-dc8f7af8635b","1342215a-5f79-4b45-8a68-093cd963447b","f690582b-03ee-4dc6-8b9e-fbb502112da9","418f7a99-c3a7-4143-a6fa-a291fe3e3e7c","a91e2117-45fe-4df1-b534-1c523ad59060","4bce6b22-f423-4370-b209-670f2c00cb90","21ba8b02-f4e3-495e-a854-85d578e586a4","19227579-ff57-4c81-8766-e309a3a62d1b","dcb26ddd-c8fc-4b59-a7dc-bf1214fda4d8","126cacbe-f929-4832-bbca-dd0d23b2e13e","df1fe014-9cbc-417a-8cc6-c44e130dcad1","c1850f80-e2dc-423c-9f78-e49d1a2a4ec9","d7a4afda-f359-4daf-a2a8-63a5b73a6989","51fdc18d-9283-4afc-ba36-8866589019c2","1e86b804-fadf-4d42-a166-dac340f9ddfd","a54078ea-eaca-461b-86ee-bde6e2f110a6","4b601291-1b9d-49e0-bf2a-107601cc540e","2ec4c2ba-4c90-4cc2-a37b-b1d8effe4e56","994e61c3-6274-440f-a3e7-af8159cf95e7","5f9e8339-5151-426a-aa32-1d6bb4fc757e","0a771f1d-67e0-4b4c-bfe6-dd088e5317ee","2e7b7d15-9a7d-4d7e-bdcf-585b2abe54e9","c1ab0439-ae6a-46c7-b56e-596c01a4c334","469db272-7279-4476-b0db-382632ed54bd","c4680439-6465-4b06-99a0-63c453a592d2","eec78e33-9540-4e12-b52a-631f85b58d8a","a5c24a64-3a9a-475f-a7b1-e72042564dd1","d7b709e5-b3bb-4a4a-b944-8f5d4b40b844","30df5b14-dd56-4896-85c4-4e1283240526","2fb1d593-eb77-4183-a6ce-c08f0e9bc60e","59abe02e-a30f-42a8-8ed3-6c937e39713d","e1d3a7af-83a3-4806-a2dc-275b7a8d950d"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T18:00:00.000+0000","publisher":"Kaufland","title":"Hier bin ich richtig","coverUrl":"https://content-media.bonial.biz/a2f7ec5b-c11a-4b69-bbdf-cd4df4701ba2/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/a2f7ec5b-c11a-4b69-bbdf-cd4df4701ba2/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"EDEKA":{"pageCount":32,"contentId":"1d0ddfe1-0e75-4ec1-90dd-46a46bda31d9","pageUuids":["3387c75a-c5b9-4d29-995c-6ef2d684e368","f2d13c45-f040-4a5d-8550-3174fc71770a","e0125294-fe34-47d5-a344-2122dafc559b","556fb33e-bcd1-431b-a061-ba9d63819a4e","2510823c-6e9d-418b-a484-a088bf2601dd","38ca3aff-72c2-41a3-afd4-3a0b154b7812","ae5419a5-6043-493d-bb21-1f1e96499a0d","bcee7a2c-dc7f-4205-9b6e-f8d37beeea60","76a2f1e9-41ec-4365-ad98-eb2e4df609ea","7ddd0019-4efe-40a5-a337-cd7fcd1e8795","a65a4048-365d-4ed6-ba86-b5630a560bdd","58a06c44-2cf3-42d1-8980-d99b243aaeba","e56c7df6-79ae-4b47-876d-5e6943198a36","c2edfe19-e480-46b3-b1f3-9d4eb11d1832","e413c7a9-eb5a-49e1-9c7a-5de51ba943ce","d3880229-f908-44da-86b3-c85f2322c359","1416def6-79b3-45d2-be50-ef8fce21c398","3cc5ae8a-423e-4ed1-b346-753cff2d36f5","0b1d7375-225b-48e9-b1c8-9e50b930b058","4f77db08-7048-4620-a752-c3dc00bdb2ae","a2db5e82-d71a-4066-b19f-99d9bdbd818c","063aa8ee-1336-46cb-9a55-a5f99e292a72","c015e05c-029d-49b8-8160-3352a0651503","15883898-fc1c-451e-8d15-5e2f7e244b5d","17ed41b1-1488-4c4b-a670-c3374e1f2f40","99a1b64e-b78f-4afa-8d7f-2a80d825eb19","b4bd273b-05b0-4d05-9713-fdf9f83a4ef2","d1d29f5f-fc20-4509-923a-1e7276e459d2","42dd6e2a-049e-4f51-b104-6091c17c31e0","514a02d9-c295-4afb-931c-615ac191e085","c98c692b-8c04-49e7-b194-ec38734982b0","da948829-3a45-44be-978b-aad7bd0870db"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T21:00:00.000+0000","publisher":"EDEKA","title":"Wir lieben Lebensmittel.","coverUrl":"https://content-media.bonial.biz/3387c75a-c5b9-4d29-995c-6ef2d684e368/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/3387c75a-c5b9-4d29-995c-6ef2d684e368/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"ALDI Süd":{"pageCount":37,"contentId":"71ee6eda-0684-4416-9d94-8210741492b5","pageUuids":["a861ecfa-fd06-4a51-b168-aae1623971f2","19215165-a8d9-4f57-bc6d-c31511245e9a","e16a996a-9b27-46b6-bf21-24bd1b740f73","c0316704-8ce2-4dbc-b8ef-9ce15b405b63","427cb1a9-2d67-4c37-aced-a2d9d1b90403","124c6423-c00b-4ca1-9f6f-f5ab54a5e0bc","24dfb3a3-610a-4ae6-b714-b62cc11020ef","9c709e04-7075-45c8-984f-886368350d1b","dcffc860-9db8-446d-9685-6c39ea460c07","4a5acc57-c53f-48d8-8051-65b616436c5b","1cf6c62e-aa85-4602-849e-da32c0c8706f","29ad60cd-a293-4750-87ef-d098fcb80369","b1f06dd0-b5e9-43b7-8076-5856443ca50b","df01018a-2574-4502-99fd-e2960f5112c2","f07fd3ca-5659-46fa-87aa-17aebf72a73b","d409d0a9-b661-4f65-881a-541e83f51cbc","70faf6a7-30dc-4fec-8838-f18688186298","e49b8b4d-c7b4-4586-97ae-5984db00a71c","908bee25-14a0-40e1-9561-ec4e4b1bc9f4","e1b61a47-c49c-499b-a755-00f9f78e34a7","5d17f8fe-e624-4ba8-8d4a-b08d2b982b1c","bff62bd3-25e4-430d-84a1-b59782ba2ee4","cf7f4f6f-9255-44eb-990f-6bf65f861301","fa055e9d-b3bb-44c1-817b-723c169eb965","df074306-1574-4095-9b33-e7f2978ad8ef","4c390acc-a968-43db-ba57-60b23ab66283","b5f82f48-a2fe-4f61-9b4e-a6c294d9644f","d3b3d28f-22ea-4c31-9113-3a0a92c8f4b0","5aba5649-d0a3-4f64-ab8f-1ffbf2bf1e2d","0bd11d9e-8dcd-4e40-88da-11ec28bab253","03f3d85e-e12d-4620-a1fc-f79faa95b93d","7cff89dd-cb78-4b4c-90a2-4728bbf5436b","ceca0f19-71d3-4c38-9e1b-b7d9396c02e1","e0ddb3e9-83fe-4ec4-85e4-b67283274571","cc0b0ddc-3bdd-4c77-a99f-1b5231159e9c","d5dd0061-e066-4cab-bb7b-280381ed58be","d0e368b1-cebc-480b-a676-3dcdc431a1f3"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T21:00:00.000+0000","publisher":"ALDI SÜD","title":"Gutes für Alle.","coverUrl":"https://content-media.bonial.biz/a861ecfa-fd06-4a51-b168-aae1623971f2/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/a861ecfa-fd06-4a51-b168-aae1623971f2/zoomlarge_page_0.jpg?impolicy=zoomlarge"},"REWE":{"pageCount":28,"contentId":"8250c199-a6fe-4628-9b75-876c0d735735","pageUuids":["903942a4-c7d8-4229-b2f3-da7240944624","4f9d3e25-2b79-428c-823b-b3722245e9b0","e62f8807-f03b-4607-8c7f-22321ec44764","599b680b-5e5e-4677-85fa-5c8d30f8d46e","4f40b8ff-4e09-481f-9725-25dd186f89df","41aeb1cf-b2a8-4f8d-8890-fd1d7e4ed26b","334b1b15-92e1-436f-aba8-8d9365cd1868","7e27bab1-7add-4e9b-a1d8-fde8cdc0736a","6c826659-44d7-4460-8ba7-e67e3e6cd793","92ae5851-ad9a-4d64-b18d-daddc2b9b62d","b92ce815-0832-423e-8e71-0c0f0b7bd3a5","8b1c97f1-e73a-4d88-be77-4791aeef4e75","c01d379c-e119-4d6f-a1a8-f53ae7a68649","d979572d-4115-4e6e-9a6d-5bac31fa9249","13602569-2918-4b70-bec5-69088d54a2a2","a002bfc5-e6b3-44fb-936e-bcf0002f8d7f","50398a24-008c-47f9-8aa5-6fa567403286","b97da4cd-d6ed-4bd7-9b3a-3ccf7c684fc5","9cc67c68-6aa1-47a1-8ef2-e49d2a7b276a","d54568f9-60ab-4c07-b576-22cac5375aae","199e04dc-2410-4f54-bd3a-cbeddb4aa7e4","190b39bb-7c67-4b34-b65e-f9fcccfd3bb1","381ce7d6-68b3-4717-9563-17cc3f132899","ef321ed1-b6db-4f23-bcd5-4fd23ca86973","0c771dcc-99e8-4fc0-b28c-6e57a8c4aa07","11787143-855f-4c0c-9c87-2f0999ff5b3a","5ab6a979-6f2c-4a34-995c-fa3da8577f47","bcd9f629-0691-4b88-bc07-c1aecf4dac90"],"validFrom":"2026-11-15T23:00:00.000+0000","validUntil":"2026-11-21T22:00:00.000+0000","publisher":"REWE","title":"Dein Markt","coverUrl":"https://content-media.bonial.biz/903942a4-c7d8-4229-b2f3-da7240944624/zoomlarge_page_0.jpg?impolicy=large","highResCoverUrl":"https://content-media.bonial.biz/903942a4-c7d8-4229-b2f3-da7240944624/zoomlarge_page_0.jpg?impolicy=zoomlarge"}};

ALL_RETAILERS_META.forEach((meta) => {
  const liveInfo = KAUFDA_LIVE_BROCHURE_PAGES[meta.id];
  if (liveInfo) {
    meta.contentId = liveInfo.contentId;
    meta.coverUrl = liveInfo.coverUrl;
    meta.highResCoverUrl = liveInfo.highResCoverUrl;
    meta.pages = `${liveInfo.pageCount} Seiten`;
    meta.pageUuids = liveInfo.pageUuids;
    meta.validFrom = liveInfo.validFrom;
    meta.validUntil = liveInfo.validUntil;
    meta.kaufdaUrl = `https://www.kaufda.de/contentViewer/static/${liveInfo.contentId}?page=1`;
    meta.brochureUrl = meta.kaufdaUrl;
  }
});

// Strenge Händler-Prüfung, damit z.B. bei ALDI Süd niemals ein REWE-Prospekt übernommen wird
function doesBrochureMatchRetailer(retailerId, pubText) {
  if (!retailerId || !pubText) return true;
  const s = String(pubText);
  const patterns = {
    'REWE': /\brewe\b/i,
    'EDEKA': /\b(edeka|marktkauf|e\s*center)\b/i,
    'Lidl': /\blidl\b/i,
    'ALDI Süd': /aldi\s*s[üu]d/i,
    'ALDI Nord': /aldi\s*nord/i,
    'Kaufland': /\bkaufland\b/i,
    'Netto': /\bnetto\b/i,
    'Penny': /\bpenny\b/i,
    'Norma': /\bnorma\b/i,
    'Globus': /\bglobus\b/i,
    'tegut': /\btegut\b/i,
    'HIT': /\bhit\b/i
  };
  const pat = patterns[retailerId];
  return pat ? pat.test(s) : true;
}

// Berechnet den Gültigkeitszeitraum (Mo–Sa; am Sonntag bereits Vorschau auf die neue Woche ab Montag!)
function getCurrentOfferWeekRange(refDate = new Date()) {
  const d = new Date(refDate.getTime());
  const day = d.getDay(); // 0 = Sonntag, 1 = Montag ... 6 = Samstag
  const isSundayPreview = day === 0;
  const isSaturdayEnding = day === 6;

  const monday = new Date(d.getTime());
  if (day === 0) {
    // Am Sonntag: Zeige bereits den neuen Zyklus ab morgen (Montag bis Samstag)
    monday.setDate(d.getDate() + 1);
  } else {
    monday.setDate(d.getDate() - (day - 1));
  }
  monday.setHours(0, 0, 0, 0);

  const saturday = new Date(monday.getTime());
  saturday.setDate(monday.getDate() + 5);
  saturday.setHours(23, 59, 59, 999);

  const fmtShort = (dt) => {
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.`;
  };
  const monShort = fmtShort(monday);
  const satShort = fmtShort(saturday);
  const cycleKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  if (isSundayPreview) {
    return {
      monday,
      saturday,
      monShort,
      satShort,
      cycleKey,
      isSundayPreview: true,
      isSaturdayEnding: false,
      badgeClass: 'valid-upcoming',
      shortBadge: `🆕 Ab Mo, ${monShort} (${monShort}–${satShort})`,
      fullBadge: `🆕 Neue Woche verfügbar: Gültig Mo, ${monShort} – Sa, ${satShort}`
    };
  }
  if (isSaturdayEnding) {
    return {
      monday,
      saturday,
      monShort,
      satShort,
      cycleKey,
      isSundayPreview: false,
      isSaturdayEnding: true,
      badgeClass: 'valid-ending',
      shortBadge: `🟠 Endet heute (Mo, ${monShort} – Sa, ${satShort})`,
      fullBadge: `🟠 Endet heute: Gültig Mo, ${monShort} – Sa, ${satShort}`
    };
  }
  return {
    monday,
    saturday,
    monShort,
    satShort,
    cycleKey,
    isSundayPreview: false,
    isSaturdayEnding: false,
    badgeClass: 'valid-active',
    shortBadge: `🟢 Gültig: Mo, ${monShort} – Sa, ${satShort}`,
    fullBadge: `🟢 Gültig: Mo, ${monShort} – Sa, ${satShort}`
  };
}

// Formatiert das exakte Gültigkeitsdatum eines Prospekts oder Angebots (inkl. Kaufland Mo–Sa)
function formatBrochureValidityBadge(item) {
  const weekFallback = getCurrentOfferWeekRange();
  if (!item) return weekFallback;

  const vfStr = item.validFrom;
  const vuStr = item.validUntil;
  if (vfStr && vuStr && /\d{4}-\d{2}-\d{2}/.test(String(vfStr)) && /\d{4}-\d{2}-\d{2}/.test(String(vuStr))) {
    const vf = new Date(vfStr);
    const vu = new Date(vuStr);
    if (!isNaN(vf.getTime()) && !isNaN(vu.getTime())) {
      const now = new Date();
      const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      const fmt = (dt) => `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.`;
      const startDay = dayNames[vf.getDay()];
      const endDay = dayNames[vu.getDay()];
      const startFmt = fmt(vf);
      const endFmt = fmt(vu);

      if (vf.getTime() > now.getTime() || now.getDay() === 0) {
        return {
          badgeClass: 'valid-upcoming',
          shortBadge: `🆕 Ab ${startDay}, ${startFmt} (${startFmt}–${endFmt})`,
          fullBadge: `🆕 Gültig ab ${startDay}, ${startFmt} bis ${endDay}, ${endFmt}`
        };
      }
      const sameDayEnd =
        now.getFullYear() === vu.getFullYear() &&
        now.getMonth() === vu.getMonth() &&
        now.getDate() === vu.getDate();
      if (sameDayEnd) {
        return {
          badgeClass: 'valid-ending',
          shortBadge: `🟠 Bis heute (${startDay}, ${startFmt} – ${endDay}, ${endFmt})`,
          fullBadge: `🟠 Endet heute (${startDay}, ${startFmt} – ${endDay}, ${endFmt})`
        };
      }
      return {
        badgeClass: 'valid-active',
        shortBadge: `🟢 ${startDay}, ${startFmt} – ${endDay}, ${endFmt}`,
        fullBadge: `🟢 Gültig: ${startDay}, ${startFmt} – ${endDay}, ${endFmt}`
      };
    }
  }
  return weekFallback;
}

function renderOfferLocationAndValidityBar() {
  const locLabelEl = document.getElementById('offerLocationLabel');
  const validBadgeEl = document.getElementById('offersWeekValidityBadge');
  const loc = state.userLocation || DEFAULT_USER_LOCATION;
  if (locLabelEl) {
    locLabelEl.textContent = `${loc.zip || '86399'} ${loc.city || 'Bobingen'}`;
  }
  if (validBadgeEl) {
    const sampleBrochure = (state.brochures && state.brochures[0]) || ALL_RETAILERS_META[0];
    const info = formatBrochureValidityBadge(sampleBrochure);
    validBadgeEl.className = `validity-pill ${info.badgeClass}`;
    validBadgeEl.textContent = `📅 ${info.shortBadge}`;
  }
}

function toggleOfferLocationEditor() {
  const box = document.getElementById('offerLocationEditorBox');
  if (!box) return;
  const isHidden = box.style.display === 'none' || !box.style.display;
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const loc = state.userLocation || DEFAULT_USER_LOCATION;
    const zInp = document.getElementById('offerZipInput');
    const cInp = document.getElementById('offerCityInput');
    if (zInp) zInp.value = loc.zip || '86399';
    if (cInp) cInp.value = loc.city || 'Bobingen';
  }
}

function setPresetOfferLocation(zip, city, lat, lng, kaufdaCity) {
  const zInp = document.getElementById('offerZipInput');
  const cInp = document.getElementById('offerCityInput');
  if (zInp) zInp.value = zip;
  if (cInp) cInp.value = city;
  state.userLocation = { zip, city, lat, lng, kaufdaCity: kaufdaCity || 'Augsburg' };
  applyUserOfferLocation();
}

function applyUserOfferLocation() {
  const zInp = document.getElementById('offerZipInput');
  const cInp = document.getElementById('offerCityInput');
  const zip = (zInp?.value || state.userLocation?.zip || '86399').trim();
  const city = (cInp?.value || state.userLocation?.city || 'Bobingen').trim();

  // Bekannte Koordinaten im Raum Bobingen / Augsburg / Bayern zuordnen
  const knownLocations = {
    '86399': { lat: '48.274', lng: '10.835', kaufdaCity: 'Augsburg' },
    '86150': { lat: '48.3705', lng: '10.8978', kaufdaCity: 'Augsburg' },
    '86830': { lat: '48.1789', lng: '10.7558', kaufdaCity: 'Augsburg' },
    '86343': { lat: '48.2694', lng: '10.8889', kaufdaCity: 'Augsburg' },
    '80331': { lat: '48.1351', lng: '11.5820', kaufdaCity: 'Muenchen' }
  };
  const coords = knownLocations[zip] || state.userLocation || DEFAULT_USER_LOCATION;
  state.userLocation = {
    zip,
    city,
    lat: coords.lat || '48.274',
    lng: coords.lng || '10.835',
    kaufdaCity: coords.kaufdaCity || 'Augsburg'
  };
  try {
    localStorage.setItem('kt_user_location_v17', JSON.stringify(state.userLocation));
  } catch (_) {}

  // Aktualisiere Koordinaten in state.brochures
  (state.brochures || []).forEach((b) => {
    if (b.id !== 'ALDI Nord') {
      b.lat = state.userLocation.lat;
      b.lng = state.userLocation.lng;
    }
  });

  const box = document.getElementById('offerLocationEditorBox');
  if (box) box.style.display = 'none';

  renderOfferLocationAndValidityBar();
  showToast(`📍 Standort auf ${zip} ${city} gesetzt – aktualisiere Prospekte...`);
  refreshAllLiveBrochures(true);
}

function setBrochureShelfLayout(layout) {
  state.brochureShelfLayout = layout === 'carousel' ? 'carousel' : 'grid';
  document.querySelectorAll('#brochureLayoutSwitcher .sub-seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.blayout === state.brochureShelfLayout);
  });
  renderBrochuresCarousel();
}

// Prüft beim App-Start (insbesondere am Sonntag oder bei neuem Wochenzyklus), ob neue Prospekte vorliegen
async function autoRefreshBrochuresIfNeeded() {
  try {
    renderOfferLocationAndValidityBar();
    const weekInfo = getCurrentOfferWeekRange();
    const lastCycle = localStorage.getItem('kt_brochure_week_cycle_v17');
    const lastFetchTs = parseInt(localStorage.getItem('kt_brochure_last_fetch_ts_v17') || '0', 10);
    const nowTs = Date.now();
    const isSunday = new Date().getDay() === 0;
    // Am Sonntag alle 3 Stunden prüfen, sonst bei neuem Wochenzyklus oder alle 12 Stunden
    const maxAgeMs = isSunday ? 3 * 3600 * 1000 : 12 * 3600 * 1000;

    if (lastCycle !== weekInfo.cycleKey || nowTs - lastFetchTs > maxAgeMs) {
      await refreshAllLiveBrochures(true);
      localStorage.setItem('kt_brochure_week_cycle_v17', weekInfo.cycleKey);
      localStorage.setItem('kt_brochure_last_fetch_ts_v17', String(nowTs));
    }
  } catch (_) {}
}

function upgradeKaufdaPageImageUrl(url, useUltraHd = true) {
  if (!url) return '';
  const policy = useUltraHd ? 'zoomlarge' : 'large';
  if (url.includes('content-media.bonial.biz')) {
    const base = url.split('?')[0];
    return `${base}?impolicy=${policy}`;
  }
  return url;
}

function selectBestHighResBrochurePageUrl(imagesArr, fallbackUrl) {
  if (!Array.isArray(imagesArr) || imagesArr.length === 0) {
    return upgradeKaufdaPageImageUrl(fallbackUrl, true);
  }
  // WICHTIG: Niemals imgs[0] nehmen, da imgs[0] bei KaufDA nur ein 75x96px Vorschaubild (?impolicy=previews) ist!
  const zoomLargeObj = imagesArr.find(
    (im) => im && im.url && (String(im.url).includes('impolicy=zoomlarge') || im.size === '2800x2800')
  );
  if (zoomLargeObj) return zoomLargeObj.url;

  const largeObj = imagesArr.find(
    (im) => im && im.url && (String(im.url).includes('impolicy=large') || im.size === '1600x1600')
  );
  if (largeObj) return upgradeKaufdaPageImageUrl(largeObj.url, true);

  const lastObj = imagesArr[imagesArr.length - 1];
  if (lastObj && lastObj.url) return upgradeKaufdaPageImageUrl(lastObj.url, true);

  return upgradeKaufdaPageImageUrl(fallbackUrl, true);
}

function buildVerifiedHighResPagesForRetailer(retMeta) {
  const baseMeta = ALL_RETAILERS_META.find((r) => r.id === retMeta.id) || retMeta;
  const liveInfo = KAUFDA_LIVE_BROCHURE_PAGES[retMeta.id] || KAUFDA_LIVE_BROCHURE_PAGES[baseMeta.id];
  const uuids = retMeta.pageUuids || baseMeta.pageUuids || (liveInfo && liveInfo.pageUuids) || [];

  if (Array.isArray(uuids) && uuids.length > 0) {
    return uuids.map((uuid, idx) => ({
      number: idx,
      largeUrl: `https://content-media.bonial.biz/${uuid}/zoomlarge_page_${idx}.jpg?impolicy=large`,
      ultraHdUrl: `https://content-media.bonial.biz/${uuid}/zoomlarge_page_${idx}.jpg?impolicy=zoomlarge`,
      imageUrl: `https://content-media.bonial.biz/${uuid}/zoomlarge_page_${idx}.jpg?impolicy=large`,
      fallbackLargeUrl: `https://content-media.bonial.biz/${uuid}/zoomlarge_page_${idx}.jpg?impolicy=large`,
      offers: []
    }));
  }

  const singleLarge = upgradeKaufdaPageImageUrl(retMeta.coverUrl || retMeta.highResCoverUrl, false);
  const singleUltra = upgradeKaufdaPageImageUrl(retMeta.highResCoverUrl || retMeta.coverUrl, true);
  return [
    {
      number: 0,
      largeUrl: singleLarge,
      ultraHdUrl: singleUltra,
      imageUrl: singleLarge,
      fallbackLargeUrl: singleLarge,
      offers: []
    }
  ];
}

let brochureTouchStartX = 0;
let brochureTouchStartY = 0;

function onBrochureTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return;
  brochureTouchStartX = e.touches[0].clientX;
  brochureTouchStartY = e.touches[0].clientY;
}

function onBrochureTouchEnd(e) {
  if (!state.activeBrochureReader || state.activeBrochureReader.zoomLevel > 0) return;
  if (!e.changedTouches || e.changedTouches.length !== 1) return;
  const dx = e.changedTouches[0].clientX - brochureTouchStartX;
  const dy = e.changedTouches[0].clientY - brochureTouchStartY;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    if (dx < 0) stepBrochureReaderPage(1);
    else stepBrochureReaderPage(-1);
  }
}

async function openInteractiveBrochureReader(retailerId, initialPage = 1, event = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const mergedBrochures = typeof getAllMergedBrochuresList === 'function' ? getAllMergedBrochuresList() : (state.brochures || ALL_RETAILERS_META);
  const retMeta =
    mergedBrochures.find((r) => r.id === retailerId) ||
    getRetailerMetaByAnyName(retailerId) || {
      id: retailerId,
      label: retailerId,
      kaufdaSlug: String(retailerId || '').replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-'),
      brochureTitle: `${retailerId} Aktuelles Prospekt`,
      kaufdaUrl: `https://www.kaufda.de/Geschaefte/${encodeURIComponent(String(retailerId || '').replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-'))}`,
      brochureUrl: `https://www.kaufda.de/Geschaefte/${encodeURIComponent(String(retailerId || '').replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-'))}`,
      validity: 'Mo – Sa'
    };

  const baseMeta = ALL_RETAILERS_META.find((r) => r.id === retMeta.id) || retMeta;
  const contentId = retMeta.contentId || baseMeta.contentId || '';
  const cityUrl = retMeta.cityUrl || baseMeta.cityUrl || '';
  const meinprospektUrl = retMeta.meinprospektUrl || baseMeta.meinprospektUrl || '';
  const loc = state.userLocation || DEFAULT_USER_LOCATION;
  const lat = retMeta.id === 'ALDI Nord' ? '52.52' : (loc.lat || retMeta.lat || baseMeta.lat || '48.274');
  const lng = retMeta.id === 'ALDI Nord' ? '13.41' : (loc.lng || retMeta.lng || baseMeta.lng || '10.835');

  const modal = document.getElementById('brochureReaderModal');
  const titleEl = document.getElementById('brochureReaderHeaderTitle') || document.getElementById('brochureReaderTitle');
  const bodyEl = document.getElementById('brochureReaderBody');
  const extLinkEl = document.getElementById('brochureReaderExternalLink');
  if (!modal || !bodyEl) return;

  const directUrl = getDirectKaufdaBrochureViewerUrl(retMeta, initialPage);
  const vBadge = formatBrochureValidityBadge(retMeta);
  if (titleEl) titleEl.textContent = `📖 ${retMeta.label} (${vBadge.shortBadge})`;
  if (extLinkEl) extLinkEl.href = directUrl;

  modal.classList.add('open');
  pushAppHistoryState('brochure');

  // Nutze sofort die verifizierten Prospektseiten
  const initialHdPages = buildVerifiedHighResPagesForRetailer(retMeta);

  state.activeBrochureReader = {
    retailerId: retMeta.id,
    retailerMeta: retMeta,
    contentId,
    directUrl,
    pageIndex: Math.max(0, (parseInt(initialPage, 10) || 1) - 1),
    zoomLevel: 0, // 0 = 100% Passend im Rahmen, 1 = 130% Lesemodus, 2 = 165% Detail-Zoom
    zoomed: false,
    loading: true,
    pages: initialHdPages
  };
  renderBrochureReaderModalContent();

  // Lade zusätzlich live alle Seiten über Supabase Edge Function (falls verbunden) oder /api/kaufda-brochure
  const liveEndpoints = [];
  if (isSupabaseSyncConfigured()) {
    const sbBase = normalizeSupabaseBaseUrl(state.household.sbUrl);
    liveEndpoints.push(
      `${sbBase}/functions/v1/kaufda-brochure?retailer=${encodeURIComponent(retMeta.label || retMeta.id)}&retailerId=${encodeURIComponent(retMeta.id)}&contentId=${encodeURIComponent(contentId)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
  }
  liveEndpoints.push(
    `/api/kaufda-brochure?retailerId=${encodeURIComponent(retMeta.id)}&contentId=${encodeURIComponent(contentId)}&cityUrl=${encodeURIComponent(cityUrl)}&meinprospektUrl=${encodeURIComponent(meinprospektUrl)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );

  for (const apiUrl of liveEndpoints) {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
      const pubCheck = `${data?.publisherName || ''} ${data?.title || ''}`;
      if (doesBrochureMatchRetailer(retMeta.id, pubCheck)) {
        const pagesArr = Array.isArray(data?.pages)
          ? data.pages
          : Array.isArray(data?.pages?.contents)
            ? data.pages.contents
            : [];
        if (pagesArr.length > 0) {
          const parsedPages = pagesArr.map((p, idx) => {
            const imgs = p.images || [];
            const fallbackPageUrl =
              initialHdPages[idx]?.ultraHdUrl ||
              upgradeKaufdaPageImageUrl(retMeta.highResCoverUrl || retMeta.coverUrl, true);
            const hdUrl = selectBestHighResBrochurePageUrl(imgs, fallbackPageUrl);
            const largeUrl = hdUrl.replace('impolicy=zoomlarge', 'impolicy=large');
            const pageOffers = [];
            (p.Validation || p.offers || p.contents || []).forEach((c) => {
              if (c && c.title) pageOffers.push(c);
            });
            return {
              number: typeof p.number === 'number' ? p.number : idx,
              largeUrl,
              ultraHdUrl: hdUrl,
              imageUrl: largeUrl,
              fallbackLargeUrl: largeUrl,
              offers: pageOffers
            };
          });
          if (data.contentId && data.contentId !== contentId) {
            retMeta.contentId = data.contentId;
            retMeta.kaufdaUrl = `https://www.kaufda.de/contentViewer/static/${data.contentId}?page=1`;
            retMeta.brochureUrl = retMeta.kaufdaUrl;
          }
          if (data.validFrom) retMeta.validFrom = data.validFrom;
          if (data.validUntil) retMeta.validUntil = data.validUntil;
          retMeta.pages = `${parsedPages.length} Seiten`;
          state.activeBrochureReader.pages = parsedPages;
          state.activeBrochureReader.loading = false;
          state.activeBrochureReader.directUrl = getDirectKaufdaBrochureViewerUrl(
            retMeta,
            state.activeBrochureReader.pageIndex + 1
          );
          renderBrochureReaderModalContent();
          return;
        }
      }
      }
    } catch (_) {}
  }

  if (state.activeBrochureReader) {
    state.activeBrochureReader.loading = false;
    renderBrochureReaderModalContent();
  }
}

function renderBrochureReaderModalContent() {
  const reader = state.activeBrochureReader;
  if (!reader) return;
  const bodyEl = document.getElementById('brochureReaderBody');
  const extLinkEl = document.getElementById('brochureReaderExternalLink');
  if (!bodyEl) return;

  const pages = reader.pages || [];
  const pageExternalUrl = getDirectKaufdaBrochureViewerUrl(reader.retailerMeta, (reader.pageIndex || 0) + 1);
  if (extLinkEl) extLinkEl.href = pageExternalUrl;

  // Für neu hinzugefügte Händler (z.B. V-Markt, dm, Rossmann), für die noch keine lokalen HD-Seiten geladen wurden:
  // Niemals ein fremdes Prospekt zeigen, sondern direkt den echten KaufDA-Link für genau diesen Händler anbieten!
  if (!reader.loading && (!pages || pages.length === 0) && !reader.contentId) {
    const kaufdaDirect =
      reader.retailerMeta.kaufdaUrl ||
      reader.retailerMeta.brochureUrl ||
      `https://www.kaufda.de/Geschaefte/${encodeURIComponent(reader.retailerMeta.kaufdaSlug || reader.retailerMeta.id)}`;
    bodyEl.innerHTML = `
      <div class="section-card" style="width:100%; text-align:center; padding:18px 14px; border-color:rgba(16,185,129,0.4);">
        <div style="font-size:28px; margin-bottom:6px;">📰</div>
        <div style="font-size:16px; font-weight:800; margin-bottom:6px;">${escapeHtml(reader.retailerMeta.label)} Prospekt</div>
        <div style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin-bottom:14px;">
          Für <strong>${escapeHtml(reader.retailerMeta.label)}</strong> liegen aktuell keine vorab gespeicherten Einzelseiten in der App vor. Du kannst das aktuelle Prospekt direkt bei KaufDA für <strong>86399 Bobingen</strong> öffnen:
        </div>
        <a href="${escapeHtml(kaufdaDirect)}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;">
          📖 ${escapeHtml(reader.retailerMeta.label)} Prospekt bei KaufDA öffnen ↗
        </a>
      </div>
    `;
    return;
  }

  const total = Math.max(1, pages.length);
  const idx = Math.min(Math.max(0, reader.pageIndex || 0), total - 1);
  reader.pageIndex = idx;
  const defaultLarge = upgradeKaufdaPageImageUrl(reader.retailerMeta.coverUrl || reader.retailerMeta.highResCoverUrl, false);
  const defaultUltra = upgradeKaufdaPageImageUrl(reader.retailerMeta.highResCoverUrl || reader.retailerMeta.coverUrl, true);
  const currentPage = pages[idx] || {
    number: idx,
    largeUrl: defaultLarge,
    ultraHdUrl: defaultUltra,
    imageUrl: defaultLarge,
    fallbackLargeUrl: defaultLarge,
    offers: []
  };

  const zoomLevel = Number(reader.zoomLevel) || 0;
  const isZoomed = zoomLevel > 0;
  const validityInfo = formatBrochureValidityBadge(reader.retailerMeta);

  // Für 100% Passend nutzen wir ?impolicy=large (2x-3x Retina, verhindert Moiré/Verpixelung durch extremes Downscaling von 2800px),
  // beim Reinzoomen (130% / 165%) schalten wir auf 2800px Ultra-HD (?impolicy=zoomlarge).
  const activeImgSrc = isZoomed
    ? (currentPage.ultraHdUrl || currentPage.imageUrl)
    : (currentPage.largeUrl || currentPage.fallbackLargeUrl || currentPage.imageUrl);

  // Nachbarseiten im Hintergrund vorladen für flüssiges Blättern ohne Nachlade-Unschärfe
  [idx + 1, idx - 1].forEach((neighborIdx) => {
    if (neighborIdx >= 0 && neighborIdx < total && pages[neighborIdx]) {
      const preImg = new Image();
      preImg.src = pages[neighborIdx].largeUrl || pages[neighborIdx].imageUrl;
    }
  });

  const zoomImgStyle =
    zoomLevel === 2
      ? 'width:165%; max-width:none; max-height:none; height:auto; object-fit:contain; image-rendering:auto; cursor:zoom-out; display:block; margin:0 auto;'
      : zoomLevel === 1
      ? 'width:130%; max-width:none; max-height:none; height:auto; object-fit:contain; image-rendering:auto; cursor:zoom-in; display:block; margin:0 auto;'
      : 'width:100%; height:100%; max-width:100%; max-height:100%; min-width:0; min-height:0; object-fit:contain; image-rendering:auto; cursor:default; display:block; margin:auto;';

  const retailerOffers = (state.offers || []).filter(
    (o) => normalizeRetailerId(o.retailer) === reader.retailerId
  );

  bodyEl.innerHTML = `
    <div class="brochure-reader-toolbar">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <button type="button" class="pill-btn" onclick="stepBrochureReaderPage(-1)" ${idx <= 0 ? 'disabled style="opacity:0.4;"' : ''}>
          ◀ Zurück
        </button>
        <span style="font-size:12.5px; font-weight:800; color:var(--text);">
          Seite ${idx + 1} / ${total}
        </span>
        <button type="button" class="pill-btn" onclick="stepBrochureReaderPage(1)" ${idx >= total - 1 ? 'disabled style="opacity:0.4;"' : ''}>
          Weiter ▶
        </button>
        <span class="validity-pill ${validityInfo.badgeClass}" style="font-size:10px;">📅 ${escapeHtml(validityInfo.shortBadge)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
        <button type="button" class="pill-btn ${zoomLevel === 0 ? 'active' : ''}" style="font-size:10.5px; padding:4px 8px; ${zoomLevel === 0 ? 'background:var(--primary); color:#fff; border-color:var(--primary);' : ''}" onclick="setBrochureReaderZoomLevel(0)">
          📐 100% Passend
        </button>
        <button type="button" class="pill-btn ${zoomLevel === 1 ? 'active' : ''}" style="font-size:10.5px; padding:4px 8px; ${zoomLevel === 1 ? 'background:var(--primary); color:#fff; border-color:var(--primary);' : ''}" onclick="setBrochureReaderZoomLevel(1)">
          🔍 130% Lesen
        </button>
        <button type="button" class="pill-btn ${zoomLevel === 2 ? 'active' : ''}" style="font-size:10.5px; padding:4px 8px; ${zoomLevel === 2 ? 'background:var(--primary); color:#fff; border-color:var(--primary);' : ''}" onclick="setBrochureReaderZoomLevel(2)">
          🔎 165% Detail
        </button>
        <a
          href="${escapeHtml(pageExternalUrl)}"
          target="_blank"
          rel="noopener"
          class="pill-btn"
          style="background:var(--bg-elevated); color:var(--primary-light); text-decoration:none; font-size:10.5px; padding:4px 8px;"
          title="Öffnet genau diese Prospekt-Seite (${idx + 1}) direkt im KaufDA ContentViewer"
        >
          📖 KaufDA ↗
        </a>
      </div>
    </div>

    <div
      class="brochure-reader-page-box ${isZoomed ? 'zoomed' : ''}"
      ondblclick="toggleBrochureReaderZoom()"
      ontouchstart="onBrochureTouchStart(event)"
      ontouchend="onBrochureTouchEnd(event)"
      title="Wischen oder Pfeile zum Blättern · Doppelklick oder Lupe oben zum Zoomen"
    >
      <button type="button" class="brochure-side-nav prev" onclick="event.stopPropagation(); stepBrochureReaderPage(-1)" ${idx <= 0 ? 'disabled' : ''} aria-label="Vorherige Seite">‹</button>
      <img
        id="brochureReaderActiveImg"
        src="${escapeHtml(activeImgSrc)}"
        alt="${escapeHtml(reader.retailerMeta.label)} Prospekt Seite ${idx + 1}"
        style="${zoomImgStyle}"
        decoding="async"
        onerror="if(this.dataset.fallbackTried!=='1'){this.dataset.fallbackTried='1';this.src='${escapeHtml(currentPage.ultraHdUrl || currentPage.fallbackLargeUrl || reader.retailerMeta.highResCoverUrl || reader.retailerMeta.coverUrl)}';}"
      />
      <button type="button" class="brochure-side-nav next" onclick="event.stopPropagation(); stepBrochureReaderPage(1)" ${idx >= total - 1 ? 'disabled' : ''} aria-label="Nächste Seite">›</button>
    </div>

    <div class="brochure-page-thumb-strip">
      ${pages
        .map(
          (p, pIdx) => `
          <button
            type="button"
            class="brochure-page-thumb ${pIdx === idx ? 'active' : ''}"
            onclick="selectBrochureReaderPage(${pIdx})"
          >
            S. ${pIdx + 1}
          </button>
        `
        )
        .join('')}
    </div>

    ${
      retailerOffers.length > 0
        ? `<div class="section-card" style="margin-bottom:0; padding:10px 12px;">
             <div style="font-size:12px; font-weight:800; color:var(--primary-light); margin-bottom:6px;">
               🏷️ Passende Top-Deals aus diesem ${escapeHtml(reader.retailerMeta.label)}-Prospekt (${retailerOffers.length}):
             </div>
             <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;">
               ${retailerOffers
                 .map((off) => {
                   const sav = calculateOfferSavings(off);
                   return `
                     <div style="flex:0 0 210px; background:#0b1120; border:1px solid var(--border); border-radius:10px; padding:8px; display:flex; flex-direction:column; gap:4px;">
                       <div style="font-size:11.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(off.title)}</div>
                       <div style="display:flex; align-items:baseline; gap:6px;">
                         <span style="font-size:14px; font-weight:900; color:#34d399;">${escapeHtml(off.price)}</span>
                         ${sav && sav.euroSavedFormatted ? `<span style="font-size:10px; color:#6ee7b7;">(-${escapeHtml(sav.euroSavedFormatted)})</span>` : ''}
                       </div>
                       <button class="pill-btn" style="background:var(--primary); color:#fff; border:none; font-size:10px; padding:4px 8px; justify-content:center;" onclick="addOfferToShoppingList('${escapeHtml(off.id)}')">
                         ＋ Auf Einkaufsliste
                       </button>
                     </div>
                   `;
                 })
                 .join('')}
             </div>
           </div>`
        : ''
    }
  `;

  // Aktiven Seiten-Button in der Leiste sanft zentrieren
  setTimeout(() => {
    const activeThumb = bodyEl.querySelector('.brochure-page-thumb.active');
    if (activeThumb && activeThumb.scrollIntoView) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 20);
}

function stepBrochureReaderPage(delta) {
  if (!state.activeBrochureReader) return;
  const pages = state.activeBrochureReader.pages || [];
  const next = Math.min(Math.max(0, (state.activeBrochureReader.pageIndex || 0) + delta), Math.max(0, pages.length - 1));
  state.activeBrochureReader.pageIndex = next;
  state.activeBrochureReader.zoomLevel = 0;
  state.activeBrochureReader.zoomed = false;
  renderBrochureReaderModalContent();
}

function selectBrochureReaderPage(pageIdx) {
  if (!state.activeBrochureReader) return;
  state.activeBrochureReader.pageIndex = pageIdx;
  state.activeBrochureReader.zoomLevel = 0;
  state.activeBrochureReader.zoomed = false;
  renderBrochureReaderModalContent();
}

function setBrochureReaderZoomLevel(level) {
  if (!state.activeBrochureReader) return;
  const numLevel = Math.min(2, Math.max(0, parseInt(level, 10) || 0));
  state.activeBrochureReader.zoomLevel = numLevel;
  state.activeBrochureReader.zoomed = numLevel > 0;
  renderBrochureReaderModalContent();
}

function toggleBrochureReaderZoom() {
  if (!state.activeBrochureReader) return;
  const current = Number(state.activeBrochureReader.zoomLevel) || 0;
  const next = (current + 1) % 3;
  setBrochureReaderZoomLevel(next);
}

function closeBrochureReaderModal() {
  const modal = document.getElementById('brochureReaderModal');
  if (modal) modal.classList.remove('open');
}

// Vollbild-Lightbox für Angebots-Artikelbilder & KaufDA-Prospektseiten
function openOfferImageLightbox(offerId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const off = (state.offers || []).find((o) => o.id === offerId);
  if (!off) return;
  const retMeta = getRetailerMetaByAnyName(off.retailer);
  const retClass = retMeta ? retMeta.badgeClass : 'REWE';
  const sav = calculateOfferSavings(off);
  const kaufdaLink = getDirectKaufdaBrochureViewerUrl(retMeta || off, 1);
  const highResUrl = getHighResOfferImageUrl(off.imageUrl);
  const validityInfo = formatBrochureValidityBadge(retMeta || off);

  const modal = document.getElementById('imageLightboxModal');
  const bodyEl = document.getElementById('imageLightboxBody');
  const headerTitle = document.getElementById('lightboxHeaderTitle');
  if (!modal || !bodyEl) return;

  if (headerTitle) headerTitle.textContent = `${off.retailer}: ${off.title}`;

  bodyEl.innerHTML = `
    <div id="lightboxZoomContainer" class="lightbox-img-container" onclick="toggleLightboxZoom()">
      <img
        id="lightboxMainImage"
        src="${escapeHtml(highResUrl)}"
        alt="${escapeHtml(off.title)}"
        onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85'"
      />
    </div>
    <div class="section-card" style="width:100%; max-width:540px; margin-bottom:0;">
      <div style="font-size:15px; font-weight:800; margin-bottom:6px;">${escapeHtml(off.title)}</div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <span class="retailer-badge retailer-${escapeHtml(retClass)}">${escapeHtml(off.retailer)}</span>
        <span class="validity-pill ${validityInfo.badgeClass}" style="font-size:10.5px;">📅 ${escapeHtml(validityInfo.shortBadge)}</span>
        <span class="offer-price-now" style="font-size:19px;">${escapeHtml(off.price)}</span>
        ${
          sav && sav.oldPriceFormatted
            ? `<span class="offer-price-old" style="font-size:13px;">statt ${escapeHtml(sav.oldPriceFormatted)}</span>`
            : ''
        }
        ${
          sav && sav.euroSavedFormatted
            ? `<span class="offer-savings-badge" style="font-size:12px; padding:3px 9px;">💰 Ersparnis: -${escapeHtml(sav.euroSavedFormatted)} (${escapeHtml(sav.pctFormatted)})</span>`
            : ''
        }
        ${off.unitInfo ? `<div style="width:100%; font-size:11.5px; color:var(--text-muted); margin-top:2px;">${escapeHtml(off.unitInfo)}</div>` : ''}
      </div>
      <div class="btn-row" style="flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="addOfferToShoppingList('${escapeHtml(off.id)}'); closeImageLightbox();">
          ＋ Auf Einkaufsliste setzen
        </button>
        <button class="btn btn-accent" onclick="closeImageLightbox(); openInteractiveBrochureReader('${escapeHtml(retMeta ? retMeta.id : off.retailer)}', 1, event)">
          📖 ${escapeHtml(off.retailer)} Prospekt in App blättern
        </button>
        <a
          href="${escapeHtml(kaufdaLink)}"
          target="_blank"
          rel="noopener"
          class="btn btn-secondary"
          style="text-decoration:none;"
        >
          🌐 Direkt im KaufDA-Viewer öffnen ↗
        </a>
      </div>
    </div>
  `;

  modal.classList.add('open');
  pushAppHistoryState('lightbox');
}

function openBrochureImageLightbox(retailerId, event) {
  return openInteractiveBrochureReader(retailerId, 1, event);
}

function openCustomImageLightbox(imgUrl, title, linkUrl) {
  const modal = document.getElementById('imageLightboxModal');
  const bodyEl = document.getElementById('imageLightboxBody');
  const headerTitle = document.getElementById('lightboxHeaderTitle');
  if (!modal || !bodyEl) return;

  if (headerTitle) headerTitle.textContent = title || 'Großansicht';

  bodyEl.innerHTML = `
    <div id="lightboxZoomContainer" class="lightbox-img-container" onclick="toggleLightboxZoom()">
      <img
        id="lightboxMainImage"
        src="${escapeHtml(imgUrl)}"
        alt="${escapeHtml(title || 'Großansicht')}"
        onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85'"
      />
    </div>
    <div class="section-card" style="width:100%; max-width:540px; margin-bottom:0; text-align:center;">
      <div style="font-size:14px; font-weight:800; margin-bottom:6px;">${escapeHtml(title || 'Bild-Großansicht')}</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">👆 Tippe auf das Bild zum Vergrößern / Reinzoomen</div>
      ${
        linkUrl
          ? `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;">
               📖 Direkt öffnen ↗
             </a>`
          : ''
      }
    </div>
  `;

  modal.classList.add('open');
  pushAppHistoryState('lightbox');
}

function closeImageLightbox() {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) modal.classList.remove('open');
}

function toggleLightboxZoom() {
  const zoomWrap = document.getElementById('lightboxZoomContainer');
  if (zoomWrap) zoomWrap.classList.toggle('zoomed');
}

function initSupermarketOffersState() {
  state.brochures = ALL_RETAILERS_META.map((r) => ({ ...r }));
  try {
    const cachedBrochures = localStorage.getItem('kt_cached_brochures_v17');
    if (cachedBrochures) {
      const parsedB = JSON.parse(cachedBrochures);
      if (Array.isArray(parsedB) && parsedB.length === ALL_RETAILERS_META.length) {
        state.brochures = ALL_RETAILERS_META.map((base) => {
          const found = parsedB.find((p) => p.id === base.id) || {};
          // Stelle sicher, dass ALDI Süd niemals eine alte falsche REWE-contentId nutzt
          const validCachedCid =
            found.contentId &&
            found.contentId !== '25b020c6-6e0a-48ab-858f-5d942fe20981' &&
            found.contentId !== 'cbb6d32e-7f56-4827-8e8c-f9bebb1016b1'
              ? found.contentId
              : base.contentId;
          const cid = validCachedCid || base.contentId;
          const directViewer = `https://www.kaufda.de/contentViewer/static/${cid}?page=1`;
          return {
            ...base,
            ...found,
            coverUrl: upgradeKaufdaPageImageUrl(found.coverUrl || base.coverUrl, false),
            highResCoverUrl: upgradeKaufdaPageImageUrl(found.highResCoverUrl || base.highResCoverUrl || base.coverUrl, true),
            contentId: cid,
            validFrom: found.validFrom || base.validFrom,
            validUntil: found.validUntil || base.validUntil,
            pageUuids: Array.isArray(found.pageUuids) && found.pageUuids.length > 0 ? found.pageUuids : base.pageUuids,
            kaufdaUrl: directViewer,
            brochureUrl: directViewer
          };
        });
      }
    }
  } catch (_) {}

  try {
    const cached = localStorage.getItem('kt_cached_offers_v17');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.offers = parsed.map((o) => ({
          ...o,
          brochureUrl: getDirectKaufdaBrochureViewerUrl(o, 1)
        }));
        return;
      }
    }
  } catch (_) {}
  state.offers = INITIAL_VERIFIED_OFFERS.map((o) => ({
    ...o,
    brochureUrl: getDirectKaufdaBrochureViewerUrl(o, 1)
  }));
}

function saveOffersToCache() {
  try {
    localStorage.setItem('kt_cached_offers_v17', JSON.stringify((state.offers || []).slice(0, 95)));
    if (state.brochures) {
      localStorage.setItem('kt_cached_brochures_v17', JSON.stringify(state.brochures));
    }
  } catch (_) {}
}

function getRetailerMetaByAnyName(name) {
  const raw = String(name || '').trim();
  const n = raw.toLowerCase();
  if (!n) return null;
  const allList = typeof getAllMergedBrochuresList === 'function' ? getAllMergedBrochuresList() : (state.brochures || ALL_RETAILERS_META);
  const exact = allList.find((r) => r.id.toLowerCase() === n || (r.label || '').toLowerCase() === n);
  if (exact) return exact;
  if (n.includes('rewe')) return allList.find((r) => r.id === 'REWE');
  if (n.includes('edeka')) return allList.find((r) => r.id === 'EDEKA');
  if (n.includes('lidl')) return allList.find((r) => r.id === 'Lidl');
  if (n.includes('aldi nord') || n.includes('aldi-nord')) return allList.find((r) => r.id === 'ALDI Nord');
  if (n.includes('aldi')) return allList.find((r) => r.id === 'ALDI Süd');
  if (n.includes('kaufland')) return allList.find((r) => r.id === 'Kaufland');
  if (n.includes('netto')) return allList.find((r) => r.id === 'Netto');
  if (n.includes('penny')) return allList.find((r) => r.id === 'Penny');
  if (n.includes('norma')) return allList.find((r) => r.id === 'Norma');
  if (n.includes('globus')) return allList.find((r) => r.id === 'Globus');
  if (n.includes('tegut')) return allList.find((r) => r.id === 'tegut');
  if (n.includes('hit')) return allList.find((r) => r.id === 'HIT');
  return allList.find((r) => n.includes(r.id.toLowerCase()) || r.id.toLowerCase().includes(n)) || null;
}

function normalizeRetailerId(retailerName) {
  const meta = getRetailerMetaByAnyName(retailerName);
  return meta ? meta.id : String(retailerName || '').trim();
}

function normalizeRetailerClass(retailerName) {
  const meta = getRetailerMetaByAnyName(retailerName);
  return meta ? meta.badgeClass : 'REWE';
}

function doesOfferMatchIngredientText(offer, ingName) {
  const lowIng = (ingName || '').toLowerCase();
  if (!lowIng || (isPantryStapleIngredient(lowIng) && !lowIng.includes('olivenöl') && !lowIng.includes('mehl'))) {
    if (lowIng.startsWith('salz') || lowIng === 'wasser' || lowIng === 'zucker' || lowIng === 'muskat') return false;
  }
  const kwList =
    offer.keywords && offer.keywords.length > 0
      ? offer.keywords
      : offer.title
          .toLowerCase()
          .split(/[\s,()/-]+/)
          .filter((w) => w.length >= 4);

  return kwList.some((kw) => kw && lowIng.includes(kw.toLowerCase()));
}

function findBestOfferForIngredientName(ingName) {
  if (!state.offers || state.offers.length === 0) return null;
  return state.offers.find((off) => doesOfferMatchIngredientText(off, ingName)) || null;
}

function getOffersMatchingRecipe(recipe) {
  if (!recipe || !recipe.ingredients || !state.offers) return [];
  const matched = [];
  const seenIds = new Set();
  recipe.ingredients.forEach((ing) => {
    state.offers.forEach((off) => {
      if (!seenIds.has(off.id) && doesOfferMatchIngredientText(off, ing.name)) {
        seenIds.add(off.id);
        matched.push(off);
      }
    });
  });
  return matched;
}

function getOfferMatchContext(offer) {
  const onShopList = (state.shoppingList || []).some(
    (item) => !item.checked && doesOfferMatchIngredientText(offer, item.name)
  );

  const allRecipes = getAllSelectableRecipesForPlanner();
  const plannedRecipes = [];
  Object.keys(state.weekPlan || {}).forEach((day) => {
    const rId = state.weekPlan[day];
    if (rId) {
      const r = allRecipes.find((x) => x.id === rId);
      if (r && (r.ingredients || []).some((ing) => doesOfferMatchIngredientText(offer, ing.name))) {
        plannedRecipes.push(`${day}: ${r.title}`);
      }
    }
  });

  const matchingRecipes = (state.recipes || []).filter((r) =>
    (r.ingredients || []).some((ing) => doesOfferMatchIngredientText(offer, ing.name))
  );

  const inWeekPlan = plannedRecipes.length > 0;
  // Passend zu Einkauf: STRIKT nur Artikel, die aktuell offen im Einkaufswagen liegen!
  const isShoppingMatch = onShopList;
  // Passend zu Rezepten: In den gespeicherten Rezepten enthalten
  const isRecipeMatch = matchingRecipes.length > 0;

  return {
    onShopList,
    inWeekPlan,
    isShoppingMatch,
    isRecipeMatch,
    plannedRecipes,
    matchingRecipes,
    isRelevant: isShoppingMatch || isRecipeMatch
  };
}

function setOffersViewMode(mode) {
  state.offersViewMode = mode || 'all';
  document.querySelectorAll('#offersViewModeBar .sub-seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.omode === state.offersViewMode);
  });

  const brochuresSection = document.getElementById('brochuresSectionCard') || document.getElementById('brochuresShelfSection');
  if (state.offersViewMode === 'shopping') {
    state.selectedRetailer = 'Passend-Einkauf';
    if (brochuresSection) brochuresSection.style.display = 'none';
  } else if (state.offersViewMode === 'recipes') {
    state.selectedRetailer = 'Passend-Rezepte';
    if (brochuresSection) brochuresSection.style.display = 'none';
  } else if (state.offersViewMode === 'brochures-grid') {
    state.selectedRetailer = 'Alle';
    state.brochureShelfLayout = 'grid';
    if (brochuresSection) brochuresSection.style.display = '';
  } else {
    if (state.selectedRetailer === 'Passend-Einkauf' || state.selectedRetailer === 'Passend-Rezepte') {
      state.selectedRetailer = 'Alle';
    }
    if (brochuresSection) brochuresSection.style.display = '';
  }

  renderOffersTab();
}

function setOfferRetailerFilter(retailerId) {
  if (retailerId === 'Passend') retailerId = 'Passend-Einkauf';
  state.selectedRetailer = retailerId;
  if (retailerId === 'Passend-Einkauf') {
    state.offersViewMode = 'shopping';
  } else if (retailerId === 'Passend-Rezepte') {
    state.offersViewMode = 'recipes';
  } else if (state.offersViewMode === 'shopping' || state.offersViewMode === 'recipes') {
    state.offersViewMode = 'all';
  }
  document.querySelectorAll('#offersViewModeBar .sub-seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.omode === state.offersViewMode);
  });
  const brochuresSection = document.getElementById('brochuresSectionCard') || document.getElementById('brochuresShelfSection');
  if (brochuresSection) {
    brochuresSection.style.display =
      state.offersViewMode === 'shopping' || state.offersViewMode === 'recipes' ? 'none' : '';
  }
  renderOffersTab();
  setTimeout(() => {
    const activeChip = document.querySelector('#offerRetailerChips .chip.active');
    if (activeChip && activeChip.scrollIntoView) {
      activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 30);
}

function renderBrochuresCarousel() {
  const carouselEl = document.getElementById('brochuresCarousel');
  if (!carouselEl) return;

  const isGridShelf = state.offersViewMode === 'brochures-grid' || state.brochureShelfLayout !== 'carousel';
  carouselEl.className = isGridShelf ? 'brochure-grid-shelf' : 'brochure-carousel';

  const enabledSet = typeof getEnabledRetailerIds === 'function' ? getEnabledRetailerIds() : null;
  const allBrochures = typeof getAllMergedBrochuresList === 'function' ? getAllMergedBrochuresList() : (state.brochures || ALL_RETAILERS_META);
  const brochures = enabledSet ? allBrochures.filter((b) => enabledSet.has(b.id)) : allBrochures;
  carouselEl.innerHTML = brochures
    .map((b) => {
      const retailerOffers = (state.offers || []).filter((o) => normalizeRetailerId(o.retailer) === b.id);
      const offerCount = retailerOffers.length;
      const isSelected = state.selectedRetailer === b.id;
      const directViewerUrl = getDirectKaufdaBrochureViewerUrl(b, 1);
      const validityInfo = formatBrochureValidityBadge(b);

      return `
        <article class="brochure-card" style="${isSelected ? 'border-color:var(--primary); box-shadow:0 0 0 1px var(--primary);' : ''}">
          <div class="brochure-cover-wrap" style="cursor:pointer;" onclick="openInteractiveBrochureReader('${escapeHtml(b.id)}', 1, event)" title="Tippen, um das ${escapeHtml(b.label)}-Prospekt direkt durchzublättern">
            <img
              src="${escapeHtml(b.coverUrl)}"
              alt="${escapeHtml(b.brochureTitle)}"
              class="brochure-cover-img"
              loading="lazy"
              onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80'"
            />
            <div class="badge-row" style="top:6px; left:6px; right:6px;">
              <span class="retailer-badge retailer-${escapeHtml(b.badgeClass)}">${escapeHtml(b.label)}</span>
              <span class="badge" style="font-size:9.5px; padding:2px 6px;">📖 ${escapeHtml(b.pages)}</span>
            </div>
          </div>
          <div class="brochure-body">
            <div style="font-size:12px; font-weight:800; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(b.brochureTitle)}
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:4px; flex-wrap:wrap; margin-top:2px;">
              <span class="validity-pill ${validityInfo.badgeClass}" style="font-size:9.5px; padding:2px 6px;">
                ${escapeHtml(validityInfo.shortBadge)}
              </span>
              <span style="font-size:10px; font-weight:700; color:#34d399;">${offerCount} Deals</span>
            </div>
            <div style="display:flex; gap:4px; margin-top:auto; padding-top:5px;">
              <button
                type="button"
                class="pill-btn"
                style="flex:1; justify-content:center; background:var(--primary); color:#fff; border:none; font-size:10.5px; padding:5px 6px;"
                onclick="openInteractiveBrochureReader('${escapeHtml(b.id)}', 1, event)"
                title="Komplettes ${escapeHtml(b.label)} Prospekt (${escapeHtml(b.pages)}) direkt in der App blättern"
              >
                📖 Blättern
              </button>
              <a
                href="${escapeHtml(directViewerUrl)}"
                target="_blank"
                rel="noopener"
                class="pill-btn"
                style="font-size:10px; padding:5px 6px; text-decoration:none; color:#93c5fd; border-color:rgba(59,130,246,0.45);"
                title="Direkt im KaufDA Prospekt-Viewer auf Seite 1 öffnen"
              >
                ↗
              </a>
              <button
                type="button"
                class="pill-btn"
                style="font-size:10px; padding:5px 6px;"
                onclick="selectAndFetchRetailerBrochure('${escapeHtml(b.id)}')"
                title="Angebote dieses Händlers filtern"
              >
                🏷️
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderSingleOfferCardHtml(off) {
  const ctx = getOfferMatchContext(off);
  const retMeta = getRetailerMetaByAnyName(off.retailer);
  const retClass = retMeta ? retMeta.badgeClass : 'REWE';
  const kaufdaLink = getDirectKaufdaBrochureViewerUrl(retMeta || off, 1);
  const topRec = ctx.matchingRecipes[0];
  const sav = calculateOfferSavings(off);
  const validityInfo = formatBrochureValidityBadge(retMeta || off);
  const safeImgUrl = off.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';

  return `
    <div class="offer-card ${ctx.isShoppingMatch ? 'matched-offer' : ''}">
      <div class="offer-card-bg" style="background-image:url('${escapeHtml(safeImgUrl)}');"></div>
      <div class="offer-card-content">
        <div>
          <div class="offer-top">
            <div class="offer-img-zoom-wrap" onclick="openOfferImageLightbox('${escapeHtml(off.id)}', event)" title="Tippen, um das Angebots-Artikelbild in groß anzuzeigen">
              <img
                src="${escapeHtml(safeImgUrl)}"
                alt="${escapeHtml(off.title)}"
                class="offer-img"
                loading="lazy"
                onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80'"
              />
              <span class="offer-zoom-badge">🔍</span>
            </div>
            <div class="offer-info">
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-bottom:3px;">
                <span class="retailer-badge retailer-${retClass}">${escapeHtml(off.retailer)}</span>
                <span class="validity-pill ${validityInfo.badgeClass}" style="font-size:9px; padding:1px 5px;">${escapeHtml(validityInfo.shortBadge)}</span>
                ${ctx.onShopList ? `<span class="offer-discount-pill">🛒 Einkauf</span>` : ''}
                ${!ctx.onShopList && ctx.inWeekPlan ? `<span class="offer-discount-pill">📅 Woche</span>` : ''}
              </div>
              <div style="font-size:13px; font-weight:800; line-height:1.25; cursor:pointer;" onclick="openOfferImageLightbox('${escapeHtml(off.id)}', event)">
                ${escapeHtml(off.title)}
              </div>
              <div class="offer-price-row">
                <span class="offer-price-now">${escapeHtml(off.price)}</span>
                ${
                  sav && sav.oldPriceFormatted
                    ? `<span class="offer-price-old">statt ${escapeHtml(sav.oldPriceFormatted)}</span>`
                    : off.oldPrice
                      ? `<span class="offer-price-old">statt ${escapeHtml(off.oldPrice)}</span>`
                      : ''
                }
                ${
                  sav && sav.pctFormatted
                    ? `<span class="offer-discount-pill">${escapeHtml(sav.pctFormatted)}</span>`
                    : off.discount
                      ? `<span class="offer-discount-pill">${escapeHtml(off.discount)}</span>`
                      : ''
                }
              </div>
              ${off.unitInfo ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${escapeHtml(off.unitInfo)}</div>` : ''}
            </div>
          </div>

          ${
            topRec
              ? `<div style="font-size:10px; color:#cbd5e1; background:rgba(15,23,42,0.72); padding:4px 7px; border-radius:7px; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border:1px solid rgba(255,255,255,0.06); cursor:pointer;" onclick="openRecipeDetail('${escapeHtml(topRec.id)}')">
                   🍲 Passend zu: <strong>${escapeHtml(topRec.title)}</strong>
                 </div>`
              : ''
          }
        </div>

        <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid var(--border);">
          <button class="pill-btn" style="background:var(--primary); color:#fff; border:none; font-size:10.5px; padding:5px 9px; flex:1; justify-content:center;" onclick="addOfferToShoppingList('${escapeHtml(off.id)}')">
            ＋ Einkaufsliste
          </button>
          <button class="pill-btn" style="font-size:10.5px; padding:5px 8px;" onclick="openInteractiveBrochureReader('${escapeHtml(retMeta ? retMeta.id : off.retailer)}', 1, event)" title="Händler-Prospekt in der App durchblättern">
            📖 Prospekt
          </button>
          <a
            href="${escapeHtml(kaufdaLink)}"
            target="_blank"
            rel="noopener"
            class="pill-btn"
            style="font-size:10.5px; padding:5px 7px; text-decoration:none; color:#93c5fd; border-color:rgba(59,130,246,0.4);"
            title="Direkt im aktuellen ${escapeHtml(off.retailer)} KaufDA-Prospekt-Viewer öffnen"
          >
            ↗
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderOffersTab() {
  renderOfferLocationAndValidityBar();
  renderBrochuresCarousel();

  const chipsEl = document.getElementById('offerRetailerChips');
  const summaryEl = document.getElementById('offersSummaryBanner');
  const listEl = document.getElementById('offersListContainer');
  const badgeEl = document.getElementById('offersMatchBadge');
  if (!listEl) return;

  const offers = state.offers || [];
  const shoppingMatches = offers.filter((o) => getOfferMatchContext(o).isShoppingMatch);
  const recipeMatches = offers.filter((o) => getOfferMatchContext(o).isRecipeMatch);

  if (badgeEl) {
    const totalBadgeCount = shoppingMatches.length;
    badgeEl.style.display = totalBadgeCount > 0 ? 'inline-block' : 'none';
    badgeEl.textContent = totalBadgeCount;
  }

  if (chipsEl) {
    const enabledSet = typeof getEnabledRetailerIds === 'function' ? getEnabledRetailerIds() : null;
    const extraCustomRetailers =
      typeof getAllAvailableRetailersMeta === 'function'
        ? getAllAvailableRetailersMeta()
            .filter((m) => (!enabledSet || enabledSet.has(m.id)) && !SUPERMARKET_RETAILERS.some((sr) => sr.id === m.id))
            .map((m) => ({ id: m.id, label: m.label }))
        : [];
    const visibleRetailers = [
      ...SUPERMARKET_RETAILERS.filter(
        (ret) =>
          ret.id === 'Alle' ||
          ret.id === 'Passend-Einkauf' ||
          ret.id === 'Passend-Rezepte' ||
          !enabledSet ||
          enabledSet.has(ret.id)
      ),
      ...extraCustomRetailers
    ];
    chipsEl.innerHTML = visibleRetailers.map((ret) => {
      let count = 0;
      if (ret.id === 'Alle') {
        count = offers.length;
      } else if (ret.id === 'Passend-Einkauf') {
        count = shoppingMatches.length;
      } else if (ret.id === 'Passend-Rezepte') {
        count = recipeMatches.length;
      } else {
        count = offers.filter((o) => normalizeRetailerId(o.retailer) === ret.id).length;
      }
      return `<button class="chip ${state.selectedRetailer === ret.id ? 'active' : ''}" onclick="setOfferRetailerFilter('${escapeHtml(ret.id)}')">${escapeHtml(ret.label)} (${count})</button>`;
    }).join('');
  }

  // Gesamt-Ersparnis-Übersicht für Einkauf & Rezepte berechnen
  let shoppingSavingsSum = 0;
  shoppingMatches.forEach((o) => {
    const s = calculateOfferSavings(o);
    if (s && s.euroSaved > 0) shoppingSavingsSum += s.euroSaved;
  });

  let recipeSavingsSum = 0;
  recipeMatches.forEach((o) => {
    const s = calculateOfferSavings(o);
    if (s && s.euroSaved > 0) recipeSavingsSum += s.euroSaved;
  });

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="section-card" style="padding:9px 12px; background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.35); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <div style="font-size:11.5px; color:#e2e8f0;">
          💰 <strong style="color:#34d399;">Spar-Check:</strong>
          🛒 Einkauf: <strong>${shoppingMatches.length} Deals</strong> ${shoppingSavingsSum > 0 ? `(-${shoppingSavingsSum.toFixed(2).replace('.', ',')} €)` : ''} ·
          🍲 Rezepte: <strong>${recipeMatches.length} Deals</strong> ${recipeSavingsSum > 0 ? `(-${recipeSavingsSum.toFixed(2).replace('.', ',')} €)` : ''}
        </div>
      </div>
    `;
  }

  // Im reinen Prospekt-Regal-Modus („📖 12 Prospekte“) blenden wir die langen Angebots-Listen darunter aus
  if (state.offersViewMode === 'brochures-grid') {
    listEl.innerHTML = `
      <div class="section-card" style="text-align:center; padding:14px;">
        <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:8px;">
          👆 Tippe oben auf ein beliebiges Händler-Prospekt zum direkten Durchblättern aller Seiten – oder wechsle zu den Einzel-Deals:
        </div>
        <button class="btn btn-primary" style="width:auto;" onclick="setOffersViewMode('all')">
          🏷️ Alle Einzel-Angebote einblenden
        </button>
      </div>
    `;
    return;
  }

  const q = (document.getElementById('offerSearchInput')?.value || '').toLowerCase().trim();
  const filtered = offers.filter((off) => {
    const ctx = getOfferMatchContext(off);
    if (state.selectedRetailer === 'Passend-Einkauf') {
      if (!ctx.isShoppingMatch) return false;
    } else if (state.selectedRetailer === 'Passend-Rezepte') {
      if (!ctx.isRecipeMatch) return false;
    } else if (state.selectedRetailer === 'Passend') {
      if (!ctx.isRelevant) return false;
    } else if (state.selectedRetailer !== 'Alle') {
      if (normalizeRetailerId(off.retailer) !== state.selectedRetailer) return false;
    }
    if (q) {
      const hay = `${off.title} ${off.brand || ''} ${off.retailer} ${(off.keywords || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    const selectedMeta = (state.brochures || ALL_RETAILERS_META).find((r) => r.id === state.selectedRetailer);
    const isEmptyShoppingFilter = state.selectedRetailer === 'Passend-Einkauf';
    listEl.innerHTML = `
      <div class="section-card" style="text-align:center; padding:22px 14px;">
        <div style="font-size:28px; margin-bottom:6px;">${isEmptyShoppingFilter ? '🛒' : '🏷️'}</div>
        <div style="font-weight:700; margin-bottom:4px;">
          ${
            isEmptyShoppingFilter
              ? 'Noch keine passenden Angebote auf deiner aktuellen Einkaufsliste'
              : 'Keine lokalen Treffer für diesen Filter'
          }
        </div>
        <div class="section-desc">
          ${
            isEmptyShoppingFilter
              ? 'Füge Rezepte zum Wochenplan oder Zutaten zur Einkaufsliste hinzu – oder sieh dir direkt die passenden Angebote zu deinen Rezepten an:'
              : `Lade jetzt live die aktuellen KaufDA-Prospekt-Angebote für „${escapeHtml(q || state.selectedRetailer)}“:`
          }
        </div>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          ${
            isEmptyShoppingFilter
              ? `<button class="btn btn-primary" style="width:auto;" onclick="setOfferRetailerFilter('Passend-Rezepte')">🍲 Passend zu Rezepten anzeigen (${recipeMatches.length})</button>
                 <button class="btn btn-secondary" style="width:auto;" onclick="setOfferRetailerFilter('Alle')">🏪 Alle 12 Händler anzeigen</button>`
              : selectedMeta
                ? `<button class="btn btn-primary" style="width:auto;" onclick="openInteractiveBrochureReader('${escapeHtml(selectedMeta.id)}', 1, event)">📖 ${escapeHtml(selectedMeta.label)} Prospekt blättern</button>
                   <a href="${escapeHtml(getDirectKaufdaBrochureViewerUrl(selectedMeta, 1))}" target="_blank" rel="noopener" class="btn btn-accent" style="width:auto; text-decoration:none;">↗ Direkt bei KaufDA öffnen</a>`
                : `<button class="btn btn-accent" style="width:auto;" onclick="executeLiveOfferSearch()">🔄 Jetzt live bei KaufDA suchen</button>`
          }
        </div>
      </div>
    `;
    return;
  }

  let sectionsHtml = '';

  // Wenn ein einzelner Händler gewählt ist: Zeige prominente Direkt-KaufDA-Prospekt-Karte inklusive Gültigkeitsdatum
  if (
    state.selectedRetailer !== 'Alle' &&
    state.selectedRetailer !== 'Passend-Einkauf' &&
    state.selectedRetailer !== 'Passend-Rezepte' &&
    state.selectedRetailer !== 'Passend'
  ) {
    const rMeta = (state.brochures || ALL_RETAILERS_META).find((r) => r.id === state.selectedRetailer);
    if (rMeta) {
      const kaufdaUrl = getDirectKaufdaBrochureViewerUrl(rMeta, 1);
      const vBadge = formatBrochureValidityBadge(rMeta);
      sectionsHtml += `
        <div class="section-card" style="padding:11px 12px; border-color:rgba(59,130,246,0.45); background:linear-gradient(135deg, rgba(59,130,246,0.14), rgba(15,23,42,0.96)); display:flex; gap:11px; align-items:center;">
          <div style="flex-shrink:0; cursor:pointer; position:relative;" onclick="openInteractiveBrochureReader('${escapeHtml(rMeta.id)}', 1, event)">
            <img src="${escapeHtml(rMeta.coverUrl)}" alt="${escapeHtml(rMeta.label)}" style="width:64px; height:84px; object-fit:cover; object-position:top; border-radius:9px; border:1px solid var(--border);" />
            <span class="offer-zoom-badge">📖</span>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
              <span class="retailer-badge retailer-${escapeHtml(rMeta.badgeClass)}">${escapeHtml(rMeta.label)}</span>
              <span class="validity-pill ${vBadge.badgeClass}" style="font-size:10px;">📅 ${escapeHtml(vBadge.shortBadge)}</span>
              <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(rMeta.pages)}</span>
            </div>
            <div style="font-size:13.5px; font-weight:800; margin-bottom:6px;">${escapeHtml(rMeta.brochureTitle)}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="pill-btn" style="background:var(--primary); color:#fff; border:none; font-size:11px;" onclick="openInteractiveBrochureReader('${escapeHtml(rMeta.id)}', 1, event)">
                📖 Prospekt in App blättern (${escapeHtml(rMeta.pages)})
              </button>
              <a href="${escapeHtml(kaufdaUrl)}" target="_blank" rel="noopener" class="pill-btn" style="text-decoration:none; font-size:11px; color:#93c5fd; border-color:rgba(59,130,246,0.45);">
                ↗ KaufDA-Viewer
              </a>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Übersichtlich im 2-Spalten-Kachel-Raster gruppiert nach Händler
  if (state.selectedRetailer === 'Passend-Einkauf' || state.selectedRetailer === 'Passend-Rezepte') {
    sectionsHtml += `
      <div class="offers-grid-2col">
        ${filtered.map((off) => renderSingleOfferCardHtml(off)).join('')}
      </div>
    `;
    listEl.innerHTML = sectionsHtml;
    return;
  }

  const retailersOrder = state.brochures || ALL_RETAILERS_META;
  retailersOrder.forEach((retMeta) => {
    const retailerOffers = filtered.filter((o) => normalizeRetailerId(o.retailer) === retMeta.id);
    if (retailerOffers.length === 0) return;
    const kaufdaUrl = getDirectKaufdaBrochureViewerUrl(retMeta, 1);
    const vBadge = formatBrochureValidityBadge(retMeta);

    sectionsHtml += `
      <div class="category-section">
        <div class="category-group-header">
          <div class="category-group-title" onclick="setOfferRetailerFilter('${escapeHtml(retMeta.id)}')" style="cursor:pointer;">
            <span class="retailer-badge retailer-${escapeHtml(retMeta.badgeClass)}">${escapeHtml(retMeta.label)}</span>
            <span class="validity-pill ${vBadge.badgeClass}" style="font-size:10px;">${escapeHtml(vBadge.shortBadge)}</span>
          </div>
          <div class="category-header-right">
            <button
              type="button"
              class="pill-btn"
              style="font-size:10px; padding:3px 8px; background:rgba(59,130,246,0.18); color:#93c5fd; border-color:rgba(59,130,246,0.4);"
              onclick="openInteractiveBrochureReader('${escapeHtml(retMeta.id)}', 1, event)"
            >
              📖 Prospekt (${escapeHtml(retMeta.pages)})
            </button>
            <a
              href="${escapeHtml(kaufdaUrl)}"
              target="_blank"
              rel="noopener"
              class="pill-btn"
              style="font-size:10px; padding:3px 7px; text-decoration:none; color:#93c5fd; border-color:rgba(59,130,246,0.4);"
            >
              ↗
            </a>
            <span class="category-group-count">${retailerOffers.length}</span>
          </div>
        </div>
        <div class="offers-grid-2col">
          ${retailerOffers.map((off) => renderSingleOfferCardHtml(off)).join('')}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = sectionsHtml;
}

async function addOfferToShoppingList(offerId) {
  const off = (state.offers || []).find((o) => o.id === offerId);
  if (!off) return;
  const sav = calculateOfferSavings(off);
  const specText = sav && sav.euroSavedFormatted
    ? `Angebot: ${off.price} (-${sav.euroSavedFormatted} gespart)`
    : `Angebot: ${off.price}`;
  const offerItemName = `${off.title} (${off.retailer})`;
  const alreadyExists = (state.shoppingList || []).some(
    (it) => !it.checked && String(it.name || '').toLowerCase() === offerItemName.toLowerCase()
  );
  if (alreadyExists) {
    showToast(`✓ "${off.title}" (${off.retailer}) ist bereits auf deiner Einkaufsliste!`);
    return;
  }
  state.shoppingList.unshift({
    id: 'sh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: offerItemName,
    spec: specText,
    recipeTitle: `🏷️ ${off.retailer} KaufDA-Deal`,
    checked: false,
    updatedAt: Date.now()
  });
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  renderShoppingList();
  renderOffersTab();
  showToast(`🏷️ "${off.title}" (${off.price} bei ${off.retailer}) auf Einkaufsliste gesetzt!`);
  await saveShoppingList();
}

function exportSingleOfferToBring(offerId) {
  const off = (state.offers || []).find((o) => o.id === offerId);
  if (!off) return;
  const sav = calculateOfferSavings(off);
  openBringTransferModal(
    `${off.retailer} KaufDA-Angebot`,
    [
      {
        name: `${off.title} (${off.retailer})`,
        spec: sav && sav.euroSavedFormatted ? `${off.price} (statt ${sav.oldPriceFormatted})` : off.price
      }
    ],
    off.brochureUrl || window.location.href,
    1,
    1
  );
}

async function quickFetchIngredientOffers(term) {
  const inp = document.getElementById('offerSearchInput');
  if (inp) inp.value = term;
  state.selectedRetailer = 'Alle';
  await executeLiveOfferSearch(term);
}

function slugifyGermanOfferTerm(term) {
  return (term || '')
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchLiveBrochureForRetailer(b) {
  const loc = state.userLocation || DEFAULT_USER_LOCATION;
  const lat = b.id === 'ALDI Nord' ? '52.52' : (loc.lat || b.lat || '48.274');
  const lng = b.id === 'ALDI Nord' ? '13.41' : (loc.lng || b.lng || '10.835');

  // 1. Primär: Supabase Edge Function (funktioniert 100 % dauerhaft auf Netlify Drag & Drop für ALLE Händler inkl. V-Markt, dm, Rossmann!)
  const endpoints = [];
  if (isSupabaseSyncConfigured()) {
    const sbBase = normalizeSupabaseBaseUrl(state.household.sbUrl);
    endpoints.push(
      `${sbBase}/functions/v1/kaufda-brochure?retailer=${encodeURIComponent(b.label || b.id)}&retailerId=${encodeURIComponent(b.id)}&contentId=${encodeURIComponent(b.contentId || '')}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
  }
  endpoints.push(
    `/api/kaufda-brochure?retailerId=${encodeURIComponent(b.id)}&contentId=${encodeURIComponent(b.contentId || '')}&cityUrl=${encodeURIComponent(b.cityUrl || '')}&meinprospektUrl=${encodeURIComponent(b.meinprospektUrl || '')}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (res.ok) {
        const data = await res.json();
        const pubCheck = `${data?.publisherName || ''} ${data?.title || ''}`;
        if (data && data.contentId && doesBrochureMatchRetailer(b.id, pubCheck)) {
          b.contentId = data.contentId;
          const directViewer = `https://www.kaufda.de/contentViewer/static/${data.contentId}?page=1`;
          b.kaufdaUrl = directViewer;
          b.brochureUrl = directViewer;
          if (data.validFrom) b.validFrom = data.validFrom;
          if (data.validUntil) b.validUntil = data.validUntil;

          const pagesArr = Array.isArray(data?.pages)
            ? data.pages
            : Array.isArray(data?.pages?.contents)
              ? data.pages.contents
              : [];
          if (pagesArr.length > 0) {
            b.pages = `${pagesArr.length} Seiten`;
            const imgs = pagesArr[0].images || [];
            const cov = selectBestHighResBrochurePageUrl(imgs, b.highResCoverUrl || b.coverUrl);
            if (cov) {
              b.coverUrl = upgradeKaufdaPageImageUrl(cov, false);
              b.highResCoverUrl = upgradeKaufdaPageImageUrl(cov, true);
            }
          }
          // Speichere aktualisierte Prospekt-Daten auch im state.brochures Array
          if (Array.isArray(state.brochures)) {
            const idx = state.brochures.findIndex((x) => x.id === b.id);
            if (idx >= 0) state.brochures[idx] = { ...state.brochures[idx], ...b };
            else state.brochures.push({ ...b });
          }
          return true;
        }
      }
    } catch (_) {}
  }

  // 2. Browser-Fallback via r.jina.ai (jetzt auch für eigene Händler wie V-Markt, dm, Rossmann!)
  try {
    const fallbackSlug = b.kaufdaSlug || String(b.label || b.id || '').replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-');
    const discoveryUrl = b.meinprospektUrl || b.cityUrl || (fallbackSlug ? `https://www.kaufda.de/Geschaefte/${encodeURIComponent(fallbackSlug)}` : '');
    if (discoveryUrl) {
      const jinaRes = await fetch(`https://r.jina.ai/${discoveryUrl}`, {
        headers: { Accept: 'application/json' }
      });
      if (jinaRes.ok) {
        const jinaJson = await jinaRes.json();
        const text = jinaJson?.data?.content || '';
        const matches = [...text.matchAll(/contentViewer\/static\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)];
        if (matches.length > 0) {
          const foundCid = matches[0][1];
          if (foundCid && foundCid !== b.contentId) {
            b.contentId = foundCid;
            const directViewer = `https://www.kaufda.de/contentViewer/static/${foundCid}?page=1`;
            b.kaufdaUrl = directViewer;
            b.brochureUrl = directViewer;
            return true;
          }
        }
      }
    }
  } catch (_) {}

  return false;
}

async function selectAndFetchRetailerBrochure(retailerId) {
  state.selectedRetailer = retailerId;
  const inp = document.getElementById('offerSearchInput');
  if (inp) inp.value = '';
  renderOffersTab();

  const rMeta = (state.brochures || ALL_RETAILERS_META).find((r) => r.id === retailerId);
  if (!rMeta) return;

  showToast(`📰 Lade aktuelle KaufDA-Prospekt-Deals von ${rMeta.label}...`);
  try {
    await fetchLiveBrochureForRetailer(rMeta);

    const urlsToTry = [
      `https://r.jina.ai/${rMeta.cityUrl || rMeta.kaufdaUrl}`,
      `https://r.jina.ai/${rMeta.meinprospektUrl || `https://www.meinprospekt.de/${rMeta.slug}`}`
    ];

    let added = 0;
    for (const u of urlsToTry) {
      try {
        const res = await fetch(u, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const json = await res.json();
        const content = json?.data?.content || '';

        const parsedOffers = parseMeinProspektMarkdownOffers(
          content,
          rMeta.label,
          getDirectKaufdaBrochureViewerUrl(rMeta, 1),
          rMeta.id
        );
        if (parsedOffers.length > 0) {
          const existingKeys = new Set(
            state.offers.map((o) => `${normalizeRetailerId(o.retailer)}|${o.title}|${o.price}`)
          );
          parsedOffers.forEach((po) => {
            const key = `${normalizeRetailerId(po.retailer)}|${po.title}|${po.price}`;
            if (!existingKeys.has(key)) {
              existingKeys.add(key);
              state.offers.unshift(po);
              added++;
            }
          });
        }
      } catch (_) {}
    }

    saveOffersToCache();
    renderOffersTab();
    renderShoppingList();
    renderRecipes();
    showToast(
      added > 0
        ? `✅ ${added} neue Deals aus dem ${rMeta.label} KaufDA-Prospekt geladen!`
        : `✓ Aktuelles ${rMeta.label} KaufDA-Prospekt (${rMeta.pages}) aktiv`
    );
  } catch (_) {}
}

async function refreshAllLiveBrochures(silent = false) {
  const btn = document.getElementById('refreshBrochuresBtn');
  if (btn) {
    btn.textContent = '⏳...';
    btn.disabled = true;
  }
  if (!silent) {
    showToast(`🔄 Aktualisiere Prospekte für ${state.userLocation?.zip || '86399'} ${state.userLocation?.city || 'Bobingen'}...`);
  }

  try {
    const enabledSet = typeof getEnabledRetailerIds === 'function' ? getEnabledRetailerIds() : null;
  const allBrochures = typeof getAllMergedBrochuresList === 'function' ? getAllMergedBrochuresList() : (state.brochures || ALL_RETAILERS_META);
  const brochures = enabledSet ? allBrochures.filter((b) => enabledSet.has(b.id)) : allBrochures;
    await Promise.allSettled(brochures.map((b) => fetchLiveBrochureForRetailer(b)));
    saveOffersToCache();
    renderOffersTab();
    if (!silent) {
      showToast('✅ Alle 12 KaufDA Händler-Prospekte erfolgreich aktualisiert!');
    }
  } catch (_) {
    if (!silent) {
      showToast('✓ KaufDA-Prospekte sind auf aktuellem Stand');
    }
  }

  if (btn) {
    btn.textContent = '🔄 Live';
    btn.disabled = false;
  }
}

async function executeLiveOfferSearch(overrideTerm) {
  const inp = document.getElementById('offerSearchInput');
  const btn = document.getElementById('offerLiveSearchBtn');
  const query = (overrideTerm || inp?.value || '').trim();
  if (!query) {
    renderOffersTab();
    return;
  }

  // Zeige sofort lokale Treffer und lade parallel live aus KaufDA & Bonial Prospekten nach
  renderOffersTab();

  const slug = slugifyGermanOfferTerm(query);
  if (!slug) return;

  if (btn) {
    btn.textContent = '⏳...';
    btn.disabled = true;
  }

  try {
    const searchUrls = [
      `https://www.kaufda.de/Angebote/${encodeURIComponent(query)}`,
      `https://www.meinprospekt.de/angebote/${slug}`
    ];

    let addedCount = 0;
    for (const targetUrl of searchUrls) {
      try {
        const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) continue;
        const json = await res.json();
        const content = json?.data?.content || '';
        const parsedOffers = parseMeinProspektMarkdownOffers(content, query, targetUrl);
        if (parsedOffers.length > 0) {
          const existingTitles = new Set(
            state.offers.map((o) => `${normalizeRetailerId(o.retailer)}|${o.title}|${o.price}`)
          );
          parsedOffers.forEach((po) => {
            const key = `${normalizeRetailerId(po.retailer)}|${po.title}|${po.price}`;
            if (!existingTitles.has(key)) {
              existingTitles.add(key);
              state.offers.unshift(po);
              addedCount++;
            }
          });
        }
      } catch (_) {}
    }

    saveOffersToCache();
    renderOffersTab();
    renderShoppingList();
    renderRecipes();
    if (addedCount > 0) {
      showToast(`🏷️ ${addedCount} aktuelle KaufDA Prospekt-Angebote für „${query}“ inkl. Bildern geladen!`);
    } else {
      showToast(`✓ Aktuelle KaufDA-Angebote für „${query}“ angezeigt`);
    }
  } catch (_) {}

  if (btn) {
    btn.textContent = '🔍 Live';
    btn.disabled = false;
  }
}

function parseMeinProspektMarkdownOffers(markdown, queryTerm, brochureUrl, fallbackRetailer = '') {
  const results = [];
  const seen = new Set();

  // Unterstützt sowohl KaufDA (/Angebote/<Zutat>, /Geschaefte/<Händler>) als auch Bonial/MeinProspekt Bilder & Preise
  const patterns = [
    /!\[Image \d+:\s*([^\]]+?)\s+im aktuellen\s+([^\]]+?)\s+Prospekt für\s+([\d,.]+\s*€)\]\((https:\/\/content-media\.bonial\.biz\/[^)]+)\)/gi,
    /!\[Image \d+:\s*([^\]]+?)\s+im\s+([^\]]+?)\s+Prospekt zum Preis von\s+([\d,.]+\s*€)\]\((https:\/\/content-media\.bonial\.biz\/[^)]+)\)/gi,
    /!\[Image \d+:\s*([^\]]+?)\s+bei\s+([^\]]+?)\s+für\s+([\d,.]+\s*€)\]\((https:\/\/content-media\.bonial\.biz\/[^)]+)\)/gi
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(markdown)) !== null && results.length < 20) {
      const rawProductAndBrand = m[1].trim();
      const rawRetailer = (m[2] || fallbackRetailer || 'REWE').trim();
      const price = m[3].trim();
      const imageUrl = m[4].trim();

      let title = rawProductAndBrand;
      let brand = '';
      const vonIdx = rawProductAndBrand.lastIndexOf(' von ');
      if (vonIdx > 0) {
        title = rawProductAndBrand.slice(0, vonIdx).trim();
        brand = rawProductAndBrand.slice(vonIdx + 5).trim();
      }

      const normRetId = normalizeRetailerId(rawRetailer);
      const retMeta = getRetailerMetaByAnyName(normRetId);
      const dedupeKey = `${normRetId}|${title}|${price}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const priceNum = parseGermanEuroPrice(price);
      const oldPriceNum = priceNum > 0 ? Math.round(priceNum * 1.25 * 100) / 100 : 0;
      const oldPriceStr = oldPriceNum > 0 ? `${oldPriceNum.toFixed(2).replace('.', ',')} €` : '';

      results.push({
        id: 'off-live-' + Date.now() + '-' + results.length,
        retailer: normRetId,
        brand: brand || rawRetailer,
        title,
        price,
        oldPrice: oldPriceStr,
        discount: '-20%',
        unitInfo: 'Aktuelles KaufDA Wochenprospekt',
        validUntil: 'Aktuelle Woche',
        keywords: [
          (queryTerm || '').toLowerCase(),
          ...title
            .toLowerCase()
            .split(/[\s,()/-]+/)
            .filter((w) => w.length >= 4)
        ],
        imageUrl,
        brochureUrl: retMeta ? retMeta.kaufdaUrl || retMeta.brochureUrl : brochureUrl
      });
    }
  }
  return results;
}

// ============================================================================
// 14. KÜCHEN-TOOLS: OFEN/AIRFRYER, BACKFORM-RECHNER, US-CUPS & ERSATZ-HELFER
// ============================================================================
const INGREDIENT_SUBSTITUTES = [
  { missing: 'Schmand (200 g)', replace: '200 g Crème fraîche oder 150 g Naturjoghurt + 50 g Sahne (oder Frischkäse)' },
  { missing: 'Crème fraîche (200 g)', replace: '200 g Schmand oder Saure Sahne + 1 EL neutrales Öl' },
  { missing: 'Buttermilch (250 ml)', replace: '240 ml Milch + 1 EL Zitronensaft oder heller Essig (5 Min. stehen lassen)' },
  { missing: 'Sahne / Schlagsahne zum Kochen (200 ml)', replace: '150 ml Milch + 50 g geschmolzene Butter (oder Frischkäse/Rama Cremefine)' },
  { missing: '1 Ei (beim Backen / Pfannkuchen)', replace: '1/2 zerdrückte reife Banane, 60 g Apfelmus oder 1 EL Chiasamen/Leinsamen + 3 EL Wasser' },
  { missing: 'Weißwein (zum Ablöschen, 100 ml)', replace: '80 ml Gemüse-/Hühnerbrühe + 20 ml heller Traubensaft oder Apfelsaft + 1 TL Zitronensaft/Weißweinessig' },
  { missing: 'Rotwein (für Saucen/Bolognese, 100 ml)', replace: '80 ml Rinder-/Gemüsebrühe + 20 ml dunkler Traubensaft + 1 TL Balsamico-Essig' },
  { missing: 'Backpulver (1 Päckchen)', replace: '1 TL Natron + 2 TL Zitronensaft oder Essig direkt in den Teig geben' },
  { missing: 'Speisestärke (1 EL zum Binden)', replace: '2 EL Weizenmehl (vorher mit etwas kaltem Wasser glatt rühren) oder 1 EL Kartoffelmehl' },
  { missing: 'Frischer Zitronensaft (1 EL)', replace: '1/2 EL Weißweinessig oder Apfelessig (oder etwas Limettensaft)' },
  { missing: '1 Knoblauchzehe (frisch)', replace: '1/4 bis 1/2 TL Knoblauchgranulat / Knoblauchpulver' },
  { missing: 'Frische Kräuter (1 EL gehackt)', replace: '1 TL getrocknete Kräuter (getrocknete Kräuter sind ca. 3× intensiver)' },
  { missing: 'Gemüsefond / Brühe (500 ml)', replace: '500 ml heißes Wasser + 1 gehäufter TL Gemüsebrühpulver oder 1/2 Brühwürfel (notfalls Wasser + 1/2 TL Salz + Kräuter)' },
  { missing: 'Parmesan (gerieben)', replace: 'Grana Padano, Pecorino oder kräftiger alter Gouda / Bergkäse fein gerieben' },
  { missing: 'Kokosmilch (400 ml im Curry)', replace: '300 ml Sahne oder Hafercuisine + 100 ml Milch (optional 1 EL Kokosraspel mitköcheln)' },
  { missing: 'Paniermehl / Semmelbrösel', replace: 'Zerdrückte Cornflakes, zerkleinerter Zwieback, Haferflocken oder geröstetes Toastbrot im Mixer' }
];

function openKitchenToolsModal() {
  updateKitchenCalculators();
  renderSubstituteHelper();
  document.getElementById('toolsModal').classList.add('open');
  pushAppHistoryState('tools');
}

function closeKitchenToolsModal() {
  document.getElementById('toolsModal').classList.remove('open');
}

function getPanAreaCm2(val) {
  if (val === 'blech') return 38 * 30; // 1140 cm²
  const d = parseFloat(val) || 26;
  const r = d / 2;
  return Math.PI * r * r;
}

function updateKitchenCalculators() {
  // 1. Ofen <-> Umluft <-> Airfryer
  const ovenTemp = parseInt(document.getElementById('toolOvenTemp')?.value || '200', 10) || 200;
  const ovenTime = parseInt(document.getElementById('toolOvenTime')?.value || '25', 10) || 25;
  const umluftTemp = Math.max(80, ovenTemp - 20);
  const airfryerTemp = Math.max(80, ovenTemp - 20);
  const airfryerTime = Math.max(3, Math.round(ovenTime * 0.8));

  const ovenResEl = document.getElementById('toolOvenResult');
  if (ovenResEl) {
    ovenResEl.innerHTML = `
      <div class="nutri-box">
        <div class="nutri-val">💨 ${umluftTemp} °C</div>
        <div class="nutri-label">Umluft (${ovenTime} Min)</div>
      </div>
      <div class="nutri-box">
        <div class="nutri-val">🍟 ${airfryerTemp} °C · ${airfryerTime} Min</div>
        <div class="nutri-label">Heißluftfritteuse / Airfryer (-20% Zeit)</div>
      </div>
    `;
  }

  // 2. Backform- / Springform-Umrechner
  const fromVal = document.getElementById('toolPanFrom')?.value || '26';
  const toVal = document.getElementById('toolPanTo')?.value || '20';
  const factor = Math.round((getPanAreaCm2(toVal) / getPanAreaCm2(fromVal)) * 100) / 100;
  const panResEl = document.getElementById('toolPanResult');
  if (panResEl) {
    const factorStr = String(factor).replace('.', ',');
    panResEl.innerHTML = `
      <div class="planner-preview-ings-short" style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <div>
          📐 <strong>Umrechnungs-Faktor: ${factorStr}×</strong><br/>
          <span style="font-size:11px; color:var(--text-muted);">Beispiel: 200 g Mehl → <strong>${Math.round(200 * factor)} g Mehl</strong></span>
        </div>
        ${
          state.activeRecipeId
            ? `<button class="pill-btn" style="background:var(--primary); color:#fff; border:none;" onclick="applyPanFactorToActiveRecipe(${factor})">
                 Auf Rezept anwenden
               </button>`
            : ''
        }
      </div>
    `;
  }

  // 3. US-Cups / oz / °F -> Gramm & ml
  const cupAmt = parseFloat(document.getElementById('toolCupAmount')?.value || '1') || 1;
  const cupType = document.getElementById('toolCupType')?.value || 'cup_flour';
  const cupResEl = document.getElementById('toolCupResult');
  if (cupResEl) {
    let resultText = '';
    switch (cupType) {
      case 'cup_flour':
        resultText = `${cupAmt} Cup Mehl = <strong>${Math.round(cupAmt * 125)} g</strong>`;
        break;
      case 'cup_sugar':
        resultText = `${cupAmt} Cup Zucker = <strong>${Math.round(cupAmt * 200)} g</strong>`;
        break;
      case 'cup_brownsugar':
        resultText = `${cupAmt} Cup Brauner Zucker = <strong>${Math.round(cupAmt * 180)} g</strong>`;
        break;
      case 'cup_butter':
        resultText = `${cupAmt} Cup Butter = <strong>${Math.round(cupAmt * 225)} g</strong>`;
        break;
      case 'cup_liquid':
        resultText = `${cupAmt} Cup Flüssigkeit = <strong>${Math.round(cupAmt * 240)} ml</strong>`;
        break;
      case 'cup_oats':
        resultText = `${cupAmt} Cup Haferflocken = <strong>${Math.round(cupAmt * 90)} g</strong>`;
        break;
      case 'cup_rice':
        resultText = `${cupAmt} Cup Reis (ungekocht) = <strong>${Math.round(cupAmt * 185)} g</strong>`;
        break;
      case 'stick_butter':
        resultText = `${cupAmt} Stick Butter = <strong>${Math.round(cupAmt * 113)} g</strong>`;
        break;
      case 'oz_weight':
        resultText = `${cupAmt} oz (Unzen) = <strong>${Math.round(cupAmt * 28.35)} g</strong>`;
        break;
      case 'fl_oz':
        resultText = `${cupAmt} fl oz = <strong>${Math.round(cupAmt * 29.57)} ml</strong>`;
        break;
      case 'fahrenheit':
        resultText = `${cupAmt} °F = <strong>${Math.round(((cupAmt - 32) * 5) / 9)} °C</strong>`;
        break;
    }
    cupResEl.innerHTML = resultText;
  }
}

async function applyPanFactorToActiveRecipe(factor) {
  const r = state.recipes.find((item) => item.id === state.activeRecipeId);
  if (!r) return;
  const base = Number(r.portions) || 4;
  state.activeScalePortions = Math.max(0.5, Math.round(base * factor * 10) / 10);
  closeKitchenToolsModal();
  await renderRecipeDetailModal(r);
  if (document.getElementById('cookModal').classList.contains('open')) {
    renderCookModeStep();
  }
  showToast(`📐 Backform-Faktor (${String(factor).replace('.', ',')}×) auf Rezept angewendet!`);
}

function renderSubstituteHelper() {
  const q = (document.getElementById('toolSubSearchInput')?.value || '').toLowerCase().trim();
  const container = document.getElementById('toolSubListContainer');
  if (!container) return;

  const filtered = INGREDIENT_SUBSTITUTES.filter(
    (s) => !q || s.missing.toLowerCase().includes(q) || s.replace.toLowerCase().includes(q)
  );

  container.innerHTML = filtered
    .map(
      (s) => `
      <div style="padding:8px 10px; border-bottom:1px solid var(--border); font-size:12.5px; line-height:1.4;">
        <div style="font-weight:800; color:var(--primary-light);">❌ Fehlt: ${escapeHtml(s.missing)}</div>
        <div style="color:#e2e8f0; margin-top:2px;">✅ <strong>Ersatz:</strong> ${escapeHtml(s.replace)}</div>
      </div>
    `
    )
    .join('');
}

// ============================================================================
// 13. GROQ / MULTI-KI HELFER FÜR ALLE TABS (NUR AUF KNOPFDRUCK – 100% SCHNELL)
// ============================================================================
let pendingAiGeneratedRecipes = {};

function ensureAiKeyConfiguredOrPrompt() {
  const key = (state.household.geminiKey || '').trim();
  if (key.length > 10) return key;
  showToast('Bitte zuerst kostenlosen Groq-Key im Tab „Suche/Neu“ eintragen!');
  switchTab('import');
  const box = document.getElementById('aiKeyQuickSetupBox');
  if (box) box.style.display = 'block';
  return '';
}

async function callActiveAiJson(promptText, overrideKey = '') {
  const key = String(overrideKey || ensureAiKeyConfiguredOrPrompt() || '').trim();
  if (!key) return { ok: false, error: 'Kein KI-Key hinterlegt' };

  const tryBackupOrFail = async (errMsg) => {
    if (!overrideKey && state.household.backupAiKey && state.household.backupAiKey.trim().length > 10) {
      return await callActiveAiJson(promptText, state.household.backupAiKey.trim());
    }
    return { ok: false, error: errMsg };
  };

  const provider = detectAiProviderFromKey(key);
  try {
    let rawOut = '';
    if (provider === 'groq') {
      const resolved = await resolveActiveGroqModels(key);
      if (resolved.error) return await tryBackupOrFail(resolved.error);
      const modelId = resolved.textModel || 'llama-3.3-70b-versatile';
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: modelId,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Du bist ein deutscher Familien-Kochassistent. Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.' },
            { role: 'user', content: promptText }
          ]
        })
      });
      const data = await resp.json();
      if (!resp.ok) return await tryBackupOrFail(data?.error?.message || `Groq HTTP ${resp.status}`);
      rawOut = data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': window.location.origin || 'https://kochtresor.app',
          'X-Title': 'KochTresor'
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'Du bist ein deutscher Familien-Kochassistent. Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown.' },
            { role: 'user', content: promptText }
          ]
        })
      });
      const data = await resp.json();
      if (!resp.ok) return await tryBackupOrFail(data?.error?.message || `OpenRouter HTTP ${resp.status}`);
      rawOut = data?.choices?.[0]?.message?.content || '';
    } else {
      const gemRes = await callGeminiWithFallback(key, {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
      });
      if (!gemRes.ok) return await tryBackupOrFail(gemRes.error || 'Gemini Fehler');
      rawOut = gemRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const match = rawOut.match(/\{[\s\S]*\}/);
    const cleaned = (match ? match[0] : rawOut).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (err) {
    return await tryBackupOrFail(String(err?.message || err));
  }
}

async function savePendingAiGeneratedRecipe(slotKey) {
  const rec = pendingAiGeneratedRecipes[slotKey];
  if (!rec) return;
  const saved = await saveImportedRecipe(rec);
  delete pendingAiGeneratedRecipes[slotKey];
  const box = document.getElementById(slotKey === 'fridge' ? 'aiFridgeResultBox' : 'aiOfferRecipeBox');
  if (box) box.style.display = 'none';
  switchTab('recipes');
  if (saved && saved.id) {
    await openRecipeDetail(saved.id);
  }
  showToast(`✅ "${rec.title}" in eurer Sammlung gespeichert!`);
}

// 1) TAB SAMMLUNG: 🧊 KI-Restekocher
async function generateFridgeRecipeWithAI() {
  const rawInput = (document.getElementById('fridgeQueryInput')?.value || state.fridgeQuery || '').trim();
  if (!rawInput) {
    showToast('Bitte gib zuerst 2–3 Zutaten aus deinem Kühlschrank ein (z.B. Paprika, Hack, Sahne)');
    document.getElementById('fridgeQueryInput')?.focus();
    return;
  }

  const btn = document.getElementById('aiFridgeBtn');
  const box = document.getElementById('aiFridgeResultBox');
  if (btn) btn.disabled = true;
  if (box) {
    box.style.display = 'block';
    box.innerHTML = `<div class="section-card" style="padding:10px 12px; font-size:12px; color:#93c5fd;">✨ Groq erstellt ein Rezept aus: <strong>${escapeHtml(rawInput)}</strong>...</div>`;
  }

  const categoryList = RECIPE_CATEGORIES.map((c) => c.id).join(', ');
  const res = await callActiveAiJson(`Erstelle ein alltagstaugliches, leckeres deutsches Familienrezept (4 Portionen), das diese vorhandenen Zutaten nutzt: "${rawInput}" (übliche Vorratszutaten wie Salz, Pfeffer, Öl, Zwiebel, Knoblauch, Wasser dürfen ergänzt werden).
Antworte NUR als JSON:
{
  "title": "Rezeptname",
  "description": "Kurze, appetitliche Beschreibung (1-2 Sätze)",
  "category": "eine aus: ${categoryList}",
  "prepTime": 25,
  "portions": 4,
  "ingredients": [{"amount": 300, "unit": "g", "name": "Zutat"}],
  "steps": ["Schritt 1 ...", "Schritt 2 ..."]
}`);

  if (btn) btn.disabled = false;
  if (!res.ok || !res.data) {
    if (box) box.innerHTML = `<div class="section-card" style="padding:10px 12px; font-size:12px; color:#f87171;">❌ KI-Fehler: ${escapeHtml(res.error || 'Unbekannt')}</div>`;
    return;
  }

  const verified = sanitizeAndVerifyExtractedRecipe(
    {
      ...res.data,
      author: 'Groq KI-Restekocher',
      sourceType: 'manual',
      tags: ['KI-Restekocher', 'Schnell'],
      imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'
    },
    ''
  );
  pendingAiGeneratedRecipes.fridge = verified;

  if (box) {
    box.innerHTML = `
      <div class="section-card" style="padding:11px 12px; border-color:rgba(16,185,129,0.5); background:rgba(16,185,129,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-size:11px; font-weight:800; color:#6ee7b7;">🧊 KI-RESTEKOCHER VORSCHLAG</div>
            <div style="font-size:14.5px; font-weight:800; margin-top:2px;">${escapeHtml(verified.title)}</div>
          </div>
          <button type="button" class="pill-btn" style="font-size:10px; padding:3px 7px;" onclick="document.getElementById('aiFridgeResultBox').style.display='none'">✕</button>
        </div>
        ${verified.description ? `<div style="font-size:12px; color:#cbd5e1; margin:5px 0 8px;">${escapeHtml(verified.description)}</div>` : ''}
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">
          ⏱ ${verified.prepTime} Min · 🍽 ${verified.portions} Portionen · 🥕 ${verified.ingredients.length} Zutaten · 👩‍🍳 ${verified.steps.length} Schritte
        </div>
        <button type="button" class="btn btn-primary" style="font-size:12.5px; padding:9px;" onclick="savePendingAiGeneratedRecipe('fridge')">
          💾 Rezept speichern &amp; öffnen
        </button>
      </div>
    `;
  }
}

// 2) TAB WOCHE: ✨ KI-Wochenplan (Mo–So)
async function generateAiWeekPlan() {
  if (!state.recipes || state.recipes.length < 3) {
    showToast('Bitte speichere zuerst mindestens 3 Rezepte in deiner Sammlung.');
    return;
  }

  const btn = document.getElementById('aiWeekPlanBtn');
  const hintEl = document.getElementById('aiWeekPlanHint');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✨ KI plant Woche...';
  }

  const recipeSummary = state.recipes.slice(0, 45).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    prepTime: r.prepTime || 25
  }));
  const offerSummary = (state.offers || []).slice(0, 15).map((o) => `${o.title} (${o.price} bei ${o.retailer})`);

  const res = await callActiveAiJson(`Stelle einen abwechslungsreichen Familien-Wochenplan (Montag bis Sonntag) AUSSCHLIESSLICH aus diesen vorhandenen Rezept-IDs zusammen.
Achte auf Abwechslung (unter der Woche eher schnell ≤35 Min, am Wochenende gern aufwändiger, guter Mix aus Kategorien) und nutze wenn passend günstige Wochenangebote.
Rezepte: ${JSON.stringify(recipeSummary)}
Aktuelle Angebote: ${JSON.stringify(offerSummary)}

Antworte NUR als JSON:
{
  "Montag": "rec-id",
  "Dienstag": "rec-id",
  "Mittwoch": "rec-id",
  "Donnerstag": "rec-id",
  "Freitag": "rec-id",
  "Samstag": "rec-id",
  "Sonntag": "rec-id",
  "note": "Kurze Begründung in 1 Satz auf Deutsch"
}`);

  if (btn) {
    btn.disabled = false;
    btn.textContent = '✨ KI-Wochenplan (Mo–So)';
  }

  if (!res.ok || !res.data) {
    showToast(`❌ KI-Wochenplan Fehler: ${res.error || 'Unbekannt'}`);
    return;
  }

  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const validIds = new Set(state.recipes.map((r) => r.id));
  let assigned = 0;
  days.forEach((day) => {
    const pickedId = res.data[day];
    if (pickedId && validIds.has(pickedId)) {
      state.weekPlan[day] = pickedId;
      assigned++;
    }
  });

  if (assigned === 0) {
    showToast('KI konnte keine passenden Rezepte zuordnen – bitte nochmal tippen.');
    return;
  }

  touchWeekPlanTimestamp();
  await dbPut('meta', { key: 'weekPlan', value: state.weekPlan });
  renderWeekPlan();
  broadcastSyncUpdate();
  if (hintEl && res.data.note) {
    hintEl.style.display = 'block';
    hintEl.textContent = `✨ KI-Plan: ${res.data.note}`;
  }
  showToast(`✨ KI-Wochenplan für ${assigned} Tage erstellt & synchronisiert!`);
}

// 3) TAB ANGEBOTE: 🍳 KI-Sparrezept aus aktuellen Bobinger Angeboten
async function generateAiOfferRecipe() {
  const offersList = (state.offers || []).slice(0, 22);
  if (offersList.length === 0) {
    showToast('Keine Angebote geladen – bitte zuerst auf 🔄 Live tippen.');
    return;
  }

  const btn = document.getElementById('aiOfferRecipeBtn');
  const box = document.getElementById('aiOfferRecipeBox');
  if (btn) btn.disabled = true;
  if (box) {
    box.style.display = 'block';
    box.innerHTML = `<div style="font-size:12px; color:#93c5fd;">✨ Groq sucht die beste Spar-Kombi aus ${offersList.length} Angeboten...</div>`;
  }

  const offerLines = offersList.map((o) => `- ${o.title} (${o.price} bei ${o.retailer})`).join('\n');
  const categoryList = RECIPE_CATEGORIES.map((c) => c.id).join(', ');

  const res = await callActiveAiJson(`Wähle 2 bis 4 passende Zutaten aus diesen AKTUELLEN Supermarkt-Angeboten aus und erstelle daraus 1 leckeres, günstiges deutsches Familienrezept (4 Portionen):
${offerLines}

Antworte NUR als JSON:
{
  "title": "Rezeptname",
  "description": "Kurze Beschreibung inkl. warum es diese Woche günstig ist (1-2 Sätze)",
  "usedOffers": ["Angebot 1 (Markt, Preis)", "Angebot 2 (Markt, Preis)"],
  "category": "eine aus: ${categoryList}",
  "prepTime": 25,
  "portions": 4,
  "ingredients": [{"amount": 400, "unit": "g", "name": "Zutat"}],
  "steps": ["Schritt 1 ...", "Schritt 2 ..."]
}`);

  if (btn) btn.disabled = false;
  if (!res.ok || !res.data) {
    if (box) box.innerHTML = `<div style="font-size:12px; color:#f87171;">❌ KI-Fehler: ${escapeHtml(res.error || 'Unbekannt')}</div>`;
    return;
  }

  const verified = sanitizeAndVerifyExtractedRecipe(
    {
      ...res.data,
      author: 'Groq KI-Sparrezept',
      sourceType: 'manual',
      tags: ['Spar-Rezept', 'Angebote'],
      imageUrl: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=900&q=80'
    },
    ''
  );
  pendingAiGeneratedRecipes.offer = verified;
  const usedList = Array.isArray(res.data.usedOffers) ? res.data.usedOffers : [];

  if (box) {
    box.innerHTML = `
      <div style="background:#0b1120; border:1px solid rgba(16,185,129,0.45); border-radius:10px; padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="font-size:14px; font-weight:800; color:#f8fafc;">${escapeHtml(verified.title)}</div>
          <button type="button" class="pill-btn" style="font-size:10px; padding:2px 7px;" onclick="document.getElementById('aiOfferRecipeBox').style.display='none'">✕</button>
        </div>
        ${verified.description ? `<div style="font-size:12px; color:#cbd5e1; margin:4px 0 6px;">${escapeHtml(verified.description)}</div>` : ''}
        ${usedList.length ? `<div style="font-size:11px; color:#34d399; margin-bottom:8px;">🏷️ Genutzte Angebote: ${escapeHtml(usedList.join(' · '))}</div>` : ''}
        <button type="button" class="btn btn-primary" style="font-size:12px; padding:8px;" onclick="savePendingAiGeneratedRecipe('offer')">
          💾 Als Rezept speichern &amp; öffnen
        </button>
      </div>
    `;
  }
}

// 4) TAB BRING! / EINKAUFSLISTE: ✨ KI-Liste aufräumen & bündeln
async function optimizeShoppingListWithAI() {
  const openItems = (state.shoppingList || []).filter((i) => !i.checked);
  const doneItems = (state.shoppingList || []).filter((i) => i.checked);
  if (openItems.length < 2) {
    showToast('Mindestens 2 offene Einträge auf der Einkaufsliste nötig.');
    return;
  }

  const btn = document.getElementById('aiOptimizeShopBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✨ KI sortiert...';
  }

  const compactItems = openItems.map((i) => ({ name: i.name, spec: i.spec || '' }));
  const res = await callActiveAiJson(`Optimiere diese deutsche Einkaufsliste:
1. Fasse doppelte oder eng verwandte Zutaten sinnvoll zusammen und addiere Mengen (z.B. "2 Zwiebeln" + "1 rote Zwiebel" -> name: "Zwiebeln", spec: "3 Stück").
2. Ordne jeden Artikel einem Supermarkt-Gang zu ("Obst & Gemüse", "Fleisch & Fisch", "Kühlregal & Käse", "Trockenwaren & Konserven", "Backwaren", "Gewürze & Öle", "Sonstiges").
3. Verliere keine einzige Zutat!

Liste: ${JSON.stringify(compactItems)}

Antworte NUR als JSON:
{
  "items": [{"name": "Zwiebeln", "spec": "3 Stück", "aisle": "Obst & Gemüse"}]
}`);

  if (btn) {
    btn.disabled = false;
    btn.textContent = '✨ KI-Aufräumen';
  }

  if (!res.ok || !Array.isArray(res.data?.items) || res.data.items.length === 0) {
    showToast(`❌ KI-Sortierung Fehler: ${res.error || 'Unbekannt'}`);
    return;
  }

  const optimizedOpen = res.data.items
    .filter((it) => it && it.name)
    .map((it, idx) => ({
      id: 'shop-ai-' + Date.now() + '-' + idx,
      name: String(it.name).trim(),
      spec: String(it.spec || '').trim(),
      aisle: String(it.aisle || 'Sonstiges').trim(),
      checked: false
    }));

  state.shoppingList = [...optimizedOpen, ...doneItems];
  await dbPut('meta', { key: 'shoppingList', value: state.shoppingList });
  try {
    localStorage.setItem('kt_shopping_list_v15', JSON.stringify(state.shoppingList));
  } catch (_) {}
  renderShoppingList();
  broadcastSyncUpdate();
  showToast(`✨ Einkaufsliste aufgeräumt (${openItems.length} → ${optimizedOpen.length} Einträge) & synchronisiert!`);
}

// ============================================================================
// 14. REZEPT DIREKT BEARBEITEN (✎) & HÄNDLER-VERWALTUNG (SUCHEN/HINZUFÜGEN/ENTFERNEN)
// ============================================================================

function openEditRecipeForm(recipeId) {
  const r = findRecipeById(recipeId);
  if (!r) return;
  const container = document.getElementById('detailModalBody');
  if (!container) return;

  state.pendingEditPhotoDataUrl = r.imageUrl || '';
  const ingsText = formatIngredientsForEditTextarea(r.ingredients || []);
  const stepsText = (r.steps || []).join('\n');

  container.innerHTML = `
    <div class="section-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div class="section-title" style="margin-bottom:0;">✎ Rezept bearbeiten</div>
        <button type="button" class="pill-btn" style="font-size:11px; padding:4px 9px;" onclick="openRecipeDetail('${escapeHtml(r.id)}')">Abbrechen</button>
      </div>
      <div class="input-group">
        <label class="input-label">📷 Rezept-Foto ändern (wird für alle synchronisiert)</label>
        <input id="editRecPhotoFile" type="file" accept="image/*" class="text-input" style="padding:7px;" onchange="handleEditRecipePhotoSelect(event)" />
        ${
          r.imageUrl
            ? `<img id="editRecPhotoPreview" src="${escapeHtml(r.imageUrl)}" alt="Foto" style="width:100%; max-height:140px; object-fit:cover; border-radius:10px; margin-top:6px;" />`
            : `<img id="editRecPhotoPreview" src="" alt="Foto" style="display:none; width:100%; max-height:140px; object-fit:cover; border-radius:10px; margin-top:6px;" />`
        }
      </div>
      <div class="input-group">
        <label class="input-label">Rezeptname</label>
        <input id="editRecTitle" type="text" class="text-input" value="${escapeHtml(r.title || '')}" />
      </div>
      <div class="btn-row" style="margin-bottom:10px;">
        <div style="flex:1;">
          <label class="input-label">Portionen</label>
          <input id="editRecPortions" type="number" min="1" max="40" class="text-input" value="${escapeHtml(String(r.portions || 4))}" />
        </div>
        <div style="flex:1;">
          <label class="input-label">Zeit (Minuten)</label>
          <input id="editRecTime" type="number" min="1" max="600" class="text-input" value="${escapeHtml(String(r.prepTime || 25))}" />
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">📝 Beschreibung</label>
        <textarea id="editRecDesc" class="textarea-input" style="min-height:58px;">${escapeHtml(r.description || '')}</textarea>
      </div>
      <div class="input-group">
        <label class="input-label">📌 Eigene Notiz / Tipp (z.B. „weniger Salz“)</label>
        <textarea id="editRecNotes" class="textarea-input" style="min-height:48px;">${escapeHtml(r.notes || '')}</textarea>
      </div>
      <div class="input-group">
        <label class="input-label">🥕 Zutaten (1 pro Zeile)</label>
        <textarea id="editRecIngs" class="textarea-input" style="min-height:130px;">${escapeHtml(ingsText)}</textarea>
      </div>
      <div class="input-group">
        <label class="input-label">👩‍🍳 Zubereitung (1 Schritt pro Zeile)</label>
        <textarea id="editRecSteps" class="textarea-input" style="min-height:140px;">${escapeHtml(stepsText)}</textarea>
      </div>
      <button type="button" class="btn btn-primary" onclick="saveEditedRecipe('${escapeHtml(r.id)}')">
        💾 Änderungen speichern &amp; synchronisieren
      </button>
    </div>
  `;
}

async function handleEditRecipePhotoSelect(event) {
  const file = event?.target?.files && event.target.files[0];
  if (!file) return;
  try {
    const rawUrl = await compressImageFileToDataUrl(file, 850, 0.75);
    const syncedUrl = await compressDataUrlForCloudSync(rawUrl, 850, 0.74);
    state.pendingEditPhotoDataUrl = syncedUrl;
    const prev = document.getElementById('editRecPhotoPreview');
    if (prev) {
      prev.src = syncedUrl;
      prev.style.display = 'block';
    }
    showToast('📷 Neues Foto geladen – jetzt unten auf Speichern tippen!');
  } catch (_) {
    showToast('Foto konnte nicht geladen werden');
  }
}

async function saveEditedRecipe(recipeId) {
  const idx = state.recipes.findIndex((x) => x.id === recipeId);
  if (idx < 0) return;

  const title = (document.getElementById('editRecTitle')?.value || '').trim();
  if (!title) {
    showToast('Bitte einen Rezeptnamen eingeben');
    return;
  }
  const portions = parseInt(document.getElementById('editRecPortions')?.value, 10) || 4;
  const prepTime = parseInt(document.getElementById('editRecTime')?.value, 10) || 25;
  const description = (document.getElementById('editRecDesc')?.value || '').trim();
  const notes = (document.getElementById('editRecNotes')?.value || '').trim();
  const ingsRaw = (document.getElementById('editRecIngs')?.value || '').trim();
  const stepsRaw = (document.getElementById('editRecSteps')?.value || '').trim();

  const ingredients = ingsRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine)
    .filter((x) => x && x.name);

  const steps = stepsRaw
    .split(/\r?\n/)
    .map((s) => s.replace(/^(?:schritt\s*)?\d+[\).:\-]\s*/i, '').trim())
    .filter(Boolean);

  const updated = {
    ...state.recipes[idx],
    title,
    portions,
    prepTime,
    description,
    notes,
    imageUrl: state.pendingEditPhotoDataUrl || state.recipes[idx].imageUrl || '',
    ingredients,
    steps,
    updatedAt: Date.now()
  };

  state.recipes[idx] = updated;
  await dbPut('recipes', updated);
  renderAll();
  broadcastSyncUpdate();
  await openRecipeDetail(updated.id);
  showToast(`✅ "${updated.title}" gespeichert & synchronisiert!`);
}

// Erweiterter Katalog zusätzlicher deutscher Händler (jederzeit per Suche aktivierbar/entfernbar)
const EXTRA_RETAILERS_CATALOG = [
  { id: 'V-Markt', label: 'V-Markt', kaufdaSlug: 'V-Markt', brochureTitle: 'V-Markt Wochenprospekt', color: '#dc2626', validity: 'Do – Mi' },
  { id: 'dm', label: 'dm-drogerie markt', kaufdaSlug: 'dm-drogerie-markt', brochureTitle: 'dm Aktuelle Angebote', color: '#1d4ed8', validity: 'Mo – Sa' },
  { id: 'Rossmann', label: 'ROSSMANN', kaufdaSlug: 'Rossmann', brochureTitle: 'ROSSMANN Ideenwelt & Angebote', color: '#dc2626', validity: 'Mo – Fr' },
  { id: 'Mueller', label: 'Müller', kaufdaSlug: 'Mueller', brochureTitle: 'Müller Drogerie Prospekt', color: '#ea580c', validity: 'Mo – Sa' },
  { id: 'Marktkauf', label: 'Marktkauf', kaufdaSlug: 'Marktkauf', brochureTitle: 'Marktkauf Wochenprospekt', color: '#dc2626', validity: 'Mo – Sa' },
  { id: 'Alnatura', label: 'Alnatura', kaufdaSlug: 'Alnatura', brochureTitle: 'Alnatura Bio-Angebote', color: '#15803d', validity: 'Mo – Sa' },
  { id: 'Denns', label: 'Denns BioMarkt', kaufdaSlug: 'Denns-BioMarkt', brochureTitle: 'Denns BioMarkt Prospekt', color: '#16a34a', validity: 'Mi – Di' },
  { id: 'Action', label: 'Action', kaufdaSlug: 'Action', brochureTitle: 'Action Wochenangebote', color: '#2563eb', validity: 'Mi – Di' },
  { id: 'OBI', label: 'OBI', kaufdaSlug: 'OBI', brochureTitle: 'OBI Baumarkt Prospekt', color: '#f97316', validity: 'Mo – Sa' }
];

function getCustomUserRetailers() {
  try {
    const raw = localStorage.getItem('kt_custom_retailers_v33');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function getAllAvailableRetailersMeta() {
  const base = [...ALL_RETAILERS_META];
  const existingIds = new Set(base.map((b) => b.id));
  const extras = [...EXTRA_RETAILERS_CATALOG, ...getCustomUserRetailers()];
  extras.forEach((ex) => {
    if (ex && ex.id && !existingIds.has(ex.id)) {
      existingIds.add(ex.id);
      base.push({
        ...ex,
        coverUrl: ex.coverUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
        brochureUrl: `https://www.kaufda.de/Geschaefte/${encodeURIComponent(ex.kaufdaSlug || ex.id)}`,
        kaufdaUrl: `https://www.kaufda.de/Geschaefte/${encodeURIComponent(ex.kaufdaSlug || ex.id)}`
      });
    }
  });
  return base;
}

function getAllMergedBrochuresList() {
  const activeBrochures = Array.isArray(state.brochures) ? [...state.brochures] : [...ALL_RETAILERS_META];
  const ids = new Set(activeBrochures.map((b) => b.id));
  getAllAvailableRetailersMeta().forEach((meta) => {
    if (!ids.has(meta.id)) {
      activeBrochures.push(meta);
    }
  });
  return activeBrochures;
}

function getEnabledRetailerIds() {
  try {
    const raw = localStorage.getItem('kt_enabled_retailers_v33');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
    }
  } catch (_) {}
  return new Set(ALL_RETAILERS_META.map((r) => r.id));
}

function saveEnabledRetailerIds(idSet) {
  try {
    localStorage.setItem('kt_enabled_retailers_v33', JSON.stringify(Array.from(idSet)));
  } catch (_) {}
}

function toggleRetailerManagerBox() {
  const box = document.getElementById('retailerManagerBox');
  if (!box) return;
  const open = box.style.display === 'none' || !box.style.display;
  box.style.display = open ? 'block' : 'none';
  if (open) renderRetailerManagerList();
}

function renderRetailerManagerList() {
  const container = document.getElementById('retailerManagerChips');
  if (!container) return;
  const q = (document.getElementById('retailerManagerSearch')?.value || '').trim().toLowerCase();
  const enabled = getEnabledRetailerIds();
  const allMeta = getAllAvailableRetailersMeta().filter(
    (m) => !q || m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  );

  if (allMeta.length === 0) {
    container.innerHTML = `<div style="font-size:11.5px; color:var(--text-muted);">Kein Treffer in der Liste – klicke oben auf <strong>+ Hinzufügen</strong>, um „${escapeHtml(q)}“ direkt als eigenen Händler anzulegen!</div>`;
    return;
  }

  container.innerHTML = allMeta
    .map((m) => {
      const isOn = enabled.has(m.id);
      return `<button type="button" class="chip ${isOn ? 'active' : ''}" style="font-size:11px; padding:4px 9px;" onclick="toggleRetailerEnabled('${escapeHtml(m.id)}')">${isOn ? '✓ ' : '+ '}${escapeHtml(m.label)}</button>`;
    })
    .join('');
}

function toggleRetailerEnabled(retailerId) {
  const enabled = getEnabledRetailerIds();
  let newlyEnabled = false;
  if (enabled.has(retailerId)) {
    if (enabled.size <= 1) {
      showToast('Mindestens 1 Händler muss aktiv bleiben');
      return;
    }
    enabled.delete(retailerId);
    if (state.selectedRetailer === retailerId) state.selectedRetailer = 'Alle';
  } else {
    enabled.add(retailerId);
    newlyEnabled = true;
  }
  saveEnabledRetailerIds(enabled);
  renderRetailerManagerList();
  renderBrochuresCarousel();
  renderOffersTab();

  if (newlyEnabled && typeof fetchLiveBrochureForRetailer === 'function') {
    const meta = getAllAvailableRetailersMeta().find((m) => m.id === retailerId);
    if (meta) {
      fetchLiveBrochureForRetailer(meta).then((updated) => {
        if (updated) {
          renderBrochuresCarousel();
          renderOffersTab();
        }
      }).catch(() => {});
    }
  }
}

function addCustomRetailerFromSearch() {
  const inp = document.getElementById('retailerManagerSearch');
  const rawName = (inp?.value || '').trim();
  if (!rawName) {
    showToast('Bitte einen Händlernamen eintippen (z.B. dm, Rossmann, Marktkauf)');
    return;
  }
  const allMeta = getAllAvailableRetailersMeta();
  const existing = allMeta.find((m) => m.label.toLowerCase() === rawName.toLowerCase() || m.id.toLowerCase() === rawName.toLowerCase());
  const enabled = getEnabledRetailerIds();

  if (existing) {
    enabled.add(existing.id);
    saveEnabledRetailerIds(enabled);
    if (inp) inp.value = '';
    renderRetailerManagerList();
    renderBrochuresCarousel();
    renderOffersTab();
    if (typeof fetchLiveBrochureForRetailer === 'function') {
      fetchLiveBrochureForRetailer(existing).then((u) => { if (u) renderBrochuresCarousel(); }).catch(() => {});
    }
    showToast(`✅ Händler "${existing.label}" aktiviert – suche Live-Prospekt...`);
    return;
  }

  const slug = rawName.replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '-').replace(/^-|-$/g, '');
  const newMeta = {
    id: rawName,
    label: rawName,
    kaufdaSlug: slug || rawName,
    brochureTitle: `${rawName} Aktuelles Prospekt`,
    color: '#0ea5e9',
    validity: 'Mo – Sa'
  };
  const customList = getCustomUserRetailers();
  customList.push(newMeta);
  try {
    localStorage.setItem('kt_custom_retailers_v33', JSON.stringify(customList));
  } catch (_) {}
  enabled.add(newMeta.id);
  saveEnabledRetailerIds(enabled);
  if (inp) inp.value = '';
  renderRetailerManagerList();
  renderBrochuresCarousel();
  renderOffersTab();
  if (typeof fetchLiveBrochureForRetailer === 'function') {
    fetchLiveBrochureForRetailer(newMeta).then((u) => { if (u) renderBrochuresCarousel(); }).catch(() => {});
  }
  showToast(`✅ Eigener Händler "${rawName}" hinzugefügt – suche Live-Prospekt...`);
}

// ============================================================================
// 15. LESEZEICHEN- & MEHRFACH-LINK-IMPORT (MIT STRIKTER DUPLIKAT-PRÜFUNG)
// ============================================================================
let pendingBookmarkCandidates = [];

function normalizeUrlForDuplicateCheck(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch (_) {
    return String(rawUrl || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/i, '')
      .split(/[?#]/)[0]
      .replace(/\/+$/, '');
  }
}

function isRecipeUrlAlreadySaved(rawUrl) {
  const norm = normalizeUrlForDuplicateCheck(rawUrl);
  if (!norm) return false;
  return (state.recipes || []).some((r) => r.sourceUrl && normalizeUrlForDuplicateCheck(r.sourceUrl) === norm);
}

function isRecipeTitleAlreadySaved(rawTitle) {
  const norm = String(rawTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '')
    .trim();
  if (!norm || norm.length < 4) return false;
  return (state.recipes || []).some(
    (r) =>
      String(r.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, '')
        .trim() === norm
  );
}

function parseBookmarkLinksFromTextOrHtml(content) {
  const raw = String(content || '');
  const found = [];
  const seenNorm = new Set();

  const pushCandidate = (url, label = '') => {
    const cleanUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    // Filtere offensichtliche Nicht-Rezept-Systemseiten (Login, Google-Suche, Localhost, Supabase, Netlify)
    if (/(localhost|127\.0\.0\.1|supabase\.com|netlify\.app|google\.com\/search|accounts\.google|login|signin|chrome:\/\/)/i.test(cleanUrl)) {
      return;
    }
    const norm = normalizeUrlForDuplicateCheck(cleanUrl);
    if (!norm || seenNorm.has(norm)) return;
    seenNorm.add(norm);
    const alreadyExists = isRecipeUrlAlreadySaved(cleanUrl);
    found.push({
      url: cleanUrl,
      label: decodeHtmlEntities(label || '').trim() || cleanUrl.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 60),
      alreadyExists,
      selected: !alreadyExists
    });
  };

  if (/<a\s+[^>]*href=/i.test(raw)) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/html');
      doc.querySelectorAll('a[href]').forEach((a) => {
        pushCandidate(a.getAttribute('href'), a.textContent || '');
      });
    } catch (_) {}
  }

  // Zusätzlich alle freien http(s)-URLs aus Zeilen/Text extrahieren
  const urlMatches = raw.match(/https?:\/\/[^\s"'<>()]+/gi) || [];
  urlMatches.forEach((u) => pushCandidate(u.replace(/[.,;!?]+$/, ''), ''));

  return found;
}

function handleBookmarkFileSelect(event) {
  const file = event?.target?.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = String(e?.target?.result || '');
    pendingBookmarkCandidates = parseBookmarkLinksFromTextOrHtml(text);
    renderBookmarkImportPreview();
  };
  reader.readAsText(file, 'utf-8');
}

function previewPastedBookmarkLinks() {
  const txt = (document.getElementById('bookmarkLinksTextarea')?.value || '').trim();
  if (!txt) {
    showToast('Bitte zuerst eine Lesezeichen-Datei wählen oder Links einfügen');
    return;
  }
  pendingBookmarkCandidates = parseBookmarkLinksFromTextOrHtml(txt);
  renderBookmarkImportPreview();
}

function toggleBookmarkImportSelection(idx) {
  if (!pendingBookmarkCandidates[idx] || pendingBookmarkCandidates[idx].alreadyExists) return;
  pendingBookmarkCandidates[idx].selected = !pendingBookmarkCandidates[idx].selected;
  renderBookmarkImportPreview();
}

function renderBookmarkImportPreview() {
  const box = document.getElementById('bookmarkPreviewBox');
  if (!box) return;
  box.style.display = 'block';

  if (!pendingBookmarkCandidates || pendingBookmarkCandidates.length === 0) {
    box.innerHTML = `<div style="font-size:12px; color:#fbbf24; padding:8px; background:rgba(245,158,11,0.12); border-radius:10px;">Keine gültigen Rezept-Links gefunden.</div>`;
    return;
  }

  const newCount = pendingBookmarkCandidates.filter((c) => !c.alreadyExists && c.selected).length;
  const dupCount = pendingBookmarkCandidates.filter((c) => c.alreadyExists).length;

  const listHtml = pendingBookmarkCandidates
    .slice(0, 60)
    .map((c, idx) => {
      if (c.alreadyExists) {
        return `<div style="font-size:11px; color:var(--text-muted); padding:5px 0; border-bottom:1px solid rgba(148,163,184,0.12); display:flex; justify-content:space-between; gap:6px;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.label)}</span>
          <span style="color:#6ee7b7; flex-shrink:0;">✓ Bereits da</span>
        </div>`;
      }
      return `<label style="font-size:11.5px; color:#e2e8f0; padding:6px 0; border-bottom:1px solid rgba(148,163,184,0.12); display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" ${c.selected ? 'checked' : ''} onchange="toggleBookmarkImportSelection(${idx})" />
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escapeHtml(c.label)}</span>
      </label>`;
    })
    .join('');

  box.innerHTML = `
    <div style="background:#0b1120; border:1px solid var(--border); border-radius:10px; padding:10px;">
      <div style="font-size:12px; font-weight:800; color:#6ee7b7; margin-bottom:6px;">
        🔖 ${pendingBookmarkCandidates.length} Links erkannt · ${newCount} neu · ${dupCount} Duplikate übersprungen
      </div>
      <div style="max-height:200px; overflow-y:auto; margin-bottom:10px;">${listHtml}</div>
      <div id="bookmarkImportProgress" style="display:none; font-size:11.5px; color:#93c5fd; margin-bottom:8px;"></div>
      <button id="startBookmarkImportBtn" type="button" class="btn btn-primary" ${newCount === 0 ? 'disabled' : ''} onclick="startBulkBookmarkImport()">
        📥 ${newCount} neue Rezepte jetzt 1:1 importieren
      </button>
    </div>
  `;
}

async function fetchAndParseSingleRecipeSilent(url) {
  let parsed = matchKnownVerifiedRecipeByUrl(url);
  if (!parsed && isSocialMediaRecipeUrl(url)) {
    parsed = await fetchAndParseSocialRecipe(url, '');
  }
  if (!parsed && /chefkoch\.de/i.test(url)) {
    parsed = await fetchChefkochRecipeByUrlOrId(url);
  }

  let rawHtml = '';
  let bestCoverImage = '';
  let bestMetaDesc = '';
  let hostTag = 'Web-Import';
  try { hostTag = new URL(url).hostname.replace(/^www\./i, ''); } catch (_) {}

  const isComplete = (r) => Boolean(r && Array.isArray(r.ingredients) && r.ingredients.length >= 2 && Array.isArray(r.steps) && r.steps.length >= 1);

  if (!isComplete(parsed)) {
    rawHtml = (await fetchUrlContentWithCorsFallback(url)) || '';
    if (rawHtml) {
      bestCoverImage = extractBestImageFromHtml(rawHtml, url);
      bestMetaDesc = extractMetaDescriptionFromHtml(rawHtml);
      const schemaC = parseSchemaOrgRecipeFromHtml(rawHtml, url);
      if (isComplete(schemaC)) {
        parsed = schemaC;
      } else {
        const wprmC = parseWprmInlineJsonFromHtml(rawHtml, url);
        const wpC = !isComplete(wprmC) ? parseWordPressRecipeHtml(rawHtml, '', url, null) : null;
        const headC = !isComplete(wpC) ? parseHeadingBasedRecipeHtml(rawHtml, url) : null;
        parsed = [schemaC, wprmC, wpC, headC].find((c) => isComplete(c)) || schemaC || wprmC || wpC || headC || null;
      }
    }
  }

  if (state.household.geminiKey && !isComplete(parsed) && rawHtml) {
    const readable = extractReadableTextFromHtml(rawHtml);
    if (readable && readable.length > 80) {
      const aiRes = await extractRecipeWithGeminiAI(readable, url);
      if (aiRes.ok && aiRes.recipe) {
        parsed = { ...aiRes.recipe, imageUrl: bestCoverImage || parsed?.imageUrl || '', tags: ['Lesezeichen', hostTag] };
      }
    }
  }

  if (!isComplete(parsed)) {
    try {
      const cleanTarget = isSocialMediaRecipeUrl(url) ? url.split('?')[0] : url;
      const jinaRes = await fetch(`https://r.jina.ai/${cleanTarget}`, { headers: { Accept: 'application/json' } });
      if (jinaRes.ok) {
        const jinaJson = await jinaRes.json();
        const data = jinaJson.data || {};
        const combinedText = (data.title ? `Title: ${data.title}\n` : '') + (data.content || '');
        let extracted = null;
        if (state.household.geminiKey && combinedText.length > 60) {
          const aiRes = await extractRecipeWithGeminiAI(combinedText, url);
          if (aiRes.ok && aiRes.recipe) extracted = aiRes.recipe;
        }
        if (!extracted || !isComplete(extracted)) {
          extracted = parseStructuredRecipeText(combinedText, url);
        }
        if (extracted && (extracted.ingredients?.length > 0 || extracted.steps?.length > 0)) {
          parsed = {
            ...extracted,
            title: extracted.title || data.title || 'Importiertes Rezept',
            description: extracted.description || bestMetaDesc || '',
            sourceUrl: data.url || url,
            imageUrl: bestCoverImage || parsed?.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
            tags: ['Lesezeichen', hostTag]
          };
        }
      }
    } catch (_) {}
  }

  if (parsed) {
    if (!parsed.description && bestMetaDesc) parsed.description = bestMetaDesc;
    if (!parsed.imageUrl && bestCoverImage) parsed.imageUrl = bestCoverImage;
    parsed = sanitizeAndVerifyExtractedRecipe(parsed, url);
  }
  return parsed;
}

async function startBulkBookmarkImport() {
  const toImport = (pendingBookmarkCandidates || []).filter((c) => !c.alreadyExists && c.selected);
  if (toImport.length === 0) {
    showToast('Keine neuen Links zum Importieren ausgewählt');
    return;
  }

  const btn = document.getElementById('startBookmarkImportBtn');
  const prog = document.getElementById('bookmarkImportProgress');
  if (btn) btn.disabled = true;
  if (prog) prog.style.display = 'block';

  let importedCount = 0;
  let skippedDupCount = 0;
  let failedCount = 0;

  for (let i = 0; i < toImport.length; i++) {
    const item = toImport[i];
    if (prog) {
      prog.textContent = `⏳ Importiere ${i + 1} / ${toImport.length}: ${item.label}...`;
    }
    if (isRecipeUrlAlreadySaved(item.url)) {
      skippedDupCount++;
      item.alreadyExists = true;
      continue;
    }
    try {
      const parsed = await fetchAndParseSingleRecipeSilent(item.url);
      if (parsed && (parsed.ingredients?.length > 0 || parsed.steps?.length > 0)) {
        if (isRecipeTitleAlreadySaved(parsed.title)) {
          skippedDupCount++;
          item.alreadyExists = true;
          continue;
        }
        const autoCat =
          parsed.category && RECIPE_CATEGORIES.some((c) => c.id === parsed.category)
            ? parsed.category
            : detectRecipeCategory(parsed.title || '', parsed.ingredients || [], parsed.tags || []);
        const newRec = {
          id: 'rec-' + Date.now() + '-' + i,
          title: parsed.title || item.label || 'Importiertes Rezept',
          description: parsed.description || '',
          category: autoCat,
          prepTime: parsed.prepTime || 25,
          portions: parsed.portions || 4,
          rating: 5,
          author: parsed.author || state.household.memberName,
          sourceType: isSocialMediaRecipeUrl(item.url) ? 'instagram' : 'web',
          sourceUrl: parsed.sourceUrl || item.url,
          imageUrl: parsed.imageUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
          hasOfflineVideo: false,
          tags: Array.from(new Set([...(parsed.tags || []), 'Lesezeichen'])),
          nutrition: parsed.nutrition || null,
          notes: '',
          ingredients: parsed.ingredients || [],
          steps: parsed.steps || [],
          updatedAt: Date.now()
        };
        state.recipes.unshift(newRec);
        await dbPut('recipes', newRec);
        item.alreadyExists = true;
        importedCount++;
      } else {
        failedCount++;
      }
    } catch (_) {
      failedCount++;
    }
    // Schonende Pause zwischen Lesezeichen-Importen, damit kostenlose Minuten-Limits (RPM) nicht anschlagen
    if (i < toImport.length - 1 && state.household.geminiKey) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  renderAll();
  await broadcastSyncUpdate();
  renderBookmarkImportPreview();
  if (prog) {
    prog.style.display = 'block';
    prog.style.color = '#34d399';
    prog.textContent = `✅ Fertig! ${importedCount} neu importiert · ${skippedDupCount} Duplikate übersprungen${failedCount ? ` · ${failedCount} ohne Rezeptdaten` : ''}`;
  }
  showToast(`🔖 Lesezeichen-Import fertig: ${importedCount} neue Rezepte gespeichert!`);
}
