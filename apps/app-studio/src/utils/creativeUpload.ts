import type { AppStorePlacement } from '../data/appStoreAssets';
import type { CreativeUploadTarget, CreativeUploadReceipt } from '../data/creativeUpload.mjs';
import { captureCreativeMedia } from './export';

export async function checkCreativeUpload(signal: AbortSignal): Promise<CreativeUploadTarget> {
  const response = await fetch('/api/upload/ios/creatives', { signal });
  if (!response.ok) throw new Error('Could not check the App Store Connect destination.');
  return response.json();
}

export async function captureCreativeUpload(element: HTMLElement, placement: AppStorePlacement): Promise<string> {
  return (await captureCreativeMedia(element, placement)).split(',')[1];
}

export async function uploadCreativeAsset(
  placement: AppStorePlacement, locale: string, data: string,
  targetVersionId: string, replace: boolean,
): Promise<CreativeUploadReceipt> {
  const response = await fetch('/api/upload/ios/creatives', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placement, locale, data, mediaType: placement === 'search' ? 'video' : 'image', targetVersionId, replace }),
  });
  const result = await response.json().catch(() => ({ error: 'The upload server returned an unreadable response.' }));
  if (!response.ok) {
    const id = result.videoId ?? result.imageId;
    const detail = id ? ` Asset Library asset: ${id}.` : '';
    throw new Error(`${result.error ?? 'Creative upload failed.'}${detail}`);
  }
  if (!Array.isArray(result.uploaded) || !Array.isArray(result.errors)) {
    throw new Error('The upload server did not confirm which fields were assigned.');
  }
  return result;
}
