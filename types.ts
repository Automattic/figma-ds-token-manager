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

type TokenMode = ".";

export type ImportedTokenValue = {
  [key in TokenMode]?: string;
};

export interface ImportedTokens {
  [key: string]: {
    value: ImportedTokenValue;
    description: string;
  };
}

export type ParsedTokenValue = {
  [key in TokenMode]?: RGB | RGBA | string | number;
};
export interface ParsedTokens {
  [key: string]: {
    value: ParsedTokenValue;
    description: string;
  };
}
