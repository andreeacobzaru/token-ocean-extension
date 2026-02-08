const VIEW_TOTAL = 'total';
const VIEW_SESSION = 'session';
const BOTTLE_ML = 500;
const GLASS_ML = 250; // typical drinking glass
const DAILY_ML = 2500; // one person's daily drinking water
const MAX_PERSON_CIRCLES = 15;

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

      const glasses = usage / GLASS_ML;
      const glassEl = document.getElementById('glass-equivalent');
      if (glassEl) {
        glassEl.textContent = glasses < 0.1 ? '0' : glasses < 1 ? glasses.toFixed(1) : Math.round(glasses);
      }

      const percentage = Math.min((usage / BOTTLE_ML) * 100, 100);
      setWaterFillPercent(percentage);
      updatePersonCircles(usage);

      document.getElementById('context-size').textContent = context.toLocaleString();
      document.getElementById('context-size-2').textContent = context.toLocaleString();
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

// Glass fill only (person viz uses updatePersonCircles)
function setWaterFillPercent(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const waterLevel = document.getElementById('water-level');
  if (waterLevel) waterLevel.style.height = `${p}%`;
}

// Person view: one circle per person's daily intake (2500 mL); when one fills, next starts
function updatePersonCircles(waterMl) {
  const usage = Math.max(0, Number(waterMl));
  const fullPeople = Math.floor(usage / DAILY_ML);
  const remainder = usage % DAILY_ML;
  const remainderPct = remainder / DAILY_ML * 100;
  const needPartial = remainderPct > 0;
  const totalCircles = Math.min(MAX_PERSON_CIRCLES, fullPeople + (needPartial ? 1 : 0));
  const showAtLeastOne = Math.max(1, totalCircles);

  const container = document.getElementById('human-circles');
  const countEl = document.getElementById('person-count');
  if (!container) return;

  const peopleEquivalent = usage / DAILY_ML;
  if (countEl) {
    countEl.textContent = peopleEquivalent < 0.01 ? '0' : peopleEquivalent < 1 ? peopleEquivalent.toFixed(1) : peopleEquivalent.toFixed(1);
  }

  const n = showAtLeastOne;
  while (container.children.length < n) {
    const circle = document.createElement('div');
    circle.className = 'person-circle';
    const fill = document.createElement('div');
    fill.className = 'person-fill';
    circle.appendChild(fill);
    container.appendChild(circle);
  }
  while (container.children.length > n) {
    container.lastElementChild.remove();
  }

  const circles = container.querySelectorAll('.person-circle');
  circles.forEach((circle, i) => {
    const fill = circle.querySelector('.person-fill');
    if (!fill) return;
    let pct = 0;
    if (i < fullPeople) pct = 100;
    else if (i === fullPeople && needPartial) pct = remainderPct;
    fill.style.height = `${pct}%`;
  });
}