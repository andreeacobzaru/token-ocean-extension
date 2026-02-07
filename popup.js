const VIEW_TOTAL = 'total';
const VIEW_SESSION = 'session';
const BOTTLE_ML = 500;

// Format water volume with appropriate unit (mL → L → kL)
function formatWater(ml) {
  const n = Math.max(0, Number(ml));
  if (n >= 1_000_000) {
    return { value: (n / 1_000_000).toFixed(1), unit: 'kL' };
  }
  if (n >= 1000) {
    return { value: (n / 1000).toFixed(2), unit: 'L' };
  }
  return { value: n.toFixed(2), unit: 'mL' };
}

document.addEventListener('DOMContentLoaded', () => {
  updateUI();
  setInterval(updateUI, 1000);

  // View toggle: Total (all-time) vs This session
  document.getElementById('view-total').addEventListener('click', () => setView(VIEW_TOTAL));
  document.getElementById('view-session').addEventListener('click', () => setView(VIEW_SESSION));

  // Viz toggle: Glass vs Person
  document.querySelectorAll('.viz-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viz-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector('.visual-stage').setAttribute('data-active', btn.dataset.viz);
    });
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    chrome.storage.local.set({
      sessionWaterMl: 0,
      waterUsage: 0,
      contextSize: 0,
      messageCount: 0,
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

      const { value: waterValue, unit: waterUnit } = formatWater(usage);
      document.getElementById('water-ml').textContent = waterValue;
      document.getElementById('water-unit').textContent = waterUnit;
      document.getElementById('water-label').textContent =
        viewMode === VIEW_SESSION ? 'This session' : 'Total water consumed';

      const bottles = (usage / BOTTLE_ML).toFixed(2);
      document.getElementById('bottle-count').textContent = bottles;

      const percentage = Math.min((usage / BOTTLE_ML) * 100, 100);
      setWaterFillPercent(percentage);
      setDailyPercent(usage, 2500);

      document.getElementById('context-size').textContent = context.toLocaleString();
      document.getElementById('messages-tracked').textContent = count;

      document.getElementById('view-total').classList.toggle('active', viewMode === VIEW_TOTAL);
      document.getElementById('view-session').classList.toggle('active', viewMode === VIEW_SESSION);

      document.body.classList.toggle('view-session', viewMode === VIEW_SESSION);
      document.body.classList.toggle('view-total', viewMode === VIEW_TOTAL);

      const warningBox = document.getElementById('warning-box');
      if (context > 10000) {
        warningBox.classList.remove('hidden');
      } else {
        warningBox.classList.add('hidden');
      }
    }
  );
}

// When you update water, set BOTH fills (glass + human viz)
function setWaterFillPercent(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const waterLevel = document.getElementById('water-level');
  const humanLevel = document.getElementById('human-level');
  if (waterLevel) waterLevel.style.height = `${p}%`;
  if (humanLevel) humanLevel.style.height = `${p}%`;
}

// Daily intake % (e.g. baseline 2500 mL/day)
function setDailyPercent(waterMl, baselineMl = 2500) {
  const pct = Math.round((waterMl / baselineMl) * 100);
  const el = document.getElementById('daily-percent');
  if (el) el.textContent = Math.max(0, pct);
}