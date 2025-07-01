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

export interface ParsedToken {
  light: { value: string; rgb?: RGB | RGBA };
  dark: { value: string; rgb?: RGB | RGBA };
}
