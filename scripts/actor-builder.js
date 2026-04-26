// actor-builder.js — converts parsed statblock data into a PF2e NPC actor

import { findSpellInCompendium, buildConditionUUIDMap, findEquipmentInCompendium } from "./compendium-lookup.js";
import { enrichDescription, slugify, parseMagicalItemName } from "./parser.js";

// ── Trait sanitisation ─────────────────────────────────────────────────────

// Magic-school traits removed in PF2e Remaster — invalid for all item types.
const SCHOOL_TRAITS = new Set([
  "abjuration", "conjuration", "divination", "enchantment",
  "evocation", "illusion", "necromancy", "transmutation",
]);

// Legacy damage / IWR types → Remaster equivalents.
const LEGACY_DAMAGE_TYPE_MAP = {
  "negative": "void",
  "positive": "vitality",
  "chaotic":  "spirit",
  "lawful":   "spirit",
  "good":     "spirit",
  "evil":     "spirit",
};

function remasterDamageType(slug) {
  if (typeof slug !== "string") return slug;
  const key = slug.toLowerCase();
  return LEGACY_DAMAGE_TYPE_MAP[key] ?? key;
}

/**
 * Returns slug only if PF2e knows it as a damage type or category. If unknown,
 * returns "untyped" so the label getter never sees an undefined slug.
 */
function safeDamageType(slug) {
  const remastered = remasterDamageType(slug);
  const pf2e = CONFIG?.PF2E ?? {};
  if (
    (pf2e.damageTypes && remastered in pf2e.damageTypes) ||
    (pf2e.damageCategories && remastered in pf2e.damageCategories)
  ) return remastered;
  return "untyped";
}

/**
 * Check a slug against PF2e's own CONFIG dictionaries.
 * Returns true only when PF2e actually knows about this trait slug,
 * so #createLabel / ListFormat.format never receives undefined.
 */
function isKnownPF2eTrait(slug, ...configKeys) {
  const pf2e = CONFIG?.PF2E ?? {};
  // Check specific keys first (fast path)
  for (const key of configKeys) {
    if (pf2e[key] && slug in pf2e[key]) return true;
  }
  // Fallback: scan all PF2e trait dictionaries
  for (const val of Object.values(pf2e)) {
    if (val && typeof val === "object" && !Array.isArray(val) && slug in val) return true;
  }
  return false;
}

/**
 * Sanitise traits for an **action / ability** item.
 * Filters to slugs PF2e recognises as valid action/feat traits.
 */
function sanitiseActionTraits(traits) {
  return traits.filter(t => {
    if (typeof t !== "string" || t.length === 0) return false;
    if (SCHOOL_TRAITS.has(t)) return false;
    return isKnownPF2eTrait(t, "actionTraits", "featTraits");
  });
}

/**
 * Sanitise traits for a **melee / ranged** strike item.
 * Normalises reach/range text slugs and filters to known weapon traits.
 */
function sanitiseStrikeTraits(traits) {
  return traits
    .filter(t => typeof t === "string" && t.length > 0)
    .map(t => {
      if (/^reach/.test(t)) return "reach";        // "reach-10-feet" → "reach"
      if (/^range/.test(t)) return null;            // range-increment-X not a trait slug
      return t;
    })
    .filter(slug => slug && isKnownPF2eTrait(slug, "weaponTraits", "npcAttackTraits"));
}

/**
 * Sanitise traits for an **NPC actor** (creature traits only).
 * Class names like "Witch" are NOT valid creature trait slugs.
 */
function sanitiseCreatureTraits(traits) {
  return traits.filter(t => {
    if (typeof t !== "string" || t.length === 0) return false;
    return isKnownPF2eTrait(t, "creatureTraits", "monsterTraits");
  });
}

/**
 * Generic CONFIG dictionary check for non-trait fields (IWR / senses / languages).
 * Returns true only when PF2e knows the slug — anything else would yield
 * `undefined` from #createLabel and crash ListFormat.format().
 */
function isKnownInDict(slug, ...configKeys) {
  const pf2e = CONFIG?.PF2E ?? {};
  for (const key of configKeys) {
    const dict = pf2e[key];
    if (!dict) continue;
    if (dict instanceof Map) {
      if (dict.has(slug)) return true;
    } else if (typeof dict === "object" && slug in dict) {
      return true;
    }
  }
  return false;
}

function sanitiseImmunities(list) {
  return list
    .map(i => ({ ...i, type: remasterDamageType(i?.type) }))
    .filter(i =>
      typeof i.type === "string" &&
      isKnownInDict(i.type, "immunityTypes", "damageTypes", "damageCategories")
    );
}

function sanitiseWeaknesses(list) {
  return list
    .map(w => ({ ...w, type: remasterDamageType(w?.type) }))
    .filter(w =>
      typeof w.type === "string" &&
      isKnownInDict(w.type, "weaknessTypes", "damageTypes", "damageCategories")
    );
}

function sanitiseResistances(list) {
  return list
    .map(r => ({ ...r, type: remasterDamageType(r?.type) }))
    .filter(r =>
      typeof r.type === "string" &&
      isKnownInDict(r.type, "resistanceTypes", "damageTypes", "damageCategories")
    );
}

/**
 * Parse a single sense string like "scent (imprecise) 30 feet" into
 * `{ type, acuity, range }` if PF2e knows the type slug; otherwise null.
 */
function parseSenseEntry(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const lower = raw.toLowerCase().trim();
  // Extract optional acuity in parentheses
  const acuityMatch = lower.match(/\(([^)]+)\)/);
  const acuity = acuityMatch ? acuityMatch[1].trim() : null;
  // Extract optional range in feet
  const rangeMatch = lower.match(/(\d+)\s*(?:feet|ft\.?)/);
  const range = rangeMatch ? parseInt(rangeMatch[1]) : null;
  // Extract head before paren / number
  const head = lower
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+\s*(?:feet|ft\.?)/, "")
    .trim();
  const slug = slugify(head);
  if (!slug) return null;
  if (!isKnownInDict(slug, "senses", "senseTypes")) return null;
  const entry = { type: slug };
  if (acuity && ["precise", "imprecise", "vague"].includes(acuity)) entry.acuity = acuity;
  if (range && Number.isFinite(range)) entry.range = range;
  return entry;
}

function buildPerceptionSenses(senses) {
  const known = [];
  const unknown = [];
  for (const raw of senses) {
    const parsed = parseSenseEntry(raw);
    if (parsed) known.push(parsed);
    else if (typeof raw === "string" && raw.length > 0) unknown.push(raw);
  }
  return { senses: known, unknown };
}

function sanitiseLanguages(langs) {
  // PF2e accepts arbitrary language slugs but still looks them up for labels;
  // fall back to "custom" field if dictionary check fails.
  const known = [];
  const unknown = [];
  for (const l of langs) {
    if (typeof l !== "string" || l.length === 0) continue;
    const slug = slugify(l);
    if (isKnownInDict(slug, "languages")) known.push(slug);
    else unknown.push(l);
  }
  return { value: known, customExtra: unknown.join(", ") };
}

export async function buildActor(data, { folderId = null } = {}) {
  const issues = [];

  // Pre-build condition UUID map once (cached for subsequent lookups)
  const conditionMap = await buildConditionUUIDMap();

  const actorData = buildActorData(data);
  if (folderId) actorData.folder = folderId;

  const actor = await Actor.create(actorData);
  if (!actor) throw new Error("Failed to create actor.");

  const items = [];

  // Skills → lore items
  for (const skill of data.skills) {
    items.push(buildLoreItem(skill));
  }

  // Equipment items (from "Items" line)
  const equipmentItems = await buildEquipmentItems(data.items, issues);
  items.push(...equipmentItems);

  // Strikes → melee items
  for (const strike of data.strikes) {
    items.push(buildMeleeItem(strike, conditionMap));
  }

  // Actions/Passives/Reactions → action items
  for (const action of data.actions) {
    items.push(buildActionItem(action, conditionMap));
  }

  // Spellcasting entries + spells
  for (const entry of data.spellcastingEntries) {
    const entryItem = buildSpellcastingEntryItem(entry);
    const [createdEntry] = await actor.createEmbeddedDocuments("Item", [entryItem]);
    const entryId = createdEntry.id;

    const spellItems = await buildSpellItems(entry, entryId, issues);
    if (spellItems.length > 0) {
      await actor.createEmbeddedDocuments("Item", spellItems);
    }
  }

  if (items.length > 0) {
    await actor.createEmbeddedDocuments("Item", items);
  }

  return { actor, issues };
}

function buildActorData(data) {
  const langs = sanitiseLanguages(data.languages);
  const { senses: parsedSenses, unknown: unknownSenses } = buildPerceptionSenses(data.senses);
  const customParts = [
    data.languageSpecial,
    langs.customExtra,
    unknownSenses.length ? `Senses: ${unknownSenses.join(", ")}` : "",
  ].filter(Boolean);
  return {
    type: "npc",
    name: data.name,
    system: {
      details: {
        level: { value: data.level },
        alignment: { value: data.alignment },
        publicNotes: "",
        privateNotes: "",
      },
      traits: {
        value: sanitiseCreatureTraits(data.traits),
        rarity: data.rarity,
        size: { value: data.size },
        languages: {
          value: langs.value,
          custom: customParts.join("; "),
        },
      },
      perception: {
        mod: data.perception,
        senses: parsedSenses,
        details: unknownSenses.length ? unknownSenses.join(", ") : "",
      },
      attributes: {
        hp: { value: data.hp, max: data.hp, details: data.hpNotes },
        ac: { value: data.ac },
        speed: buildSpeedObject(data.speeds),
        immunities: sanitiseImmunities(data.immunities).map(i => ({ type: i.type })),
        weaknesses: sanitiseWeaknesses(data.weaknesses).map(w => ({ type: w.type, value: w.value })),
        resistances: sanitiseResistances(data.resistances).map(r => ({
          type: r.type, value: r.value,
          exceptions: (r.exceptions ?? []).filter(e =>
            isKnownInDict(typeof e === "string" ? e : "", "damageTypes", "damageCategories")
          ),
        })),
        allSaves: { value: data.saves.saveNotes ?? "" },
      },
      saves: {
        fortitude: { value: data.saves.fort },
        reflex: { value: data.saves.ref },
        will: { value: data.saves.will },
      },
      abilities: {
        str: { mod: data.abilities.str },
        dex: { mod: data.abilities.dex },
        con: { mod: data.abilities.con },
        int: { mod: data.abilities.int },
        wis: { mod: data.abilities.wis },
        cha: { mod: data.abilities.cha },
      },
    },
  };
}

function buildSensesString(senses) {
  return senses.join(", ");
}

function buildSpeedObject(speeds) {
  return {
    value: speeds.walk,
    otherSpeeds: speeds.other.map(s => ({
      type: s.type,
      value: s.value,
    })),
  };
}

function buildLoreItem(skill) {
  return {
    type: "lore",
    name: skill.name,
    system: {
      mod: { value: skill.mod },
      proficient: { value: 1 },
      traits: { value: [], rarity: "common", otherTags: [] },
    },
  };
}

function resolveConditions(text, conditionMap) {
  // Replace [[CONDITION:frightened 2]] → @UUID[...]{frightened 2}
  return text.replace(/\[\[CONDITION:([^\]]+)\]\]/g, (match, raw) => {
    const baseName = raw.trim().replace(/\s+\d+$/, "").toLowerCase();
    const uuid = conditionMap.get(baseName);
    if (!uuid) return raw; // fallback: plain text if not found
    return `@UUID[${uuid}]{${raw.trim()}}`;
  });
}

function buildMeleeItem(strike, conditionMap = new Map()) {
  const damageRolls = {};
  for (const roll of strike.damageRolls) {
    const id = foundry.utils.randomID();
    const entry = { damage: roll.damage, damageType: safeDamageType(roll.damageType) };
    if (roll.category) entry.category = roll.category;
    damageRolls[id] = entry;
  }

  // Notes from "plus <ability>" → enriched description
  let description = "";
  if (strike.notes?.length) {
    const noteText = strike.notes.map(n => `plus ${n}`).join(", ");
    description = `<p>${resolveConditions(enrichDescription(noteText), conditionMap)}</p>`;
  }

  return {
    type: "melee",
    name: strike.name,
    system: {
      bonus: { value: strike.bonus },
      damageRolls,
      traits: { value: sanitiseStrikeTraits(strike.traits), rarity: "common", otherTags: [] },
      weaponType: { value: strike.weaponType },
      description: { value: description },
    },
  };
}

function buildActionItem(action, conditionMap = new Map()) {
  const actionTypeMap = {
    action: "action", reaction: "reaction", free: "free", passive: "passive"
  };

  const enrichedDesc = resolveConditions(action.description, conditionMap);

  return {
    type: "action",
    name: action.name,
    system: {
      actionType: { value: actionTypeMap[action.actionType] ?? "action" },
      actions: { value: action.actions },
      traits: { value: sanitiseActionTraits(action.traits), rarity: "common", otherTags: [] },
      description: { value: `<p>${enrichedDesc}</p>` },
    },
  };
}

function buildSpellcastingEntryItem(entry) {
  return {
    type: "spellcastingEntry",
    name: entry.name,
    system: {
      tradition: { value: entry.tradition },
      prepared: { value: entry.prepared },
      spelldc: { dc: entry.dc, value: entry.attack },
      showSlotlessLevels: { value: false },
    },
  };
}

async function buildSpellItems(entry, entryId, issues) {
  const items = [];

  for (const spell of entry.spells) {
    const found = await findSpellInCompendium(spell.name);

    if (found) {
      const spellData = found.toObject();
      spellData.system.location = {
        value: entryId,
        heightenedLevel: spell.level === 0 ? (spell.heighten ?? null) : spell.level,
        uses: spell.atWill ? { value: -1, max: -1 } : { value: spell.uses, max: spell.uses },
      };
      delete spellData._id;
      items.push(spellData);
    } else {
      issues.push(`Spell not found in compendium: "${spell.name}"`);
      items.push(buildFallbackSpellItem(spell, entryId, entry.tradition));
    }
  }

  return items;
}

// ── Equipment ───────────────────────────────────────────────────────────────

async function buildEquipmentItems(itemList, issues) {
  const results = [];
  for (const item of itemList) {
    const parsed = parseMagicalItemName(item.name);
    const found = await findEquipmentInCompendium(item.name, parsed);

    if (found) {
      // Merge homebrew description if provided
      if (item.description) {
        found.system.description = found.system.description ?? {};
        const existing = found.system.description.value ?? "";
        found.system.description.value =
          existing
            ? `${existing}<hr/><p><em>${item.description}</em></p>`
            : `<p>${item.description}</p>`;
      }
      results.push(found);
    } else {
      // Homebrew / not found → create placeholder equipment
      issues.push(`Equipment not found in compendium: "${item.name}"`);
      results.push(buildFallbackEquipmentItem(item));
    }
  }
  return results;
}

function buildFallbackEquipmentItem(item) {
  // Always use "equipment" type for homebrew/unfound items.
  // Creating weapon/armor without their full required schema (damage, category,
  // group, hands, etc.) causes the PF2e sheet renderer to crash.
  const desc = item.description
    ? `<p>${item.description}</p>`
    : "<p><em>Homebrew item — not found in compendium.</em></p>";

  return {
    type: "equipment",
    name: item.name,
    system: {
      description: { value: desc },
      quantity: 1,
      weight: { value: "L" },
      equipped: { carryType: "worn", inSlot: false, invested: null },
      traits: { value: [], rarity: "common", otherTags: [] },
    },
  };
}

function buildFallbackSpellItem(spell, entryId, tradition) {
  return {
    type: "spell",
    name: spell.name,
    system: {
      level: { value: spell.level },
      tradition: { value: tradition },
      location: {
        value: entryId,
        heightenedLevel: spell.level === 0 ? (spell.heighten ?? null) : spell.level,
        uses: spell.atWill ? { value: -1, max: -1 } : { value: spell.uses, max: spell.uses },
      },
      description: { value: "<p><em>Not found in compendium. Please replace with the correct spell.</em></p>" },
      traits: { value: [], rarity: "common", otherTags: [] },
    },
  };
}
