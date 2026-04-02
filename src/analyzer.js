export function analyzeDownline(members, rootId) {
  const membersMap = new Map();
  members.forEach(m => membersMap.set(m.id, { ...m, children: [] }));

  let rootNode = membersMap.get(rootId);
  if (!rootNode) return { leftTeam: [], rightTeam: [], rootNode: null, allAnalyzed: [] };

  const isActive = (m) => {
    // กรองคนที่มีจุดแดง 2 จุดออกจากการทำงาน (ถือเป็น Inactive และข้ามชั้นไปเลย)
    if (m.dots && m.dots[0] === 'red' && m.dots[1] === 'red') {
      return false;
    }
    return m.volL > 0 || m.volR > 0 || m.id === rootId;
  };

  // Helper to trace if a node is functionally underneath the dynamic rootId
  function isUnderRoot(startNode) {
    if (startNode.id === rootId) return true;
    const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;
    let curr = getCleanId(startNode.upline) || getCleanId(startNode.sponsor);
    let limit = 1000;
    while (curr && limit-- > 0) {
      if (curr === rootId) return true;
      let p = membersMap.get(curr);
      if (!p) break;
      curr = getCleanId(p.upline) || getCleanId(p.sponsor);
    }
    // Specific Fallback: If logged in as sweeping admin (900057), all data inherently belongs to them
    if (rootId === '900057') return true;
    return false;
  }

  // Build tree based on strict Upline relationships, skipping inactive uplines
  membersMap.forEach(m => {
    if (m.id !== rootId && isActive(m)) {
      
      // ONLY process if they are actually in the downline of the logged in user
      if (!isUnderRoot(m)) return;
      
      let parent = null;
      const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;
      let currUplineId = getCleanId(m.upline) || getCleanId(m.sponsor);
      let limit = 1000;
      
      while (currUplineId && limit-- > 0) {
        let p = membersMap.get(currUplineId);
        if (!p) break; 
        
        if (isActive(p) && isUnderRoot(p)) {
          parent = p;
          break;
        }
        currUplineId = getCleanId(p.upline) || getCleanId(p.sponsor);
      }

      if (!parent) parent = rootNode;
      parent.children.push(m);
    }
  });

  // Assign Team Side and Flatten with DFS for correct Upline order
  const dfsAnalyzed = [];
  function traverseAndAnalyze(node, team) {
    node.team = team;
    const imbalance = Math.abs(node.volL - node.volR);
    const powerLeg = node.volL > node.volR ? 'Left' : (node.volR > node.volL ? 'Right' : 'Balanced');
    const totalVol = node.volL + node.volR;
    
    // Automated Badges Removed (Now 100% Manual)
    const badges = [];
    
    node.badges = badges;
    node.imbalance = imbalance;
    node.powerLeg = powerLeg;
    node.totalVol = totalVol;
    node.score = totalVol === 0 ? 0 : Math.round(imbalance * 1.5 + node.level * 100); 

    dfsAnalyzed.push(node);
    
    // Traverse downlines so they are correctly ordered under their upline
    node.children.forEach(c => traverseAndAnalyze(c, team));
  }
  
  // Process Root Node
  rootNode.team = 'Root';
  rootNode.imbalance = Math.abs(rootNode.volL - rootNode.volR);
  rootNode.powerLeg = rootNode.volL > rootNode.volR ? 'Left' : (rootNode.volR > rootNode.volL ? 'Right' : 'Balanced');
  rootNode.totalVol = rootNode.volL + rootNode.volR;
  rootNode.score = rootNode.totalVol === 0 ? 0 : Math.round(rootNode.imbalance * 1.5 + rootNode.level * 100);
  
  rootNode.badges = []; // Reset root badges

  dfsAnalyzed.push(rootNode);

  if (rootNode.children.length > 0) {
    rootNode.children.forEach((child, index) => {
      // Heuristic: First child is Left, Second is Right
      // (Override if pos explicitly contains side, though uncommon in this report)
      const p = String(child.pos || '').toLowerCase();
      let side = (index === 0) ? 'Left' : 'Right';
      
      if (p.includes('ขวา') || p.includes('right') || p === 'r') side = 'Right';
      else if (p.includes('ซ้าย') || p.includes('left') || p === 'l') side = 'Left';
      
      traverseAndAnalyze(child, side);
    });
  }
  
  // We already skipped inactive nodes during mapping, so the tree is clean.
  const leftTeam = dfsAnalyzed.filter(m => m.team === 'Left' && m.id !== rootId);
  const rightTeam = dfsAnalyzed.filter(m => m.team === 'Right' && m.id !== rootId);
  
  return { leftTeam, rightTeam, rootNode, allAnalyzed: dfsAnalyzed };
}

export function getSponsorTreeStats(rootId, allMembers) {
  const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;
  const map = new Map();
  allMembers.forEach(m => map.set(m.id, { ...m, sponsorChildren: [] }));
  
  allMembers.forEach(m => {
    const sponsorId = getCleanId(m.sponsor);
    if (sponsorId && map.has(sponsorId)) {
      map.get(sponsorId).sponsorChildren.push(m.id);
    }
  });

  let maxDepth = 0;
  let totalCount = 0;
  let totalVolume = 0;

  function traverse(id, currentDepth) {
    const node = map.get(id);
    if (!node) return;
    
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    
    node.sponsorChildren.forEach(childId => {
      totalCount++;
      const childNode = map.get(childId);
      if (childNode) totalVolume += (parseFloat(childNode.volL) || 0) + (parseFloat(childNode.volR) || 0);
      traverse(childId, currentDepth + 1);
    });
  }

  const rootNode = map.get(rootId);
  if (rootNode) {
    rootNode.sponsorChildren.forEach(childId => {
      totalCount++;
      const childNode = map.get(childId);
      if (childNode) totalVolume += (parseFloat(childNode.volL) || 0) + (parseFloat(childNode.volR) || 0);
      traverse(childId, 1);
    });
  }

  return { maxDepth, totalCount, totalVolume };
}

export function getCoachJoeAdvice(rootId, allMembers, dfsAnalyzed, balanceStats) {
  const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;

  // 1. Gen 1 Metrics (Frontline - Only those personally sponsored)
  const gen1Members = allMembers.filter(m => getCleanId(m.sponsor) === rootId);
  const gen1Count = gen1Members.length;
  const gen1Volume = gen1Members.reduce((sum, m) => sum + (parseFloat(m.volL) || 0) + (parseFloat(m.volR) || 0), 0);

  // 2. Next Gen Metrics (Taproot / Depth - using pure Sponsorship Tree)
  const sponsorStats = getSponsorTreeStats(rootId, allMembers);
  const nextGenDepth = sponsorStats.maxDepth;
  const nextGenCount = sponsorStats.totalCount - gen1Count; // Exclude direct gen1 from "nextGen" count
  const nextGenVolume = sponsorStats.totalVolume - gen1Volume;


  // 3. Logic & Recommendation Rules based on Coach JOE's Hybrid Plan
  let advice = {};

  if (gen1Count < 2) {
    advice = {
      level: 'Spark',
      title: 'Hybrid Step 1: จุดไฟด้วยสปอนเซอร์ส่วนตัว',
      message: 'คุณยังมี Gen 1 น้อยเกินไป (ขาดหน้ากว้าง)! กฎข้อ 1: "คุณต้องไม่หยุดสปอนเซอร์ส่วนตัว" เพื่อหาวัตถุดิบ เติมเลือดใหม่ และสร้างตัวอย่างการทำงาน (Lead by Example) ให้กับตั้วเองและทีมงาน',
      image: './assets/coachjoe/step1.jpg',
      color: '#eab308', // Gold
      stats: { gen1Count, gen1Volume, nextGenDepth, nextGenCount, nextGenVolume }
    };
  } else if (gen1Count >= 2 && nextGenDepth < 3) {
    advice = {
      level: 'Taproot',
      title: 'Hybrid Step 2: ขุดลึกทันทีภายใน 48 ชั่วโมง',
      message: 'คุณมี Gen 1 แล้ว! แต่รากฐานยังไม่ลึกพอ แนะนำให้รีบทำ "Work Plan" ดึงรายชื่อจาก Gen 1 ของคุณ และช่วยเขาสปอนเซอร์ต่อให้ได้ภายใน 48 ชั่วโมง เพื่อเปลี่ยนมือใหม่ให้กลายเป็น "ความลึก"',
      image: './assets/coachjoe/step2.jpg',
      color: '#f97316', // Orange
      stats: { gen1Count, gen1Volume, nextGenDepth, nextGenCount, nextGenVolume }
    };
  } else if (nextGenDepth >= 3 && nextGenDepth < 6 && nextGenCount < 20) {
    advice = {
      level: 'StopDigging',
      title: 'Hybrid Step 3: กฎการหยดขุด (When to Stop Digging)',
      message: `สายลึกเริ่มมาแล้ว (ปัจจุบันลึก ${nextGenDepth} ชั้น)! ขุดลึกลงไปจนกว่าจะเจอ "ผู้นำที่ทำงานแทนคุณได้" อย่างน้อย 2-3 คน (Safe Zone) เมื่อสายงาน Secured คุณจึงค่อยย้ายโฟกัสไปขยายหน้ากว้างอื่น`,
      image: './assets/coachjoe/step3.jpg',
      color: '#3b82f6', // Blue
      stats: { gen1Count, gen1Volume, nextGenDepth, nextGenCount, nextGenVolume }
    };
  } else {
    advice = {
      level: 'Synthesis',
      title: 'The Synthesis: สถาปัตยกรรมแห่งความสำเร็จ',
      message: 'สุดยอด! สถาปัตยกรรมองค์กรของคุณมั่นคงมาก ผสานกลยุทธ์ Hybrid ได้อย่างสมบูรณ์แบบ ทั้ง Speed (20% Frontline) และ Stability (80% Taprooting) ยกระดับองค์กรนี้เพื่อการเกษียณถาวร!',
      image: './assets/coachjoe/synthesis.jpg',
      color: '#10b981', // Emerald Green
      stats: { gen1Count, gen1Volume, nextGenDepth, nextGenCount, nextGenVolume }
    };
  }

  // 4. Balance Analysis (Left vs Right)
  if (balanceStats) {
    const { left5Core, right5Core, volL, volR } = balanceStats;
    const diff5Core = Math.abs(left5Core - right5Core);
    const powerLeg = volL > volR ? 'ซ้าย' : (volR > volL ? 'ขวา' : 'สมดุล');
    const weakLeg = volL > volR ? 'ขวา' : (volR > volL ? 'ซ้าย' : 'สมดุล');
    
    let balanceMessage = `<br/><br/><div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--advice-color, #fff); margin-top: 1rem;">`;
    balanceMessage += `<strong style="color:#fff;">⚖️ การวิเคราะห์ความสมดุล (Balance):</strong><br/>`;
    balanceMessage += `<ul style="margin-top: 0.5rem; padding-left: 1.2rem; color: #cbd5e1; font-size: 0.95rem; display: flex; flex-direction: column; gap: 0.5rem;">`;
    
    // 5Core Analysis
    if ((left5Core + right5Core) > 0) {
      balanceMessage += `<li>คุณมีผู้นำ 5Core จำนวน <strong>${left5Core + right5Core} คน</strong> (ซ้าย: ${left5Core}, ขวา: ${right5Core})</li>`;
      if (diff5Core >= 2) {
        const weak5CoreSide = left5Core > right5Core ? 'ขวา' : 'ซ้าย';
        balanceMessage += `<li>⚠️ <strong>ความเสี่ยง:</strong> ผู้นำ 5Core <u>ฝั่ง${weak5CoreSide}</u> น้อยกว่าหน้ากว้าง แนะนำให้ลงไป Focus สร้างผู้นำฝั่ง${weak5CoreSide}เพิ่มด่วนเพื่อ Balance ธุรกิจ</li>`;
      } else {
        balanceMessage += `<li>✅ จำนวนผู้นำ 5Core ของคุณกระจายตัวได้สมดุลดีแล้ว</li>`;
      }
    } else {
      balanceMessage += `<li>⚠️ คุณยังไม่มีผู้นำระดับ 5Core ในทีม รีบค้นหาและพัฒนาผู้นำด่วน!</li>`;
    }
    
    // Volume Analysis
    if (volL !== volR && (volL > 0 || volR > 0)) {
       balanceMessage += `<li>💡 คะแนนทีมแข็งของคุณคือ <strong>ฝั่ง${powerLeg}</strong> แนะนำให้ลงไปช่วยกระตุ้นทีม <strong>ฝั่ง${weakLeg}</strong> เพื่อเพิ่ม Matching Bonus รายวัน</li>`;
    } else if (volL > 0 && volR > 0) {
       balanceMessage += `<li>✅ คะแนนทั้งสองฝั่งของคุณ (ซ้าย-ขวา) มีความสมดุลดีมาก รักษาโมเมนตัมนี้ไว้!</li>`;
    }
    
    balanceMessage += `</ul></div>`;
    advice.message += balanceMessage;
  }

  return advice;
}

export function getAdvancedAnalysis(rootNode, dfsAnalyzed, allMembers, leftTeam, rightTeam) {
  const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;
  
  // 1. Matching Target
  const volL = rootNode ? rootNode.volL : 0;
  const volR = rootNode ? rootNode.volR : 0;
  const diffVol = Math.abs(volL - volR);
  const weakLegName = volL < volR ? 'ซ้าย' : (volR < volL ? 'ขวา' : '-');
  const powerLegVol = Math.max(volL, volR);

  // Pre-calculate sponsors count for each member to evaluate drivers
  const sponsorCountMap = {};
  allMembers.forEach(m => {
    const sId = getCleanId(m.sponsor);
    if (sId) { sponsorCountMap[sId] = (sponsorCountMap[sId] || 0) + 1; }
  });

  // 2. The "Free-Rider" vs "Driver"
  let drivers = 0;
  let freeRiders = 0;
  let sleepingNodes = 0;
  
  dfsAnalyzed.forEach(m => {
    if (m.id === rootNode?.id) return;
    const sCount = sponsorCountMap[m.id] || 0;
    const mVolL = parseFloat(m.volL) || 0;
    const mVolR = parseFloat(m.volR) || 0;
    
    // Driver: decent balance & sponsoring
    if (sCount > 0 && mVolL > 0 && mVolR > 0) {
       const ratio = Math.min(mVolL, mVolR) / Math.max(mVolL, mVolR);
       if (ratio > 0.1) drivers++;
    }
    // Free rider / Sleeping: one leg > 10,000, other leg == 0, no sponsors
    if (sCount === 0 && ((mVolL > 10000 && mVolR === 0) || (mVolR > 10000 && mVolL === 0))) {
       freeRiders++;
       sleepingNodes++;
    }
  });

  // 3. Momentum Index (Volume from deep levels)
  const maxLevel = Math.max(...dfsAnalyzed.map(m => m.level)) || 0;
  const rootLvl = rootNode?.level || 0;
  const placementDepth = maxLevel - rootLvl;
  
  let deepVol = 0;
  let totalDescVol = 0;
  dfsAnalyzed.forEach(m => {
    if (m.id === rootNode?.id) return;
    const mVol = (parseFloat(m.volL) || 0) + (parseFloat(m.volR) || 0);
    totalDescVol += mVol;
    // Bottom 2 levels
    if (m.level >= maxLevel - 1) {
      deepVol += mVol;
    }
  });
  const momentumPercent = totalDescVol > 0 ? ((deepVol / totalDescVol) * 100).toFixed(1) : 0;

  // 4. Leadership Duplication
  const teamMap = new Map();
  [...leftTeam, ...rightTeam].forEach(m => teamMap.set(m.id, m));
  
  let leaderFactories = 0;
  teamMap.forEach(m => {
    if (m.badges && m.badges.includes('5core')) {
      // Find m's sponsored children who are ALSO in the team and are 5core
      const sponsoredDwn = allMembers.filter(child => getCleanId(child.sponsor) === m.id);
      const has5CoreChild = sponsoredDwn.some(child => {
         const tChild = teamMap.get(child.id);
         return tChild && tChild.badges && tChild.badges.includes('5core');
      });
      if (has5CoreChild) leaderFactories++;
    }
  });

  return {
    diffVol,
    weakLegName,
    powerLegVol,
    drivers,
    freeRiders,
    momentumPercent,
    placementDepth,
    leaderFactories,
    sleepingNodes
  };
}
