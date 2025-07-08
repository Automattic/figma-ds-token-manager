import type { ParsedToken } from "../types";

figma.showUI(__html__, { themeColors: true, height: 300 });

// Useful to track all variables created during the import, so that we can
// alias variables correctly.
const allImportedVariables: Record<string, Variable> = {};

function computeNameForVariable(parsedTokenName: string) {
  let variableName = parsedTokenName
    // Remove the --wpds- prefix (replaced by the collection name)
    .replace(/^--wpds-/, "")
    // Abbreviate bg segments to 3 characters.
    .replace(/(.*)-bg-(\w+)(.*)/, (_, p1, p2, p3) => {
      return `${p1}-bg-${p2.slice(0, 3)}${p3}`;
    });

  const folderSegments = [];

  if (/color-/.test(variableName)) {
    // Remove the color- prefix (replaced by the folder path)
    variableName = variableName.replace(/^color-/, "");
    folderSegments.push("Color");

    if (/private/.test(variableName)) {
      folderSegments.push("_Primitives");

      if (/primary/.test(variableName)) {
        folderSegments.push("primary");
      } else if (/success/.test(variableName)) {
        folderSegments.push("Success");
      } else if (/info/.test(variableName)) {
        folderSegments.push("Info");
      } else if (/warning/.test(variableName)) {
        folderSegments.push("Warning");
      } else if (/error/.test(variableName)) {
        folderSegments.push("Error");
      } else {
        folderSegments.push("Neutral");
      }

      variableName = variableName.split("-").slice(-1)[0];
    } else {
      if (/fg/.test(variableName)) {
        folderSegments.push("Foreground");
      } else if (/bg/.test(variableName)) {
        folderSegments.push("Background");
      } else if (/stroke/.test(variableName)) {
        folderSegments.push("Stroke");
      } else {
        // There shouldn't be any other color variables, but just in case.
        folderSegments.push("Other");
      }

      if (/brand/.test(variableName)) {
        folderSegments.push("Brand");
      } else if (/success/.test(variableName)) {
        folderSegments.push("Success");
      } else if (/info/.test(variableName)) {
        folderSegments.push("Info");
      } else if (/warning/.test(variableName)) {
        folderSegments.push("Warning");
      } else if (/error/.test(variableName)) {
        folderSegments.push("Error");
      } else {
        folderSegments.push("Neutral");
      }
    }
  }

  // Avoid adding '/' if there are no folder segments
  const folderPrefix =
    folderSegments.length > 0 ? `${folderSegments.join("/")}/` : "";

  return `${folderPrefix}${variableName}`;
}

async function updateCollection(args: {
  tokens: Record<string, ParsedToken>;
  collectionName: string;
}) {
  // Useful to avoid trashing and re-creating the same variables (and instead
  // just updating them), so that references don't get lost.
  const variablesInCollectionBeforeImporting: Record<string, Variable> = {};
  // Useful to track which variables were not updated during the import, so we
  // can clean them up and avoid stale variables lingering around.
  const variablesUpdatedDuringImport: Record<string, boolean> = {};

  const { tokens, collectionName } = args;

  // Get or create collection
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
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
  (await figma.variables.getLocalVariablesAsync())
    .filter((v) => v.variableCollectionId === collection.id)
    .forEach((variable) => {
      variablesInCollectionBeforeImporting[variable.name] = variable;
    });

  // Pass 1: create or update all direct value variables
  for (const [name, data] of Object.entries(tokens)) {
    const lightData = data.light;
    const variableName = computeNameForVariable(name);

    if (lightData.value.startsWith("var(")) continue;
    if (!lightData.rgb) continue;

    let variable = variablesInCollectionBeforeImporting[variableName];

    if (!variable) {
      // Create new variable
      variable = figma.variables.createVariable(
        variableName,
        collection,
        "COLOR"
      );
    }

    // Values holding raw values should not be used directly, or published.
    variable.scopes = [];
    variable.hiddenFromPublishing = true;

    // Update values
    variable.setValueForMode(lightModeId, lightData.rgb);

    // Optionally set a dark mode value (if it exists)
    const darkData = data.dark;
    if (!darkData.value.startsWith("var(") && darkData.rgb) {
      variable.setValueForMode(darkModeId, darkData.rgb);
    }

    allImportedVariables[name] = variable;
    variablesUpdatedDuringImport[variableName] = true;
  }

  // Pass 2: create or update aliases
  for (const [name, data] of Object.entries(tokens)) {
    const lightData = data.light;
    const variableName = computeNameForVariable(name);

    if (!lightData.value.startsWith("var(")) continue;
    const match = /var\(\s*(--[\w-]+)\s*\)/.exec(lightData.value);
    const refName = match && match[1];
    if (!refName || !allImportedVariables[refName]) continue;

    let variable = variablesInCollectionBeforeImporting[variableName];

    if (!variable) {
      // Create new variable
      variable = figma.variables.createVariable(
        variableName,
        collection,
        "COLOR"
      );
    }

    // Update alias references
    variable.setValueForMode(lightModeId, {
      type: "VARIABLE_ALIAS",
      id: allImportedVariables[refName].id,
    });
    variable.setValueForMode(darkModeId, {
      type: "VARIABLE_ALIAS",
      id: allImportedVariables[refName].id,
    });

    // Update scopes
    if (/fg/.test(name)) {
      variable.scopes = ["TEXT_FILL", "SHAPE_FILL"];
    } else if (/stroke/.test(name)) {
      variable.scopes = ["STROKE_COLOR", "EFFECT_COLOR"];
    } else if (/bg/.test(name)) {
      variable.scopes = ["FRAME_FILL", "SHAPE_FILL"];
    } else {
      variable.scopes = [];
    }

    allImportedVariables[name] = variable;
    variablesUpdatedDuringImport[variableName] = true;
  }

  // Clean up variables that weren't updated (no longer in the import)
  for (const [variableName, variable] of Object.entries(
    variablesInCollectionBeforeImporting
  )) {
    if (!variablesUpdatedDuringImport[variableName]) {
      variable.remove();
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-tokens") {
    const parsedTokens: Record<string, ParsedToken> = msg.parsedTokens;

    await updateCollection({
      tokens: parsedTokens,
      collectionName: "WPDS Tokens",
    });
  }

  figma.closePlugin();
};
