export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

type ColorModes = "light" | "dark" | ".";

export type ImportedTokenValue = {
  [key in ColorModes]?: string;
};

export interface ImportedTokens {
  [key: string]: {
    value: ImportedTokenValue;
    description: string;
  };
}

export type ParsedTokenValue = {
  [key in ColorModes]?: RGB | RGBA | string;
};
export interface ParsedTokens {
  [key: string]: {
    value: ParsedTokenValue;
    description: string;
  };
}
