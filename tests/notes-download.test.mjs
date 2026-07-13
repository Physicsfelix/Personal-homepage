import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMirrorUrl,
  discoverContentLength,
  enhanceNotesListing,
  fetchRangeWithFallback,
  retrievePdf,
  savePdfBytes,
} from '../assets/notes-download.js';

const rangeResponse = (bytes) => new Response(Uint8Array.from(bytes), { status: 206 });

const withDeadline = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const stalledRangeResponse = (signal, bytes, { resolveOnAbort = false } = {}) => ({
  status: 206,
  arrayBuffer: () => new Promise((resolve, reject) => {
    const finish = () => {
      if (resolveOnAbort) {
        resolve(Uint8Array.from(bytes).buffer);
      } else {
        reject(signal.reason instanceof Error ? signal.reason : new Error('request aborted'));
      }
    };
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  }),
});

const hasClass = (element, className) => element.className.split(/\s+/).includes(className);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.href = '';
    this.download = '';
    this.target = '';
    this.rel = '';
    this.type = '';
    this.hidden = false;
    this.disabled = false;
    this.isConnected = false;
    this.clicked = false;
    this.listeners = new Map();
  }

  append(...elements) {
    for (const element of elements) {
      element.parentElement = this;
      element.isConnected = this.isConnected;
      this.children.push(element);
    }
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'href') this.href = text;
    if (name === 'download') this.download = text;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.clicked = true;
    return this.listeners.get('click')?.();
  }

  querySelector(selector) {
    if (selector === ':scope > .note-card-actions') {
      return this.children.find((child) => hasClass(child, 'note-card-actions')) ?? null;
    }
    return null;
  }

  replaceWith(replacement) {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    parent.children[index] = replacement;
    replacement.parentElement = parent;
    replacement.isConnected = parent.isConnected;
    this.parentElement = null;
    this.isConnected = false;
  }

  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.body.isConnected = true;
    this.createdElements = [];
    this.config = null;
    this.cardLinks = [];
  }

  createElement(tagName) {
    const element = new FakeElement(tagName);
    this.createdElements.push(element);
    return element;
  }

  querySelector(selector) {
    return selector === '#note-download-config' ? this.config : null;
  }

  querySelectorAll(selector) {
    if (selector === '.quarto-listing .g-col-1 > a.quarto-grid-link[href$=".pdf"]') {
      return this.cardLinks;
    }
    return [];
  }
}

const createListingFixture = () => {
  const documentRef = new FakeDocument();
  const config = documentRef.createElement('div');
  config.dataset.mirrorBase = 'https://raw.githubusercontent.com/Physicsfelix/Personal-homepage/main/';
  documentRef.config = config;

  const item = documentRef.createElement('div');
  item.className = 'g-col-1';
  item.isConnected = true;
  const cardLink = documentRef.createElement('a');
  cardLink.className = 'quarto-grid-link';
  cardLink.setAttribute('href', 'files/notes/example.pdf');
  item.append(cardLink);
  documentRef.cardLinks = [cardLink];

  return { documentRef, item, cardLink };
};

test('buildMirrorUrl accepts only public note PDFs', () => {
  const base = 'https://raw.githubusercontent.com/Physicsfelix/Personal-homepage/main/';
  assert.equal(
    buildMirrorUrl('files/notes/example.pdf', base),
    `${base}files/notes/example.pdf`,
  );
  assert.throws(() => buildMirrorUrl('../secret.pdf', base), /files\/notes/);
  for (const unsafePath of [
    'files/notes/%2e%2e/secret.pdf',
    'files/notes/example%2fsecret.pdf',
    'files/notes/example%5csecret.pdf',
    'files/notes\\secret.pdf',
  ]) {
    assert.throws(() => buildMirrorUrl(unsafePath, base), /files\/notes/);
  }
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

test('fetchRangeWithFallback times out a stalled response body before using Pages', async () => {
  const calls = [];
  let mirrorSignal;
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.includes('raw.githubusercontent.com')) {
      mirrorSignal = init.signal;
      return stalledRangeResponse(init.signal, [0, 1, 2, 3]);
    }
    return rangeResponse([0, 1, 2, 3]);
  };

  const bytes = await withDeadline(fetchRangeWithFallback({
    urls: ['https://raw.githubusercontent.com/note.pdf', 'https://example.test/note.pdf'],
    start: 0,
    end: 3,
    fetchImpl,
    attempts: 1,
    timeoutMs: 10,
    sleepImpl: async () => {},
  }), 250, 'stalled response body was not aborted');

  assert.deepEqual([...bytes], [0, 1, 2, 3]);
  assert.equal(mirrorSignal.aborted, true);
  assert.deepEqual(calls, [
    'https://raw.githubusercontent.com/note.pdf',
    'https://example.test/note.pdf',
  ]);
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
  assert.equal(progress[progress.length - 1], 100);
});

test('retrievePdf aborts sibling workers and prevents later fetches or progress', async () => {
  const calls = [];
  const progress = [];
  let siblingSignal;
  let markSiblingStarted;
  const siblingStarted = new Promise((resolve) => { markSiblingStarted = resolve; });
  const fetchImpl = async (url, init) => {
    const range = init.headers.Range;
    calls.push(`${url} ${range}`);
    if (range === 'bytes=4-7') {
      siblingSignal = init.signal;
      markSiblingStarted();
      return stalledRangeResponse(init.signal, [4, 5, 6, 7], { resolveOnAbort: true });
    }
    await siblingStarted;
    return new Response(null, { status: 503 });
  };

  await assert.rejects(
    withDeadline(retrievePdf({
      pageUrl: 'https://example.test/note.pdf',
      mirrorUrl: 'https://raw.githubusercontent.com/note.pdf',
      totalBytes: 12,
      fetchImpl,
      chunkSize: 4,
      concurrency: 2,
      attempts: 1,
      timeoutMs: 200,
      sleepImpl: async () => {},
      onProgress: (percent) => progress.push(percent),
    }), 250, 'terminal range failure did not reject'),
    /all download sources failed/,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(siblingSignal.aborted, true);
  assert.deepEqual(progress, []);
  assert.equal(calls.some((call) => call.endsWith('bytes=8-11')), false);
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

test('savePdfBytes clicks a temporary PDF link and revokes its Blob URL', async () => {
  const documentRef = new FakeDocument();
  const scheduled = [];
  const revoked = [];
  let savedBlob;
  const urlApi = {
    createObjectURL: (blob) => {
      savedBlob = blob;
      return 'blob:note-download';
    },
    revokeObjectURL: (url) => revoked.push(url),
  };

  savePdfBytes(Uint8Array.from([7, 8, 9]), 'example.pdf', {
    documentRef,
    urlApi,
    setTimeoutImpl: (callback, milliseconds) => scheduled.push({ callback, milliseconds }),
  });

  const anchor = documentRef.createdElements[0];
  assert.equal(savedBlob.type, 'application/pdf');
  assert.deepEqual([...new Uint8Array(await savedBlob.arrayBuffer())], [7, 8, 9]);
  assert.equal(anchor.href, 'blob:note-download');
  assert.equal(anchor.download, 'example.pdf');
  assert.equal(anchor.hidden, true);
  assert.equal(anchor.clicked, true);
  assert.equal(documentRef.body.children.length, 0);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].milliseconds, 1_000);
  assert.deepEqual(revoked, []);
  scheduled[0].callback();
  assert.deepEqual(revoked, ['blob:note-download']);
});

test('file mode adds a direct download and keeps actions inside the listing item', () => {
  const { documentRef, item, cardLink } = createListingFixture();
  enhanceNotesListing({
    documentRef,
    locationRef: { href: 'file:///site/notes.html', protocol: 'file:' },
    fetchImpl: async () => { throw new Error('file mode must not fetch'); },
  });

  const actions = item.querySelector(':scope > .note-card-actions');
  assert.equal(actions.parentElement, item);
  assert.equal(item.children[1], actions);
  assert.equal(actions.getAttribute('role'), 'group');
  assert.match(actions.getAttribute('aria-label'), /example\.pdf/);
  assert.equal(actions.children.length, 2);
  assert.equal(actions.children[0].textContent, '在线阅读');
  assert.equal(actions.children[1].textContent, '下载 PDF');
  assert.equal(actions.children[1].href, 'files/notes/example.pdf');
  assert.equal(actions.children[1].getAttribute('download'), 'example.pdf');
  assert.equal(cardLink.target, '_blank');
  assert.equal(cardLink.rel, 'noopener');
});

test('HTTPS mode exposes accessible busy state and ordinary fallback on failure', async () => {
  const { documentRef, item } = createListingFixture();
  let resolveHead;
  const fetchImpl = async (_url, init) => {
    assert.equal(init.method, 'HEAD');
    return new Promise((resolve) => { resolveHead = resolve; });
  };
  enhanceNotesListing({
    documentRef,
    locationRef: { href: 'https://physicsfelix.github.io/Personal-homepage/notes.html', protocol: 'https:' },
    fetchImpl,
  });

  const actions = item.querySelector(':scope > .note-card-actions');
  const button = actions.children[1];
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('aria-live'), 'polite');

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    const download = button.click();
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.textContent, '准备下载…');
    resolveHead(new Response(null, { status: 503 }));
    await download;
  } finally {
    console.warn = originalWarn;
  }

  const fallback = actions.children[1];
  assert.equal(warnings.length, 1);
  assert.equal(fallback.tagName, 'A');
  assert.equal(fallback.textContent, '普通下载');
  assert.equal(fallback.href, 'https://raw.githubusercontent.com/Physicsfelix/Personal-homepage/main/files/notes/example.pdf');
  assert.equal(fallback.target, '_blank');
  assert.equal(fallback.rel, 'noopener');
  assert.equal(fallback.parentElement, actions);
});

test('enhanceNotesListing is idempotent and leaves actions on the sortable item', () => {
  const { documentRef, item } = createListingFixture();
  const options = {
    documentRef,
    locationRef: { href: 'https://example.test/notes.html', protocol: 'https:' },
    fetchImpl: async () => { throw new Error('unused'); },
  };

  enhanceNotesListing(options);
  enhanceNotesListing(options);

  const actionGroups = item.children.filter((child) => hasClass(child, 'note-card-actions'));
  assert.equal(actionGroups.length, 1);
  assert.equal(actionGroups[0].parentElement, item);
  assert.equal(item.children.length, 2);
});
