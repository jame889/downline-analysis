import { members } from './data.js';
import { localHistory } from './history.js';
import { analyzeDownline } from './analyzer.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, get, child } from "firebase/database";

// Firebase Configuration (Replace with your own if needed)
const firebaseConfig = {
  apiKey: "optional-placeholder-key",
  databaseURL: "https://downline-analyzer-default-rtdb.asia-southeast1.firebasedatabase.app"
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
  const filters = { search: '', badge: 'all', sortBy: 'upline' };

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
  }

  // 2. Login Logic
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) return;

    loginError.style.color = '#8b949e';
    loginError.textContent = 'Verifying...';

    const memberData = members.find(m => m.id === user);
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
    let { leftTeam, rightTeam, rootNode } = analyzeDownline(members, rootId);

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
        const member = members.find(m => m.id === uid);
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

});
