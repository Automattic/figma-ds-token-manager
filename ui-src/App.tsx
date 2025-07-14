import { useRef } from "react";
import { converter } from "culori";
import "./App.css";

import type { ImportedTokens, ParsedTokens, ParsedTokenValue } from "../types";

const rgb = converter("rgb");

function App() {
  const inputRef = useRef<HTMLInputElement>(null);

  const onImport = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {
      const tokens = JSON.parse(
        event.target?.result as string
      ) as ImportedTokens;

      const parsedTokens: ParsedTokens = {};

      for (const [tokenName, tokenObject] of Object.entries(tokens)) {
        // For now, only import colors.
        if (!/color/gi.test(tokenName)) {
          continue;
        }

        parsedTokens[tokenName] = {
          value: { ".": "placeholder" },
          description: tokenObject.description,
        };

        for (const [modeName, modeValue] of Object.entries(tokenObject.value)) {
          const typedModeName = modeName as keyof typeof tokenObject.value;
          let computedModeValue: ParsedTokenValue[keyof ParsedTokenValue];

          if (modeValue.startsWith("{") && modeValue.endsWith("}")) {
            // Preserve aliases
            computedModeValue = modeValue;
          } else if (/color/gi.test(tokenName)) {
            const converted = rgb(modeValue);
            if (!converted) {
              console.warn(`Invalid color value: ${modeValue}`);
              continue;
            }

            // Convert to RBG(A) object for Figma.
            computedModeValue = {
              r: Math.max(Math.min(converted.r, 1), 0),
              g: Math.max(Math.min(converted.g, 1), 0),
              b: Math.max(Math.min(converted.b, 1), 0),
              a: converted.alpha ?? 1,
            };
          }

          if (!computedModeValue) {
            console.log("Error: no computed value");
            continue;
          }

          parsedTokens[tokenName].value[typedModeName] = computedModeValue;
        }
      }

      parent.postMessage(
        { pluginMessage: { type: "import-tokens", parsedTokens } },
        "*"
      );
    };

    reader.readAsText(file);
  };

  const onCancel = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <main>
      <h2>
        WPDS Token Manager <small>(v4)</small>
      </h2>

      <section>
        <label htmlFor="input">Select a JSON file</label>
        <input id="input" type="file" accept=".json" ref={inputRef} />
      </section>
      <footer>
        <button className="brand" onClick={onImport}>
          Import tokens
        </button>
        <button onClick={onCancel}>Cancel</button>
      </footer>
    </main>
  );
}

export default App;
