// module.js — entry point

import { StatblockImportDialog } from "./dialog.js";

Hooks.once("init", () => {
  console.log("PF2e Bestiary Import | Initialized");
  loadTemplates(["modules/pf2e-bestiary-import/templates/import-dialog.hbs"]);
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e") {
    ui.notifications.warn("PF2e Bestiary Import requires the PF2e system.");
    return;
  }
  console.log("PF2e Bestiary Import | Ready");
});

// Add button to Actors sidebar — handles both Application (jQuery) and ApplicationV2 (HTMLElement)
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;

  // Normalize to HTMLElement regardless of Foundry version
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  // Avoid adding button twice on re-renders
  if (root.querySelector(".psbi-sidebar-btn")) return;

  // Try known footer selectors across Foundry versions
  const footer =
    root.querySelector(".directory-footer") ??
    root.querySelector("footer.action-buttons") ??
    root.querySelector("footer") ??
    root;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "psbi-sidebar-btn";
  btn.title = "Import PF2e Statblock";
  btn.innerHTML = '<i class="fas fa-file-import"></i> Import Statblock';
  btn.addEventListener("click", () => new StatblockImportDialog().render(true));

  footer.appendChild(btn);
});

// Expose API for macros: PF2eStatblockImport.open()
globalThis.PF2eStatblockImport = {
  open: () => new StatblockImportDialog().render(true),
};
