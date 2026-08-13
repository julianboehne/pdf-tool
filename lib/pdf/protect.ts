import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, stampMetadata } from './load';

/**
 * Permission flags enforced when the document is opened with the *user*
 * password. Opening with the owner password bypasses them.
 */
export interface ProtectPermissions {
  printing: boolean;
  modifying: boolean;
  copying: boolean;
  annotating: boolean;
}

export interface ProtectOptions {
  /** Required to open the document. */
  userPassword: string;
  /** Grants full access; defaults to the user password when left empty. */
  ownerPassword?: string;
  permissions: ProtectPermissions;
}

export async function protectPdf(
  bytes: Uint8Array,
  options: ProtectOptions,
): Promise<Uint8Array> {
  if (!options.userPassword) throw new PdfToolError('passwordMissing');

  try {
    const doc = await loadPdf(bytes);
    stampMetadata(doc);

    doc.encrypt({
      userPassword: options.userPassword,
      ownerPassword: options.ownerPassword || options.userPassword,
      permissions: {
        printing: options.permissions.printing ? 'highResolution' : false,
        modifying: options.permissions.modifying,
        copying: options.permissions.copying,
        annotating: options.permissions.annotating,
        fillingForms: options.permissions.annotating,
        contentAccessibility: options.permissions.copying,
        documentAssembly: options.permissions.modifying,
      },
    });

    // Object streams and the encryption dictionary do not mix reliably across
    // readers, so encrypted output is written with plain indirect objects.
    return await doc.save({ useObjectStreams: false });
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/**
 * Removes encryption by decrypting with the supplied password and re-saving
 * without a security handler.
 */
export async function removePassword(
  bytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  try {
    // Passing the password explicitly — `''` is a legitimate PDF password.
    const doc = await loadPdf(bytes, password);
    stampMetadata(doc);
    return await doc.save({ useObjectStreams: true });
  } catch (error) {
    const normalised = toPdfToolError(error);
    // At this point the only plausible cause is a bad password.
    if (normalised.key === 'encrypted') throw new PdfToolError('wrongPassword');
    throw normalised;
  }
}
