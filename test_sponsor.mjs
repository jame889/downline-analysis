import { members } from './src/data.js';

const getCleanId = (str) => str ? String(str).split('\n')[0].trim() : null;

function getSponsorTreeStats(rootId) {
  const map = new Map();
  members.forEach(m => map.set(m.id, { ...m, sponsorChildren: [] }));
  
  // Build sponsor tree
  members.forEach(m => {
    const sponsorId = getCleanId(m.sponsor);
    if (sponsorId && map.has(sponsorId)) {
      map.get(sponsorId).sponsorChildren.push(m.id);
    }
  });

  let maxDepth = 0;
  let totalCount = 0;

  function traverse(id, currentDepth) {
    const node = map.get(id);
    if (!node) return;
    
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    
    node.sponsorChildren.forEach(childId => {
      totalCount++;
      traverse(childId, currentDepth + 1);
    });
  }

  const rootNode = map.get(rootId);
  if (rootNode) {
    rootNode.sponsorChildren.forEach(childId => {
      totalCount++;
      traverse(childId, 1);
    });
  }

  return { maxDepth, totalCount };
}

console.log('Admin:', getSponsorTreeStats('900057'));
console.log('User 900173:', getSponsorTreeStats('900173'));
