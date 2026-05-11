const KEY = 'ehs_story_progress';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

export function getProgress(storyId) {
  return load()[storyId] || { lastCard: 0, completed: false, exerciseResults: {} };
}

export function getAllProgress() { return load(); }

export function getCompletedCount(stories) {
  const p = load();
  return stories.filter(s => p[s.id]?.completed).length;
}

export function saveCardProgress(storyId, cardIndex) {
  const all = load();
  const cur = all[storyId] || { lastCard: 0, completed: false, exerciseResults: {} };
  cur.lastCard = Math.max(cur.lastCard, cardIndex);
  all[storyId] = cur;
  save(all);
}

export function markComplete(storyId) {
  const all = load();
  const cur = all[storyId] || { lastCard: 0, completed: false, exerciseResults: {} };
  cur.completed = true;
  cur.completedAt = new Date().toISOString();
  all[storyId] = cur;
  save(all);
}

export function saveExerciseResult(storyId, exerciseId, correct, attempts) {
  const all = load();
  const cur = all[storyId] || { lastCard: 0, completed: false, exerciseResults: {} };
  cur.exerciseResults[exerciseId] = { correct, attempts };
  all[storyId] = cur;
  save(all);
}
