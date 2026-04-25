// actor-builder.js — converts parsed statblock data into a PF2e NPC actor

import { findSpellInCompendium, buildConditionUUIDMap, findEquipmentInCompendium } from "./compendium-lookup.js";
import { enrichDescription, slugify, parseMagicalItemName } from "./parser.js";

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
        value: data.traits,
        rarity: data.rarity,
        size: { value: data.size },
        senses: { value: buildSensesString(data.senses) },
        languages: {
          value: data.languages.map(l => slugify(l)),
          custom: data.languageSpecial ?? "",
        },
      },
      attributes: {
        hp: { value: data.hp, max: data.hp, details: data.hpNotes },
        ac: { value: data.ac },
        perception: { value: data.perception },
        speed: buildSpeedObject(data.speeds),
        immunities: data.immunities.map(i => ({ type: i.type })),
        weaknesses: data.weaknesses.map(w => ({ type: w.type, value: w.value })),
        resistances: data.resistances.map(r => ({
          type: r.type, value: r.value,
          exceptions: r.exceptions ?? []
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
    const entry = { damage: roll.damage, damageType: roll.damageType };
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
      traits: { value: strike.traits },
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
      traits: { value: action.traits },
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
      results.push(buildFallbackEquipmentItem(item, parsed));
    }
  }
  return results;
}

function buildFallbackEquipmentItem(item, parsed) {
  // Guess type from name patterns
  const name = item.name.toLowerCase();
  const isArmor  = /\b(armor|mail|plate|leather|chain|breastplate|hide|shield)\b/.test(name);
  const isWeapon = /\b(sword|axe|bow|staff|dagger|spear|club|flail|hammer|crossbow|wand)\b/.test(name);
  const type = isArmor ? "armor" : isWeapon ? "weapon" : "equipment";

  const desc = item.description
    ? `<p>${item.description}</p>`
    : "<p><em>Homebrew item — not found in compendium.</em></p>";

  return {
    type,
    name: item.name,
    system: {
      description: { value: desc },
      quantity: 1,
      traits: { value: [], rarity: "common" },
      ...(type === "weapon" && parsed.potency ? {
        potencyRune: { value: parsed.potency },
        strikingRune: { value: parsed.striking },
      } : {}),
      ...(type === "armor" && parsed.potency ? {
        potencyRune: { value: parsed.potency },
        resiliencyRune: { value: parsed.resilient },
      } : {}),
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
      traits: { value: [], rarity: "common" },
    },
  };
}
