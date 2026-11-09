import { NextRequest, NextResponse } from 'next/server';
import { androidSessions, readUpload, stageLocale, stagingDir, UNREADABLE_UPLOAD, uploadAndroidLocale } from '../../_lib';

/** Stage one locale's images, then push them into the open edit via `gplay`. */
export async function POST(req: NextRequest) {
  const body = await readUpload<{
    sessionId: string;
    locale: string;
    screenshots: Array<{ filename: string; data: string }>;
  }>(req);
  if (!body) return NextResponse.json({ error: UNREADABLE_UPLOAD }, { status: 400 });
  const { sessionId, locale, screenshots } = body;

  const session = androidSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'No such edit session. Start a new upload.' }, { status: 410 });
  }

  try {
    const dir = stageLocale(stagingDir('android', session.device), locale, screenshots);
    const result = await uploadAndroidLocale({
      device: session.device,
      locale,
      dir,
      editId: session.editId,
      log: (line: string) => console.log(`[Android] ${line}`),
    });

    if (result.skipped) return NextResponse.json({ skipped: true, count: 0, reason: result.reason });

    console.log(`[Android] ${locale} → ${result.uploaded.join(', ')} (${result.galleries.join(', ')})`);
    return NextResponse.json({
      ok: true,
      locale,
      count: result.count,
      galleries: result.galleries,
      uploaded: result.uploaded,
      ...(result.dropped?.length ? { dropped: result.dropped } : {}),
      ...(result.errors.length ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Android upload] ${locale}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
