document.addEventListener('DOMContentLoaded', () => {
    updateUI();
  
    // Update every second while popup is open (in case chat is streaming)
    setInterval(updateUI, 1000);
  
    // Reset button logic
    document.getElementById('reset-btn').addEventListener('click', () => {
      chrome.storage.local.set({ 
        waterUsage: 0, 
        contextSize: 0, 
        messageCount: 0 
      }, () => {
        updateUI();
      });
    });
  });
  
  function updateUI() {
    // Fetch data from Chrome's local storage
    chrome.storage.local.get(['waterUsage', 'contextSize', 'messageCount'], (data) => {
      const usage = data.waterUsage || 0;
      const context = data.contextSize || 0;
      const count = data.messageCount || 0;
  
      // 1. Update Water Usage (formatted to 2 decimals)
      document.getElementById('water-ml').textContent = usage.toFixed(2);
  
      // 2. Update Bottle Calculation (Assuming 500mL standard bottle)
      const bottles = (usage / 500).toFixed(2);
      document.getElementById('bottle-count').textContent = bottles;
  
      // 3. Update Progress Bar (Visual flair)
      // Caps at 100% just for the visual, even if usage goes higher
      const percentage = Math.min((usage / 500) * 100, 100); 
      document.getElementById('water-level').style.width = `${percentage}%`;
  
      // 4. Update Context Stats
      document.getElementById('context-size').textContent = context.toLocaleString();
      document.getElementById('messages-tracked').textContent = count;
  
      // 5. Context Warning Logic
      // If context > 4000 tokens, the "re-read" cost is getting expensive
      const warningBox = document.getElementById('warning-box');
      if (context > 4000) {
        warningBox.classList.remove('hidden');
      } else {
        warningBox.classList.add('hidden');
      }
    });
  }