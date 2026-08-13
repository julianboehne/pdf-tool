import type { PdfResult } from './pdf/types';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), filename);
}

/** Bundles multi-file results so the browser only has to accept one download. */
export async function downloadZip(
  results: PdfResult[],
  zipName: string,
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  results.forEach((result) => zip.file(result.name, result.bytes));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    // PDFs are already compressed; a light level keeps zipping fast.
    compressionOptions: { level: 3 },
  });

  saveBlob(blob, zipName);
}

/** Replaces the extension of a source filename, e.g. `a.pdf` → `a_merged.pdf`. */
export function suffixFilename(name: string, suffix: string): string {
  const stem = name.replace(/\.pdf$/i, '');
  return `${stem}_${suffix}.pdf`;
}
