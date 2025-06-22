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

    const apiUrl = 'http://localhost:3001/rankings';
    const response = await fetch(`${apiUrl}?username=${username}`);
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
    const apiUrl = 'http://localhost:3001/rankings';
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