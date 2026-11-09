import { NextRequest, NextResponse } from 'next/server';
import { renderSearchVideo } from '@/data/creativeVideo.mjs';
import { CreativeUploadError } from '@/data/creativeUpload.mjs';

export const runtime = 'nodejs';

/** Local render only. Downloads and Store uploads both use this encoder. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const video = await renderSearchVideo(body);
    return new NextResponse(new Uint8Array(video), { headers: {
      'Content-Type': 'video/mp4', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="ricecal-app-store-search.mp4"',
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not render the Search video.' },
      { status: error instanceof CreativeUploadError ? error.status : 500 });
  }
}
