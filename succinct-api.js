// Succinct Stats API 서버
const http = require('http');
const url = require('url');

// Succinct Stats API 캐시
let leaderboardCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Succinct Stats API에서 데이터 가져오기
async function fetchSuccinctLeaderboard() {
  try {
    const response = await fetch('https://www.succinct-stats.xyz/api/leaderboard?action=getByPage&page=1&entriesPerPage=25000', {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Succinct Stats API 요청 실패:', error);
    return null;
  }
}

// 사용자명으로 랭킹 정보 찾기
function findUserRanking(username, leaderboard) {
  if (!leaderboard) return null;
  
  // @ 기호 제거하고 소문자로 변환
  const cleanUsername = username.replace('@', '').toLowerCase();
  
  for (const entry of leaderboard) {
    const entryName = entry.name.replace('@', '').toLowerCase();
    if (entryName === cleanUsername) {
      return {
        rank: parseInt(entry.rank.replace('#', '')),
        stars: parseInt(entry.stars),
        proofs: parseInt(entry.proofs),
        cycles: parseInt(entry.cycles),
        name: entry.name,
        category: 'succinct',
        lastUpdated: new Date().toISOString()
      };
    }
  }
  
  return null;
}

// 캐시된 리더보드 가져오기
async function getCachedLeaderboard() {
  const now = Date.now();
  
  // 캐시가 유효한 경우 캐시된 데이터 반환
  if (leaderboardCache && (now - lastCacheTime) < CACHE_DURATION) {
    return leaderboardCache;
  }
  
  // 새로운 데이터 가져오기
  console.log('Succinct Stats API에서 새로운 데이터를 가져오는 중...');
  const newData = await fetchSuccinctLeaderboard();
  
  if (newData) {
    leaderboardCache = newData;
    lastCacheTime = now;
    console.log(`${newData.length}개의 랭킹 데이터를 캐시했습니다.`);
  }
  
  return leaderboardCache;
}

// HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  try {
    // 랭킹 정보 요청
    if (pathname === '/rankings' && req.method === 'GET') {
      const username = query.username;
      
      if (!username) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Username parameter is required' }));
        return;
      }

      // 캐시된 리더보드 가져오기
      const leaderboard = await getCachedLeaderboard();
      
      if (!leaderboard) {
        res.writeHead(503, corsHeaders);
        res.end(JSON.stringify({ error: 'Failed to fetch leaderboard data' }));
        return;
      }

      // 사용자 랭킹 찾기
      const ranking = findUserRanking(username, leaderboard);
      
      if (ranking) {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(ranking));
      } else {
        // 랭킹이 없는 경우
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ 
          error: 'User not found in leaderboard',
          message: `User ${username} is not in the top ${leaderboard.length} rankings`
        }));
      }
    }
    
    // 전체 랭킹 목록 요청
    else if (pathname === '/rankings' && req.method === 'POST') {
      const leaderboard = await getCachedLeaderboard();
      
      if (leaderboard) {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({
          rankings: leaderboard.slice(0, 100), // 상위 100개만 반환
          total: leaderboard.length
        }));
      } else {
        res.writeHead(503, corsHeaders);
        res.end(JSON.stringify({ error: 'Failed to fetch leaderboard data' }));
      }
    }
    
    // 헬스 체크
    else if (pathname === '/health') {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cacheSize: leaderboardCache ? leaderboardCache.length : 0,
        lastCacheUpdate: lastCacheTime ? new Date(lastCacheTime).toISOString() : null
      }));
    }
    
    // 캐시 새로고침
    else if (pathname === '/refresh' && req.method === 'POST') {
      leaderboardCache = null;
      lastCacheTime = 0;
      await getCachedLeaderboard();
      
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ 
        status: 'success', 
        message: 'Cache refreshed',
        timestamp: new Date().toISOString()
      }));
    }
    
    // 기본 응답
    else {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('서버 에러:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// 서버 시작
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Succinct Stats API server running on http://localhost:${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET  /rankings?username=<username> - Get ranking for user`);
  console.log(`   POST /rankings - Get top 100 rankings`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /refresh - Refresh cache`);
  console.log(``);
  console.log(`💡 For Chrome extension testing, use:`);
  console.log(`   http://localhost:${PORT}/rankings?username=SaiMoo_n`);
  console.log(``);
  console.log(`🔄 Cache duration: ${CACHE_DURATION / 1000 / 60} minutes`);
});

// 에러 처리
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}); 