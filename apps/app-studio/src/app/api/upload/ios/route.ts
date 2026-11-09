import { NextRequest, NextResponse } from 'next/server';
import { IOS_DEVICE_TYPE, iosReady, readUpload, stageLocale, stagingDir, UNREADABLE_UPLOAD, uploadIOSLocale } from '../_lib';

/** Stage one locale's screenshots on disk, then hand them to `asc`. */
export async function POST(req: NextRequest) {
  const ready = await iosReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const body = await readUpload<{
    device: string;
    locale: string;
    screenshots: Array<{ filename: string; data: string }>;
  }>(req);
  if (!body) return NextResponse.json({ error: UNREADABLE_UPLOAD }, { status: 400 });
  const { device, locale, screenshots } = body;
  // Checked before staging, because `device` is a directory name there.
  if (!Object.hasOwn(IOS_DEVICE_TYPE, device)) {
    return NextResponse.json({ error: `Unknown device: ${device}` }, { status: 400 });
  }

  try {
    const dir = stageLocale(stagingDir('ios', device), locale, screenshots);
    const log: string[] = [];
    const result = await uploadIOSLocale({
      device, locale, dir, log: (line: string) => { console.log(`[iOS] ${line}`); log.push(line); },
    });

    if (result.skipped) {
      return NextResponse.json({ skipped: true, reason: result.reason });
    }

    console.log(`[iOS] ${locale} → ${result.uploaded.join(', ')} (v${result.version})`);
    return NextResponse.json({
      ok: true,
      locale,
      uploaded: result.uploaded,
      count: screenshots.length,
      version: result.version,
      ...(result.errors.length ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[iOS upload]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
