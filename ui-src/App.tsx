import { useRef } from "react";
import postcss from "postcss";
import safeParser from "postcss-safe-parser";
import { parse, converter } from "culori";
import "./App.css";

import type { ParsedToken } from "../types";

function App() {
  const inputRef = useRef<HTMLInputElement>(null);

  const onImport = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {
      const css = event.target?.result as string;
      const result = await postcss().process(css, { parser: safeParser });
      const root = result.root;

      const parsedTokens: Record<string, ParsedToken> = {};
      const toRgb = converter("rgb");

      root.walkRules((rule) => {
        const parentAtRule =
          rule.parent?.type === "atrule" ? rule.parent.name : null;
        if (parentAtRule === "media") return;
        if (rule.selector?.includes('[data-wpds-color-scheme="light"')) return;

        const isDark = rule.selector?.includes(
          '[data-wpds-color-scheme="dark"]'
        );

        rule.walkDecls((decl) => {
          if (!decl.prop.startsWith("--wpds-color-")) return;
          const value = decl.value.trim();
          const parsed = parse(value);
          const rgb =
            parsed && !value.startsWith("var(") ? toRgb(parsed) : null;

          if (!(decl.prop in parsedTokens)) {
            parsedTokens[decl.prop] = {
              light: { value: "", rgb: undefined },
              dark: { value: "", rgb: undefined },
            };
          }

          parsedTokens[decl.prop][isDark ? "dark" : "light"] = {
            value,
            rgb: rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : undefined,
          };
        });
      });

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
      <h2>WPDS Token Manager</h2>

      <section>
        <label htmlFor="input">Select a CSS file</label>
        <input id="input" type="file" ref={inputRef} />
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
