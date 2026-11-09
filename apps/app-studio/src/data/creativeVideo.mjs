import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { run, runJson, briefError } from './storeUpload.mjs';
import { validateCreativeImage } from './creativeImage.mjs';
import { CreativeUploadError } from './creativeError.mjs';
import { IOS_LOCALE_MAP } from './storeLocales.mjs';

import scan from './searchAnimation.json' with { type: 'json' };
export const SEARCH_VIDEO = { width: scan.videoWidth, height: scan.videoHeight, fps: scan.fps, duration: scan.period * scan.cycles };

export function validateScanGeometry(geometry) {
  const keys = ['x', 'y', 'width', 'height', 'beamX', 'beamWidth', 'beamHeight'];
  if (!geometry || keys.some(key => !Number.isFinite(geometry[key]))) {
    throw new CreativeUploadError('The food camera geometry is missing.', 400);
  }
  const { x, y, width, height, beamX, beamWidth, beamHeight } = geometry;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 3841 || y + height > 2561
    || beamX < x || beamWidth <= 0 || beamX + beamWidth > x + width + 1 || beamHeight <= 0
    || beamHeight > height * scan.minTop) {
    throw new CreativeUploadError('The food camera geometry is outside the Search artwork.', 400);
  }
  return geometry;
}

async function probeVideo(file) {
  const result = await runJson('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30_000 });
  const streams = result.json?.streams;
  const video = streams?.find(stream => stream.codec_type === 'video');
  const fpsParts = video?.avg_frame_rate?.split('/').map(Number);
  const fps = fpsParts?.length === 2 ? fpsParts[0] / fpsParts[1] : NaN;
  const duration = Number(result.json?.format?.duration);
  if (!result.ok || !video || streams.filter(stream => stream.codec_type === 'video').length !== 1
    || video.width !== SEARCH_VIDEO.width || video.height !== SEARCH_VIDEO.height
    || Math.abs(fps - SEARCH_VIDEO.fps) > 0.01 || Math.abs(duration - SEARCH_VIDEO.duration) > 0.05
    || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p'
    || streams.some(stream => stream.codec_type === 'audio')) {
    const detail = result.ok ? `${video?.width} × ${video?.height}, ${fps} fps, ${duration}s, ${video?.codec_name}/${video?.pix_fmt}` : briefError(result);
    throw new CreativeUploadError(`Search requires the generated 1920 × 1280, 30 fps, 7.2-second silent H.264 MP4. Received: ${detail}.`, 400);
  }
  return { width: video.width, height: video.height, fps, duration };
}

/** Render the very same captured composition and scan asset that the Studio displays. */
export async function renderSearchVideo({ locale, data, geometry }) {
  const frame = validateCreativeImage('search', locale, data, true);
  validateScanGeometry(geometry);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ricecal-search-video-'));
  try {
    const frameFile = path.join(directory, 'frame.jpg');
    const beamFile = path.join(directory, 'beam.png');
    const videoFile = path.join(directory, 'search.mp4');
    const ratio = scan.videoWidth / 3840;
    const beamWidth = Math.round(geometry.beamWidth * ratio);
    const beamHeight = Math.round(geometry.beamHeight * ratio);
    await fs.writeFile(frameFile, frame);
    await sharp(path.join(process.cwd(), 'public', scan.beamImage)).resize(beamWidth, beamHeight).png().toFile(beamFile);
    const x = Math.round(geometry.beamX * ratio);
    const y = geometry.y * ratio;
    const height = geometry.height * ratio;
    const lineY = beamHeight * scan.beamLineY / scan.beamHeight;
    const motion = `${y}+${height}*(${scan.minTop}+${scan.maxTop - scan.minTop}*(1-cos(2*PI*t/${scan.period}))/2)-${lineY}`;
    const result = await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1', '-framerate', String(scan.fps), '-i', frameFile,
      '-loop', '1', '-framerate', String(scan.fps), '-i', beamFile,
      '-filter_complex', `[0:v]scale=${scan.videoWidth}:${scan.videoHeight}:out_range=tv,format=yuv420p[base];[base][1:v]overlay=x=${x}:y='${motion}':eval=frame:shortest=1[out]`,
      '-map', '[out]', '-frames:v', String(Math.round(SEARCH_VIDEO.duration * scan.fps)),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-an', '-color_range', 'tv', '-movflags', '+faststart', videoFile,
    ], { timeout: 180_000 });
    if (!result.ok) throw new CreativeUploadError(`Could not encode the camera scan: ${briefError(result)}`, 503);
    await probeVideo(videoFile);
    return await fs.readFile(videoFile);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** Inspect the actual upload bytes before making any App Store command. */
export async function validateCreativeVideo(locale, data) {
  if (!Object.hasOwn(IOS_LOCALE_MAP, locale)) throw new CreativeUploadError('This language has no App Store Connect localization.', 400);
  if (typeof data !== 'string' || !data.length || data.length > 32 * 1024 * 1024
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new CreativeUploadError('Send a complete base64 MP4 under 24 MB.', 400);
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new CreativeUploadError('Search uploads require an MP4 video, not a still image.', 400);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ricecal-validate-video-'));
  try {
    const file = path.join(directory, 'search.mp4');
    await fs.writeFile(file, bytes);
    const metadata = await probeVideo(file);
    return { bytes, ...metadata };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
