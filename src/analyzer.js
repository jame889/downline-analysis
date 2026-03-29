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

  if (rootNode.children.length > 0) traverseAndAnalyze(rootNode.children[0], 'Left');
  if (rootNode.children.length > 1) traverseAndAnalyze(rootNode.children[1], 'Right');
  for (let i = 2; i < rootNode.children.length; i++) {
    const side = i % 2 === 0 ? 'Left' : 'Right';
    traverseAndAnalyze(rootNode.children[i], side); 
  }
  
  // We already skipped inactive nodes during mapping, so the tree is clean.
  const leftTeam = dfsAnalyzed.filter(m => m.team === 'Left' && m.id !== rootId);
  const rightTeam = dfsAnalyzed.filter(m => m.team === 'Right' && m.id !== rootId);
  
  return { leftTeam, rightTeam, rootNode, allAnalyzed: dfsAnalyzed };
}

export function getCoachJoeAdvice(rootId, allMembers, dfsAnalyzed) {
  const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;

  // 1. Gen 1 Metrics (Frontline)
  const gen1Members = allMembers.filter(m => getCleanId(m.sponsor) === rootId);
  const gen1Count = gen1Members.length;
  const gen1Volume = gen1Members.reduce((sum, m) => sum + (parseFloat(m.volL) || 0) + (parseFloat(m.volR) || 0), 0);

  // 2. Next Gen Metrics (Taproot / Depth)
  // dfsAnalyzed already contains all members in the Downline tree of rootId (placement)
  const nextGenMembers = dfsAnalyzed.filter(m => m.id !== rootId);
  const nextGenCount = nextGenMembers.length;
  const nextGenVolume = nextGenMembers.reduce((sum, m) => sum + (parseFloat(m.volL) || 0) + (parseFloat(m.volR) || 0), 0);
  
  // Calculate depth based on standard level distance in binary tree
  let nextGenDepth = 0;
  if (nextGenMembers.length > 0) {
    const rootLevel = dfsAnalyzed.find(m => m.id === rootId)?.level || 0;
    const maxLevel = Math.max(...nextGenMembers.map(m => m.level));
    nextGenDepth = maxLevel - rootLevel;
  }

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

  return advice;
}
