import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderSearchVideo, validateCreativeVideo } from '../src/data/creativeVideo.mjs';
import { run, runJson } from '../src/data/storeUpload.mjs';

const still = (await fs.readFile(new URL('../public/assets/verification/app-store-search.jpg', import.meta.url))).toString('base64');
const geometry = { x: 2522.5, y: 566.5, width: 960, height: 1254, beamX: 2576.5, beamWidth: 852, beamHeight: 192 };
const hasEncoder = (await run('ffmpeg', ['-version'])).ok && (await run('ffprobe', ['-version'])).ok;

test('a still image cannot enter the Search video uploader', async () => {
  await assert.rejects(validateCreativeVideo('en', still), /MP4 video, not a still image/);
});

test('Search rejects geometry outside its composition before encoding', async () => {
  await assert.rejects(renderSearchVideo({ locale: 'en', data: still, geometry: { ...geometry, x: -10 } }), /outside/);
});

test('the real Search encoder creates a silent compliant MP4 with a moving scan', { skip: !hasEncoder }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ricecal-video-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const bytes = await renderSearchVideo({ locale: 'en', data: still, geometry });
  const result = await validateCreativeVideo('en', bytes.toString('base64'));
  assert.deepEqual([result.width, result.height, result.fps, result.duration], [1920, 1280, 30, 7.2]);
  const file = path.join(directory, 'search.mp4');
  await fs.writeFile(file, bytes);
  const probe = await runJson('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]);
  assert.equal(probe.json.streams.length, 1, 'the loop should have one video stream and no audio');
  assert.equal(probe.json.streams[0].codec_name, 'h264');
  assert.equal(probe.json.streams[0].pix_fmt, 'yuv420p');
  const frames = [];
  for (const time of [0, 1.8]) {
    const frame = path.join(directory, `scan-${time}.png`);
    assert.equal((await run('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', file, '-frames:v', '1', frame])).ok, true);
    frames.push(await fs.readFile(frame));
  }
  assert.equal(frames[0].equals(frames[1]), false, 'the scan must move in the exported video');
  const invalid = path.join(directory, 'too-short.mp4');
  assert.equal((await run('ffmpeg', ['-v', 'error', '-i', file, '-t', '2', '-c', 'copy', invalid])).ok, true);
  await assert.rejects(validateCreativeVideo('en', (await fs.readFile(invalid)).toString('base64')), /7.2-second/);
});
