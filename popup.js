const VIEW_TOTAL = 'total';
const VIEW_SESSION = 'session';
const BOTTLE_ML = 500;

document.addEventListener('DOMContentLoaded', () => {
  updateUI();
  setInterval(updateUI, 1000);

  // View toggle: Total (all-time) vs This session
  document.getElementById('view-total').addEventListener('click', () => setView(VIEW_TOTAL));
  document.getElementById('view-session').addEventListener('click', () => setView(VIEW_SESSION));

  document.getElementById('reset-btn').addEventListener('click', () => {
    chrome.storage.local.set({
      sessionWaterMl: 0,
      waterUsage: 0,
    }, () => updateUI());
  });
});

function setView(mode) {
  chrome.storage.local.set({ viewMode: mode }, () => updateUI());
  document.getElementById('view-total').classList.toggle('active', mode === VIEW_TOTAL);
  document.getElementById('view-session').classList.toggle('active', mode === VIEW_SESSION);
}

function updateUI() {
  chrome.storage.local.get(
    ['overallWaterMl', 'sessionWaterMl', 'contextSize', 'messageCount', 'viewMode'],
    (data) => {
      const viewMode = data.viewMode || VIEW_TOTAL;
      const usage =
        viewMode === VIEW_SESSION
          ? (data.sessionWaterMl || 0)
          : (data.overallWaterMl || 0);
      const context = data.contextSize || 0;
      const count = data.messageCount || 0;

      document.getElementById('water-ml').textContent = usage.toFixed(2);
      document.getElementById('water-label').textContent =
        viewMode === VIEW_SESSION ? 'This session' : 'Total water consumed';

      const bottles = (usage / BOTTLE_ML).toFixed(2);
      document.getElementById('bottle-count').textContent = bottles;

      const percentage = Math.min((usage / BOTTLE_ML) * 100, 100);
      document.getElementById('water-level').style.width = `${percentage}%`;

      document.getElementById('context-size').textContent = context.toLocaleString();
      document.getElementById('messages-tracked').textContent = count;

      document.getElementById('view-total').classList.toggle('active', viewMode === VIEW_TOTAL);
      document.getElementById('view-session').classList.toggle('active', viewMode === VIEW_SESSION);

      document.body.classList.toggle('view-session', viewMode === VIEW_SESSION);
      document.body.classList.toggle('view-total', viewMode === VIEW_TOTAL);

      const warningBox = document.getElementById('warning-box');
      if (context > 4000) {
        warningBox.classList.remove('hidden');
      } else {
        warningBox.classList.add('hidden');
      }
    }
  );
}