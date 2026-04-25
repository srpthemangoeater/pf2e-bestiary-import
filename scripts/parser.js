// parser.js — converts raw statblock text into a structured JS object

const SIZES = {
  tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg"
};

const ALIGNMENTS = new Set(["LG", "LN", "LE", "NG", "N", "NE", "CG", "CN", "CE"]);
const RARITIES = new Set(["common", "uncommon", "rare", "unique"]);

const ACTION_COST_MAP = {
  "one-action": 1, "two-actions": 2, "three-actions": 3,
  "reaction": "reaction", "free-action": "free"
};

const CLASS_TRADITION = {
  witch: "occult", wizard: "arcane", sorcerer: "arcane", magus: "arcane",
  cleric: "divine", champion: "divine", oracle: "divine",
  druid: "primal", ranger: "primal", animist: "primal",
  bard: "occult", psychic: "occult", thaumaturge: "occult",
};

export function parseStatblock(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim());
  const nonEmpty = lines.filter(l => l.length > 0);

  const result = {
    name: "",
    level: 0,
    size: "med",
    rarity: "common",
    alignment: "N",
    traits: [],
    perception: 0,
    senses: [],
    languages: [],
    languageSpecial: "",
    skills: [],
    abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    items: [],
    ac: 10,
    saves: { fort: 0, ref: 0, will: 0, saveNotes: "" },
    hp: 1,
    hpNotes: "",
    immunities: [],
    weaknesses: [],
    resistances: [],
    speeds: { walk: 25, other: [] },
    passives: [],
    strikes: [],
    spellcastingEntries: [],
    actions: [],
  };

  if (nonEmpty.length === 0) return result;

  result.name = nonEmpty[0];

  // Find and parse the "Size CreatureType Level" line
  const levelLineIdx = nonEmpty.findIndex((l, i) => i > 0 && /\b\d+\s*$/.test(l) && /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(l));
  if (levelLineIdx !== -1) {
    const m = nonEmpty[levelLineIdx].match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.*?)\s+(\d+)\s*$/i);
    if (m) {
      result.size = SIZES[m[1].toLowerCase()] ?? "med";
      result.level = parseInt(m[3]);
    }
  }

  for (const line of nonEmpty) {
    // Traits line: comma-separated list containing rarity, alignment, size, or creature types
    // e.g. "Uncommon, CE, Large, Demon, Fiend, Witch"
    if (isTraitsLine(line)) {
      parseTraitsLine(line, result);
      continue;
    }

    if (/^Perception\s+/i.test(line)) { parsePerception(line, result); continue; }
    if (/^Languages?\s+/i.test(line)) { parseLanguages(line, result); continue; }
    if (/^Skills?\s+/i.test(line)) { parseSkills(line, result); continue; }
    if (/^Str\s+[+-]\d+/i.test(line)) { parseAbilityScores(line, result); continue; }
    if (/^Items?\s+/i.test(line)) { parseEquipmentItems(line, result); continue; }
    if (/^AC\s+\d+/i.test(line)) { parseDefenses(line, result); continue; }
    if (/^HP\s+\d+/i.test(line)) { parseHP(line, result); continue; }
    if (/^Speed\s+/i.test(line)) { parseSpeeds(line, result); continue; }
    if (/^(Melee|Ranged)\s+\[/i.test(line)) { parseStrike(line, result); continue; }
    if (/^\w[\w\s]*?\bSpells?\s+DC\s+\d+/i.test(line)) {
      parseSpellcastingEntry(line, result); continue;
    }
  }

  // Parse multi-line blocks: passives and actions (separated by blank lines from the main block)
  parseAbilityBlocks(lines, result);

  return result;
}

function isTraitsLine(line) {
  if (!line.includes(",")) return false;
  const parts = line.split(",").map(s => s.trim());
  // A traits line has at least one rarity, alignment, size, or short capitalized token
  return parts.some(p =>
    RARITIES.has(p.toLowerCase()) ||
    ALIGNMENTS.has(p) ||
    SIZES[p.toLowerCase()] !== undefined ||
    /^[A-Z][a-z]+$/.test(p)
  ) && !/^(AC|HP|Fort|Ref|Will|Speed|Perception|Skills?|Languages?|Items?|Str)\b/i.test(line);
}

function parseTraitsLine(line, result) {
  const parts = line.split(",").map(s => s.trim());
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (RARITIES.has(lower)) { result.rarity = lower; continue; }
    if (ALIGNMENTS.has(p)) { result.alignment = p; continue; }
    if (SIZES[lower]) continue; // size already parsed from level line
    if (p) result.traits.push(slugify(p));
  }
}

function parsePerception(line, result) {
  const m = line.match(/^Perception\s+([+-]?\d+)(.*)/i);
  if (!m) return;
  result.perception = parseInt(m[1]);
  const rest = m[2];
  const senses = rest.split(";").map(s => s.trim()).filter(Boolean);
  if (senses.length > 0) result.senses = senses.flatMap(s => s.split(",").map(x => x.trim())).filter(Boolean);
}

function parseLanguages(line, result) {
  const m = line.match(/^Languages?\s+(.*)/i);
  if (!m) return;
  const [langs, special] = m[1].split(";");
  result.languages = langs.split(",").map(l => l.trim()).filter(Boolean);
  if (special) result.languageSpecial = special.trim();
}

function parseSkills(line, result) {
  const m = line.match(/^Skills?\s+(.*)/i);
  if (!m) return;
  const pairs = m[1].split(",");
  for (const pair of pairs) {
    const sm = pair.trim().match(/^(.+?)\s+([+-]\d+)$/);
    if (sm) result.skills.push({ name: sm[1].trim(), mod: parseInt(sm[2]) });
  }
}

function parseAbilityScores(line, result) {
  const keys = ["str", "dex", "con", "int", "wis", "cha"];
  const labels = ["Str", "Dex", "Con", "Int", "Wis", "Cha"];
  for (let i = 0; i < keys.length; i++) {
    const m = line.match(new RegExp(labels[i] + "\\s+([+-]\\d+)", "i"));
    if (m) result.abilities[keys[i]] = parseInt(m[1]);
  }
}

function parseEquipmentItems(line, result) {
  const m = line.match(/^Items?\s+(.*)/i);
  if (!m) return;

  // Split by comma but respect square brackets: "idol [desc], +2 staff"
  const parts = splitRespectBrackets(m[1]);
  result.items = parts.map(part => {
    const bracketM = part.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
    if (bracketM) {
      return { name: bracketM[1].trim(), description: bracketM[2].trim() };
    }
    return { name: part.trim(), description: "" };
  }).filter(i => i.name);
}

function splitRespectBrackets(str) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "[") { depth++; cur += ch; }
    else if (ch === "]") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Parse magical prefixes from an item name string
// "+2 striking staff of withering" → { potency:2, striking:"striking", baseName:"staff of withering" }
export function parseMagicalItemName(name) {
  let remainder = name.trim();
  let potency = 0;
  let striking = "";
  let resilient = "";

  const potencyM = remainder.match(/^\+(\d)\s+/);
  if (potencyM) { potency = parseInt(potencyM[1]); remainder = remainder.slice(potencyM[0].length); }

  const strikingM = remainder.match(/^(major striking|greater striking|striking)\s+/i);
  if (strikingM) {
    const s = strikingM[1].toLowerCase();
    striking = s.includes("major") ? "majorStriking" : s.includes("greater") ? "greaterStriking" : "striking";
    remainder = remainder.slice(strikingM[0].length);
  }

  const resilientM = remainder.match(/^(major resilient|greater resilient|resilient)\s+/i);
  if (resilientM) {
    const r = resilientM[1].toLowerCase();
    resilient = r.includes("major") ? "majorResilient" : r.includes("greater") ? "greaterResilient" : "resilient";
    remainder = remainder.slice(resilientM[0].length);
  }

  return { baseName: remainder.trim(), potency, striking, resilient };
}

function parseDefenses(line, result) {
  // AC 30; Fort +21, Ref +15, Will +20; +1 status to all saves vs. magic
  const acM = line.match(/AC\s+(\d+)/i);
  if (acM) result.ac = parseInt(acM[1]);

  const fortM = line.match(/Fort(?:itude)?\s+([+-]\d+)/i);
  if (fortM) result.saves.fort = parseInt(fortM[1]);

  const refM = line.match(/Ref(?:lex)?\s+([+-]\d+)/i);
  if (refM) result.saves.ref = parseInt(refM[1]);

  const willM = line.match(/Will\s+([+-]\d+)/i);
  if (willM) result.saves.will = parseInt(willM[1]);

  // Save notes: everything after the last save value
  const notesM = line.match(/Will\s+[+-]\d+;?\s*(.*)/i);
  if (notesM && notesM[1].trim()) result.saves.saveNotes = notesM[1].trim();
}

function parseHP(line, result) {
  // HP 200; Immunities fire, poison; Weaknesses cold iron 10, good 10; Resistances physical 10 (except cold iron)
  const hpM = line.match(/HP\s+(\d+)\s*;?(.*)/i);
  if (!hpM) return;
  result.hp = parseInt(hpM[1]);
  const rest = hpM[2];

  const immM = rest.match(/Immunities\s+([^;]+)/i);
  if (immM) result.immunities = parseValuedList(immM[1]);

  const weakM = rest.match(/Weaknesses?\s+([^;]+)/i);
  if (weakM) result.weaknesses = parseValuedList(weakM[1]);

  const resM = rest.match(/Resistances?\s+([^;]+)/i);
  if (resM) result.resistances = parseValuedList(resM[1]);

  // HP notes (e.g. "fast healing 5")
  const hpNoteM = rest.match(/^([^;]+?)\s*(?:;|$)/);
  if (hpNoteM && hpNoteM[1].trim() && !/^(Immunities|Weaknesses|Resistances)/i.test(hpNoteM[1])) {
    result.hpNotes = hpNoteM[1].trim();
  }
}

// Parses "cold iron 10, good 10, physical 10 (except cold iron)"
function parseValuedList(str) {
  const items = [];
  // Split by comma but respect parentheses
  const parts = str.split(/,(?![^(]*\))/);
  for (const part of parts) {
    const m = part.trim().match(/^(.+?)\s+(\d+)\s*(\([^)]*\))?$/);
    if (m) {
      items.push({
        type: slugify(m[1].trim()),
        value: parseInt(m[2]),
        exceptions: m[3] ? m[3].replace(/[()]/g, "").split(",").map(s => slugify(s.trim())) : []
      });
    } else if (part.trim()) {
      // No value (e.g. immunity with no number)
      items.push({ type: slugify(part.trim()), value: 0, exceptions: [] });
    }
  }
  return items;
}

function parseSpeeds(line, result) {
  // Speed 30 feet, fly 40 feet, swim 20 feet
  const m = line.match(/^Speed\s+(.*)/i);
  if (!m) return;
  const parts = m[1].split(",");
  for (const part of parts) {
    const sp = part.trim();
    const walkM = sp.match(/^(\d+)\s*feet?/i);
    if (walkM) { result.speeds.walk = parseInt(walkM[1]); continue; }
    const otherM = sp.match(/^(fly|swim|burrow|climb)\s+(\d+)\s*feet?/i);
    if (otherM) result.speeds.other.push({ type: otherM[1].toLowerCase(), value: parseInt(otherM[2]) });
  }
}

function parseStrike(line, result) {
  // Melee [one-action] devouring maw +22 (magical, reach 10 feet), Damage 2d12+14 piercing plus gorge
  const typeM = line.match(/^(Melee|Ranged)\s+/i);
  if (!typeM) return;
  const weaponType = typeM[1].toLowerCase();

  const costM = line.match(/\[([^\]]+)\]/);
  const cost = costM ? ACTION_COST_MAP[costM[1].toLowerCase()] ?? 1 : 1;

  // name and bonus: "devouring maw +22"
  const nameM = line.match(/\]\s+(.+?)\s+([+-]\d+)\s*(?:\(|,|$)/);
  if (!nameM) return;
  const name = nameM[1].trim();
  const bonus = parseInt(nameM[2]);

  // Traits in parentheses
  const traitM = line.match(/\(([^)]+)\)/);
  const traits = traitM
    ? traitM[1].split(",").map(t => slugify(t.trim())).filter(Boolean)
    : [];

  // Damage: everything after "Damage "
  const damageM = line.match(/Damage\s+(.+)$/i);
  const damageStr = damageM ? damageM[1] : "";
  const { rolls: damageRolls, notes } = parseDamageRolls(damageStr);

  result.strikes.push({ name, weaponType, cost, bonus, traits, damageRolls, notes });
}

function parseDamageRolls(str) {
  // Examples:
  //   "2d12+14 piercing plus gorge"              → roll piercing, note "gorge"
  //   "2d8+6 slashing plus 1d6 fire"             → roll slashing + roll fire
  //   "2d6+4 piercing plus 1d6 persistent bleed" → roll piercing + roll persistent bleed
  //   "2d8+6 slashing and 1d4 bludgeoning"       → roll slashing + roll bludgeoning
  const rolls = [];
  const notes = [];

  // Split on " plus " first, then " and " within each segment
  const plusSegments = str.split(/\s+plus\s+/i);
  for (const seg of plusSegments) {
    const andParts = seg.split(/\s+and\s+/i);
    for (const part of andParts) {
      const t = part.trim();
      // Match: dice [persistent] type
      const diceM = t.match(/^(\d+d\d+(?:[+-]\d+)?)\s+(?:(persistent)\s+)?(\w+)/i);
      if (diceM) {
        const roll = {
          damage: diceM[1],
          damageType: mapDamageType(diceM[3].toLowerCase()),
        };
        if (diceM[2]) roll.category = "persistent";
        rolls.push(roll);
      } else if (t && rolls.length > 0) {
        // Non-dice text after "plus" = named ability trigger (e.g. "gorge", "grab")
        notes.push(t);
      }
    }
  }

  return { rolls, notes };
}

function parseSpellcastingEntry(line, result) {
  // "Divine Innate Spells DC 29, attack +21; 5th ...; 4th ...; Cantrips (5th) ..."
  const headerM = line.match(/^([\w\s]+?)\s+DC\s+(\d+)(?:,\s*attack\s+([+-]\d+))?;?\s*(.*)/i);
  if (!headerM) return;

  const entryName = headerM[1].trim();  // "Divine Innate Spells"
  const dc = parseInt(headerM[2]);
  const attack = headerM[3] ? parseInt(headerM[3]) : dc - 8;
  const rest = headerM[4];

  // Determine tradition and prepared type from entry name
  const { tradition, prepared } = detectSpellcastingType(entryName);

  const spells = parseSpellLevels(rest);

  result.spellcastingEntries.push({ name: entryName, tradition, prepared, dc, attack, spells });
}

function detectSpellcastingType(name) {
  const lower = name.toLowerCase();
  let tradition = "arcane";
  let prepared = "prepared";

  if (lower.includes("innate")) prepared = "innate";
  else if (lower.includes("focus")) prepared = "focus";
  else if (lower.includes("spontaneous")) prepared = "spontaneous";
  else prepared = "prepared";

  if (lower.includes("divine")) tradition = "divine";
  else if (lower.includes("occult")) tradition = "occult";
  else if (lower.includes("primal")) tradition = "primal";
  else if (lower.includes("arcane")) tradition = "arcane";
  else {
    // Try to infer from class name
    for (const [cls, trad] of Object.entries(CLASS_TRADITION)) {
      if (lower.includes(cls)) { tradition = trad; break; }
    }
  }
  return { tradition, prepared };
}

function parseSpellLevels(str) {
  // "5th feast of ashes (x2), dimension door; 4th create food (at will), gluttony curse; Cantrips (5th) detect magic, spout"
  const spells = [];
  // Split by ";", each segment is "Nth spell1, spell2" or "Cantrips (Nth) spell1, spell2"
  const segments = str.split(";").map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const cantripM = seg.match(/^Cantrips?\s+\((\d+)(?:st|nd|rd|th)\)\s+(.*)/i);
    if (cantripM) {
      const heighten = parseInt(cantripM[1]);
      const names = parseSpellNames(cantripM[2]);
      for (const sp of names) spells.push({ ...sp, level: 0, heighten });
      continue;
    }
    const levelM = seg.match(/^(\d+)(?:st|nd|rd|th)\s+(.*)/i);
    if (levelM) {
      const level = parseInt(levelM[1]);
      const names = parseSpellNames(levelM[2]);
      for (const sp of names) spells.push({ ...sp, level });
      continue;
    }
  }
  return spells;
}

function parseSpellNames(str) {
  // "feast of ashes (x2), dimension door, create food (at will)"
  const spells = [];
  const parts = str.split(",").map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const countM = part.match(/^(.+?)\s+\(x(\d+)\)$/i);
    const atWillM = part.match(/^(.+?)\s+\(at will\)$/i);
    if (countM) spells.push({ name: countM[1].trim(), uses: parseInt(countM[2]), atWill: false });
    else if (atWillM) spells.push({ name: atWillM[1].trim(), uses: -1, atWill: true });
    else spells.push({ name: part, uses: 1, atWill: false });
  }
  return spells;
}

// Parse passive, aura, action, reaction, free-action blocks from blank-line separated groups
function parseAbilityBlocks(lines, result) {
  const groups = [];
  let current = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) { groups.push(current); current = []; }
    } else {
      current.push(line.trim());
    }
  }
  if (current.length > 0) groups.push(current);

  // Skip first group (header stats) — identify ability groups by [action] tags or known patterns
  const abilityPatterns = /\[(one-action|two-actions|three-actions|reaction|free-action|aura)\]/i;
  const strikePattern = /^(Melee|Ranged)\s+\[/i;
  const spellPattern = /^([\w\s]+?)\s+DC\s+\d+/i;
  const statBlockPattern = /^(AC\s+\d+|HP\s+\d+|Speed\s+|Perception\s+|Skills?\s+|Languages?\s+|Str\s+|Items?\s+)/i;

  for (const group of groups) {
    const joined = group.join(" ");
    if (!abilityPatterns.test(joined)) continue;
    if (strikePattern.test(joined)) continue;
    if (statBlockPattern.test(group[0])) continue;

    // Each line in this group is potentially a separate ability
    for (const line of group) {
      if (!abilityPatterns.test(line)) continue;
      if (strikePattern.test(line)) continue;
      parseAbilityLine(line, result);
    }
  }
}

function parseAbilityLine(line, result) {
  // "Gluttony's Pall [aura] (divine, enchantment, mental) 30 feet. DC 29 Will save..."
  // "Gorge [reaction] Trigger The demon...; Effect ..."
  // "Hollow Feast [three-actions] (attack, divine, necromancy) Makes a..."
  // "Trample [three-actions] Medium or smaller, devouring maw, DC 29"

  const costTagM = line.match(/\[([^\]]+)\]/);
  if (!costTagM) return;
  const costTag = costTagM[1].toLowerCase();

  const nameM = line.match(/^([^[]+)\[/);
  const name = nameM ? nameM[1].trim() : "Unknown";

  // ActionType
  let actionType = "action";
  let actions = 1;
  if (costTag === "aura") { actionType = "passive"; actions = null; }
  else if (costTag === "reaction") { actionType = "reaction"; actions = null; }
  else if (costTag === "free-action") { actionType = "free"; actions = null; }
  else if (costTag === "one-action") { actionType = "action"; actions = 1; }
  else if (costTag === "two-actions") { actionType = "action"; actions = 2; }
  else if (costTag === "three-actions") { actionType = "action"; actions = 3; }

  // Traits in ()
  const traitM = line.match(/\]\s*\(([^)]+)\)/);
  const traits = traitM ? traitM[1].split(",").map(t => slugify(t.trim())).filter(Boolean) : [];
  if (costTag === "aura") traits.push("aura");

  // Description: everything after the cost tag (and optional trait parens)
  const descStart = line.indexOf("]") + 1;
  let desc = line.slice(descStart).replace(/^\s*\([^)]+\)\s*/, "").trim();
  desc = enrichDescription(desc);

  result.actions.push({ name, actionType, actions, traits, description: desc });
}

// PF2e conditions that can appear in ability text
const PF2E_CONDITIONS = [
  "blinded", "clumsy", "confused", "concealed", "dazzled", "deafened",
  "doomed", "drained", "dying", "enfeebled", "fatigued", "fleeing",
  "frightened", "grabbed", "hidden", "immobilized", "invisible",
  "paralyzed", "petrified", "prone", "quickened", "restrained",
  "sickened", "slowed", "stunned", "stupefied", "unconscious",
  "undetected", "unnoticed", "wounded", "encumbered",
];
const CONDITION_PATTERN = new RegExp(
  `\\b(${PF2E_CONDITIONS.join("|")})(\\s+\\d+)?\\b`,
  "gi"
);

export function enrichDescription(text) {
  // DC X [Save] save → @Check enricher
  text = text.replace(/DC\s+(\d+)\s+(Fortitude|Reflex|Will)\s+save/gi, (match, dc, save) =>
    `@Check[type:${save.toLowerCase()}|dc:${dc}]{${match}}`
  );

  // "Xd persistent [type] damage" → @Damage with persistent tag
  text = text.replace(/(\d+d\d+(?:[+-]\d+)?)\s+persistent\s+(\w+)\s+damage/gi, (match, dice, type) =>
    `@Damage[${dice}[persistent,${mapDamageType(type)}]]{${match}}`
  );

  // Standard damage "Xd Y+Z type damage" → @Damage  (skip already-enriched spans)
  text = text.replace(/(\d+d\d+(?:[+-]\d+)?)\s+([\w]+)\s+damage/gi, (match, dice, type) => {
    if (text.includes(`@Damage`) && match.startsWith("@")) return match;
    return `@Damage[${dice}[${mapDamageType(type)}]]{${match}}`;
  });

  // Conditions → placeholder tag; actor-builder replaces these with real @UUID links
  text = text.replace(CONDITION_PATTERN, (match) => `[[CONDITION:${match.trim()}]]`);

  return text;
}

// Exported so actor-builder can resolve [[CONDITION:X]] → @UUID after async compendium lookup
export { PF2E_CONDITIONS };

export function slugify(str) {
  return str.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

export function mapDamageType(type) {
  const map = {
    piercing: "piercing", slashing: "slashing", bludgeoning: "bludgeoning",
    fire: "fire", cold: "cold", electricity: "electricity", acid: "acid",
    sonic: "sonic", force: "force", poison: "poison", mental: "mental",
    bleed: "bleed", bleed_persistent: "bleed", spirit: "spirit",
    positive: "positive", negative: "negative", vitality: "vitality", void: "void",
    chaotic: "chaotic", evil: "evil", good: "good", lawful: "lawful",
  };
  return map[type] ?? type;
}
