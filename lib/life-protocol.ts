export type Request =
  | { kind: "boot"; id: number; wasmUrl: string }
  | { kind: "seed"; id: number; width: number; height: number; pixels: ArrayBuffer; thresholds: number[]; auto?: boolean; density?: number; dither: boolean; invert: boolean; mask: number }
  | { kind: "step"; id: number; wrap: boolean; mask: number }
  | { kind: "render"; id: number; mask: number };
export type Frame = { kind: "frame"; id: number; generation: number; width: number; height: number; pixels: ArrayBuffer; previews: ArrayBuffer[]; previewWidth: number; previewHeight: number; population: number[]; appliedThresholds: number[] };
export type Response = Frame | { kind: "ready"; id: number } | { kind: "error"; id: number; message: string };
