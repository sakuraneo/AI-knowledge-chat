/** Multer/busboy often interpret UTF-8 filename bytes as Latin-1. */
export function decodeMultipartFilename(name: string): string {
  if (!name || /^[\x00-\x7F]*$/.test(name)) {
    return name;
  }

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

export function resolveUploadFilename(
  bodyFilename: unknown,
  originalname: string,
): string {
  if (typeof bodyFilename === 'string' && bodyFilename.trim()) {
    return bodyFilename.trim();
  }
  return decodeMultipartFilename(originalname);
}
