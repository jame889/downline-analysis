import { members } from './data.js';
import { analyzeDownline } from './analyzer.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// Firebase Configuration (Replace with your own if needed)
const firebaseConfig = {
  apiKey: "optional-placeholder-key",
  databaseURL: "https://downline-analyzer-default-rtdb.asia-southeast1.firebasedatabase.app"
};

let db;
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

  // Badge State across all members
  let manualBadges = JSON.parse(localStorage.getItem('manual_badges') || '{}');

  // Listen for Firebase Updates (if connected)
  if (db) {
    const badgesRef = ref(db, 'badges');
    onValue(badgesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        manualBadges = data;
        localStorage.setItem('manual_badges', JSON.stringify(manualBadges));
        if (currentRootId) renderDashboard(currentRootId);
      }
    });
  }

  // Handle Login Flow
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    // Mock Authentication: Accept if user passes criteria
    if (user && pass) {
      loginError.style.color = '#8b949e';
      loginError.textContent = 'Verifying credentials...';
      
      setTimeout(() => {
        const memberData = members.find(m => m.id === user);
        let isValidAuth = false;
        let authMessage = '';
        
        if (memberData) {
          const hasTwoRedDots = memberData.dots && memberData.dots[0] === 'red' && memberData.dots[1] === 'red';
          const hasVolume = memberData.volL > 0 || memberData.volR > 0;
          if (!hasTwoRedDots && (hasVolume || user === '900057')) {
            
            // Password Check Logic
            if (pass === '123654') {
              // Admin Master Key Override
              isValidAuth = true;
            } else {
              const storedPass = localStorage.getItem(`pwd_${user}`);
              if (storedPass) {
                if (pass === storedPass) {
                  isValidAuth = true;
                } else {
                  authMessage = 'Access Denied: รหัสผ่านไม่ถูกต้อง';
                }
              } else {
                // First-time login: Set the password
                localStorage.setItem(`pwd_${user}`, pass);
                isValidAuth = true;
                alert(`ระบบได้บันทึกรหัสผ่านของคุณเรียบร้อยแล้ว!\n(ครั้งต่อไปกรุณาใช้รหัสผ่านนี้ในการเข้าสู่ระบบ)`);
              }
            }
          } else {
             authMessage = 'Access Denied: รหัสนี้ไม่ผ่านเกณฑ์การเข้าใช้งาน (0 PV หรือไม่มีความเคลื่อนไหว)';
          }
        } else {
           authMessage = 'Access Denied: ไม่พบรหัสสมาชิกนี้ในระบบ';
        }

        if (isValidAuth) {
          // Success
          loginOverlay.style.display = 'none';
          appContainer.style.display = 'block';
          renderDashboard(user);
        } else {
          loginError.style.color = 'var(--error)';
          loginError.textContent = authMessage;
        }
      }, 600);
    }
  });

  // State for filtering and sorting
  let currentRootId = '';
  const filters = {
    search: '',
    badge: 'all',
    sortBy: 'score'
  };

  // Event Listeners for Controls
  document.getElementById('member-search').addEventListener('input', (e) => {
    filters.search = e.target.value.toLowerCase();
    renderDashboard(currentRootId);
  });

  document.getElementById('badge-filter').addEventListener('change', (e) => {
    filters.badge = e.target.value;
    renderDashboard(currentRootId);
  });

  document.getElementById('sort-by').addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    renderDashboard(currentRootId);
  });

  // Render Dashboard
  function renderDashboard(rootId) {
    currentRootId = rootId;
    let { leftTeam, rightTeam, rootNode } = analyzeDownline(members, rootId);

    // Merge Manual Badges from Firebase
    const mergeBadges = (m) => ({ ...m, badges: manualBadges[m.id] || [] });
    leftTeam = leftTeam.map(mergeBadges);
    rightTeam = rightTeam.map(mergeBadges);

    // Filter Logic
    const filterFn = (m) => {
      const matchesSearch = !filters.search || 
                            m.name.toLowerCase().includes(filters.search) || 
                            m.id.includes(filters.search);
      const matchesBadge = filters.badge === 'all' || (m.badges && m.badges.includes(filters.badge === 'matching' ? 'ประกบ' : (filters.badge === 'support' ? 'ประคอง' : filters.badge)));
      return matchesSearch && matchesBadge;
    };

    leftTeam = leftTeam.filter(filterFn);
    rightTeam = rightTeam.filter(filterFn);

    // Sort Logic
    const sortFn = (a, b) => {
      if (filters.sortBy === 'score') return b.score - a.score;
      if (filters.sortBy === 'vol') return (b.volL + b.volR) - (a.volL + a.volR);
      if (filters.sortBy === 'level') return a.level - b.level;
      return 0;
    };

    leftTeam.sort(sortFn);
    rightTeam.sort(sortFn);

    // Render Root Stats
    if (rootNode) {
      document.getElementById('root-stats').innerHTML = `
        <div class="stat-pill">Root: ${rootNode.name} (${rootNode.id})</div>
        <div class="stat-pill">Vol L: <span class="stat-value">${rootNode.volL.toLocaleString()}</span></div>
        <div class="stat-pill">Vol R: <span class="stat-value">${rootNode.volR.toLocaleString()}</span></div>
      `;
    }

    // Update Badges
    document.getElementById('left-count').textContent = leftTeam.length;
    document.getElementById('right-count').textContent = rightTeam.length;

    // Render Lists
    const leftList = document.getElementById('left-team-list');
    const rightList = document.getElementById('right-team-list');
    leftList.innerHTML = '';
    rightList.innerHTML = '';

    const renderCard = (member, index) => {
      const d = document.createElement('div');
      d.className = 'leader-card';
      d.style.animationDelay = `${index * 0.05}s`;
      
      d.innerHTML = `
        <div class="card-header">
          <div class="member-info">
            <h3>${member.name}</h3>
            <div class="member-id">ID: ${member.id} | Level: ${member.level} | Pos: ${member.pos}</div>
          </div>
          <div class="score-badge">
            ${member.score.toLocaleString()}
            <span>Focus Score</span>
          </div>
        </div>
        <div class="card-stats">
          <div class="stat-box">
            <span class="stat-label">Total Vol (Left)</span>
            <span class="stat-num" style="color: ${member.volL > member.volR ? 'var(--accent-left)' : '#fff'}">${member.volL.toLocaleString()}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Total Vol (Right)</span>
            <span class="stat-num" style="color: ${member.volR > member.volL ? 'var(--accent-right)' : '#fff'}">${member.volR.toLocaleString()}</span>
          </div>
        </div>
        <div class="badge-picker">
          <button class="picker-btn ${member.badges.includes('startup') ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleBadge('${member.id}', 'startup')">Startup</button>
          <button class="picker-btn ${member.badges.includes('5core') ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleBadge('${member.id}', '5core')">5Core</button>
          <button class="picker-btn ${member.badges.includes('ประกบ') ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleBadge('${member.id}', 'ประกบ')">ประกบ</button>
          <button class="picker-btn ${member.badges.includes('ประคอง') ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleBadge('${member.id}', 'ประคอง')">ประคอง</button>
        </div>
        <div class="badge-container">
          ${(member.badges || []).map(b => `<span class="badge-pill badge-${b === 'ประกบ' ? 'matching' : (b === 'ประคอง' ? 'support' : b)}">${b}</span>`).join('')}
        </div>
        <div class="power-leg power-${member.powerLeg.toLowerCase()}">
          ${member.powerLeg !== 'Balanced' ? `<div class="power-indicator"></div> Power Leg: ${member.powerLeg} ` : '<div class="power-indicator" style="background:#8b949e"></div> Balanced'}
        </div>
        <div class="card-details" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); animation: fadeIn 0.3s ease;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            <strong style="color:#fff;">อัพไลน์ตัวจริง:</strong> ${member.upline} - ${member.uplineName || 'ไม่ระบุ'}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            <strong style="color:#fff;">ผู้แนะนำ:</strong> ${member.sponsor} - ${member.sponsorName || 'ไม่ระบุ'}
          </div>
        </div>
      `;

      d.addEventListener('click', () => {
        const details = d.querySelector('.card-details');
        if (details.style.display === 'none') {
           details.style.display = 'block';
           d.style.background = 'rgba(255,255,255,0.06)';
           d.style.boxShadow = '0 10px 20px rgba(0,0,0,0.4)';
        } else {
           details.style.display = 'none';
           d.style.background = '';
           d.style.boxShadow = '';
        }
      });
      return d;
    };

    leftTeam.forEach((m, i) => leftList.appendChild(renderCard(m, i)));
    rightTeam.forEach((m, i) => rightList.appendChild(renderCard(m, i)));
  }

  // Global Toggle Function for Badges
  window.toggleBadge = (memberId, badgeType) => {
    const current = manualBadges[memberId] || [];
    let updated;
    if (current.includes(badgeType)) {
      updated = current.filter(b => b !== badgeType);
    } else {
      updated = [...current, badgeType];
    }
    
    // Save to Local + Firebase
    manualBadges[memberId] = updated;
    localStorage.setItem('manual_badges', JSON.stringify(manualBadges));
    renderDashboard(currentRootId);

    if (db) {
       set(ref(db, `badges/${memberId}`), updated).catch(e => console.error("Firebase Sync Error", e));
    }
  };
});
