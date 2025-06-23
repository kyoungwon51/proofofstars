// 백그라운드 서비스 워커
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Proof of Stars extension installed.');
  
  // 기본값 설정
  await chrome.storage.sync.set({
    rankingData: {},
    lastUpdateTime: 0,
    enabled: true,
  });
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRankingData') {
    handleGetRankingData(request.username, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }
  
  if (request.action === 'updateSettings') {
    handleUpdateSettings(request.settings, sendResponse);
    return true;
  }
  
  if (request.action === 'refreshRankingData') {
    handleRefreshRankingData(sendResponse);
    return true;
  }
  
  // 업데이트 시간 상태 요청 처리
  if (request.action === 'getUpdateTimeStatus') {
    chrome.storage.local.get('lastUpdateTime', (result) => {
      sendResponse({ lastUpdateTime: result.lastUpdateTime || 0 });
    });
    return true;
  }
});

// 랭킹 데이터 가져오기
async function handleGetRankingData(username, sendResponse) {
  try {
    const cachedData = await getCachedRank(username);
    if (cachedData) {
      sendResponse(cachedData);
      return;
    }

    const apiUrl = 'https://proofofstars.vercel.app/rankings';
    const response = await fetch(`${apiUrl}?username=${username}`);

    if (response.status === 404) {
      sendResponse({ success: false, notFound: true });
      return;
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    const data = await response.json();
    await cacheRank(username, data);
    sendResponse(data);

  } catch (error) {
    console.error(`Error getting ranking for ${username}:`, error);
    sendResponse({ error: error.message });
  }
}

// 설정 업데이트
async function handleUpdateSettings(settings, sendResponse) {
  try {
    await chrome.storage.sync.set(settings);
    sendResponse({ success: true });
  } catch (error) {
    console.error('설정 업데이트 실패:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 랭킹 데이터 새로고침
async function handleRefreshRankingData(sendResponse) {
  try {
    const { lastUpdateTime } = await chrome.storage.local.get('lastUpdateTime');
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (now - lastUpdateTime < twentyFourHours) {
      console.log('업데이트 제한 시간(24시간)이 아직 지나지 않았습니다.');
      sendResponse({ success: false, error: 'cooldown', timeLeft: twentyFourHours - (now - lastUpdateTime) });
      return;
    }

    await updateRankingData();
    await chrome.storage.local.set({ lastUpdateTime: now });
    
    sendResponse({ success: true, lastUpdateTime: now });

  } catch (error) {
    console.error('랭킹 데이터 새로고침 실패:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 탭 업데이트 시 콘텐츠 스크립트 재실행
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      (tab.url?.includes('twitter.com') || tab.url?.includes('x.com'))) {
    
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(error => {
      console.error('콘텐츠 스크립트 실행 실패:', error);
    });
  }
});

// alarms API가 사용 가능한 경우에만 리스너 등록
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'daily_update_at_midnight_utc') {
      console.log(`${new Date().toISOString()}: 예약된 랭킹 업데이트를 실행합니다.`);
      updateRankingData();
    }
  });
} else {
  console.warn('alarms API를 사용할 수 없어 자동 업데이트가 비활성화됩니다.');
}

async function updateRankingData() {
  try {
    // 이제 캐시된 사용자 정보가 아닌, 전체 캐시를 비우는 방식으로 변경
    console.log('랭킹 데이터 캐시를 비웁니다...');
    await chrome.storage.sync.set({ rankingData: {} });
    
    // 모든 트위터 탭에 업데이트 알림
    const tabs = await chrome.tabs.query({
      url: ['*://twitter.com/*', '*://x.com/*']
    });
    
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'dataRefreshed' }).catch(() => {
        // 메시지 전송 실패는 무시 (탭이 로드되지 않았을 수 있음)
      });
    });
    
    console.log('랭킹 데이터 캐시 비우기 완료 및 탭 업데이트 메시지 전송 완료.');
    
  } catch (error) {
    console.error('랭킹 데이터 업데이트 실패:', error);
  }
}

// 익스텐션 아이콘 클릭 시 팝업 열기
chrome.action.onClicked.addListener((tab) => {
  // 팝업이 이미 정의되어 있으므로 자동으로 열림
});

async function scheduleDailyUpdate() {
  if (!chrome.alarms) {
    console.warn('alarms API를 사용할 수 없어 자동 업데이트가 비활성화됩니다.');
    return;
  }
  
  const alarmName = 'daily_update_at_midnight_utc';
  const alarm = await chrome.alarms.get(alarmName);

  // 알람이 이미 설정되어 있으면 다시 설정하지 않음
  if (alarm) {
    console.log('일일 업데이트 알람이 이미 설정되어 있습니다.');
    return;
  }
  
  // 다음 UTC 자정 시간 계산
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // 다음 날로 설정
    0, 0, 0, 0 // 00:00:00.000
  ));

  // 알람 생성 (when: 밀리초 단위의 절대 시간, periodInMinutes: 반복 주기)
  chrome.alarms.create(alarmName, {
    when: nextMidnightUTC.getTime(),
    periodInMinutes: 24 * 60 // 24시간마다 반복
  });
  
  console.log(`다음 랭킹 업데이트는 ${nextMidnightUTC.toISOString()}에 예정되어 있습니다.`);
}

async function getCachedRank(username) {
  const result = await chrome.storage.sync.get(['rankingData']);
  const cachedData = result.rankingData || {};
  return cachedData[username] || null;
}

async function cacheRank(username, data) {
  const result = await chrome.storage.sync.get(['rankingData']);
  const cachedData = result.rankingData || {};
  cachedData[username] = data;
  await chrome.storage.sync.set({ rankingData: cachedData });
}

async function refreshAllRankings() {
  try {
    const now = Date.now();
    const { lastUpdateTime = 0 } = await chrome.storage.local.get('lastUpdateTime');
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (now - lastUpdateTime < twentyFourHours) {
      const timeLeft = twentyFourHours - (now - lastUpdateTime);
      console.log(`Cooldown active. ${Math.round(timeLeft / 1000 / 60)} minutes left.`);
      return { success: false, error: 'cooldown', timeLeft };
    }

    // API에서 전체 데이터 가져오기
    const apiUrl = 'https://proofofstars.vercel.app/rankings';
    const response = await fetch(apiUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    const data = await response.json();
    await cacheRank(data.username, data);
    return data;
  } catch (error) {
    console.error('랭킹 데이터 새로고침 실패:', error);
    return { success: false, error: error.message };
  }
}

let rankingMapCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1시간

async function fetchLatestTxId() {
  const query = {
    query: `
      query {
        transactions(
          tags: [{ name: "App-Name", values: ["SuccinctStatsRanking"] }]
          first: 1
          sort: HEIGHT_DESC
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `
  };
  try {
    const res = await fetch('https://arweave.net/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });
    const json = await res.json();
    return json.data.transactions.edges[0]?.node?.id || null;
  } catch (e) {
    console.error('Failed to fetch latest txid:', e);
    return null;
  }
}

async function fetchRankingMap() {
  const now = Date.now();
  if (rankingMapCache && (now - lastFetchTime < CACHE_DURATION)) {
    return rankingMapCache;
  }
  try {
    const txId = await fetchLatestTxId();
    if (!txId) throw new Error('No txId found');
    const res = await fetch(`https://gateway.irys.xyz/${txId}`);
    if (!res.ok) throw new Error('Failed to fetch rankings from Irys');
    const rankings = await res.json();
    const map = Object.fromEntries(rankings.map(r => [r.name.replace(/^@/, ''), r]));
    rankingMapCache = map;
    lastFetchTime = now;
    return map;
  } catch (e) {
    console.error('Failed to fetch ranking map:', e);
    return {}; // 빈 맵 반환
  }
}

// 사용 예시 (트위터 프로필에서 username 추출 후)
async function showBadgeForUser(username) {
  const rankingMap = await fetchRankingMap();
  const userRanking = rankingMap[username];
  if (userRanking) {
    // 뱃지 표시 로직
    console.log('Rank:', userRanking.rank, 'Stars:', userRanking.stars);
    // ...뱃지 DOM 생성 코드...
  } else {
    // 유저가 랭킹에 없을 때
    console.log('No ranking found for', username);
    // ...뱃지 숨기기/미표시...
  }
}

(function() {
  if (window.__PROOF_OF_STARS_BADGE_LOADED__) return;
  window.__PROOF_OF_STARS_BADGE_LOADED__ = true;

  let rankingMapCache = null;
  let lastFetchTime = 0;
  const CACHE_DURATION = 60 * 60 * 1000;

  async function fetchLatestTxId() {
    const query = {
      query: `
        query {
          transactions(
            tags: [{ name: "App-Name", values: ["SuccinctStatsRanking"] }]
            first: 1
            sort: HEIGHT_DESC
          ) {
            edges { node { id } }
          }
        }
      `
    };
    try {
      const res = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      const json = await res.json();
      return json.data.transactions.edges[0]?.node?.id || null;
    } catch (e) {
      console.error('Failed to fetch latest txid:', e);
      return null;
    }
  }

  async function fetchRankingMap() {
    const now = Date.now();
    if (rankingMapCache && (now - lastFetchTime < CACHE_DURATION)) return rankingMapCache;
    try {
      const txId = await fetchLatestTxId();
      if (!txId) throw new Error('No txId found');
      const res = await fetch(`https://gateway.irys.xyz/${txId}`);
      if (!res.ok) throw new Error('Failed to fetch rankings from Irys');
      const rankings = await res.json();
      const map = Object.fromEntries(rankings.map(r => [r.name.replace(/^@/, ''), r]));
      rankingMapCache = map;
      lastFetchTime = now;
      return map;
    } catch (e) {
      console.error('Failed to fetch ranking map:', e);
      return {};
    }
  }

  class TwitterRankingBadge {
    constructor() {
      this.enabled = true;
      this.init();
    }
    async init() {
      this.observePageChanges();
      if (this.enabled) this.addRankingBadges();
    }
    observePageChanges() {
      const observer = new MutationObserver(() => {
        if (this.enabled) this.addRankingBadges();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    async addRankingBadges() {
      if (!this.enabled) return;
      const profileElements = this.findProfileElements();
      for (const element of profileElements) {
        if (!element.hasAttribute('data-ranking-badge-added')) {
          await this.addBadgeToProfile(element);
        }
      }
    }
    findProfileElements() {
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
      return [...new Set(elements)];
    }
    async addBadgeToProfile(profileElement) {
      try {
        const username = this.extractUsername(profileElement);
        if (!username) return;
        const ranking = await this.getRankingInfo(username);
        if (!ranking) return;
        const badge = this.createRankingBadge(ranking);
        this.insertBadge(profileElement, badge);
        profileElement.setAttribute('data-ranking-badge-added', 'true');
      } catch (error) {
        console.error('뱃지 추가 실패:', error);
      }
    }
    extractUsername(profileElement) {
      const usernameElement = profileElement.querySelector('a[href*="/"]');
      if (usernameElement) {
        const href = usernameElement.getAttribute('href');
        const match = href.match(/\/([^\/]+)$/);
        return match ? match[1] : null;
      }
      const text = profileElement.textContent;
      const atMatch = text.match(/@(\w+)/);
      return atMatch ? atMatch[1] : null;
    }
    async getRankingInfo(username) {
      try {
        const rankingMap = await fetchRankingMap();
        return rankingMap[username] || rankingMap['@' + username] || null;
      } catch (e) {
        console.error('랭킹 정보 가져오기 실패:', e);
        return null;
      }
    }
    createRankingBadge(ranking) {
      const badge = document.createElement('div');
      badge.className = 'ranking-badge';
      badge.setAttribute('data-rank', ranking.rank);
      badge.setAttribute('data-stars', ranking.stars);
      const rankWithSuffix = `${ranking.rank}th`;
      const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="ranking-star-svg"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg>`;
      badge.innerHTML = `
        <span class="ranking-text">${rankWithSuffix}</span>
        ${starSvg}
        <span class="stars-text">${ranking.stars.toLocaleString()}</span>
      `;
      return badge;
    }
    insertBadge(profileElement, badge) {
      const container = profileElement.closest('[data-testid="User-Name"]') || profileElement;
      const existingBadge = container.querySelector('.ranking-badge');
      if (existingBadge) existingBadge.remove();
      container.appendChild(badge);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new TwitterRankingBadge());
  } else {
    new TwitterRankingBadge();
  }
})(); 