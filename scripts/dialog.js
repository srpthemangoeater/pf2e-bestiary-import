// dialog.js — Import dialog with live split-panel preview

import { parseStatblock } from "./parser.js";
import { buildActor } from "./actor-builder.js";
import { clearCache } from "./compendium-lookup.js";

// ── Size slug → display label ──────────────────────────────────────────────
const SIZE_LABEL = {
  tiny: "Tiny", sm: "Small", med: "Medium",
  lg: "Large", huge: "Huge", grg: "Gargantuan"
};

// ── mod → "+X" / "−X" string ──────────────────────────────────────────────
function signedMod(n) { return (n >= 0 ? "+" : "") + n; }

// ── Escape HTML ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Build one preview row ──────────────────────────────────────────────────
function row(text, label, type) {
  return `<div class="psbi-row psbi-row-${type}">
    <div class="psbi-row-text">${esc(text)}</div>
    <div class="psbi-row-label">${label}</div>
  </div>`;
}

// ── Reconstruct display strings from parsed data and render preview HTML ───
function renderPreview(parsed) {
  const blocks = [];
  let fieldCount = 0;

  function add(text, label, type) {
    if (!text) return;
    fieldCount++;
    blocks.push(row(text, label, type));
  }

  // Name
  add(parsed.name, "name", "name");

  // Creature type line
  if (parsed.level !== undefined) {
    add(
      `${SIZE_LABEL[parsed.size] ?? parsed.size} … ${parsed.level}`,
      "creature type",
      "creature"
    );
  }

  // Traits
  const traitParts = [
    parsed.rarity !== "common" ? capitalize(parsed.rarity) : null,
    parsed.alignment && parsed.alignment !== "N" ? parsed.alignment : null,
    SIZE_LABEL[parsed.size],
    ...parsed.traits.map(t => capitalize(t.replace(/-/g, " "))),
  ].filter(Boolean);
  if (traitParts.length) add(traitParts.join(", "), "traits", "traits");

  // Perception + senses
  if (parsed.perception !== 0 || parsed.senses.length) {
    const sStr = parsed.senses.length ? `; ${parsed.senses.join(", ")}` : "";
    add(`Perception ${signedMod(parsed.perception)}${sStr}`, "perception", "perception");
  }

  // Languages
  if (parsed.languages.length) {
    const langStr = parsed.languages.join(", ") +
      (parsed.languageSpecial ? `; ${parsed.languageSpecial}` : "");
    add(`Languages ${langStr}`, "languages", "languages");
  }

  // Skills
  if (parsed.skills.length) {
    const skillStr = parsed.skills.map(s => `${s.name} ${signedMod(s.mod)}`).join(", ");
    add(`Skills ${skillStr}`, "skills", "skills");
  }

  // Ability scores
  const ab = parsed.abilities;
  if (Object.values(ab).some(v => v !== 0)) {
    add(
      `Str ${signedMod(ab.str)}, Dex ${signedMod(ab.dex)}, Con ${signedMod(ab.con)}, ` +
      `Int ${signedMod(ab.int)}, Wis ${signedMod(ab.wis)}, Cha ${signedMod(ab.cha)}`,
      "ability modifiers", "abilities"
    );
  }

  // Items — each entry is { name, description }
  if (parsed.items.length) {
    const itemNames = parsed.items.map(i => i.description ? `${i.name} [homebrew]` : i.name).join(", ");
    add(`Items ${itemNames}`, "items", "items");
  }

  // AC & saves
  if (parsed.ac) {
    let defStr = `AC ${parsed.ac}; Fort ${signedMod(parsed.saves.fort)}, Ref ${signedMod(parsed.saves.ref)}, Will ${signedMod(parsed.saves.will)}`;
    if (parsed.saves.saveNotes) defStr += `; ${parsed.saves.saveNotes}`;
    add(defStr, "AC & saves", "defenses");
  }

  // HP + immunities / weaknesses / resistances
  if (parsed.hp) {
    let hpStr = `HP ${parsed.hp}`;
    if (parsed.hpNotes) hpStr += ` (${parsed.hpNotes})`;
    if (parsed.immunities.length)
      hpStr += `; Immunities ${parsed.immunities.map(i => i.type).join(", ")}`;
    if (parsed.weaknesses.length)
      hpStr += `; Weaknesses ${parsed.weaknesses.map(w => `${w.type} ${w.value}`).join(", ")}`;
    if (parsed.resistances.length)
      hpStr += `; Resistances ${parsed.resistances.map(r => `${r.type} ${r.value}`).join(", ")}`;
    add(hpStr, "HP & resistances", "hp");
  }

  // Speed
  if (parsed.speeds.walk) {
    const spdParts = [`${parsed.speeds.walk} feet`];
    for (const s of parsed.speeds.other) spdParts.push(`${s.type} ${s.value} feet`);
    add(`Speed ${spdParts.join(", ")}`, "speed", "speed");
  }

  // Passives / auras / actions / reactions
  for (const action of parsed.actions) {
    const costLabel = {
      passive: "[aura]", reaction: "[reaction]", free: "[free-action]",
      action: { 1: "[one-action]", 2: "[two-actions]", 3: "[three-actions]" }[action.actions] ?? "[action]"
    }[action.actionType] ?? "";
    const traitStr = action.traits.length ? ` (${action.traits.join(", ")})` : "";
    // Strip enricher tags and condition placeholders for preview display
    const descClean = action.description
      .replace(/@\w+\[[^\]]+\]\{([^}]+)\}/g, "$1")
      .replace(/\[\[CONDITION:([^\]]+)\]\]/g, "$1")
      .substring(0, 80);
    const preview = `${action.name} ${costLabel}${traitStr} ${descClean}${action.description.length > 80 ? "…" : ""}`;
    add(preview, "ability / action", "action");
  }

  // Strikes
  for (const strike of parsed.strikes) {
    const dmgStr = strike.damageRolls
      .map(d => `${d.damage} ${d.category === "persistent" ? "persistent " : ""}${d.damageType}`)
      .join(" + ");
    const notesStr = strike.notes?.length ? ` plus ${strike.notes.join(", ")}` : "";
    const traitStr = strike.traits.length ? ` (${strike.traits.join(", ")})` : "";
    add(
      `${capitalize(strike.weaponType)} [one-action] ${strike.name} ${signedMod(strike.bonus)}${traitStr}, Damage ${dmgStr}${notesStr}`,
      "melee strike",
      "strike"
    );
  }

  // Spellcasting entries
  for (const entry of parsed.spellcastingEntries) {
    const spellSummary = entry.spells.length
      ? ` — ${entry.spells.length} spell${entry.spells.length > 1 ? "s" : ""}`
      : "";
    add(
      `${entry.name} DC ${entry.dc}, attack ${signedMod(entry.attack)}${spellSummary}`,
      "spells",
      "spells"
    );
    // Show each spell level as a sub-row
    const byLevel = groupSpellsByLevel(entry.spells);
    for (const [lvl, spells] of byLevel) {
      const lvlLabel = lvl === 0 ? "Cantrips" : `${lvl}${ordinal(lvl)}`;
      const names = spells.map(s => s.name + (s.uses > 1 ? ` ×${s.uses}` : "") + (s.atWill ? " (at will)" : "")).join(", ");
      fieldCount++;
      blocks.push(
        `<div class="psbi-row psbi-row-spell-level">
          <div class="psbi-row-text">&nbsp;&nbsp;&nbsp;${lvlLabel}: ${esc(names)}</div>
          <div class="psbi-row-label">spell list</div>
        </div>`
      );
    }
  }

  return { html: blocks.join(""), fieldCount };
}

function groupSpellsByLevel(spells) {
  const map = new Map();
  for (const sp of spells) {
    if (!map.has(sp.level)) map.set(sp.level, []);
    map.get(sp.level).push(sp);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function ordinal(n) {
  if (n === 1) return "st"; if (n === 2) return "nd"; if (n === 3) return "rd"; return "th";
}

// ── Dialog class ───────────────────────────────────────────────────────────
export class StatblockImportDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pf2e-statblock-import",
      title: "PF2e Statblock Importer",
      template: "modules/pf2e-bestiary-import/templates/import-dialog.hbs",
      width: 880,
      height: 660,
      resizable: true,
      classes: ["pf2e-statblock-import"],
    });
  }

  getData() {
    return {
      folders: game.folders
        .filter(f => f.type === "Actor")
        .map(f => ({ id: f.id, name: f.name })),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const textarea = html.find("#psbi-statblock")[0];
    const preview  = html.find("#psbi-preview")[0];
    const counter  = html.find("#psbi-field-count")[0];

    // Live preview with 250 ms debounce
    let debounceTimer;
    textarea.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this._updatePreview(textarea, preview, counter), 250);
    });

    html.find("#psbi-import-btn").on("click", this._onImport.bind(this));
    html.find("#psbi-clear-btn").on("click", () => {
      textarea.value = "";
      preview.innerHTML = "";
      counter.textContent = "—";
      html.find("#psbi-log").html("");
    });
  }

  _updatePreview(textarea, preview, counter) {
    const text = textarea.value.trim();
    if (!text) {
      preview.innerHTML = "";
      counter.textContent = "—";
      return;
    }
    try {
      const parsed = parseStatblock(text);
      const { html, fieldCount } = renderPreview(parsed);
      preview.innerHTML = html;
      counter.textContent = `${fieldCount} fields matched`;
    } catch (e) {
      preview.innerHTML = `<div class="psbi-row psbi-row-error">Parse error: ${esc(e.message)}</div>`;
      counter.textContent = "error";
    }
  }

  async _onImport(event) {
    event.preventDefault();
    const html   = this.element;
    const text   = html.find("#psbi-statblock").val()?.trim();
    const folder = html.find("#psbi-folder").val() || null;
    const log    = html.find("#psbi-log");

    if (!text) {
      ui.notifications.warn("PF2e Statblock Importer: No statblock text provided.");
      return;
    }

    const btn = html.find("#psbi-import-btn");
    btn.prop("disabled", true).html('<i class="fas fa-spinner fa-spin"></i> Importing…');
    log.html("<p>Parsing statblock…</p>");

    try {
      clearCache();
      const parsed = parseStatblock(text);
      log.append(`<p>Parsed: <strong>${esc(parsed.name)}</strong> (Level ${parsed.level})</p>`);

      const { actor, issues } = await buildActor(parsed, { folderId: folder });
      log.append(`<p class="psbi-log-ok">✔ Actor created: <strong>${esc(actor.name)}</strong></p>`);

      if (issues.length) {
        log.append(
          `<p><strong>Warnings (${issues.length}):</strong></p>` +
          `<ul>${issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`
        );
      }

      ui.notifications.info(`PF2e Statblock Importer: "${actor.name}" imported successfully.`);
      actor.sheet.render(true);
    } catch (err) {
      log.append(`<p class="psbi-error">Error: ${esc(err.message)}</p>`);
      console.error("PF2e Statblock Importer |", err);
      ui.notifications.error("PF2e Statblock Importer: Import failed. See console for details.");
    } finally {
      btn.prop("disabled", false).html('<i class="fas fa-file-import"></i> Import');
    }
  }
}
