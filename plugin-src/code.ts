import type { ParsedTokens, ParsedTokenValue } from "../types";

figma.showUI(__html__, { themeColors: true, height: 300 });

// Useful to track all variables created during the import, so that we can
// alias variables correctly.
const allImportedVariables: Record<string, Variable> = {};

const LEGACY_DEFAULT_MODE = "light";
const DEFAULT_MODE = "default";

function isAliasValue(
  value: ParsedTokenValue[keyof ParsedTokenValue]
): value is string {
  return (
    typeof value === "string" && value.startsWith("{") && value.endsWith("}")
  );
}

function isValidColorValue(value: any): value is ParsedTokenValue {
  return (
    typeof value === "object" && "r" in value && "g" in value && "b" in value
  );
}

function getResolvedType(value: any): VariableResolvedDataType | undefined {
  if (isValidColorValue(value)) {
    return "COLOR";
  } else if (typeof value === "number") {
    return "FLOAT";
  }
}

function groupByCollection(tokens: ParsedTokens): Record<string, ParsedTokens> {
  return Object.entries(tokens).reduce<Record<string, ParsedTokens>>(
    (result, [tokenName, tokenData]) => {
      const collection = tokenName.split("/")[0];
      result[collection] = result[collection] || {};
      result[collection][tokenName] = tokenData;
      return result;
    },
    {}
  );
}

async function updateCollection(args: {
  tokens: ParsedTokens;
  collectionName: string;
}) {
  // Useful to avoid trashing and re-creating the same variables (and instead
  // just updating them), so that references don't get lost.
  const variablesInCollectionBeforeImporting: Record<string, Variable> = {};
  // Useful to track which variables were not updated during the import, so we
  // can clean them up and avoid stale variables lingering around.
  const variablesUpdatedDuringImport: Record<string, boolean> = {};

  const modesInCollectionBeforeImporting: Record<string, string> = {};
  const modesAddedDuringImport = new Set<string>();

  const { tokens, collectionName } = args;

  // Get or create collection
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = collections.find((c) => c.name === collectionName);

  if (!collection) {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  // Get existing modes in the collection
  for (const mode of collection.modes) {
    if (mode.name === LEGACY_DEFAULT_MODE) {
      collection.renameMode(mode.modeId, DEFAULT_MODE);
    }

    modesInCollectionBeforeImporting[mode.name] = mode.modeId;
  }

  // Get existing variables in the collection
  (await figma.variables.getLocalVariablesAsync())
    .filter((v) => v.variableCollectionId === collection.id)
    .forEach((variable) => {
      variablesInCollectionBeforeImporting[variable.name] = variable;
    });

  // Pass 1: create or update all direct value variables
  for (const [tokenName, tokenData] of Object.entries(tokens)) {
    const { value, description } = tokenData;

    let variable = variablesInCollectionBeforeImporting[tokenName];

    // Don't save variables where we can't determine the resolved type
    const resolvedType = getResolvedType(value["."]);
    if (!resolvedType) {
      continue;
    }

    if (!variable) {
      // Create new variable
      variable = figma.variables.createVariable(
        tokenName,
        collection,
        resolvedType
      );
    }

    if (description) {
      variable.description = description;
    } else {
      variable.description = "";
    }

    // Update scopes
    if (/color\/foreground/gi.test(tokenName)) {
      variable.scopes = ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR"];
    } else if (/color\/stroke/gi.test(tokenName)) {
      variable.scopes = ["STROKE_COLOR", "EFFECT_COLOR"];
    } else if (/color\/background/gi.test(tokenName)) {
      variable.scopes = ["FRAME_FILL", "SHAPE_FILL"];
    } else if (/dimension\/(padding|gap)/gi.test(tokenName)) {
      variable.scopes = ["GAP"];
    } else if (/dimension/gi.test(tokenName)) {
      variable.scopes = ["WIDTH_HEIGHT"];
    } else {
      variable.scopes = [];
    }

    for (const [modeName, modeValue] of Object.entries(value)) {
      const computedModeName = modeName === "." ? DEFAULT_MODE : modeName;

      if (!(computedModeName in modesInCollectionBeforeImporting)) {
        modesInCollectionBeforeImporting[computedModeName] =
          collection.addMode(computedModeName);
      }
      modesAddedDuringImport.add(computedModeName);

      // First pass: only save non-aliased values
      if (isAliasValue(modeValue)) {
        continue;
      }

      variable.setValueForMode(
        modesInCollectionBeforeImporting[computedModeName],
        modeValue
      );
    }

    allImportedVariables[tokenName] = variable;
    variablesUpdatedDuringImport[tokenName] = true;
  }

  // Pass 2: create or update aliases
  for (const [tokenName, tokenData] of Object.entries(tokens)) {
    const { value } = tokenData;

    const variable = allImportedVariables[tokenName];
    if (!variable) {
      console.log(
        "Something is off — this variable should have already been created"
      );
      continue;
    }

    for (const [modeName, modeValue] of Object.entries(value)) {
      const computedModeName = modeName === "." ? DEFAULT_MODE : modeName;

      if (!(computedModeName in modesInCollectionBeforeImporting)) {
        console.log(
          "Something is off — this mode should have already been created"
        );
        continue;
      }

      // Second pass: only save aliased values
      if (!isAliasValue(modeValue)) {
        continue;
      }

      const matchAliasTokenName = /^\{(.*)\}$/.exec(modeValue);
      const aliasTokenName = matchAliasTokenName && matchAliasTokenName[1];

      if (!aliasTokenName || !allImportedVariables[aliasTokenName]) {
        continue;
      }

      variable.setValueForMode(
        modesInCollectionBeforeImporting[computedModeName],
        {
          type: "VARIABLE_ALIAS",
          id: allImportedVariables[aliasTokenName].id,
        }
      );
    }
  }

  // Pass 3: fallback missing mode values to the default mode value
  for (const [tokenName, tokenData] of Object.entries(tokens)) {
    const { value } = tokenData;

    const variable = allImportedVariables[tokenName];
    if (!variable) {
      console.log(
        "Something is off — this variable should have already been created"
      );
      continue;
    }

    const modesMissingValues = new Set(collection.modes.map((m) => m.modeId));

    for (const [modeName] of Object.entries(value)) {
      const computedModeName = modeName === "." ? DEFAULT_MODE : modeName;

      if (!(computedModeName in modesInCollectionBeforeImporting)) {
        console.log(
          "Something is off — this mode should have already been created"
        );
        continue;
      }

      modesMissingValues.delete(
        modesInCollectionBeforeImporting[computedModeName]
      );
    }

    for (const modeId of modesMissingValues) {
      variable.setValueForMode(
        modeId,
        variable.valuesByMode[modesInCollectionBeforeImporting[DEFAULT_MODE]]
      );
    }
  }

  // Clean up variables that weren't updated (no longer in the import)
  for (const [variableName, variable] of Object.entries(
    variablesInCollectionBeforeImporting
  )) {
    if (!variablesUpdatedDuringImport[variableName]) {
      variable.remove();
    }
  }

  // Clean up modes that weren't updated (no longer in the import)
  for (const [modeName, modeId] of Object.entries(
    modesInCollectionBeforeImporting
  )) {
    if (!modesAddedDuringImport.has(modeName)) {
      collection.removeMode(modeId);
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import-tokens") {
    const parsedTokens: ParsedTokens = msg.parsedTokens;
    const groupedTokens = groupByCollection(parsedTokens);

    for (const [collectionName, tokens] of Object.entries(groupedTokens)) {
      await updateCollection({
        tokens: tokens,
        collectionName: `WPDS ${collectionName}`,
      });
    }
  }

  figma.closePlugin();
};
