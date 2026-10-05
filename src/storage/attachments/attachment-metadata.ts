const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function cleanAttachmentName(value: string): string {
  const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
  const clean = Array.from(leaf)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && (code < 127 || code > 159);
    })
    .join('')
    .trim();
  return clean.length > 0 ? clean : 'file';
}

export function mediaTypeFor(extension: string): string {
  return (
    MEDIA_TYPE_BY_EXTENSION[extension.toLowerCase()] ??
    'application/octet-stream'
  );
}
