export interface CreativeUploadTarget {
  ok: boolean;
  error?: string;
  versionId?: string;
  version?: string;
  libraryId?: string;
  url?: string;
}

export interface CreativeUploadReceipt {
  versionId: string;
  version: string;
  libraryId: string;
  url: string;
  placement: 'header' | 'search';
  locale: string;
  imageId?: string;
  videoId?: string;
  uploaded: string[];
  errors: string[];
}

export class CreativeUploadError extends Error {
  status: number;
  receipt: Partial<CreativeUploadReceipt>;
}

export declare const CREATIVE_UPLOAD_SPECS: Record<'header' | 'search', {
  width: number; height: number; type: string; label: string;
}>;
export declare function validateCreativeImage(placement: string, locale: string, data: string): Buffer;
export declare function creativeUploadStatus(): Promise<CreativeUploadTarget>;
export declare function uploadIOSCreative(args: {
  placement: 'header' | 'search'; locale: string; data: string; mediaType?: 'image' | 'video';
  targetVersionId: string; replace?: boolean; log?: (line: string) => void;
}): Promise<CreativeUploadReceipt>;
