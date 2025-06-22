// 팝업 JavaScript
document.addEventListener('DOMContentLoaded', () => {
  const updateButton = document.getElementById('updateRankings');
  updateButton.addEventListener('click', manualUpdate);

  // 팝업이 열릴 때 업데이트 상태 확인
  chrome.runtime.sendMessage({ action: 'getUpdateTimeStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    if (response) {
      updateCooldownUI(response.lastUpdateTime);
    }
  });
});

let countdownInterval;

function updateCooldownUI(lastUpdateTime) {
  clearInterval(countdownInterval);

  const updateButton = document.getElementById('updateRankings');
  const cooldownTimer = document.querySelector('.cooldown-timer');
  const countdownSpan = document.getElementById('countdown');
  
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  let timeLeft = (lastUpdateTime + twentyFourHours) - now;

  if (timeLeft > 0) {
    updateButton.disabled = true;
    updateButton.textContent = 'Update Cooldown';
    cooldownTimer.style.display = 'block';

    const updateCountdown = () => {
      if (timeLeft < 0) {
        clearInterval(countdownInterval);
        updateCooldownUI(0); // UI를 업데이트 가능 상태로 리셋
        return;
      }
      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
      const seconds = Math.floor((timeLeft / 1000) % 60);
      countdownSpan.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      timeLeft -= 1000;
    };
    
    updateCountdown(); // 최초 호출
    countdownInterval = setInterval(updateCountdown, 1000);

  } else {
    updateButton.disabled = false;
    updateButton.textContent = 'Update Now';
    cooldownTimer.style.display = 'none';
  }
}

async function manualUpdate() {
  const updateButton = document.getElementById('updateRankings');
  updateButton.disabled = true;
  updateButton.textContent = 'Updating...';
  showStatus('Updating ranking data...', 'success');

  chrome.runtime.sendMessage({ action: 'refreshRankingData' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        showStatus('An error occurred.', 'error');
        updateCooldownUI(0); // 실패 시 재시도 허용
        return;
    }

    if (response.success) {
      showStatus('Update successful!', 'success');
      updateCooldownUI(response.lastUpdateTime);
    } else {
      if (response.error === 'cooldown') {
        showStatus('Update not yet available.', 'error');
        const serverLastUpdateTime = Date.now() - (24 * 60 * 60 * 1000 - response.timeLeft);
        updateCooldownUI(serverLastUpdateTime);
      } else {
        showStatus('Update failed. Please try again.', 'error');
        updateCooldownUI(0); // 실패 시 재시도 허용
      }
    }
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  statusElement.style.display = 'block';
  
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// 백그라운드 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateStatus') {
    showStatus(request.message, request.type);
  }
}); 