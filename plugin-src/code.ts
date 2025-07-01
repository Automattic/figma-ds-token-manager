import type { ParsedToken } from "../types";

figma.showUI(__html__, { themeColors: true, height: 300 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-tokens") {
    const parsedTokens: Record<string, ParsedToken> = msg.parsedTokens;
    const collectionName = "WPDS Colors";
    // Remove existing collection
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const existing = collections.find((c) => c.name === collectionName);

    if (existing) {
      for (const v of await figma.variables.getLocalVariablesAsync()) {
        if (v.variableCollectionId === existing.id) {
          v.remove();
        }
      }
      existing.remove();
    }
    const collection = figma.variables.createVariableCollection(collectionName);
    collection.renameMode(collection.modes[0].modeId, "light");
    const lightModeId = collection.modes[0].modeId;
    const darkModeId = collection.addMode("dark");

    const created: Record<string, Variable> = {};

    // Pass 1: create all direct value variables
    for (const [name, data] of Object.entries(parsedTokens)) {
      // Set a light mode value (which should always exist)
      const lightData = data.light;

      if (lightData.value.startsWith("var(")) continue;
      if (!lightData.rgb) continue;

      const variable = figma.variables.createVariable(
        name.replace(/^--/, ""),
        collection,
        "COLOR"
      );
      variable.setValueForMode(lightModeId, lightData.rgb);
      variable.scopes = [];
      created[name] = variable;

      // Optionally set a dark mode value (if it exists).
      const darkData = data.dark;
      if (darkData.value.startsWith("var(")) continue;
      if (!darkData.rgb) continue;
      variable.setValueForMode(darkModeId, darkData.rgb);
      // }
    }

    // Pass 2: create aliases
    for (const [name, data] of Object.entries(parsedTokens)) {
      const lightData = data.light;

      if (!lightData.value.startsWith("var(")) continue;
      const match = /var\(\s*(--[\w-]+)\s*\)/.exec(lightData.value);
      const refName = match && match[1];
      if (!refName || !created[refName]) continue;

      const variable = figma.variables.createVariable(
        name.replace(/^--/, ""),
        collection,
        "COLOR"
      );
      // Assume that both dark and light keep referring the same aliases
      // both in light and dark mode — it's the underlying aliased variables
      // that changed between modes.
      variable.setValueForMode(lightModeId, {
        type: "VARIABLE_ALIAS",
        id: created[refName].id,
      });
      variable.setValueForMode(darkModeId, {
        type: "VARIABLE_ALIAS",
        id: created[refName].id,
      });

      variable.scopes = [];
      if (/text/.test(name)) {
        variable.scopes = ["TEXT_FILL"];
      } else if (/border/.test(name)) {
        variable.scopes = ["STROKE_COLOR", "EFFECT_COLOR"];
      } else if (/bg/.test(name)) {
        variable.scopes = ["FRAME_FILL", "SHAPE_FILL"];
      }

      created[name] = variable;
    }
  }

  figma.closePlugin();
};
