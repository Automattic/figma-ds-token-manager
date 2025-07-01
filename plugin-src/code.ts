import type { ParsedToken } from "../types";

figma.showUI(__html__, { themeColors: true, height: 300 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-tokens") {
    const parsedTokens: Record<string, ParsedToken> = msg.parsedTokens;
    const collectionName = "WPDS Colors";

    // Get or create collection
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === collectionName);

    if (!collection) {
      collection = figma.variables.createVariableCollection(collectionName);
      collection.renameMode(collection.modes[0].modeId, "light");
      collection.addMode("dark");
    }

    const lightModeId = collection.modes[0].modeId;
    const darkModeId = collection.modes[1]
      ? collection.modes[1].modeId
      : collection.addMode("dark");

    // Get existing variables in the collection
    const existingVariables = await figma.variables.getLocalVariablesAsync();
    const collectionVariables = existingVariables.filter(
      (v) => v.variableCollectionId === collection.id
    );
    const existingVariableMap: Record<string, Variable> = {};

    collectionVariables.forEach((variable) => {
      existingVariableMap[variable.name] = variable;
    });

    const created: Record<string, Variable> = {};
    const updatedVariables: Record<string, boolean> = {};

    // Pass 1: create or update all direct value variables
    for (const [name, data] of Object.entries(parsedTokens)) {
      const lightData = data.light;
      const variableName = name.replace(/^--/, "");

      if (lightData.value.startsWith("var(")) continue;
      if (!lightData.rgb) continue;

      let variable = existingVariableMap[variableName];

      if (!variable) {
        // Create new variable
        variable = figma.variables.createVariable(
          variableName,
          collection,
          "COLOR"
        );
        variable.scopes = [];
      }

      // Update values
      variable.setValueForMode(lightModeId, lightData.rgb);

      // Optionally set a dark mode value (if it exists)
      const darkData = data.dark;
      if (!darkData.value.startsWith("var(") && darkData.rgb) {
        variable.setValueForMode(darkModeId, darkData.rgb);
      }

      created[name] = variable;
      updatedVariables[variableName] = true;
    }

    // Pass 2: create or update aliases
    for (const [name, data] of Object.entries(parsedTokens)) {
      const lightData = data.light;
      const variableName = name.replace(/^--/, "");

      if (!lightData.value.startsWith("var(")) continue;
      const match = /var\(\s*(--[\w-]+)\s*\)/.exec(lightData.value);
      const refName = match && match[1];
      if (!refName || !created[refName]) continue;

      let variable = existingVariableMap[variableName];

      if (!variable) {
        // Create new variable
        variable = figma.variables.createVariable(
          variableName,
          collection,
          "COLOR"
        );
        variable.scopes = [];
      }

      // Update alias references
      variable.setValueForMode(lightModeId, {
        type: "VARIABLE_ALIAS",
        id: created[refName].id,
      });
      variable.setValueForMode(darkModeId, {
        type: "VARIABLE_ALIAS",
        id: created[refName].id,
      });

      // Update scopes
      if (/text/.test(name)) {
        variable.scopes = ["TEXT_FILL"];
      } else if (/border/.test(name)) {
        variable.scopes = ["STROKE_COLOR", "EFFECT_COLOR"];
      } else if (/bg/.test(name)) {
        variable.scopes = ["FRAME_FILL", "SHAPE_FILL"];
      }

      created[name] = variable;
      updatedVariables[variableName] = true;
    }

    // Clean up variables that weren't updated (no longer in the import)
    for (const [variableName, variable] of Object.entries(
      existingVariableMap
    )) {
      if (!updatedVariables[variableName]) {
        variable.remove();
      }
    }
  }

  figma.closePlugin();
};
