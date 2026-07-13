export const CHUNK_SIZE = 64 * 1024;
export const MAX_CONCURRENCY = 3;
export const ATTEMPTS_PER_SOURCE = 3;
export const REQUEST_TIMEOUT_MS = 25_000;

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function buildMirrorUrl(relativeHref, mirrorBase) {
  const cleanPath = relativeHref.split(/[?#]/, 1)[0].replace(/^\.\//, '');
  if (cleanPath.includes('\\') || /%(?:2f|5c)/i.test(cleanPath)) {
    throw new Error('download path must be a files/notes PDF');
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch {
    throw new Error('download path must be a files/notes PDF');
  }
  const segments = decodedPath.split('/');
  if (!decodedPath.startsWith('files/notes/') || !decodedPath.toLowerCase().endsWith('.pdf') || segments.includes('..')) {
    throw new Error('download path must be a files/notes PDF');
  }
  return new URL(cleanPath, mirrorBase).href;
}

function createAttemptController(timeoutMs, parentSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => {
    const error = new Error(`request timed out after ${timeoutMs} ms`);
    error.name = 'TimeoutError';
    controller.abort(error);
  }, timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error('download aborted');
}

async function fetchWithTimeout(url, init, fetchImpl, timeoutMs) {
  const attempt = createAttemptController(timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: attempt.signal });
  } finally {
    attempt.dispose();
  }
}

export async function discoverContentLength(pageUrl, {
  fetchImpl = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const response = await fetchWithTimeout(pageUrl, { method: 'HEAD', cache: 'no-store' }, fetchImpl, timeoutMs);
  if (!response.ok) throw new Error(`header request failed with ${response.status}`);
  const totalBytes = Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new Error('missing positive Content-Length');
  return totalBytes;
}

async function fetchRange(url, start, end, fetchImpl, timeoutMs, parentSignal) {
  const attempt = createAttemptController(timeoutMs, parentSignal);
  try {
    throwIfAborted(attempt.signal);
    const response = await fetchImpl(
      url,
      {
        headers: { Range: `bytes=${start}-${end}` },
        cache: 'no-store',
        signal: attempt.signal,
      },
    );
    throwIfAborted(attempt.signal);
    if (response.status !== 206) throw new Error(`range request failed with ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    throwIfAborted(attempt.signal);
    const expectedLength = end - start + 1;
    if (bytes.byteLength !== expectedLength) {
      throw new Error(`expected ${expectedLength} bytes, received ${bytes.byteLength}`);
    }
    return bytes;
  } finally {
    attempt.dispose();
  }
}

export async function fetchRangeWithFallback({
  urls,
  start,
  end,
  fetchImpl = fetch,
  attempts = ATTEMPTS_PER_SOURCE,
  timeoutMs = REQUEST_TIMEOUT_MS,
  sleepImpl = defaultSleep,
  signal,
}) {
  let lastError;
  for (const url of urls) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      throwIfAborted(signal);
      try {
        return await fetchRange(url, start, end, fetchImpl, timeoutMs, signal);
      } catch (error) {
        throwIfAborted(signal);
        lastError = error;
        if (attempt < attempts) {
          await sleepImpl(250 * attempt);
          throwIfAborted(signal);
        }
      }
    }
  }
  const detail = lastError instanceof Error ? lastError.message : 'unknown error';
  throw new Error(`all download sources failed for bytes ${start}-${end}: ${detail}`, { cause: lastError });
}

export async function retrievePdf({
  pageUrl,
  mirrorUrl,
  totalBytes,
  fetchImpl = fetch,
  chunkSize = CHUNK_SIZE,
  concurrency = MAX_CONCURRENCY,
  attempts = ATTEMPTS_PER_SOURCE,
  timeoutMs = REQUEST_TIMEOUT_MS,
  sleepImpl = defaultSleep,
  onProgress = () => {},
}) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new Error('totalBytes must be positive');
  const ranges = [];
  for (let start = 0; start < totalBytes; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize - 1, totalBytes - 1) });
  }
  const parts = new Array(ranges.length);
  let cursor = 0;
  let completedBytes = 0;
  const downloadController = new AbortController();
  const worker = async () => {
    try {
      while (cursor < ranges.length) {
        throwIfAborted(downloadController.signal);
        const index = cursor;
        cursor += 1;
        const { start, end } = ranges[index];
        const part = await fetchRangeWithFallback({
          urls: [mirrorUrl, pageUrl], start, end, fetchImpl, attempts, timeoutMs, sleepImpl,
          signal: downloadController.signal,
        });
        throwIfAborted(downloadController.signal);
        parts[index] = part;
        completedBytes += part.byteLength;
        onProgress(Math.round((completedBytes / totalBytes) * 100), completedBytes, totalBytes);
      }
    } catch (error) {
      if (!downloadController.signal.aborted) downloadController.abort(error);
      throw error;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, () => worker()));
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  if (offset !== totalBytes) throw new Error(`assembled ${offset} bytes, expected ${totalBytes}`);
  return result;
}

export function savePdfBytes(bytes, filename, {
  documentRef = document,
  urlApi = URL,
  setTimeoutImpl = setTimeout,
} = {}) {
  const blobUrl = urlApi.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = documentRef.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeoutImpl(() => urlApi.revokeObjectURL(blobUrl), 1_000);
}

function createActionLink(documentRef, label, href, extraClass) {
  const link = documentRef.createElement('a');
  link.className = `note-action ${extraClass}`;
  link.href = href;
  link.textContent = label;
  return link;
}

function noteFilename(relativeHref) {
  const segments = relativeHref.split(/[?#]/, 1)[0].split('/');
  return decodeURIComponent(segments[segments.length - 1]);
}

function replaceWithOrdinaryDownload(button, mirrorUrl, documentRef) {
  const fallback = createActionLink(documentRef, '普通下载', mirrorUrl, 'note-action-fallback');
  fallback.target = '_blank';
  fallback.rel = 'noopener';
  button.replaceWith(fallback);
}

async function runStableDownload({ button, pageUrl, mirrorUrl, filename, documentRef, fetchImpl }) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '准备下载…';
  try {
    const totalBytes = await discoverContentLength(pageUrl, { fetchImpl });
    const bytes = await retrievePdf({
      pageUrl,
      mirrorUrl,
      totalBytes,
      fetchImpl,
      onProgress: (percent) => { button.textContent = `下载 ${percent}%`; },
    });
    savePdfBytes(bytes, filename, { documentRef });
    button.textContent = '已开始下载';
    setTimeout(() => {
      if (button.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = '稳定下载';
      }
    }, 2_000);
  } catch (error) {
    console.warn('Stable PDF download failed; exposing ordinary download.', error);
    replaceWithOrdinaryDownload(button, mirrorUrl, documentRef);
  }
}

export function enhanceNotesListing({
  documentRef = document,
  locationRef = window.location,
  fetchImpl = fetch,
} = {}) {
  const config = documentRef.querySelector('#note-download-config');
  const mirrorBase = config?.dataset.mirrorBase;
  if (!mirrorBase) return;

  const cardLinks = documentRef.querySelectorAll('.quarto-listing .g-col-1 > a.quarto-grid-link[href$=".pdf"]');
  for (const cardLink of cardLinks) {
    const item = cardLink.parentElement;
    if (!item || item.querySelector(':scope > .note-card-actions')) continue;

    const relativeHref = cardLink.getAttribute('href');
    const pageUrl = new URL(relativeHref, locationRef.href).href;
    const mirrorUrl = buildMirrorUrl(relativeHref, mirrorBase);
    const filename = noteFilename(relativeHref);

    cardLink.target = '_blank';
    cardLink.rel = 'noopener';

    const actions = documentRef.createElement('div');
    actions.className = 'note-card-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', `${filename} 文件操作`);

    const readLink = createActionLink(documentRef, '在线阅读', pageUrl, 'note-action-read');
    readLink.target = '_blank';
    readLink.rel = 'noopener';
    actions.append(readLink);

    if (locationRef.protocol === 'file:') {
      const directLink = createActionLink(documentRef, '下载 PDF', relativeHref, 'note-action-fallback');
      directLink.setAttribute('download', filename);
      actions.append(directLink);
    } else {
      const downloadButton = documentRef.createElement('button');
      downloadButton.type = 'button';
      downloadButton.className = 'note-action note-action-download';
      downloadButton.textContent = '稳定下载';
      downloadButton.setAttribute('aria-live', 'polite');
      downloadButton.addEventListener('click', () => runStableDownload({
        button: downloadButton,
        pageUrl,
        mirrorUrl,
        filename,
        documentRef,
        fetchImpl,
      }));
      actions.append(downloadButton);
    }

    item.append(actions);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceNotesListing(), { once: true });
  } else {
    enhanceNotesListing();
  }
}
