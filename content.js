(function() {
  // 중복 실행 방지
  if (window.__PROOF_OF_STARS_BADGE_LOADED__) return;
  window.__PROOF_OF_STARS_BADGE_LOADED__ = true;

  /**
   * 숫자에 맞는 서수 접미사(st, nd, rd, th)를 반환합니다.
   * @param {number} i - 숫자
   * @returns {string} - 서수 접미사
   */
  function getOrdinalSuffix(i) {
    const j = i % 10,
          k = i % 100;
    if (j == 1 && k != 11) {
      return "st";
    }
    if (j == 2 && k != 12) {
      return "nd";
    }
    if (j == 3 && k != 13) {
      return "rd";
    }
    return "th";
  }

  // 트위터 랭킹 뱃지 익스텐션
  class TwitterRankingBadge {
    constructor() {
      this.rankingData = {};
      this.enabled = true;
      this.init();
    }

    async init() {
      // 설정 로드
      await this.loadSettings();
      
      // 메시지 리스너 설정
      this.setupMessageListeners();
      
      // 페이지 변경 감지
      this.observePageChanges();
      
      // 초기 뱃지 추가
      if (this.enabled) {
        this.addRankingBadges();
      }
    }

    async loadSettings() {
      try {
        const result = await chrome.storage.sync.get(['rankingApiUrl', 'rankingData', 'enabled']);
        this.rankingData = result.rankingData || {};
        this.apiUrl = result.rankingApiUrl || 'http://localhost:3001/rankings';
        this.enabled = result.enabled !== false;
      } catch (error) {
        console.error('설정 로드 실패:', error);
      }
    }

    setupMessageListeners() {
      // 백그라운드로부터의 메시지 처리
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
          case 'settingsUpdated':
            this.handleSettingsUpdate(request.settings);
            break;
          case 'extensionStateChanged':
            this.handleStateChange(request.enabled);
            break;
          case 'cacheCleared':
            this.handleCacheCleared();
            break;
          case 'dataRefreshed':
            this.handleDataRefreshed();
            break;
        }
      });
    }

    handleSettingsUpdate(settings) {
      this.apiUrl = settings.rankingApiUrl || this.apiUrl;
      this.enabled = settings.enabled !== false;
      
      if (this.enabled) {
        this.addRankingBadges();
      } else {
        this.removeAllBadges();
      }
    }

    handleStateChange(enabled) {
      this.enabled = enabled;
      if (enabled) {
        this.addRankingBadges();
      } else {
        this.removeAllBadges();
      }
    }

    handleCacheCleared() {
      this.rankingData = {};
      this.removeAllBadges();
      if (this.enabled) {
        this.addRankingBadges();
      }
    }

    handleDataRefreshed() {
      this.rankingData = {};
      this.removeAllBadges();
      if (this.enabled) {
        this.addRankingBadges();
      }
    }

    observePageChanges() {
      // 트위터의 SPA 특성을 고려한 페이지 변경 감지
      const observer = new MutationObserver(() => {
        if (this.enabled) {
          this.addRankingBadges();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    async addRankingBadges() {
      if (!this.enabled) return;
      
      // 프로필 요소들 찾기
      const profileElements = this.findProfileElements();
      
      for (const element of profileElements) {
        if (!element.hasAttribute('data-ranking-badge-added')) {
          await this.addBadgeToProfile(element);
        }
      }
    }

    removeAllBadges() {
      const badges = document.querySelectorAll('.ranking-badge');
      badges.forEach(badge => badge.remove());
      
      // 추가된 속성 제거
      const elements = document.querySelectorAll('[data-ranking-badge-added]');
      elements.forEach(el => el.removeAttribute('data-ranking-badge-added'));
    }

    findProfileElements() {
      // 트위터 프로필 요소들을 찾는 다양한 선택자
      const selectors = [
        '[data-testid="UserName"]',
        '[data-testid="User-Name"]',
        'div[role="article"] [data-testid="User-Name"]',
        'div[data-testid="tweet"] [data-testid="User-Name"]',
        'a[href*="/status/"] [data-testid="User-Name"]'
      ];

      const elements = [];
      selectors.forEach(selector => {
        const found = document.querySelectorAll(selector);
        found.forEach(el => elements.push(el));
      });

      return [...new Set(elements)]; // 중복 제거
    }

    async addBadgeToProfile(profileElement) {
      try {
        // 사용자명 추출
        const username = this.extractUsername(profileElement);
        if (!username) return;

        // 랭킹 정보 가져오기
        const ranking = await this.getRankingInfo(username);
        if (!ranking) {
          // 랭킹이 없는 사용자는 뱃지 추가하지 않음
          return;
        }

        // 뱃지 생성 및 추가
        const badge = this.createRankingBadge(ranking);
        this.insertBadge(profileElement, badge);

        // 중복 추가 방지
        profileElement.setAttribute('data-ranking-badge-added', 'true');

      } catch (error) {
        console.error('뱃지 추가 실패:', error);
      }
    }

    extractUsername(profileElement) {
      // 사용자명 추출 로직 개선
      const usernameElement = profileElement.querySelector('a[href*="/"]');
      if (usernameElement) {
        const href = usernameElement.getAttribute('href');
        const match = href.match(/\/([^\/]+)$/);
        return match ? match[1] : null;
      }
      
      // 대체 방법: 텍스트에서 @username 찾기
      const text = profileElement.textContent;
      const atMatch = text.match(/@(\w+)/);
      return atMatch ? atMatch[1] : null;
    }

    async getRankingInfo(username) {
      // 캐시된 데이터 확인
      if (this.rankingData[username]) {
        return this.rankingData[username];
      }

      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'getRankingData',
            username: username
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });

        if (response && response.success) {
          this.rankingData[username] = response.data;
          return response.data;
        } else {
          // 랭킹이 없는 경우(404 등)는 에러 로그를 남기지 않고 null 반환
          return null;
        }
      } catch (error) {
        // Extension context invalidated 등은 조용히 무시
        if (
          error &&
          error.message &&
          error.message.includes('Extension context invalidated')
        ) {
          return null;
        }
        let errorMsg;
        if (typeof error === 'object') {
          if (error.message) {
            errorMsg = error.message;
          } else {
            try {
              errorMsg = JSON.stringify(error);
            } catch (e) {
              errorMsg = String(error);
            }
          }
        } else {
          errorMsg = String(error);
        }
        console.error('랭킹 정보 가져오기 실패:', errorMsg);
        return null;
      }
    }

    getFallbackRanking(username) {
      // API 실패 시 사용할 기본 랭킹 데이터
      const hash = this.hashCode(username);
      const rank = (hash % 1000) + 1;
      
      return {
        rank: rank,
        stars: Math.floor(Math.random() * 50000) + 1000,
        proofs: Math.floor(Math.random() * 100) + 1,
        cycles: Math.floor(Math.random() * 10000000) + 100000,
        category: 'succinct',
        lastUpdated: new Date().toISOString()
      };
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    }

    createRankingBadge(ranking) {
      const badge = document.createElement('div');
      badge.className = 'ranking-badge';
      badge.setAttribute('data-rank', ranking.rank);
      badge.setAttribute('data-stars', ranking.stars);
      
      const rankWithSuffix = `${ranking.rank}th`;
      
      const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="ranking-star-svg"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg>`;

      // 뱃지 내용 (랭킹과 스타 표시)
      badge.innerHTML = `
        <span class="ranking-text">${rankWithSuffix}</span>
        ${starSvg}
        <span class="stars-text">${ranking.stars.toLocaleString()}</span>
      `;

      return badge;
    }

    insertBadge(profileElement, badge) {
      // 프로필 요소 내 적절한 위치에 뱃지 삽입
      const container = profileElement.closest('[data-testid="User-Name"]') || profileElement;
      
      // 기존 뱃지 제거
      const existingBadge = container.querySelector('.ranking-badge');
      if (existingBadge) {
        existingBadge.remove();
      }

      // 새 뱃지 추가
      container.appendChild(badge);
    }
  }

  // 익스텐션 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new TwitterRankingBadge();
    });
  } else {
    new TwitterRankingBadge();
  }
})(); 