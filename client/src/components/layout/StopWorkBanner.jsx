// StopWorkBanner.jsx — thin red bar at the top of every protected page.
//
// If any incident in the user's org has stop_work_status='active', the
// banner shows the count and a click-target that navigates to the most
// recent active stop-work. Hidden when there are none. Polls on mount
// and whenever the refreshKey ticks (after a stop-work is submitted /
// resolved, the AppContext fires triggerRefresh).
//
// Phase 2 follow-up: UX-H. Dashboard had its own active-stop-works card
// already; this is the *cross-page* presence that ensures every screen
// surfaces an unresolved imminent-danger condition.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listActiveStopWorks } from '../../api/stop_work';
import { useApp } from '../../context/AppContext';
import Icon from '../shared/Icon';

export default function StopWorkBanner() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const [active, setActive] = useState([]);

  const load = useCallback(() => {
    listActiveStopWorks()
      .then(setActive)
      .catch(() => setActive([]));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Poll every 30s so a stop-work submitted from another browser tab /
  // user shows up promptly without a manual refresh. Cheap (single GET
  // with limit=5).
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (active.length === 0) return null;

  const first = active[0];
  const handleClick = () => navigate(`/incidents/${first.id}`);

  return (
    <button
      type="button"
      className="swb"
      onClick={handleClick}
      aria-label={
        active.length === 1
          ? `Active stop-work at ${first.area || 'a site'} — click to open`
          : `${active.length} active stop-works — click to open the most recent`
      }
    >
      <span className="swb-pulse"/>
      <Icon name="warning" size={14}/>
      <span className="swb-label">
        {active.length === 1
          ? <>STOP WORK active{first.area ? ` — ${first.area}` : ''}</>
          : <>{active.length} STOP WORKS active</>}
      </span>
      <span className="swb-meta">{first.incident_number}{first.site_name ? ` · ${first.site_name}` : ''}</span>
      <span className="swb-cta">Open <Icon name="arrow" size={11}/></span>
    </button>
  );
}
