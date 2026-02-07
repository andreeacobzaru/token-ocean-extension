// Depends on utils.js (load order in manifest). Uses: getMessageSelectors, estimateTokens, estimateTokensForFile, DEBUG_MESSAGES, ENERGY_*, WUE_ML_PER_WH.
// Persisted: overallWaterMl (all-time). Session: sessionWaterMl (resets on conversation switch or popup "Reset this session").

let previousMessageCount = 0;
/** When the user switches to a different chat (e.g. from history), we set baseline and don't count those messages. */
let lastConversationKey = '';

function getConversationKey() {
  return window.location.href || window.location.pathname || '';
}

const LOG_PREFIX = '[Token Ocean]';

function calculateFootprint() {
  const { user: userSel, assistant: assistantSel } = getMessageSelectors();

  if (!userSel || !assistantSel) {
    if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'skip: no selectors for host', window.location.hostname);
    return;
  }

  const userMessages = document.querySelectorAll(userSel);
  const assistantMessages = document.querySelectorAll(assistantSel);
  const messages = [...userMessages, ...assistantMessages];

  if (messages.length === 0) {
    if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'skip: 0 messages');
    chrome.storage.local.set({ contextSize: 0, messageCount: 0 });
    return;
  }

  const conversationKey = getConversationKey();
  const switchedConversation = conversationKey !== lastConversationKey;

  if (switchedConversation) {
    if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'skip: switched conversation, baseline set', { messages: messages.length, key: conversationKey.slice(-40) });
    lastConversationKey = conversationKey;
    previousMessageCount = messages.length;
    let contextText = '';
    for (let i = 0; i < messages.length; i++) {
      const el = messages[i];
      if (el && el.innerText != null) contextText += el.innerText;
    }
    const contextTokens = estimateTokens(contextText);
    chrome.storage.local.set({
      sessionWaterMl: 0,
      waterUsage: 0,
      contextSize: contextTokens,
      messageCount: messages.length,
    });
    return;
  }

  if (messages.length === previousMessageCount) return;

  if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'counting new message/response', { user: userMessages.length, assistant: assistantMessages.length, total: messages.length });

  // 2. Calculate Context Window (The "Re-read")
  // The LLM had to read ALL previous messages to generate the newest one.
  let contextText = "";
  for (let i = 0; i < messages.length - 1; i++) {
    const el = messages[i];
    if (el && el.innerText != null) contextText += el.innerText;
  }
  const contextTokensFromText = estimateTokens(contextText);

  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) {
    if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'skip: no latestMessage');
    return;
  }
  const outputTokens = estimateTokens(latestMessage.innerText || '');

  if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'tokens', { contextFromText: contextTokensFromText, output: outputTokens });

  chrome.storage.local.get(['lastUploadTokens'], function (data) {
    const fileTokens = data.lastUploadTokens || 0;
    const contextTokens = contextTokensFromText + fileTokens;

    const energyUsed = (contextTokens * ENERGY_PREFILL_PER_TOKEN) +
      (outputTokens * ENERGY_DECODE_PER_TOKEN);
    const waterConsumed = energyUsed * WUE_ML_PER_WH;

    previousMessageCount = messages.length;

    chrome.storage.local.get(['overallWaterMl', 'sessionWaterMl', 'waterUsage'], function (prev) {
      const prevOverall = prev.overallWaterMl ?? prev.waterUsage ?? 0;
      const overall = prevOverall + waterConsumed;
      const session = (prev.sessionWaterMl || 0) + waterConsumed;
      if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'stored', {
        contextTokens,
        outputTokens,
        waterConsumed: waterConsumed.toFixed(4),
        overall: overall.toFixed(2),
        session: session.toFixed(2),
        messageCount: messages.length,
      });
      chrome.storage.local.set({
        overallWaterMl: overall,
        sessionWaterMl: session,
        waterUsage: session,
        contextSize: contextTokens,
        messageCount: messages.length,
      });
    });
  });
}

// --- File upload: file-listener.js (world: MAIN) captures File.size and dispatches; we handle it here ---
const FILE_UPLOAD_EVENT = '__TOKEN_OCEAN_FILE_UPLOAD__';
window.addEventListener(FILE_UPLOAD_EVENT, function (e) {
  const { files } = e.detail || {};
  if (!files || !files.length) return;
  const totalBytes = files.reduce(function (sum, f) { return sum + (f.size || 0); }, 0);
  const totalTokens = files.reduce(function (sum, f) {
    return sum + estimateTokensForFile(f.size, f.type);
  }, 0);
  // if (DEBUG_MESSAGES) {
  //   console.log('[Water extension] File(s) added:', files.map(function (f) {
  //     return f.name + ' (' + (f.size || 0) + ' B) ~' + estimateTokensForFile(f.size, f.type) + ' tokens';
  //   }).join(', '));
  // }
  chrome.storage.local.set({
    lastUploadSize: totalBytes,
    lastUploadCount: files.length,
    lastUploadTokens: totalTokens,
  });
});

// Watch for changes
const observer = new MutationObserver((mutations) => {
  // TODO: use better debouncing
  calculateFootprint();
});

observer.observe(document.body, { childList: true, subtree: true });