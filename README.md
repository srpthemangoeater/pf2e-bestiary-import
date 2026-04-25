# PF2e Bestiary Import

A FoundryVTT module for the **Pathfinder 2e** system that lets you paste a statblock as plain text and instantly create a fully-formatted NPC actor — with compendium lookups, PF2e enricher automation, and live parse preview.

---

## Credits & Attribution

This module is inspired by and modelled after **[5e Statblock Importer](https://github.com/Aioros/5e-statblock-importer)** by **Aioros** — a FoundryVTT module for D&D 5e that pioneered the paste-to-import statblock workflow. The overall architecture (text → structured data → FoundryVTT actor pipeline, compendium spell lookup, import dialog UX) follows the same pattern established by that project.

All PF2e-specific implementation — the parser, data mapping, enricher integration, and UI — was written from scratch for the Pathfinder 2e system.

**System:** [Pathfinder 2e for FoundryVTT](https://github.com/foundryvtt/pf2e) by the PF2e Development Team  
**Game:** Pathfinder 2e / Pathfinder 2e Remaster © Paizo Inc.

---

## Features

| Feature | Detail |
|---|---|
| **Live parse preview** | Split-panel UI — paste text on the left, see colour-coded field preview on the right in real time |
| **Compendium spell lookup** | Spells pulled from `pf2e.spells-srd` and bestiary packs; missing spells get placeholder items with a warning |
| **Legacy → Remaster spell mapping** | Old spell names (e.g. `Vampiric Touch`, `Ray of Enfeeblement`) automatically resolve to their Remaster equivalents |
| **Compendium equipment lookup** | Items searched in `pf2e.equipment-srd`; magical prefix runes (`+2 striking`, `resilient`) applied automatically |
| **Homebrew item support** | Items not found in compendium become placeholder equipment; inline descriptions supported via `item name [description]` format |
| **PF2e enrichers** | DC saves → `@Check`, damage → `@Damage`, conditions → `@UUID[pf2e.conditionitems]` |
| **Plus damage on strikes** | `plus 1d6 fire` becomes a second damage roll; `plus gorge` becomes a description note |
| **Persistent damage** | `plus 1d6 persistent bleed` sets `category: "persistent"` on the damage roll |
| **Condition links** | `frightened 2`, `stunned 1`, etc. in ability text resolve to clickable compendium condition links |
| **Full NPC sheet coverage** | AC, saves, HP, immunities, weaknesses, resistances, speeds, ability scores, skills (as lore items), strikes, spellcasting entries, actions, reactions, free actions, auras |
| **Folder support** | Choose which Actor folder to import into |
| **Macro API** | `PF2eStatblockImport.open()` |

---

## Installation

### Method 1 — Manifest URL (recommended)

1. In Foundry, go to **Configuration → Add-on Modules → Install Module**
2. Paste the manifest URL into the **Manifest URL** field at the bottom:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/pf2e-bestiary-import/main/module.json
   ```
   *(Replace with your actual hosted `module.json` URL — GitHub raw, your own server, etc.)*
3. Click **Install**
4. Enable the module in **Settings → Manage Modules**

### Method 2 — Manual (local file)

1. Download or copy the `pf2e-bestiary-import` folder into:
   ```
   %localappdata%\FoundryVTT\Data\modules\
   ```
   Full path on Windows:
   ```
   C:\Users\[username]\AppData\Local\FoundryVTT\Data\modules\pf2e-bestiary-import\
   ```
2. In Foundry, go to **Settings → Manage Modules** → enable **PF2e Bestiary Import**
3. Reload your world

> Requires FoundryVTT **v13+** and the **PF2e system**.

---

## How to Use

1. Open any world running the PF2e system
2. Click the **Actors** tab in the sidebar
3. Click **Import Statblock** at the bottom of the sidebar
4. Paste your statblock text into the left panel — the right panel shows a live parse preview
5. Select a folder (optional)
6. Click **Import**

The actor sheet opens automatically. Any spells or items not found in the compendium are listed in the log.

**Macro shortcut:**
```js
PF2eStatblockImport.open();
```

---

## Statblock Format

Each section must appear on its own line. Blank lines separate ability blocks (passives, strikes, spells, actions) from the stat header.

```
[Name]

[Size] [Creature Type] [Level]

[Rarity], [Alignment], [Size], [Trait], [Trait], ...

Perception +[mod]; [sense] [range], [sense] [range]

Languages [Language], [Language]; [special communication]

Skills [Skill] +[mod], [Skill] +[mod], ...

Str +[mod], Dex +[mod], Con +[mod], Int +[mod], Wis +[mod], Cha +[mod]

Items [item], +[N] [rune] [item], [homebrew item] [optional description in brackets]

AC [value]; Fort +[mod], Ref +[mod], Will +[mod]; [save notes]

HP [value]; Immunities [type], [type]; Weaknesses [type] [value]; Resistances [type] [value] (except [type])

Speed [value] feet, fly [value] feet, swim [value] feet


[Ability Name] [aura] ([trait], [trait]) [description with DC X Will save]


Melee [one-action] [name] +[bonus] ([trait], reach [X] feet), Damage [dice] [type] plus [dice] [type]

Ranged [one-action] [name] +[bonus] ([trait], range increment [X] feet), Damage [dice] [type]


[Tradition] [Prepared/Innate/Spontaneous] Spells DC [value], attack +[value]; [Nth] [spell] (x[N]), [spell]; Cantrips ([Nth]) [spell]


[Name] [reaction] Trigger [text]; Effect [text]

[Name] [three-actions] ([trait]) [description]
```

### Field Reference

| Field | Format | Notes |
|---|---|---|
| **Name** | First non-empty line | |
| **Size / Level** | `Large Fiend 10` | Size must be first word |
| **Rarity** | `Common` / `Uncommon` / `Rare` / `Unique` | |
| **Alignment** | `LG` `LN` `LE` `NG` `N` `NE` `CG` `CN` `CE` | |
| **Perception** | `Perception +19; darkvision, scent (imprecise) 30 feet` | Senses after `;` |
| **Languages** | `Languages Abyssal, Common; telepathy 100 feet` | Special after `;` |
| **Skills** | `Skills Arcana +20, Deception +21` | |
| **Ability Scores** | `Str +6, Dex +2, Con +5, Int +6, Wis +3, Cha +7` | |
| **Items** | `Items +2 striking staff, healer's tools, idol [dark obsidian idol]` | See item format below |
| **AC / Saves** | `AC 30; Fort +21, Ref +15, Will +20; +1 status to saves vs. magic` | Notes after last save |
| **HP** | `HP 200; Immunities fire; Weaknesses cold iron 10; Resistances physical 10 (except cold iron)` | |
| **Speed** | `Speed 30 feet, fly 40 feet, swim 20 feet` | Walk first, then others |
| **Action cost** | `[one-action]` `[two-actions]` `[three-actions]` `[reaction]` `[free-action]` `[aura]` | Square brackets required |
| **Ability traits** | `(divine, enchantment, mental)` | Parentheses after cost tag |
| **Melee Strike** | `Melee [one-action] name +bonus (traits), Damage 2d8+6 slashing` | |
| **Ranged Strike** | `Ranged [one-action] name +bonus (traits), Damage 2d6+4 piercing` | |
| **Plus damage** | `Damage 2d8+6 slashing plus 1d6 fire` | Extra dice = second damage roll |
| **Plus ability** | `Damage 2d12+14 piercing plus grab` | Non-dice = note in description |
| **Persistent** | `Damage 2d6+4 piercing plus 1d6 persistent bleed` | Sets `category: persistent` |

### Item Format

```
Items healer's tools, +2 striking staff of withering, corrupted idol [A cursed idol. Grants +1 status to Intimidation checks.], +1 resilient breastplate
```

- **Plain name** → exact + fuzzy compendium search
- **`+N [rune] name`** → strip runes, search base item, apply `potencyRune` / `strikingRune` / `resiliencyRune`
- **`name [description]`** → description is attached; if not in compendium, creates homebrew placeholder

**Rune prefixes supported:**

| Prefix | Applied field |
|---|---|
| `+1` / `+2` / `+3` / `+4` | `potencyRune` |
| `striking` / `greater striking` / `major striking` | `strikingRune` |
| `resilient` / `greater resilient` / `major resilient` | `resiliencyRune` |

### Spellcasting Formats

```
Divine Innate Spells DC 29, attack +21; 5th feast of ashes (x2), dimension door; 4th create food (at will); Cantrips (5th) detect magic
Witch Spells DC 31, attack +23; 5th flesh to stone; Cantrips (5th) needle of vengeance
Arcane Prepared Spells DC 24, attack +16; 3th fireball, haste; Cantrips (3rd) electric arc
```

**Tradition keywords** (in entry name): `Divine`, `Occult`, `Arcane`, `Primal`  
**Class → tradition inference**: Witch → occult · Wizard/Magus → arcane · Cleric/Champion/Oracle → divine · Druid/Ranger → primal · Bard/Psychic → occult  
**Prepared type keywords**: `Innate`, `Focus`, `Spontaneous` (default: prepared)

### Legacy → Remaster Spell Name Mapping

The importer automatically resolves pre-remaster spell names to their remaster equivalents:

| Legacy | Remaster |
|---|---|
| Vampiric Touch | Vampiric Feast |
| Ray of Enfeeblement | Enfeeble |
| Burning Hands | Breathe Fire |
| Flesh to Stone | Petrify |
| Hold Person | Paralyze |
| Hold Monster | Transfix |
| Freedom of Movement | Unfettered Movement |
| Mage Armor | Mystic Armor |
| Mage Hand | Telekinetic Hand |
| Comprehend Languages | Translate |
| Chill Touch | Void Warp |
| Color Spray | Dizzying Colors |
| Acid Splash | Caustic Blast |
| See Invisibility | See the Unseen |
| Dominate Person | Dominate |
| True Seeing | Truesight |
| Shocking Grasp | Electric Arc |
| Water Breathing | Breathe Water |
| Enlarge Person | Enlarge |
| Reduce Person | Shrink |

### Enrichers Applied Automatically

| Text pattern | Enricher output |
|---|---|
| `DC 29 Will save` | `@Check[type:will\|dc:29]{DC 29 Will save}` |
| `2d6 fire damage` | `@Damage[2d6[fire]]{2d6 fire damage}` |
| `1d6 persistent bleed damage` | `@Damage[1d6[persistent,bleed]]{…}` |
| `frightened 2` | `@UUID[Compendium.pf2e.conditionitems.Item.xxx]{frightened 2}` |
| `stunned 1`, `sickened`, etc. | Same UUID pattern for all PF2e conditions |

---

## Full Example

```
Vorraeth the Pale Hunger

Large Fiend 10

Uncommon, CE, Large, Demon, Fiend, Witch

Perception +19; darkvision, scent (imprecise) 30 feet

Languages Abyssal, Common, Sylvan; telepathy 100 feet

Skills Arcana +20, Deception +21, Intimidation +21, Occultism +20, Stealth +16

Str +6, Dex +2, Con +5, Int +6, Wis +3, Cha +7

Items corrupted hunger idol [A blackened idol that weeps with hunger. The bearer gains a +1 item bonus to Intimidation.], +2 striking staff of withering

AC 30; Fort +21, Ref +15, Will +20; +1 status to all saves vs. magic

HP 200; Immunities fire, poison; Weaknesses cold iron 10, good 10; Resistances physical 10 (except cold iron)

Speed 30 feet, fly 40 feet


Gluttony's Pall [aura] (divine, enchantment, mental) 30 feet. DC 29 Will save or -2 status penalty to attack rolls and skill checks until the start of your next turn.


Melee [one-action] devouring maw +22 (magical, reach 10 feet), Damage 2d12+14 piercing plus gorge

Melee [one-action] withering claw +22 (agile, magical, reach 10 feet), Damage 2d8+14 slashing plus 1d6 persistent bleed


Divine Innate Spells DC 29, attack +21; 5th feast of ashes (x2), dimension door; 4th create food (at will), gluttony curse; Cantrips (5th) detect magic, spout

Witch Spells DC 31, attack +23; 5th flesh to stone, shadow siphon; 4th drop dead, translocate; 3rd mind reading, veil; Cantrips (5th) needle of vengeance


Gorge [reaction] Trigger The demon hits a creature with its maw Strike and deals damage; Effect The target takes 2d6 persistent bleed damage and the demon regains 15 HP.

Hollow Feast [three-actions] (attack, divine, necromancy) The demon makes a devouring maw Strike. On a critical hit, the target is swallowed whole (Large, 3d12+14 bludgeoning, Rupture 22, Escape DC 31).

Trample [three-actions] Medium or smaller, devouring maw, DC 29
```

---

## Blank Template

```
[Name]

[Size] [Creature Type] [Level]

[Rarity], [Alignment], [Size], [Trait], [Trait]

Perception +[mod]; [sense], [sense] [range]

Languages [Language], [Language]; [special]

Skills [Skill] +[mod], [Skill] +[mod]

Str +[mod], Dex +[mod], Con +[mod], Int +[mod], Wis +[mod], Cha +[mod]

Items [item], [item name] [optional homebrew description]

AC [value]; Fort +[mod], Ref +[mod], Will +[mod]; [save notes]

HP [value]; Immunities [type]; Weaknesses [type] [value]; Resistances [type] [value]

Speed [value] feet


[Passive Name] [aura] ([trait]) [Description. DC X Will save.]


Melee [one-action] [name] +[bonus] ([trait]), Damage [dice] [type] plus [dice] [type]

Ranged [one-action] [name] +[bonus] ([trait], range increment [X] feet), Damage [dice] [type]


[Tradition] [Innate/Prepared] Spells DC [value], attack +[value]; [Nth] [spell] (x[N]); Cantrips ([Nth]) [spell]


[Name] [reaction] Trigger [text]; Effect [text]

[Name] [two-actions] ([trait]) [description]
```

---

## More Examples

### Simple Creature (No Spells)

```
Thornback Boar

Large Animal 3

N, Large, Animal

Perception +8; low-light vision, scent (imprecise) 30 feet

Skills Athletics +11, Stealth +6, Survival +8

Str +4, Dex +1, Con +3, Int -4, Wis +1, Cha -2

AC 18; Fort +11, Ref +7, Will +7

HP 45

Speed 40 feet


Ferocity [reaction] Trigger The boar is reduced to 0 HP; Effect The boar makes one Strike before falling unconscious.


Melee [one-action] tusk +11 (reach 5 feet), Damage 1d8+7 piercing plus knockdown

Melee [one-action] hoof +9 (agile), Damage 1d6+5 bludgeoning


Knockdown [free-action] Trigger The boar succeeds at a tusk Strike; Effect The target must succeed at a DC 19 Fortitude save or fall prone.

Trample [three-actions] Medium or smaller, hoof, DC 19
```

### Divine Prepared Spellcaster

```
Sister Vellara

Medium Humanoid 7

Unique, LN, Medium, Human, Humanoid

Perception +15; darkvision

Languages Common, Necril, Varisian

Skills Arcana +12, Deception +13, Medicine +17, Occultism +14, Religion +17

Str +0, Dex +2, Con +2, Int +3, Wis +6, Cha +3

Items +1 striking staff, healer's tools, religious symbol

AC 24; Fort +13, Ref +12, Will +18; +1 status to all saves vs. disease and poison

HP 110; Immunities disease

Speed 25 feet


Divine Prepared Spells DC 26, attack +18; 4th heal (x2), freedom of movement; 3rd blindness, crisis of faith, vampiric touch; 2nd aid, harm, restoration; 1st bane, command, ray of enfeeblement; Cantrips (4th) chill touch, detect magic, guidance, stabilize


Divine Intercession [reaction] Trigger An ally within 30 feet would be reduced to 0 HP; Effect Vellara expends a 3rd-level or higher spell slot to stabilize the ally at 1 HP.

Channeled Strike [two-actions] (divine, necromancy) Vellara makes a staff Strike. On a hit, she expends a harm or heal spell slot to deal an additional 2d10 positive or negative damage.
```

### Multi-Speed with Innate + Focus Spells

```
Aetherwing Sphinx

Large Beast 9

Rare, LN, Large, Beast, Sphinx

Perception +20; darkvision, true seeing

Languages Celestial, Common, Draconic, Sphinx

Skills Arcana +20, Athletics +17, Occultism +20, Religion +18, Society +18

Str +5, Dex +3, Con +3, Int +6, Wis +5, Cha +4

AC 27; Fort +16, Ref +18, Will +20

HP 145; Weaknesses cold iron 5

Speed 35 feet, fly 50 feet


Arcane Innate Spells DC 28, attack +20; 4th dimension door (at will); 3rd dispel magic (x2); 2nd comprehend language (at will); Cantrips (5th) detect magic, read aura

Occult Focus Spells DC 28; 5th inevitable destination


Riddling Gaze [aura] (arcane, enchantment, mental) 30 feet. DC 28 Will save or the creature is stupefied 1 until it correctly answers a riddle.


Melee [one-action] claw +20 (agile, magical), Damage 2d8+11 slashing plus 1d6 mental

Melee [one-action] jaws +20 (magical), Damage 2d10+11 piercing


Pounce [two-actions] The sphinx Strides and makes a claw Strike. If it moved at least 20 feet, the Strike deals an extra 2d8 damage.

Inevitable Riddle [three-actions] (arcane, enchantment, mental, linguistic) The sphinx poses a riddle to a creature within 30 feet. The target must attempt a DC 28 Will save or become stupefied 2 until it answers correctly.
```

---

## Notes & Limitations

- **Blank lines** between the header stat block and ability blocks are required
- **Traits line** must be comma-separated and come after the Size/Level line
- Spells not in the SRD or bestiary compendiums are created as placeholder items — drag the real spell from a compendium to replace them
- Equipment items not found in compendium become `equipment`-type placeholders; type is guessed from the item name (sword/axe/staff → weapon, armor/plate/mail → armor)
- Save DC references in ability descriptions are enriched automatically; inline `[[/r XdY]]` rolls are not added to avoid clutter
- The `Items` line populates the actor's **Inventory** tab; carried/worn distinction is not parsed

---

## License

This module is released for personal use. Pathfinder 2e content is property of Paizo Inc. and used under the community use policy.
