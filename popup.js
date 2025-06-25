// Proof of Stars popup: No manual update, just info
// This file is intentionally left blank as all update logic is now automatic. 

// Proof of Stars popup - Cache status management and manual update
class PopupManager {
  constructor() {
    this.elements = {
      cacheStatus: document.getElementById('cacheStatus'),
      cacheSize: document.getElementById('cacheSize'),
      lastUpdate: document.getElementById('lastUpdate'),
      updateButton: document.getElementById('updateButton'),
      cooldownInfo: document.getElementById('cooldownInfo'),
      cooldownTime: document.getElementById('cooldownTime'),
      loadingInfo: document.getElementById('loadingInfo'),
      progressFill: document.getElementById('progressFill'),
      badgeToggle: document.getElementById('badgeToggle')
    };
    
    this.init();
  }

  async init() {
    // 초기 상태 로드
    await this.loadStatus();
    
    // 이벤트 리스너 설정
    this.elements.updateButton.addEventListener('click', () => this.handleUpdate());
    this.elements.badgeToggle.addEventListener('change', (e) => this.handleBadgeToggle(e.target.checked));
    
    // 주기적으로 상태 업데이트 (쿨다운 타이머용)
    this.startStatusPolling();
  }

  async loadStatus() {
    try {
      // 캐시 상태 가져오기
      const cacheStatus = await this.getCacheStatus();
      const updateStatus = await this.getUpdateTimeStatus();
      
      this.updateStatusDisplay(cacheStatus, updateStatus);
      
    } catch (error) {
      console.error('Status load failed:', error);
      this.elements.cacheStatus.textContent = 'Error';
      this.elements.cacheStatus.className = 'status-value error';
    }
  }

  async getCacheStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCacheStatus' }, (response) => {
        resolve(response || { cacheSize: 0, isInitialized: false, badgeEnabled: true, maxCacheSize: 25000 });
      });
    });
  }

  async getUpdateTimeStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getUpdateTimeStatus' }, (response) => {
        resolve(response || { lastUpdateTime: 0, isInitialized: false, badgeEnabled: true });
      });
    });
  }

  updateStatusDisplay(cacheStatus, updateStatus) {
    // 캐시 상태 표시
    if (cacheStatus.isInitialized) {
      this.elements.cacheStatus.textContent = 'Ready';
      this.elements.cacheStatus.className = 'status-value success';
    } else {
      this.elements.cacheStatus.textContent = 'Need Initialization';
      this.elements.cacheStatus.className = 'status-value warning';
    }

    // 캐시 크기 표시
    this.elements.cacheSize.textContent = `${cacheStatus.cacheSize.toLocaleString()} / ${cacheStatus.maxCacheSize.toLocaleString()}`;

    // 마지막 업데이트 시간 표시
    if (updateStatus.lastUpdateTime > 0) {
      const lastUpdate = new Date(updateStatus.lastUpdateTime);
      const now = new Date();
      const diffMs = now - lastUpdate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 1) {
        this.elements.lastUpdate.textContent = 'Just now';
      } else if (diffHours < 24) {
        this.elements.lastUpdate.textContent = `${diffHours} hours ago`;
      } else {
        const diffDays = Math.floor(diffHours / 24);
        this.elements.lastUpdate.textContent = `${diffDays} days ago`;
      }
    } else {
      this.elements.lastUpdate.textContent = 'Never updated';
    }

    // 뱃지 토글 상태 설정
    this.elements.badgeToggle.checked = updateStatus.badgeEnabled;

    // 업데이트 버튼 상태 설정
    this.updateButtonState(updateStatus.lastUpdateTime);
  }

  updateButtonState(lastUpdateTime) {
    const now = Date.now();
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24시간
    const timeSinceUpdate = now - lastUpdateTime;
    
    if (timeSinceUpdate < cooldownPeriod) {
      // 쿨다운 중
      this.elements.updateButton.disabled = true;
      this.elements.updateButton.textContent = 'Update Cooldown';
      
      const timeLeft = cooldownPeriod - timeSinceUpdate;
      this.showCooldownInfo(timeLeft);
    } else {
      // 업데이트 가능
      this.elements.updateButton.disabled = false;
      this.elements.updateButton.textContent = 'Update Data';
      this.hideCooldownInfo();
    }
  }

  showCooldownInfo(timeLeft) {
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      this.elements.cooldownTime.textContent = `${hours}h ${minutes}m`;
    } else {
      this.elements.cooldownTime.textContent = `${minutes}m`;
    }
    this.elements.cooldownInfo.style.display = 'block';
  }

  hideCooldownInfo() {
    this.elements.cooldownInfo.style.display = 'none';
  }

  async handleUpdate() {
    try {
      // 로딩 상태 표시
      this.elements.updateButton.disabled = true;
      this.elements.updateButton.textContent = 'Updating...';
      this.elements.loadingInfo.classList.add('show');
      this.hideCooldownInfo();

      // 진행률 표시 업데이트
      this.elements.loadingInfo.innerHTML = `
        <div>Downloading rankings from Succinct Stats API...</div>
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill" style="width: 0%"></div>
        </div>
      `;

      // 업데이트 요청
      const response = await this.requestUpdate();
      
      if (response.success) {
        // 성공 시 진행률을 100%로 표시
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
          progressFill.style.width = '100%';
        }
        
        // 성공 시 상태 새로고침
        setTimeout(() => {
          this.loadStatus();
          this.elements.loadingInfo.classList.remove('show');
        }, 1000);
      } else {
        // 실패 시 에러 처리
        this.handleUpdateError(response.error, response.timeLeft);
      }
      
    } catch (error) {
      console.error('Update failed:', error);
      this.handleUpdateError('Update failed. Please try again.');
    }
  }

  async requestUpdate() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'refreshRankingData' }, (response) => {
        resolve(response || { success: false, error: 'No response' });
      });
    });
  }

  async handleBadgeToggle(enabled) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'toggleBadge', 
          enabled: enabled 
        }, (response) => {
          resolve(response || { success: false });
        });
      });

      if (!response.success) {
        // 토글 실패 시 원래 상태로 되돌리기
        this.elements.badgeToggle.checked = !enabled;
        console.error('Badge toggle failed');
      }
    } catch (error) {
      console.error('Badge toggle error:', error);
      this.elements.badgeToggle.checked = !enabled;
    }
  }

  handleUpdateError(error, timeLeft) {
    this.elements.updateButton.disabled = false;
    this.elements.updateButton.textContent = 'Update Data';
    this.elements.loadingInfo.classList.remove('show');
    
    if (error === 'cooldown' && timeLeft) {
      this.showCooldownInfo(timeLeft);
    } else {
      // 에러 메시지 표시
      this.elements.cacheStatus.textContent = 'Update Failed';
      this.elements.cacheStatus.className = 'status-value error';
      
      // 에러 상세 정보 표시
      let errorMessage = 'Update failed. Please try again.';
      if (error && error.includes('API')) {
        errorMessage = 'API server is unavailable. Please check your internet connection and try again later.';
      } else if (error && error.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error && error.includes('timeout')) {
        errorMessage = 'Request timeout. The server is taking too long to respond.';
      }
      
      // 에러 메시지를 캐시 크기 필드에 임시로 표시
      const originalCacheSize = this.elements.cacheSize.textContent;
      this.elements.cacheSize.textContent = errorMessage;
      this.elements.cacheSize.className = 'status-value error';
      
      // 5초 후 상태 복원
      setTimeout(() => {
        this.loadStatus();
      }, 5000);
    }
  }

  startStatusPolling() {
    // 쿨다운 타이머를 위해 1초마다 상태 확인
    setInterval(() => {
      this.getUpdateTimeStatus().then(updateStatus => {
        this.updateButtonState(updateStatus.lastUpdateTime);
      });
    }, 1000);
  }

  async updateStatus() {
    await this.loadStatus();
  }
}

// 팝업 초기화
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
}); 