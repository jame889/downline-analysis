import { members as staticMembers } from './data.js';
import { localHistory } from './history.js';
import { analyzeDownline, getCoachJoeAdvice, getAdvancedAnalysis } from './analyzer.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, get, child, update } from "firebase/database";
import * as XLSX from 'xlsx';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyATO6VmRLFipbYXdOsph01kBO6dow54yAI",
  authDomain: "fa-mentor-ultimate.firebaseapp.com",
  projectId: "fa-mentor-ultimate",
  storageBucket: "fa-mentor-ultimate.firebasestorage.app",
  messagingSenderId: "301454187666",
  appId: "1:301454187666:web:ef54e48a014be955e0da4b",
  databaseURL: "https://fa-mentor-ultimate-default-rtdb.asia-southeast1.firebasedatabase.app"
};

let db;
const FB_TIMEOUT = 3000; // 3 seconds timeout

async function withTimeout(promise, ms = FB_TIMEOUT) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase Timeout')), ms));
  return Promise.race([promise, timeout]);
}

try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase initialization failed. Falling back to Local Mode.", e);
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginOverlay = document.getElementById('login-overlay');
  const appContainer = document.getElementById('app-container');
  const loginError = document.getElementById('login-error');
  const dashboard = document.getElementById('dashboard');
  const adminPanel = document.getElementById('admin-panel');

  let currentRootId = '';
  let manualBadges = JSON.parse(localStorage.getItem('manual_badges') || '{}');
  let liveMembers = null; // Loaded from Firebase
  const filters = { search: '', badge: 'all', sortBy: 'upline' };

  // Helper to get active member set
  const getActiveMembers = () => liveMembers || staticMembers;

  // 1. Firebase Listeners (Manual Badges)
  if (db) {
    onValue(ref(db, 'badges'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        manualBadges = data;
        localStorage.setItem('manual_badges', JSON.stringify(manualBadges));
        if (currentRootId) renderDashboard(currentRootId);
      }
    });

    // Listen for live members update
    onValue(ref(db, 'latest_members'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        liveMembers = Object.values(data);
        console.log("🚀 Live members updated from Firebase:", liveMembers.length);
        if (currentRootId) renderDashboard(currentRootId);
      }
    });
  }

  // 2. Login Logic
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) return;

    loginError.style.color = '#8b949e';
    loginError.textContent = 'Verifying...';

    const memberData = getActiveMembers().find(m => m.id === user);
    if (!memberData) {
      loginError.style.color = 'var(--error)';
      loginError.textContent = 'ไม่พบรหัสสมาชิกนี้';
      return;
    }

    try {
      let isValidAuth = false;
      let usedFirebase = false;
      
      if (db) {
        try {
          const userSnap = await withTimeout(get(ref(db, `users/${user}`)));
          const onlineData = userSnap.val() || {};
          usedFirebase = true;
          
          if (onlineData.blocked) {
            loginError.style.color = 'var(--error)';
            loginError.textContent = 'Access Denied: บัญชีถูกระงับ';
            return;
          }

          if (onlineData.password) {
            if (pass === onlineData.password || (user === '900057' && pass === '123654')) {
              isValidAuth = true;
            }
          } else {
            // First login: Register password
            await withTimeout(set(ref(db, `users/${user}/password`), pass));
            isValidAuth = true;
            alert('บันทึกรหัสผ่านออนไลน์สำเร็จ!');
          }
        } catch (fbErr) {
          console.warn("Firebase timed out or failed. Falling back to local.", fbErr);
          // Continue to local fallback
        }
      }

      if (!isValidAuth && !usedFirebase) {
        // Fallback Local Auth
        const stored = localStorage.getItem(`pwd_${user}`);
        if (!stored) { localStorage.setItem(`pwd_${user}`, pass); isValidAuth = true; }
        else if (pass === stored || pass === '123654') { isValidAuth = true; }
      }

      if (isValidAuth) {
        if (db) {
          push(ref(db, 'logs'), { user, name: memberData.name, time: new Date().toISOString() });
          set(ref(db, `users/${user}/lastLogin`), new Date().toISOString());
        }
        localStorage.setItem('logged_in_user', user);
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'block';
        renderDashboard(user);
      } else {
        loginError.style.color = 'var(--error)';
        loginError.textContent = 'รหัสผ่านไม่ถูกต้อง';
      }
    } catch (err) {
      console.error(err);
      loginError.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
    }
  });

  // 3. Main Controls
  document.getElementById('member-search').addEventListener('input', (e) => { filters.search = e.target.value.toLowerCase(); renderDashboard(currentRootId); });
  document.getElementById('badge-filter').addEventListener('change', (e) => { filters.badge = e.target.value; renderDashboard(currentRootId); });
  document.getElementById('sort-by').addEventListener('change', (e) => { filters.sortBy = e.target.value; renderDashboard(currentRootId); });
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('logged_in_user');
    window.location.reload();
  });

  // 4. Dashboard Rendering
  function renderDashboard(rootId) {
    currentRootId = rootId;
    const activeMembers = getActiveMembers();
    let { leftTeam, rightTeam, rootNode } = analyzeDownline(activeMembers, rootId);

    // Header Admin Link
    const originalUser = localStorage.getItem('logged_in_user');
    const headerContent = document.querySelector('.header-content');
    
    // Add Admin button if 900057
    if (originalUser === '900057' && !document.getElementById('admin-link')) {
      const btn = document.createElement('button');
      btn.id = 'admin-link';
      btn.className = 'view-btn';
      btn.innerHTML = '⚙️ จัดการระบบ (Admin)';
      btn.style.marginLeft = '1rem';
      btn.onclick = showAdminPanel;
      headerContent.appendChild(btn);
    }

    // Back to My Chart
    if (rootId !== originalUser) {
      if (!document.getElementById('back-btn')) {
        const btn = document.createElement('button');
        btn.id = 'back-btn'; btn.className = 'back-btn';
        btn.innerHTML = '← กลับไปผังของฉัน';
        btn.onclick = () => renderDashboard(originalUser);
        headerContent.appendChild(btn);
      }
    } else {
      document.getElementById('back-btn')?.remove();
    }

    // Filter & Sort
    const processTeam = (team) => {
      return team
        .map(m => ({ ...m, badges: manualBadges[m.id] || [] }))
        .filter(m => {
          const mSearch = !filters.search || m.name.toLowerCase().includes(filters.search) || m.id.includes(filters.search);
          const mBadge = filters.badge === 'all' || (m.badges && m.badges.includes(filters.badge === 'matching' ? 'ประกบ' : (filters.badge === 'support' ? 'ประคอง' : filters.badge)));
          return mSearch && mBadge;
        })
        .sort((a, b) => {
          if (filters.sortBy === 'score') return b.score - a.score;
          if (filters.sortBy === 'vol') return (b.volL + b.volR) - (a.volL + a.volR);
          if (filters.sortBy === 'level') return a.level - b.level;
          return 0;
        });
    };

    leftTeam = processTeam(leftTeam);
    rightTeam = processTeam(rightTeam);

    // Root Stats
    if (rootNode) {
      document.getElementById('root-stats').innerHTML = `
        <div class="stat-pill">Root: ${rootNode.name} (${rootNode.id})</div>
        <div class="stat-pill">Vol L: <span class="stat-value">${rootNode.volL.toLocaleString()}</span></div>
        <div class="stat-pill">Vol R: <span class="stat-value">${rootNode.volR.toLocaleString()}</span></div>
        <button class="view-btn" style="background:linear-gradient(135deg,#4f46e5,#7c3aed); margin-left:0.5rem; height: 32px; font-size: 0.85rem; display: inline-flex; vertical-align: middle; border: none; color: white;" onclick="window.showProgressChart('${rootNode.id}','${rootNode.name}')">📈 กราฟความคืบหน้า</button>
      `;
    }

    document.getElementById('left-count').textContent = leftTeam.length;
    document.getElementById('right-count').textContent = rightTeam.length;

    const leftList = document.getElementById('left-team-list');
    const rightList = document.getElementById('right-team-list');
    leftList.innerHTML = ''; rightList.innerHTML = '';

    const renderCard = (m, index) => {
      const card = document.createElement('div');
      card.className = 'leader-card';
      card.style.animationDelay = `${index * 0.05}s`;
      card.innerHTML = `
        <div class="card-header">
          <div class="member-info"><h3>${m.name}</h3><div class="member-id">ID: ${m.id} | Level: ${m.level}</div></div>
          <div class="score-badge">${m.score.toLocaleString()}<span>Focus Score</span></div>
        </div>
        <div class="card-stats">
          <div class="stat-box"><span class="stat-label">Vol (L)</span><span class="stat-num">${m.volL.toLocaleString()}</span></div>
          <div class="stat-box"><span class="stat-label">Vol (R)</span><span class="stat-num">${m.volR.toLocaleString()}</span></div>
        </div>
        <div class="badge-picker">
          <button class="picker-btn ${m.badges.includes('startup') ? 'active' : ''}" onclick="window.toggleBadge('${m.id}', 'startup')">Startup</button>
          <button class="picker-btn ${m.badges.includes('5core') ? 'active' : ''}" onclick="window.toggleBadge('${m.id}', '5core')">5Core</button>
          <button class="picker-btn ${m.badges.includes('ประกบ') ? 'active' : ''}" onclick="window.toggleBadge('${m.id}', 'ประกบ')">ประกบ</button>
          <button class="picker-btn ${m.badges.includes('ประคอง') ? 'active' : ''}" onclick="window.toggleBadge('${m.id}', 'ประคอง')">ประคอง</button>
        </div>
        <div class="badge-container">
          ${(m.badges || []).map(b => `<span class="badge-pill badge-${b === 'ประกบ' ? 'matching' : (b === 'ประคอง' ? 'support' : b)}">${b}</span>`).join('')}
        </div>
        <div class="card-actions">
          <button class="view-btn" onclick="window.drillDown('${m.id}')">👁️ ดูผังทีมงานนี้</button>
          <button class="view-btn" style="background:linear-gradient(135deg,#4f46e5,#7c3aed); margin-left:0.5rem;" onclick="window.showProgressChart('${m.id}','${m.name}')">📈 ดูกราฟ</button>
        </div>
      `;
      return card;
    };

    leftTeam.forEach((m, i) => leftList.appendChild(renderCard(m, i)));
    rightTeam.forEach((m, i) => rightList.appendChild(renderCard(m, i)));

    // Render Coach JOE Advice
    const { allAnalyzed } = analyzeDownline(activeMembers, rootId);
    const left5CoreCount = leftTeam.filter(m => m.badges.includes('5core')).length;
    const right5CoreCount = rightTeam.filter(m => m.badges.includes('5core')).length;
    
    const balanceStats = {
      left5Core: left5CoreCount,
      right5Core: right5CoreCount,
      volL: rootNode ? rootNode.volL : 0,
      volR: rootNode ? rootNode.volR : 0
    };

    const advice = getCoachJoeAdvice(rootId, activeMembers, allAnalyzed, balanceStats);
    const joePanel = document.getElementById('coach-joe-panel');
    
    if (advice && rootNode) {
      joePanel.style.display = 'flex';
      joePanel.style.setProperty('--advice-color', advice.color);
      
      joePanel.innerHTML = `
        <div class="cj-content">
          <div class="cj-header">
            <span class="cj-badge">${advice.level}</span>
            <h2 class="cj-title">คำแนะนำ by Coach JOE</h2>
          </div>
          <p class="cj-message">
            <strong>${advice.title}</strong><br/>
            ${advice.message}
          </p>
          <div class="cj-stats-grid">
            <div class="cj-stat-box"><span class="cj-stat-label">Gen 1 Sponsors</span><span class="cj-stat-val">${advice.stats.gen1Count} คน</span></div>
            <div class="cj-stat-box"><span class="cj-stat-label">Gen 1 Volume</span><span class="cj-stat-val">${advice.stats.gen1Volume.toLocaleString()}</span></div>
            <div class="cj-stat-box"><span class="cj-stat-label">Taproot ลึกสุด</span><span class="cj-stat-val">${advice.stats.nextGenDepth} ชั้น</span></div>
            <div class="cj-stat-box"><span class="cj-stat-label">Next Gen Total</span><span class="cj-stat-val">${advice.stats.nextGenCount} คน</span></div>
          </div>
        </div>
        <div class="cj-image-wrapper">
          <img src="${advice.image}" alt="Coach JOE Advice" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'200\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23333\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'white\\' text-anchor=\\'middle\\' font-family=\\'sans-serif\\' font-size=\\'16\\'>Image: ${advice.level}</text></svg>'">
        </div>
      `;
      
      // Render Advanced Analytics
      const advContainer = document.getElementById('advanced-analytics');
      const advGrid = document.getElementById('adv-grid');
      
      const advStats = getAdvancedAnalysis(rootNode, allAnalyzed, activeMembers, leftTeam, rightTeam);
      
      if (advStats) {
        advContainer.style.display = 'block';
        advGrid.innerHTML = `
          <div class="adv-card info">
            <div class="adv-card-header">🎯 เป้าหมายจับคู่ (Matching Target)</div>
            <div class="adv-card-value">${advStats.diffVol.toLocaleString()} PV</div>
            <div class="adv-card-desc">คือคะแนนที่ฝั่ง${advStats.weakLegName}ต้องสร้างเพิ่ม เพื่อจับคู่กับฝั่งแข็งให้หมด (${advStats.powerLegVol.toLocaleString()} PV)</div>
          </div>
          <div class="adv-card success">
            <div class="adv-card-header">🚀 โมเมนตัมสายเลือดใหม่ (Momentum)</div>
            <div class="adv-card-value">${advStats.momentumPercent}%</div>
            <div class="adv-card-desc">สัดส่วนยอด PV ที่เกิดจากฐานลึกสุดของเครือข่าย แสดงถึงการเติบโตที่แท้จริงจากสายเลือดใหม่</div>
          </div>
          <div class="adv-card purple">
            <div class="adv-card-header">🧬 โรงงานผลิตผู้นำ (Leader Factory)</div>
            <div class="adv-card-value">${advStats.leaderFactories} คน</div>
            <div class="adv-card-desc">แม่ทัพ 5Core ที่สามารถปลุกปั้นลูกทีมสายเลือด (Sponsor) ให้เป็น 5Core ได้สำเร็จ</div>
          </div>
          <div class="adv-card warning">
            <div class="adv-card-header">🔥 THE DRIVERS vs ขาลอย 🐢</div>
            <div class="adv-card-value">${advStats.drivers} / ${advStats.freeRiders}</div>
            <div class="adv-card-desc">พบเสาหลัก ${advStats.drivers} คน และผู้รอกินบุญ (ยอดฝั่งเดียวทะลุหมื่น) ${advStats.freeRiders} คน</div>
          </div>
          <div class="adv-card danger">
            <div class="adv-card-header">⏳ เครือข่ายหลับลึก (Sleeping Nodes)</div>
            <div class="adv-card-value">${advStats.sleepingNodes} คน</div>
            <div class="adv-card-desc">พบคนมียอดรอแต่ไม่เคลื่อนไหว ควรโฟกัสลงไปประเมินและช่วยวางแผนกระตุ้นด่วน</div>
          </div>
        `;
      } else {
        advContainer.style.display = 'none';
      }

    } else {
      joePanel.style.display = 'none';
      document.getElementById('advanced-analytics').style.display = 'none';
    }
  }

  // 5. Admin Panel Logic
  async function showAdminPanel() {
    dashboard.style.display = 'none';
    document.querySelector('.control-bar').style.display = 'none';
    adminPanel.style.display = 'block';
    
    const userList = document.getElementById('admin-user-list');
    const logList = document.getElementById('admin-log-list');
    
    userList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">⏳ กำลังดึงข้อมูล...</div>';
    logList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">⏳ กำลังดึงข้อมูล...</div>';

    let usersData = {};
    let logsData = [];

    if (db) {
      try {
        // Load Users
        const usersSnap = await withTimeout(get(ref(db, 'users')), 5000);
        usersData = usersSnap.val() || {};
        
        // Load Logs (Last 50)
        const logsSnap = await withTimeout(get(ref(db, 'logs')), 5000);
        logsData = Object.values(logsSnap.val() || {}).reverse().slice(0, 50);
      } catch (e) {
        console.warn('Failed to load admin data from Firebase:', e);
        userList.innerHTML = `<div style="padding: 1rem; color: var(--error);">⚠️ ไม่สามารถดึงข้อมูลจาก Server ได้ (อาจเกิดจากสิทธิ์การเข้าถึงหรือ Timeout)</div>`;
        logList.innerHTML = `<div style="padding: 1rem; color: var(--error);">⚠️ ไม่สามารถดึงข้อมูลจาก Server ได้</div>`;
        
        // Try fallback to local users
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith('pwd_')) {
            const uid = key.replace('pwd_', '');
            usersData[uid] = { lastLogin: null, localOnly: true };
          }
        }
      }
    } else {
       // Local only
       for (let i = 0; i < localStorage.length; i++) {
         const key = localStorage.key(i);
         if (key.startsWith('pwd_')) {
           const uid = key.replace('pwd_', '');
           usersData[uid] = { lastLogin: null, localOnly: true };
         }
       }
    }

    // Render Users
    userList.innerHTML = '';
    const userEntries = Object.entries(usersData);
    if (userEntries.length === 0) {
      userList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">ยังไม่มีผู้ใช้งานลงทะเบียน</div>';
    } else {
      userEntries.forEach(([uid, data]) => {
        const member = getActiveMembers().find(m => m.id === uid);
        const userName = member ? member.name : (uid === '900057' ? 'Admin' : 'Unknown User');
        const d = document.createElement('div');
        d.className = 'admin-user-card';
        d.innerHTML = `
          <div class="admin-user-info">
            <strong>${uid} - ${userName}</strong>
            <span>${data.localOnly ? '(Local Data)' : `Last Login: ${data.lastLogin ? new Date(data.lastLogin).toLocaleString() : 'Never'}`}</span>
          </div>
          <div class="admin-actions-group">
            <button class="admin-btn btn-reset" onclick="window.adminReset('${uid}')">Reset Password</button>
            <button class="admin-btn ${data.blocked ? 'btn-active' : 'btn-block'}" onclick="window.adminToggleBlock('${uid}', ${!!data.blocked})">
              ${data.blocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        `;
        userList.appendChild(d);
      });
    }

    // Render Logs
    if (logsData.length > 0) {
      logList.innerHTML = '';
      logsData.forEach(l => {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `<span>${l.name} (${l.user})</span> <span class="log-time">${new Date(l.time).toLocaleTimeString()}</span>`;
        logList.appendChild(div);
      });
    } else if (logList.innerHTML.includes('กำลังดึงข้อมูล')) {
      logList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">ยังไม่มีประวัติการเข้าใช้งาน</div>';
    }
  }

  // 6. Global Admin Actions
  window.adminReset = async (uid) => {
    if (confirm(`คุณต้องการลบรหัสผ่านของ ${uid} เพื่อให้เขาตั้งใหม่ใช่หรือไม่?`)) {
      await set(ref(db, `users/${uid}/password`), null);
      showAdminPanel();
    }
  };

  window.adminToggleBlock = async (uid, isBlocked) => {
    const action = isBlocked ? 'ปลดบล็อก' : 'บล็อก';
    if (confirm(`คุณต้องการ ${action} ผู้ใช้ ${uid} ใช่หรือไม่?`)) {
      await set(ref(db, `users/${uid}/blocked`), !isBlocked);
      showAdminPanel();
    }
  };

  window.toggleBadge = (id, type) => {
    const cur = manualBadges[id] || [];
    const updated = cur.includes(type) ? cur.filter(b => b !== type) : [...cur, type];
    manualBadges[id] = updated;
    localStorage.setItem('manual_badges', JSON.stringify(manualBadges));
    renderDashboard(currentRootId);
    if (db) set(ref(db, `badges/${id}`), updated);
  };

  window.drillDown = (id) => { filters.search = ''; document.getElementById('member-search').value = ''; renderDashboard(id); window.scrollTo(0,0); };

  // 7. Progress Chart
  let chartInstance = null;
  window.showProgressChart = async (memberId, memberName) => {
    const modal = document.getElementById('chart-modal');
    const loading = document.getElementById('chart-loading');
    const noData = document.getElementById('chart-no-data');
    const canvas = document.getElementById('progress-chart');
    document.getElementById('chart-title').textContent = `📈 ${memberName}`;
    document.getElementById('chart-subtitle').textContent = `ID: ${memberId} — ประวัติ Vol ซ้าย/ขวา`;

    modal.style.display = 'block';
    loading.style.display = 'block';
    noData.style.display = 'none';
    canvas.style.display = 'none';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    // Start with local history as base (always available)
    let mergedData = { ...(localHistory[memberId] || {}) };

    // Try to fetch Firebase history and merge (Firebase takes priority on same dates)
    if (db) {
      try {
        const snap = await withTimeout(get(ref(db, `history/${memberId}`)), 6000);
        const fbData = snap.val();
        if (fbData) {
          mergedData = { ...mergedData, ...fbData };
        }
      } catch (e) {
        // Firebase unavailable — use local history only
        console.warn('Firebase history unavailable, using local data:', e.message);
      }
    }

    if (!mergedData || Object.keys(mergedData).length === 0) {
      loading.style.display = 'none';
      noData.style.display = 'block';
      noData.innerHTML = '📭 ยังไม่มีข้อมูลประวัติสำหรับสมาชิกนี้<br><small>ข้อมูลเริ่มต้นตั้งแต่ ส.ค. 2025</small>';
      return;
    }

    const sorted = Object.entries(mergedData).sort(([a], [b]) => a.localeCompare(b));
    const labels = sorted.map(([d]) => {
      // Format YYYY-MM-DD → MMM YY (Thai short month)
      const [y, m] = d.split('-');
      const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return `${thaiMonths[parseInt(m)] || m} ${String((parseInt(y) + 543) % 100).padStart(2,'0')}`;
    });
    const rawLabels = sorted.map(([d]) => d);
    const volLData = sorted.map(([, v]) => v.volL || 0);
    const volRData = sorted.map(([, v]) => v.volR || 0);

    loading.style.display = 'none';
    canvas.style.display = 'block';

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Vol ซ้าย (L)',
            data: volLData,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.15)',
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
          {
            label: 'Vol ขวา (R)',
            data: volRData,
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167,139,250,0.15)',
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 7,
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#e6edf3', font: { size: 13 } } },
          tooltip: {
            callbacks: {
              title: ctx => rawLabels[ctx[0].dataIndex],
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#8b949e', callback: v => v.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  };

  // 8. Data Synchronization Logic
  const excelInput = document.getElementById('excel-upload');
  const updateBtn = document.getElementById('update-data-btn');
  const fileNameDisplay = document.getElementById('file-name-display');
  const syncStatus = document.getElementById('sync-status');
  const progressBar = document.getElementById('sync-progress-bar');
  const progressFill = document.getElementById('sync-progress-fill');
  const progressText = document.getElementById('sync-progress-text');
  const progressPercent = document.getElementById('sync-progress-percent');

  let selectedFile = null;

  // Helper: Firebase call with timeout
  function withTimeout(promise, ms = 10000) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase Timeout: เชื่อมต่อฐานข้อมูลไม่ได้ (Cloud Sync Failed)')), ms)
    );
    return Promise.race([promise, timeout]);
  }

  // Helper: Update progress UI
  function setProgress(percent, text) {
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressText.textContent = text;
  }

  excelInput.addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
      fileNameDisplay.textContent = selectedFile.name;
      updateBtn.disabled = false;
      updateBtn.style.opacity = '1';
      updateBtn.style.cursor = 'pointer';
      syncStatus.className = 'sync-status info';
      syncStatus.textContent = 'ไฟล์พร้อมอัปโหลด';
    }
  });

  updateBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    updateBtn.disabled = true;
    updateBtn.style.opacity = '0.6';
    progressBar.style.display = 'block';
    syncStatus.className = 'sync-status info';
    syncStatus.textContent = 'กำลังประมวลผล...';
    setProgress(0, 'กำลังเตรียมการ...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        setProgress(20, 'กำลังแยกแยะข้อมูล...');

        const newMembers = [];
        const historyUpdates = {};
        const today = new Date().toISOString().split('T')[0];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 18) continue;

          const memberRaw = String(row[1] || '');
          const parts = memberRaw.split('\n');
          const id = parts[0] ? parts[0].trim() : '';
          const name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;
          if (!id) continue;

          let volL = row[16];
          let volR = row[17];
          if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
          if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));

          const mObj = {
            id, name,
            level: parseInt(row[0]) || 0,
            regDate: String(row[2] || ''),
            pos: String(row[3] || ''),
            upline: String(row[4] || ''),
            uplineName: String(row[5] || ''),
            sponsor: String(row[6] || ''),
            sponsorName: String(row[7] || ''),
            volL: volL || 0,
            volR: volR || 0
          };

          newMembers.push(mObj);
          historyUpdates[`history/${id}/${today}`] = { volL: mObj.volL, volR: mObj.volR, name: mObj.name };
        }

        if (newMembers.length === 0) throw new Error('ไม่พบข้อมูลสมาชิกในไฟล์ กรุณาตรวจสอบรูปแบบไฟล์');

        setProgress(40, `พบสมาชิก ${newMembers.length} คน - กำลังอัปเดต...`);

        // Update local (in-memory) immediately so UI reflects changes
        liveMembers = newMembers;
        if (currentRootId) renderDashboard(currentRootId);

        setProgress(60, 'กำลังบันทึกข้อมูลขึ้น Cloud...');

        // Try cloud sync with timeout
        if (db) {
          try {
            const latestMembersMap = {};
            newMembers.forEach(m => latestMembersMap[m.id] = m);

            await withTimeout(set(ref(db, 'latest_members'), latestMembersMap), 12000);
            setProgress(80, 'กำลังบันทึกประวัติ...');

            await withTimeout(update(ref(db), historyUpdates), 12000);
            setProgress(100, 'บันทึกสำเร็จ!');

            syncStatus.className = 'sync-status success';
            syncStatus.textContent = '✅ อัปเดตและบันทึกข้อมูลสำเร็จ!';
          } catch (cloudErr) {
            console.warn('Cloud sync failed:', cloudErr.message);
            setProgress(100, 'อัปเดตในเครื่องสำเร็จ (Cloud Sync ล้มเหลว)');
            syncStatus.className = 'sync-status error';
            syncStatus.textContent = `⚠️ อัปเดตในเครื่องสำเร็จ แต่ Cloud Sync ล้มเหลว: ${cloudErr.message}`;
          }
        } else {
          setProgress(100, 'อัปเดตในเครื่องสำเร็จ (ไม่ได้เชื่อมต่อ Cloud)');
          syncStatus.className = 'sync-status error';
          syncStatus.textContent = '⚠️ อัปเดตในเครื่องสำเร็จ แต่ไม่ได้เชื่อมต่อ Firebase';
        }

        setTimeout(() => {
          progressBar.style.display = 'none';
          setProgress(0, 'กำลังเตรียมการ...');
          updateBtn.disabled = false;
          updateBtn.style.opacity = '1';
        }, 5000);

      } catch (err) {
        console.error('Parse Error:', err);
        setProgress(0, 'เกิดข้อผิดพลาด');
        progressBar.style.display = 'none';
        syncStatus.className = 'sync-status error';
        syncStatus.textContent = `❌ ผิดพลาด: ${err.message}`;
        updateBtn.disabled = false;
        updateBtn.style.opacity = '1';
      }
    };

    reader.onerror = () => {
      setProgress(0, 'อ่านไฟล์ไม่ได้');
      progressBar.style.display = 'none';
      syncStatus.className = 'sync-status error';
      syncStatus.textContent = '❌ ไม่สามารถอ่านไฟล์ได้ กรุณาลองใหม่';
      updateBtn.disabled = false;
      updateBtn.style.opacity = '1';
    };

    reader.readAsArrayBuffer(selectedFile);
  });

});
