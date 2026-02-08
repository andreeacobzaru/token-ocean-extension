const VIEW_TOTAL = 'total';
const VIEW_SESSION = 'session';
const BOTTLE_ML = 500;
const GLASS_ML = 250; // typical drinking glass
const DAILY_ML = 2500; // one person's daily drinking water
const MAX_PERSON_CIRCLES = 15;
const MAX_GLASS_CIRCLES = 15;

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

      if (viewMode === VIEW_SESSION) {
        const glasses = usage / GLASS_ML;
        const glassEl = document.getElementById('glass-equivalent');
        if (glassEl) {
          glassEl.textContent = glasses < 0.01 ? '0' : glasses.toFixed(1);
        }
        updateGlassCircles(usage);
      } else {
        updatePersonCircles(usage);
      }

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

// Session: multiple small glasses, each 250 mL; when one fills, next starts
function updateGlassCircles(waterMl) {
  const usage = Math.max(0, Number(waterMl));
  const fullGlasses = Math.floor(usage / GLASS_ML);
  const remainder = usage % GLASS_ML;
  const remainderPct = remainder / GLASS_ML * 100;
  const needPartial = remainderPct > 0;
  const totalGlasses = Math.min(MAX_GLASS_CIRCLES, fullGlasses + (needPartial ? 1 : 0));
  const showAtLeastOne = Math.max(1, totalGlasses);

  const container = document.getElementById('glass-circles');
  if (!container) return;

  const n = showAtLeastOne;
  while (container.children.length < n) {
    const circle = document.createElement('div');
    circle.className = 'glass-circle';
    const fill = document.createElement('div');
    fill.className = 'glass-fill';
    circle.appendChild(fill);
    container.appendChild(circle);
  }
  while (container.children.length > n) {
    container.lastElementChild.remove();
  }

  const circles = container.querySelectorAll('.glass-circle');
  circles.forEach((circle, i) => {
    const fill = circle.querySelector('.glass-fill');
    if (!fill) return;
    let pct = 0;
    if (i < fullGlasses) pct = 100;
    else if (i === fullGlasses && needPartial) pct = remainderPct;
    fill.style.height = `${pct}%`;
  });
}

// Person shape path (head + body) — reused for symbol and clipPath
const PERSON_PATH_D = 'M50,5 A12,12 0 1,1 50,29 A12,12 0 1,1 50,5 M30,35 H70 C78,35 85,42 85,50 V75 C85,80 80,85 75,85 H65 V115 C65,118 62,120 60,120 H40 C38,120 35,118 35,115 V85 H25 C20,85 15,80 15,75 V50 C15,42 22,35 30,35 Z';

// Build one person SVG with unique IDs (for Total view)
function createPersonSvg(index) {
  const sid = `ps-${index}`;
  const cid = `cp-${index}`;
  return `<div class="person-container">
  <svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet" class="person-svg">
    <defs>
      <symbol id="${sid}">
        <path d="${PERSON_PATH_D}" />
      </symbol>
      <clipPath id="${cid}">
        <path d="${PERSON_PATH_D}" />
      </clipPath>
    </defs>
    <use href="#${sid}" class="person-bg" />
    <rect class="person-fill" x="0" y="120" width="100" height="0" clip-path="url(#${cid})" fill="#2f80ed" />
    <use href="#${sid}" class="person-border" fill="none" />
  </svg>
</div>`;
}

// Total: one person SVG per daily intake (2500 mL); when one fills, next starts
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
    countEl.textContent = peopleEquivalent < 0.01 ? '0' : peopleEquivalent.toFixed(1);
  }

  const n = showAtLeastOne;
  while (container.children.length < n) {
    const div = document.createElement('div');
    div.innerHTML = createPersonSvg(container.children.length);
    container.appendChild(div.firstElementChild);
  }
  while (container.children.length > n) {
    container.lastElementChild.remove();
  }

  const persons = container.querySelectorAll('.person-container');
  const viewBoxHeight = 120;
  persons.forEach((person, i) => {
    const fill = person.querySelector('.person-fill');
    if (!fill) return;
    let pct = 0;
    if (i < fullPeople) pct = 100;
    else if (i === fullPeople && needPartial) pct = remainderPct;
    const fillHeight = (viewBoxHeight * pct) / 100;
    const y = viewBoxHeight - fillHeight;
    fill.setAttribute('y', y);
    fill.setAttribute('height', fillHeight);
  });
}