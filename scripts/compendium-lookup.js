// compendium-lookup.js — looks up spells from PF2e compendium packs
// with automatic legacy→remaster name mapping

const SPELL_PACKS = [
  "pf2e.spells-srd",
  "pf2e.pathfinder-monster-core",
  "pf2e.pathfinder-bestiary",
  "pf2e.pathfinder-bestiary-2",
  "pf2e.pathfinder-bestiary-3",
];

// Legacy (pre-remaster) spell names → Remaster spell names
// Source: PF2e Player Core / Monster Core remaster changes
const SPELL_ALIASES = {
  // Cantrips
  "acid splash":                "caustic blast",
  "disrupt undead":             "vitality lash",
  "divine lance":               "holy lance",
  "produce flame":              "ignition",
  "ray of frost":               "frostbite",
  "shocking grasp":             "electric arc",    // electric arc was always present; shocking grasp is gone
  "telekinetic projectile":     "telekinetic projectile", // unchanged
  "chill touch":                "void warp",

  // 1st rank
  "alarm":                      "alarm",           // unchanged
  "burning hands":              "breathe fire",
  "charm person":               "charm",
  "color spray":                "dizzying colors",
  "magic missile":              "magic missile",   // unchanged
  "mage armor":                 "mystic armor",
  "mage hand":                  "telekinetic hand",
  "magic weapon":               "runic weapon",
  "protection":                 "ward ally",
  "ray of enfeeblement":        "enfeeble",
  "true strike":                "true strike",     // unchanged

  // 2nd rank
  "comprehend languages":       "translate",
  "comprehend language":        "translate",
  "darkness":                   "darkness",        // unchanged
  "enlarge person":             "enlarge",
  "false life":                 "false vitality",
  "humanoid form":              "humanoid form",   // unchanged
  "invisibility":               "invisibility",    // unchanged
  "reduce person":              "shrink",
  "see invisibility":           "see the unseen",
  "spider climb":               "spider climb",    // unchanged
  "water breathing":            "breathe water",

  // 3rd rank
  "blindness":                  "blindness",       // unchanged
  "dispel magic":               "dispel magic",    // unchanged
  "fireball":                   "fireball",        // unchanged
  "fly":                        "fly",             // unchanged
  "haste":                      "haste",           // unchanged
  "heroism":                    "heroism",         // unchanged
  "hold person":                "paralyze",
  "lightning bolt":             "lightning bolt",  // unchanged
  "mind reading":               "read the thoughts of others", // or "mind reading" — check compendium
  "nondetection":               "nondetection",    // unchanged
  "slow":                       "slow",            // unchanged
  "stinking cloud":             "stinking cloud",  // unchanged
  "vampiric touch":             "vampiric feast",

  // 4th rank
  "charm monster":              "charm",
  "dominate person":            "dominate",
  "flesh to stone":             "petrify",
  "freedom of movement":        "unfettered movement",
  "globe of invulnerability":   "globe of invulnerability", // unchanged
  "phantasmal killer":          "phantasmal calamity",
  "polymorph":                  "adapt self",      // or might still be "polymorph"
  "resilient sphere":           "resilient sphere", // unchanged
  "stone to flesh":             "stone to flesh",  // unchanged (reverse of petrify)

  // 5th rank
  "baleful polymorph":          "unfathomable creature",
  "cone of cold":               "cone of cold",    // unchanged
  "dimension door":             "dimension door",  // unchanged
  "hold monster":               "transfix",
  "magic jar":                  "possession",
  "shadow siphon":              "shadow siphon",   // unchanged (check)
  "telekinesis":                "telekinesis",     // unchanged
  "teleport":                   "teleport",        // unchanged
  "wall of force":              "wall of force",   // unchanged
  "wall of stone":              "wall of stone",   // unchanged

  // 6th rank
  "chain lightning":            "chain lightning", // unchanged
  "disintegrate":               "disintegrate",    // unchanged
  "dominate monster":           "dominate",
  "flesh to stone":             "petrify",
  "true seeing":                "truesight",

  // 7th rank
  "finger of death":            "finger of death", // unchanged
  "power word blind":           "power word blind", // unchanged
  "regenerate":                 "regenerate",      // unchanged

  // 8th rank
  "horrid wilting":             "wither",
  "mind blank":                 "mind blank",      // unchanged
  "power word stun":            "power word stun", // unchanged

  // 9th rank
  "imprisonment":               "imprisonment",    // unchanged
  "power word kill":            "power word kill", // unchanged
  "time stop":                  "time stop",       // unchanged
  "wish":                       "wish",            // unchanged

  // 10th rank
  "alter reality":              "alter reality",   // unchanged
};

const spellCache = new Map();

export async function findSpellInCompendium(spellName) {
  const key = spellName.toLowerCase().trim();
  if (spellCache.has(key)) return spellCache.get(key);

  // Try original name first, then remaster alias
  const namesToTry = [key];
  const alias = SPELL_ALIASES[key];
  if (alias && alias !== key) namesToTry.push(alias.toLowerCase());

  for (const name of namesToTry) {
    // Exact match across all packs
    for (const packId of SPELL_PACKS) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["name", "type"] });
      const entry = index.find(e => e.type === "spell" && e.name.toLowerCase() === name);
      if (entry) {
        const doc = await pack.getDocument(entry._id);
        spellCache.set(key, doc);
        return doc;
      }
    }
  }

  // Fuzzy fallback: substring match (original name)
  for (const packId of SPELL_PACKS) {
    const pack = game.packs.get(packId);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: ["name", "type"] });
    const entry = index.find(e => e.type === "spell" && e.name.toLowerCase().includes(key));
    if (entry) {
      const doc = await pack.getDocument(entry._id);
      spellCache.set(key, doc);
      return doc;
    }
  }

  spellCache.set(key, null);
  return null;
}

export function clearCache() {
  spellCache.clear();
  conditionCache.clear();
  equipmentCache.clear();
}

// ── Condition lookup ───────────────────────────────────────────────────────
const conditionCache = new Map();

// Returns a Map<conditionNameLower, uuid> for all conditions in the compendium.
// Cached after first call.
export async function buildConditionUUIDMap() {
  if (conditionCache.size > 0) return conditionCache;

  const pack = game.packs.get("pf2e.conditionitems");
  if (!pack) return conditionCache;

  const index = await pack.getIndex({ fields: ["name"] });
  for (const entry of index) {
    conditionCache.set(entry.name.toLowerCase(), `Compendium.pf2e.conditionitems.Item.${entry._id}`);
  }
  return conditionCache;
}

// Returns the remaster name for a legacy spell, or the original if not aliased
export function resolveSpellName(name) {
  const key = name.toLowerCase().trim();
  return SPELL_ALIASES[key] ?? name;
}

// ── Equipment lookup ───────────────────────────────────────────────────────
const EQUIPMENT_PACKS = [
  "pf2e.equipment-srd",
  "pf2e.treasure-vault",
  "pf2e.pathfinder-monster-core",
  "pf2e.pathfinder-bestiary",
];

// Item types that count as equipment on an NPC sheet
const EQUIPMENT_TYPES = new Set([
  "weapon", "armor", "equipment", "backpack", "consumable",
  "shield", "treasure", "worn",
]);

const equipmentCache = new Map();

/**
 * Find an equipment item by name. Returns the raw data object with runes applied,
 * or null if not found.
 * @param {string} rawName  - original item string, e.g. "+2 striking staff of withering"
 * @param {{ potency:number, striking:string, resilient:string, baseName:string }} parsed
 */
export async function findEquipmentInCompendium(rawName, parsed) {
  const fullKey = rawName.toLowerCase().trim();
  if (equipmentCache.has(fullKey)) return equipmentCache.get(fullKey);

  const namesToTry = [
    fullKey,
    parsed.baseName.toLowerCase(),
  ].filter(Boolean);

  for (const name of namesToTry) {
    for (const packId of EQUIPMENT_PACKS) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["name", "type"] });

      // Exact match
      let entry = index.find(e => EQUIPMENT_TYPES.has(e.type) && e.name.toLowerCase() === name);

      // Fuzzy: contains
      if (!entry) {
        entry = index.find(e => EQUIPMENT_TYPES.has(e.type) && e.name.toLowerCase().includes(name));
      }

      if (!entry) continue;

      const doc = await pack.getDocument(entry._id);
      const data = doc.toObject();

      // Apply runes if the item supports them
      applyRunes(data, parsed);

      delete data._id;
      equipmentCache.set(fullKey, data);
      return data;
    }
  }

  equipmentCache.set(fullKey, null);
  return null;
}

function applyRunes(data, { potency, striking, resilient }) {
  const sys = data.system;
  if (!sys) return;

  // Only apply runes if the item has the property AND the value is truthy
  if (potency && sys.potencyRune?.value !== undefined) {
    sys.potencyRune.value = potency;
  }
  if (striking && sys.strikingRune?.value !== undefined) {
    sys.strikingRune.value = striking;
  }
  if (resilient && sys.resiliencyRune?.value !== undefined) {
    sys.resiliencyRune.value = resilient;
  }

  // Ensure traits always have otherTags to prevent ListFormat crash
  if (sys.traits && !Array.isArray(sys.traits.otherTags)) {
    sys.traits.otherTags = [];
  }
  if (sys.traits?.value && !Array.isArray(sys.traits.value)) {
    sys.traits.value = [];
  }
}
