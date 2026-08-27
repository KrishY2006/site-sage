const DEFAULT_BATCH_SIZE = 128;
const MAX_RETRIES = 3;
const DEFAULT_MODEL = 'liquid/lfm-2.5-embedding-350m:free';
const DEFAULT_API_BASE = 'https://openrouter.ai/api/v1';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }
  return key;
}

function getModel() {
  return process.env.EMBEDDINGS_MODEL || DEFAULT_MODEL;
}

function getApiBase() {
  return (process.env.EMBEDDINGS_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

function getBatchSize() {
  const parsed = Number.parseInt(process.env.EMBEDDINGS_BATCH_SIZE, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2048) : DEFAULT_BATCH_SIZE;
}

function getBackoffMs(attempt) {
  return Math.min(6000, 400 * 2 ** (attempt - 1)) + Math.random() * 250;
}

async function readErrorDetail(response) {
  try {
    const payload = await response.json();
    if (payload && payload.error && payload.error.message) return payload.error.message;
  } catch {}
  try {
    const text = await response.text();
    if (text) return text.slice(0, 300);
  } catch {}
  return response.statusText || 'Unknown error';
}

function isRetriableStatus(status) {
  return status === 429 || status >= 500;
}

function areValidVectors(vectors) {
  return vectors.every(vector =>
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(n => typeof n === 'number' && Number.isFinite(n))
  );
}

async function requestEmbeddings(batch, apiKey) {
  const body = { model: getModel(), input: batch };

  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(`${getApiBase()}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'site-sage-server'
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Embeddings request failed: ${err.message}`);
      }
      await sleep(getBackoffMs(attempt));
      continue;
    }

    if (response.ok) {
      const payload = await response.json();
      const vectors = [...((payload && payload.data) || [])]
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      if (vectors.length !== batch.length) {
        throw new Error(`Embeddings API returned ${vectors.length} vectors for ${batch.length} inputs`);
      }
      if (!areValidVectors(vectors)) {
        throw new Error('Embeddings API returned malformed vectors');
      }
      return vectors;
    }

    const detail = await readErrorDetail(response);
    if (!isRetriableStatus(response.status) || attempt >= MAX_RETRIES) {
      throw new Error(`Embeddings API error ${response.status}: ${detail}`);
    }
    await sleep(getBackoffMs(attempt));
  }
}

async function createEmbeddings(input) {
  const isSingleString = typeof input === 'string';
  const rawTexts = isSingleString ? [input] : Array.isArray(input) ? input : null;

  if (rawTexts === null) {
    throw new TypeError('createEmbeddings expects a string or an array of strings');
  }

  const texts = rawTexts.map(text => String(text ?? ''));
  if (texts.length === 0) return [];
  if (texts.some(text => !text.trim())) {
    throw new Error('Cannot embed empty text');
  }

  const apiKey = getApiKey();
  const batchSize = getBatchSize();
  const vectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    vectors.push(...(await requestEmbeddings(texts.slice(i, i + batchSize), apiKey)));
  }

  const dimensions = new Set(vectors.map(vector => vector.length));
  if (dimensions.size > 1) {
    throw new Error(`Inconsistent embedding dimensions received: ${[...dimensions].join(', ')}`);
  }

  return isSingleString ? vectors[0] : vectors;
}

module.exports = { createEmbeddings };
