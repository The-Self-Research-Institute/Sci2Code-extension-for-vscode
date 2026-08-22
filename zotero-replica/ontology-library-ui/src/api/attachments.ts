import { apiClient } from './client';
import { ownerBase, type LibraryOwner } from './libraryOwner';
import type { BinaryDownloadResult } from './transport';

/** Maps to AttachmentController's POST .../items/{key}/file (multipart upload into GridFS). */
export function uploadAttachmentFile(
  owner: LibraryOwner,
  itemKey: string,
  file: { filename: string; contentType: string; base64Data: string },
  ifUnmodifiedSinceVersion?: number,
): Promise<{ libraryVersion: number | null }> {
  return apiClient.uploadFile(`${ownerBase(owner)}/items/${itemKey}/file`, file, {
    headers:
      ifUnmodifiedSinceVersion !== undefined ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) } : undefined,
  });
}

/** Maps to AttachmentController's GET .../items/{key}/file (streams GridFS bytes back as base64). */
export function downloadAttachmentFile(owner: LibraryOwner, itemKey: string): Promise<BinaryDownloadResult> {
  return apiClient.downloadBinary(`${ownerBase(owner)}/items/${itemKey}/file`);
}
