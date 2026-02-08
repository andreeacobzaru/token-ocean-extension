// Shared constants and helpers for Token Ocean content script.
// Loaded before content.js via manifest; all names are global in the content script scope.

// Set to true to log messages to the page console (Inspect → Console)
var DEBUG_MESSAGES = true;

// Energy constants (Wh = Watt-hours)
var ENERGY_PREFILL_PER_TOKEN = 0.0002;
var ENERGY_DECODE_PER_TOKEN = 0.001;
// TODO: use better WUE estimation
var WUE_ML_PER_WH = 1.8; // mL water per Wh energy

/**
 * CSS selectors for user/assistant message content per host.
 * @returns {{ user: string, assistant: string }}
 */
function getMessageSelectors() {
  var host = window.location.hostname;
  if (host.indexOf('chatgpt.com') !== -1) {
    return {
      user: '.user-message-bubble-color > .whitespace-pre-wrap',
      assistant: '.markdown.prose',
    };
  }
  if (host.indexOf('gemini.google.com') !== -1) {
    return {
      user: '.user-query-bubble-with-background',
      assistant: '.model-response-text',
    };
  }
  return { user: '', assistant: '' };
}

/** Text patterns that identify the "Stop generating" button (case-insensitive). */
var STOP_GENERATING_LABELS = ['stop generating', 'stop'];

/**
 * Returns the "Stop generating" button element if present (model is streaming).
 * Uses button text so it works across DOM changes. Returns null if not found.
 * @returns {HTMLButtonElement | null}
 */
function getStopGeneratingButton() {
  var host = window.location.hostname;
  var buttons = document.querySelectorAll('button');
  for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    var text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
    if (STOP_GENERATING_LABELS.some(function (label) { return text === label || text.indexOf(label) !== -1; })) {
      return btn;
    }
  }
  return null;
}

/**
 * Rough token count from text (~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.max(0, Math.round((text || '').length / 4));
}

/**
 * Estimate tokens for an uploaded file from size and MIME type (heuristic).
 * @param {number} sizeBytes
 * @param {string} [mimeType]
 * @returns {number}
 */
function estimateTokensForFile(sizeBytes, mimeType) {
  if (!sizeBytes || sizeBytes <= 0) return 0;
  var type = (mimeType || '').toLowerCase();
  if (type.indexOf('image/') === 0) {
    var mb = sizeBytes / (1024 * 1024);
    if (mb <= 0.1) return 300;
    if (mb <= 0.5) return 700;
    if (mb <= 2) return 1100;
    return Math.min(4000, 1100 + Math.round(mb * 500));
  }
  if (type.indexOf('json') !== -1 || type.indexOf('text') !== -1 || type.indexOf('xml') !== -1 || type.indexOf('csv') !== -1 || type === 'application/json') {
    return Math.max(0, Math.round(sizeBytes / 4));
  }
  return Math.max(0, Math.round(sizeBytes / 4));
}
