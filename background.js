// 백그라운드 서비스 워커 - IndexedDB 기반 캐시 시스템
let db = null;
const DB_NAME = 'ProofOfStarsDB';
const DB_VERSION = 1;
const STORE_NAME = 'rankings';
const CACHE_SIZE = 25000; // 25,000등까지 캐시

// IndexedDB 초기화
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'username' });
        store.createIndex('rank', 'rank', { unique: false });
        store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
    };
  });
}

// 익스텐션 설치 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Proof of Stars extension installed.');
  
  try {
    await initDB();
    await chrome.storage.local.set({
      lastUpdateTime: 0,
      enabled: true,
      badgeEnabled: true, // 뱃지 표시 여부
      cacheSize: 0,
      isInitialized: false
    });
    
    console.log('IndexedDB 초기화 완료');
  } catch (error) {
    console.error('IndexedDB 초기화 실패:', error);
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRankingData') {
    handleGetRankingData(request.username, sendResponse);
    return true;
  }
  
  if (request.action === 'updateSettings') {
    handleUpdateSettings(request.settings, sendResponse);
    return true;
  }
  
  if (request.action === 'refreshRankingData') {
    handleRefreshRankingData(sendResponse);
    return true;
  }
  
  if (request.action === 'getUpdateTimeStatus') {
    handleGetUpdateTimeStatus(sendResponse);
    return true;
  }
  
  if (request.action === 'getCacheStatus') {
    handleGetCacheStatus(sendResponse);
    return true;
  }
  
  if (request.action === 'toggleBadge') {
    handleToggleBadge(request.enabled, sendResponse);
    return true;
  }
});

// 랭킹 데이터 가져오기 (로컬 캐시에서)
async function handleGetRankingData(username, sendResponse) {
  try {
    if (!db) await initDB();
    
    const ranking = await getCachedRanking(username);
    if (ranking) {
      sendResponse({ success: true, data: ranking });
    } else {
      sendResponse({ success: false, notFound: true });
    }
  } catch (error) {
    console.error(`Error getting ranking for ${username}:`, error);
    sendResponse({ success: false, error: error.message });
  }
}

// 설정 업데이트
async function handleUpdateSettings(settings, sendResponse) {
  try {
    await chrome.storage.local.set(settings);
    sendResponse({ success: true });
  } catch (error) {
    console.error('설정 업데이트 실패:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 랭킹 데이터 새로고침 (25,000등까지 다운로드)
async function handleRefreshRankingData(sendResponse) {
  try {
    console.log('=== 랭킹 데이터 새로고침 시작 ===');
    
    const { lastUpdateTime = 0 } = await chrome.storage.local.get('lastUpdateTime');
    const now = Date.now();
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24시간 쿨다운

    console.log(`현재 시간: ${new Date(now).toISOString()}`);
    console.log(`마지막 업데이트: ${new Date(lastUpdateTime).toISOString()}`);
    console.log(`경과 시간: ${now - lastUpdateTime}ms`);
    console.log(`쿨다운 기간: ${cooldownPeriod}ms`);

    if (now - lastUpdateTime < cooldownPeriod) {
      const timeLeft = cooldownPeriod - (now - lastUpdateTime);
      console.log(`쿨다운 중: ${timeLeft}ms 남음`);
      sendResponse({ 
        success: false, 
        error: 'cooldown', 
        timeLeft: timeLeft 
      });
      return;
    }

    console.log('쿨다운 통과, 다운로드 시작...');

    // 25,000등까지의 데이터 다운로드 시작
    sendResponse({ success: true, downloading: true });
    
    await downloadAllRankings();
    await chrome.storage.local.set({ 
      lastUpdateTime: now,
      isInitialized: true 
    });
    
    console.log('=== 랭킹 데이터 새로고침 완료 ===');
    
    // 모든 트위터 탭에 업데이트 알림
    const tabs = await chrome.tabs.query({
      url: ['*://twitter.com/*', '*://x.com/*']
    });
    
    console.log(`${tabs.length}개의 트위터 탭에 업데이트 알림 전송`);
    
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'dataRefreshed' }).catch(() => {
        // 메시지 전송 실패는 무시
      });
    });

  } catch (error) {
    console.error('=== 랭킹 데이터 새로고침 실패 ===');
    console.error('에러 상세:', error);
    console.error('에러 스택:', error.stack);
    sendResponse({ success: false, error: error.message });
  }
}

// 업데이트 시간 상태 요청 처리
async function handleGetUpdateTimeStatus(sendResponse) {
  try {
    const { lastUpdateTime = 0, isInitialized = false, badgeEnabled = true } = await chrome.storage.local.get(['lastUpdateTime', 'isInitialized', 'badgeEnabled']);
    sendResponse({ lastUpdateTime, isInitialized, badgeEnabled });
  } catch (error) {
    sendResponse({ lastUpdateTime: 0, isInitialized: false, badgeEnabled: true });
  }
}

// 캐시 상태 요청 처리
async function handleGetCacheStatus(sendResponse) {
  try {
    if (!db) await initDB();
    
    const count = await getCacheSize();
    const { isInitialized = false, badgeEnabled = true } = await chrome.storage.local.get(['isInitialized', 'badgeEnabled']);
    
    sendResponse({ 
      cacheSize: count, 
      isInitialized,
      badgeEnabled,
      maxCacheSize: CACHE_SIZE 
    });
  } catch (error) {
    sendResponse({ cacheSize: 0, isInitialized: false, badgeEnabled: true, maxCacheSize: CACHE_SIZE });
  }
}

// 뱃지 on/off 토글 처리
async function handleToggleBadge(enabled, sendResponse) {
  try {
    await chrome.storage.local.set({ badgeEnabled: enabled });
    
    // 모든 트위터 탭에 상태 변경 알림
    const tabs = await chrome.tabs.query({
      url: ['*://twitter.com/*', '*://x.com/*']
    });
    
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'badgeStateChanged', 
        enabled: enabled 
      }).catch(() => {
        // 메시지 전송 실패는 무시
      });
    });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('뱃지 상태 변경 실패:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// XMLHttpRequest를 사용한 API 호출 (CORS 문제 해결용)
async function fetchWithXHR(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (error) {
          reject(new Error('JSON 파싱 실패: ' + error.message));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };
    
    xhr.onerror = function() {
      reject(new Error('네트워크 오류'));
    };
    
    xhr.ontimeout = function() {
      reject(new Error('요청 시간 초과'));
    };
    
    xhr.timeout = 30000; // 30초 타임아웃
    xhr.send();
  });
}

// 25,000등까지의 모든 랭킹 데이터 다운로드
async function downloadAllRankings() {
  console.log('=== 전체 랭킹 데이터 다운로드 시작 ===');
  
  const db = await initDB();
  const maxRank = 25000;
  const pageSize = 100;
  let totalDownloaded = 0;
  let page = 0;
  
  console.log(`목표: ${maxRank}등까지, 페이지 크기: ${pageSize}`);

  try {
    // 기존 데이터 삭제
    await clearAllRankings();
    console.log('기존 데이터 삭제 완료');

    while (totalDownloaded < maxRank) {
      page++;
      const offset = (page - 1) * pageSize;
      
      console.log(`페이지 ${page} 다운로드 중... (offset: ${offset})`);
      
      const url = `https://proofofstars.vercel.app/api/leaderboard?offset=${offset}&limit=${pageSize}`;
      console.log(`API URL: ${url}`);
      
      let data;
      try {
        // 먼저 fetch 시도
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        console.log(`응답 상태: ${response.status}`);
        console.log(`응답 헤더:`, Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API 응답 에러: ${response.status} - ${errorText}`);
          throw new Error(`API 응답 에러: ${response.status} - ${errorText}`);
        }

        data = await response.json();
      } catch (fetchError) {
        console.log('Fetch 실패, XMLHttpRequest 시도:', fetchError.message);
        // fetch 실패 시 XMLHttpRequest 시도
        data = await fetchWithXHR(url);
      }
      
      console.log(`받은 데이터:`, data);
      
      if (!data || !Array.isArray(data)) {
        console.error('잘못된 데이터 형식:', data);
        throw new Error('잘못된 데이터 형식');
      }

      if (data.length === 0) {
        console.log('더 이상 데이터가 없음, 다운로드 완료');
        break;
      }

      // 데이터 저장
      const rankings = data.map((entry, index) => ({
        username: entry.username || entry.address || `user_${offset + index}`,
        rank: offset + index + 1,
        address: entry.address,
        points: entry.points || 0,
        lastUpdated: new Date().toISOString()
      }));

      console.log(`${rankings.length}개 항목 저장 중...`);
      
      for (const ranking of rankings) {
        await saveRanking(ranking);
      }

      totalDownloaded += rankings.length;
      console.log(`총 ${totalDownloaded}개 다운로드 완료`);

      // 서버 부하 방지를 위한 지연
      if (data.length === pageSize) {
        console.log('1초 대기...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`=== 다운로드 완료: 총 ${totalDownloaded}개 항목 ===`);
    
  } catch (error) {
    console.error('=== 다운로드 중 에러 발생 ===');
    console.error('에러 상세:', error);
    console.error('에러 스택:', error.stack);
    throw error;
  }
}

// 랭킹 데이터 저장
async function saveRanking(ranking) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(ranking);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 캐시된 랭킹 데이터 가져오기
async function getCachedRanking(username) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(username);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 캐시 크기 가져오기
async function getCacheSize() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(0);
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 모든 랭킹 데이터 삭제
async function clearAllRankings() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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

// 자동 업데이트 알람 설정
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'daily_update') {
      console.log(`${new Date().toISOString()}: 예약된 랭킹 업데이트를 실행합니다.`);
      downloadAllRankings().catch(error => {
        console.error('자동 업데이트 실패:', error);
      });
    }
  });
  
  // 24시간마다 자동 업데이트 설정
  chrome.alarms.create('daily_update', {
    periodInMinutes: 24 * 60 // 24시간마다
  });
} else {
  console.warn('alarms API를 사용할 수 없어 자동 업데이트가 비활성화됩니다.');
}

// 익스텐션 아이콘 클릭 시 팝업 열기
chrome.action.onClicked.addListener((tab) => {
  // 팝업이 이미 정의되어 있으므로 자동으로 열림
}); 