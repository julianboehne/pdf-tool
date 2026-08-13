import { PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import type { PdfSource } from './types';

const PRODUCER = 'PDF Tool';

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function toPdfSource(file: File): Promise<PdfSource> {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    bytes: await readFileBytes(file),
    size: file.size,
  };
}

/**
 * Loads a document, translating pdf-lib's encryption failures into our own
 * error keys. Pass `password` for documents the user has unlocked.
 */
export async function loadPdf(
  bytes: Uint8Array,
  password?: string,
): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, {
      // An empty string is a valid PDF password, so only forward a defined one.
      ...(password !== undefined ? { password } : {}),
      updateMetadata: false,
    });
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/**
 * Reads the encryption flag without needing the password. pdf-lib can parse the
 * document structure of an encrypted file as long as decryption is skipped.
 */
export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return doc.isEncrypted;
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/** Number of pages, for UIs that need it before any real work happens. */
export async function getPageCount(
  bytes: Uint8Array,
  password?: string,
): Promise<number> {
  const doc = await loadPdf(bytes, password);
  const count = doc.getPageCount();
  if (count === 0) throw new PdfToolError('noPages');
  return count;
}

/** Applied to every document this tool writes. */
export function stampMetadata(doc: PDFDocument): void {
  doc.setProducer(PRODUCER);
  doc.setModificationDate(new Date());
}

export async function savePdf(
  doc: PDFDocument,
  options: { useObjectStreams?: boolean } = {},
): Promise<Uint8Array> {
  stampMetadata(doc);
  return doc.save({ useObjectStreams: options.useObjectStreams ?? true });
}
