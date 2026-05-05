import api from './client';

export async function globalSearch(q) {
  if (!q || !q.trim()) return { incidents: [], investigations: [], capas: [] };
  const params = { search: q.trim(), limit: 5 };
  const [inc, inv, cap] = await Promise.all([
    api.get('/incidents', { params }).then(r => r.data).catch(() => ({ incidents: [] })),
    api.get('/investigations', { params }).then(r => r.data).catch(() => ({ investigations: [] })),
    api.get('/capas', { params }).then(r => r.data).catch(() => ({ capas: [] })),
  ]);
  return {
    incidents: inc.incidents || [],
    investigations: inv.investigations || [],
    capas: cap.capas || [],
  };
}
