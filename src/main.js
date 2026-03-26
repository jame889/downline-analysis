import { members } from './data.js';
import { analyzeDownline } from './analyzer.js';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginOverlay = document.getElementById('login-overlay');
  const appContainer = document.getElementById('app-container');
  const loginError = document.getElementById('login-error');

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

  // Render Dashboard
  function renderDashboard(rootId) {
    const { leftTeam, rightTeam, rootNode } = analyzeDownline(members, rootId);

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
    leftList.innerHTML = ''; // clear any existing data
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
});
