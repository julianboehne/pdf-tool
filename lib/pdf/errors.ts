/**
 * Errors surfaced to the user carry a message *key* rather than a sentence, so
 * the UI layer can translate them via next-intl (`errors.<key>`).
 */
export class PdfToolError extends Error {
  constructor(
    readonly key: PdfToolErrorKey,
    readonly params?: Record<string, string | number>,
  ) {
    super(key);
    this.name = 'PdfToolError';
  }
}

export type PdfToolErrorKey =
  | 'invalidPdf'
  | 'encrypted'
  | 'wrongPassword'
  | 'notEncrypted'
  | 'noPages'
  | 'emptySelection'
  | 'invalidRange'
  | 'unsupportedCharacters'
  | 'unsupportedImage'
  | 'passwordMissing'
  | 'renderFailed'
  | 'unknown';

/** Normalises anything thrown during processing into a `PdfToolError`. */
export function toPdfToolError(error: unknown): PdfToolError {
  if (error instanceof PdfToolError) return error;

  const message = error instanceof Error ? error.message : String(error);

  // pdf-lib throws `EncryptedPDFError` / `PDFInvalidObjectParsingError` with
  // messages that are stable enough to classify.
  if (/encrypted/i.test(message)) return new PdfToolError('encrypted');
  if (/password/i.test(message)) return new PdfToolError('wrongPassword');
  if (/WinAnsi|cannot encode|Unicode/i.test(message)) {
    return new PdfToolError('unsupportedCharacters');
  }
  if (/parse|invalid|header|trailer/i.test(message)) {
    return new PdfToolError('invalidPdf');
  }

  return new PdfToolError('unknown');
}
