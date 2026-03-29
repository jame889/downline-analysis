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
