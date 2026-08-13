/** A PDF held entirely in memory — nothing in this app ever touches a server. */
export interface PdfSource {
  /** Stable id used as React key and for drag-and-drop reordering. */
  id: string;
  name: string;
  bytes: Uint8Array;
  size: number;
}

/** One produced file, ready for download. */
export interface PdfResult {
  name: string;
  bytes: Uint8Array;
}

export type ProgressCallback = (done: number, total: number) => void;
