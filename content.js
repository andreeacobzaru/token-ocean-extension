// Depends on utils.js (load order in manifest). Uses: getMessageSelectors, estimateTokens, estimateTokensForFile, DEBUG_MESSAGES, ENERGY_*, WUE_ML_PER_WH.

let totalWaterMl = 0;
let previousMessageCount = 0;
/** When the user switches to a different chat (e.g. from history), we set baseline and don't count those messages. */
let lastConversationKey = '';

function getConversationKey() {
  return window.location.href || window.location.pathname || '';
}

function calculateFootprint() {
  const { user: userSel, assistant: assistantSel } = getMessageSelectors();

  if (!userSel || !assistantSel) return;

  // TODO: ADD THINKING

  const userMessages = document.querySelectorAll(userSel);
  const assistantMessages = document.querySelectorAll(assistantSel);
  const messages = [...userMessages, ...assistantMessages];

  if (messages.length === 0) return;

  const conversationKey = getConversationKey();
  const switchedConversation = conversationKey !== lastConversationKey;

  if (switchedConversation) {
    lastConversationKey = conversationKey;
    previousMessageCount = messages.length;
    return;
  }

  if (messages.length === previousMessageCount) return;

  if (DEBUG_MESSAGES) {
    console.log('[Water extension] user:', userMessages.length, 'assistant:', assistantMessages.length, 'total:', messages.length);
    // userMessages.forEach((el, i) => console.log('[Water extension] user msg', i + 1, ':', el.innerText?.slice(0, 80) + (el.innerText?.length > 80 ? '…' : '')));
    // assistantMessages.forEach((el, i) => console.log('[Water extension] assistant msg', i + 1, ':', el.innerText?.slice(0, 80) + (el.innerText?.length > 80 ? '…' : '')));
    userMessages.forEach((el, i) => console.log('[Water extension] user msg', i + 1, ':', el.innerText));
    assistantMessages.forEach((el, i) => console.log('[Water extension] assistant msg', i + 1, ':', el.innerText));
  }

  // 2. Calculate Context Window (The "Re-read")
  // The LLM had to read ALL previous messages to generate the newest one.
  let contextText = "";
  for (let i = 0; i < messages.length - 1; i++) {
    const el = messages[i];
    if (el && el.innerText != null) contextText += el.innerText;
  }
  const contextTokensFromText = estimateTokens(contextText);

  // 3. Calculate New Generation (The "Output")
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) return;
  const outputTokens = estimateTokens(latestMessage.innerText || '');

  // 4. Add file upload tokens to context (async read)
  chrome.storage.local.get(['lastUploadTokens'], function (data) {
    const fileTokens = data.lastUploadTokens || 0;
    const contextTokens = contextTokensFromText + fileTokens;

    // 5. Apply The Formula
    const energyUsed = (contextTokens * ENERGY_PREFILL_PER_TOKEN) +
      (outputTokens * ENERGY_DECODE_PER_TOKEN);

    const waterConsumed = energyUsed * WUE_ML_PER_WH;

    // 6. Update Total
    totalWaterMl += waterConsumed;
    previousMessageCount = messages.length;

    // Save to storage for the popup to read (contextSize includes file tokens)
    chrome.storage.local.set({ waterUsage: totalWaterMl, contextSize: contextTokens });
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
  if (DEBUG_MESSAGES) {
    console.log('[Water extension] File(s) added:', files.map(function (f) {
      return f.name + ' (' + (f.size || 0) + ' B) ~' + estimateTokensForFile(f.size, f.type) + ' tokens';
    }).join(', '));
  }
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