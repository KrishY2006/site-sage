const DEFAULT_CHUNK_SIZE = 400; // <-- Lowered from 800
const DEFAULT_OVERLAP_RATIO = 0.18;
const MIN_CHUNK_RATIO = 0.3;
const CHARS_PER_TOKEN_ESTIMATE = 4;

function getChunkSize() {
  const parsed = Number.parseInt(process.env.CHUNK_SIZE, 10);
  const size = Number.isFinite(parsed) && parsed >= 100 ? parsed : DEFAULT_CHUNK_SIZE;
  
  // Ultra-strict cap to survive dense text / code snippets
  return Math.min(size, 450); 
}

function getOverlapSize(chunkSize) {
  const parsed = Number.parseFloat(process.env.CHUNK_OVERLAP_RATIO);
  const ratio = Number.isFinite(parsed) && parsed >= 0.05 && parsed <= 0.5 ? parsed : DEFAULT_OVERLAP_RATIO;
  return Math.round(chunkSize * ratio);
}

function findLastSentenceEnd(slice) {
  let last = -1;
  for (const match of slice.matchAll(/[.!?]+["')\]]*(?=\s)/g)) {
    last = match.index + match[0].length;
  }
  return last;
}

function findSplitIndex(text, start, end, minChars) {
  const slice = text.slice(start, end);

  let idx = slice.lastIndexOf('\n\n');
  if (idx + 2 >= minChars) return start + idx + 2;

  idx = findLastSentenceEnd(slice);
  if (idx >= minChars) return start + idx + 1;

  idx = slice.lastIndexOf('\n');
  if (idx >= minChars) return start + idx + 1;

  idx = slice.lastIndexOf(' ');
  if (idx >= minChars) return start + idx + 1;

  return end;
}

function chunkText(rawText) {
  const text = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  if (!text) return [];

  const chunkSize = getChunkSize();
  const overlapSize = getOverlapSize(chunkSize);
  const minChars = Math.max(1, Math.floor(chunkSize * MIN_CHUNK_RATIO));

  if (text.length <= chunkSize) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const cut = end < text.length ? findSplitIndex(text, start, end, minChars) : end;

    const chunkStr = text.slice(start, cut);
    chunks.push(chunkStr);
    
    // Log the chunk sizes to the backend terminal for verification
    console.log(`Created chunk of length: ${chunkStr.length} characters`);

    if (cut >= text.length) break;

    let nextStart = Math.max(cut - overlapSize, start + 1);
    while (nextStart < cut && /\s/.test(text[nextStart])) nextStart++;
    start = nextStart > start ? nextStart : start + 1;
  }

  return chunks;
}

function estimateTokenCount(text) {
  return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN_ESTIMATE);
}

// Crucial export line that was missing
module.exports = { chunkText, estimateTokenCount };