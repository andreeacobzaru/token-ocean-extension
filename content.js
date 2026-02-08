// Depends on utils.js (load order in manifest). Uses: getMessageSelectors, estimateTokens, estimateTokensForFile, DEBUG_MESSAGES, ENERGY_*, WUE_ML_PER_WH.
// Persisted: overallWaterMl (all-time). Session: sessionWaterMl (resets on conversation switch or popup "Reset this session").

/** -1 = baseline not yet synced (just switched/reloaded); don't run footprint until we've synced and then see a real increase. */
let previousMessageCount = -1;
/** When baseline is unsynced, we wait for the same message count twice before committing (avoids 0→N or partial DOM). */
let pendingBaselineCount = null;
let lastConversationKey = '';
/** Track last message length so we only run footprint when it has been stable (streaming finished). */
let lastSeenLastMessageLength = -1;

function getConversationKey() {
  return window.location.href || window.location.pathname || '';
}

const LOG_PREFIX = '[Token Ocean]';

/** Runs immediately on mutation. If conversation switched, resets session and marks baseline unsynced so we never treat existing messages as "new". */
function handleConversationSwitch() {
  const conversationKey = getConversationKey();
  if (conversationKey === lastConversationKey) return false;

  if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'switched/reload (reset, baseline unsynced)', { key: conversationKey.slice(-40) });
  lastConversationKey = conversationKey;
  previousMessageCount = -1;
  pendingBaselineCount = null;
  lastSeenLastMessageLength = -1;

  chrome.storage.local.set({
    sessionWaterMl: 0,
    waterUsage: 0,
    contextSize: 0,
    messageCount: 0,
  });
  return true;
}

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
  if (conversationKey !== lastConversationKey) {
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
  if (DEBUG_MESSAGES) console.log(LOG_PREFIX, 'latest message', latestMessage.innerText);

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

// Run footprint only when the *last message's text* has been unchanged for this long (streaming done).
// So a 2.5s stall mid-stream doesn't trigger a run; only when content actually stops growing.
const STABLE_MS = 2000;
let stableTimer = null;

const observer = new MutationObserver(function () {
  if (handleConversationSwitch()) return;

  const { user: userSel, assistant: assistantSel } = getMessageSelectors();
  if (!userSel || !assistantSel) return;

  const userMessages = document.querySelectorAll(userSel);
  const assistantMessages = document.querySelectorAll(assistantSel);
  const messages = [...userMessages, ...assistantMessages];
  const lastMsg = messages[messages.length - 1];
  const lastMsgLength = lastMsg && lastMsg.innerText != null ? (lastMsg.innerText || '').length : -1;

  // First time after switch/reload: only sync baseline once DOM has settled, never run footprint.
  if (previousMessageCount === -1) {
    if (messages.length === 0) {
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = null;
      return; // don't sync to 0; DOM may still be loading
    }
    // Single message = likely new chat; sync so next message (assistant reply) triggers footprint.
    // Otherwise require same count twice so we don't sync on partial DOM (e.g. 0→5 or 3→5).
    if (messages.length === 1 || pendingBaselineCount === messages.length) {
      previousMessageCount = messages.length;
      pendingBaselineCount = null;
      lastSeenLastMessageLength = lastMsgLength;
    } else {
      pendingBaselineCount = messages.length;
    }
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = null;
    return;
  }

  if (messages.length <= previousMessageCount) {
    previousMessageCount = messages.length;
    lastSeenLastMessageLength = lastMsgLength;
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = null;
    return;
  }

  // Real increase: user sent a new message; wait for streaming to settle then run footprint.
  const latestMessage = lastMsg;
  const currentLength = lastMsgLength;

  if (currentLength !== lastSeenLastMessageLength) {
    lastSeenLastMessageLength = currentLength;
    if (stableTimer) clearTimeout(stableTimer);
    if (currentLength > 0) {
      stableTimer = setTimeout(function () {
        stableTimer = null;
        calculateFootprint();
      }, STABLE_MS);
    } else {
      stableTimer = null;
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });