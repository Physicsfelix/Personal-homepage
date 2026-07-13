import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMirrorUrl,
  discoverContentLength,
  fetchRangeWithFallback,
  retrievePdf,
} from '../assets/notes-download.js';

const rangeResponse = (bytes) => new Response(Uint8Array.from(bytes), { status: 206 });

test('buildMirrorUrl accepts only public note PDFs', () => {
  const base = 'https://raw.githubusercontent.com/Physicsfelix/Personal-homepage/main/';
  assert.equal(
    buildMirrorUrl('files/notes/example.pdf', base),
    `${base}files/notes/example.pdf`,
  );
  assert.throws(() => buildMirrorUrl('../secret.pdf', base), /files\/notes/);
});

test('discoverContentLength returns a positive exact byte length', async () => {
  const fetchImpl = async (_url, init) => {
    assert.equal(init.method, 'HEAD');
    return new Response(null, {
      status: 200,
      headers: { 'Content-Length': '10' },
    });
  };
  assert.equal(await discoverContentLength('https://example.test/note.pdf', { fetchImpl }), 10);
});

test('fetchRangeWithFallback exhausts the mirror before using Pages', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('raw.githubusercontent.com')) throw new TypeError('reset');
    return rangeResponse([0, 1, 2, 3]);
  };
  const bytes = await fetchRangeWithFallback({
    urls: ['https://raw.githubusercontent.com/note.pdf', 'https://example.test/note.pdf'],
    start: 0,
    end: 3,
    fetchImpl,
    attempts: 3,
    timeoutMs: 100,
    sleepImpl: async () => {},
  });
  assert.deepEqual([...bytes], [0, 1, 2, 3]);
  assert.equal(calls.filter((url) => url.includes('raw.githubusercontent.com')).length, 3);
  assert.equal(calls.filter((url) => url.includes('example.test')).length, 1);
});

test('retrievePdf reorders concurrent ranges and reports 100 percent', async () => {
  const progress = [];
  const fetchImpl = async (_url, init) => {
    const [, startText, endText] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    const start = Number(startText);
    const end = Number(endText);
    await new Promise((resolve) => setTimeout(resolve, start === 0 ? 8 : 1));
    return rangeResponse(Array.from({ length: end - start + 1 }, (_, index) => start + index));
  };
  const bytes = await retrievePdf({
    pageUrl: 'https://example.test/note.pdf',
    mirrorUrl: 'https://raw.githubusercontent.com/note.pdf',
    totalBytes: 10,
    fetchImpl,
    chunkSize: 4,
    concurrency: 3,
    attempts: 1,
    timeoutMs: 100,
    onProgress: (percent) => progress.push(percent),
  });
  assert.deepEqual([...bytes], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(progress.at(-1), 100);
});

test('retrievePdf rejects a short range instead of corrupting the file', async () => {
  const fetchImpl = async () => rangeResponse([0, 1]);
  await assert.rejects(
    retrievePdf({
      pageUrl: 'https://example.test/note.pdf',
      mirrorUrl: 'https://raw.githubusercontent.com/note.pdf',
      totalBytes: 4,
      fetchImpl,
      chunkSize: 4,
      concurrency: 1,
      attempts: 1,
      timeoutMs: 100,
      sleepImpl: async () => {},
    }),
    /expected 4 bytes, received 2/,
  );
});
