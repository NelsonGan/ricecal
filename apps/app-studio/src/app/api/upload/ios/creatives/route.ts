import { NextRequest, NextResponse } from 'next/server';
import { CreativeUploadError, creativeUploadStatus, uploadIOSCreative } from '@/data/creativeUpload.mjs';

export const runtime = 'nodejs';

/** Resolve an editable version and its Asset Library without making any writes. */
export async function GET() {
  return NextResponse.json(await creativeUploadStatus());
}

/** Upload one Header image or animated Search MP4 and assign its Header or Search Results field. */
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Send a valid creative upload request.' }, { status: 400 }); }

  try {
    const result = await uploadIOSCreative({
      placement: body?.placement, locale: body?.locale, data: body?.data,
      mediaType: body?.mediaType, targetVersionId: body?.targetVersionId, replace: body?.replace ?? false,
    });
    return NextResponse.json({ ok: result.errors.length === 0, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Creative upload failed.';
    return NextResponse.json({
      ok: false, error: message,
      ...(error instanceof CreativeUploadError ? error.receipt : {}),
    }, { status: error instanceof CreativeUploadError ? error.status : 500 });
  }
}
