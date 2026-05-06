import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getInspection, saveInspectionItem, completeInspection, abandonInspection } from '../../api/inspections';
import { getAnswerSets } from '../../api/answer_sets';
import Icon from '../../components/shared/Icon';
import '../../styles/inspections.css';

export default function InspectionEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [inspection, setInspection] = useState(null);
  const [items, setItems] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [answerSets, setAnswerSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [toast, setToast] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showAbandon, setShowAbandon] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState(new Set());

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ins, asData] = await Promise.all([getInspection(id), getAnswerSets()]);
      setInspection(ins);
      setItems(ins.items || []);
      setTemplateItems(ins.template_items || []);
      setAnswerSets(asData.answer_sets || []);
    } catch {
      showToast('Failed to load inspection');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const tiMap = new Map();
  templateItems.forEach(ti => tiMap.set(ti.item_key, ti));

  // Evaluate conditional visibility based on current answers
  const visibleKeys = useMemo(() => {
    const answerMap = new Map();
    for (const item of items) {
      if (item.selected_option_id) answerMap.set(item.item_key, item.selected_option_id);
    }
    const visible = new Set();
    for (const ti of templateItems) {
      if (ti.type === 'section') { visible.add(ti.item_key); continue; }
      const meta = (typeof ti.meta === 'object' && ti.meta) || {};
      const conditions = meta.conditions;
      if (!conditions || conditions.length === 0) { visible.add(ti.item_key); continue; }
      const logic = meta.condition_logic || 'all';
      const results = conditions.map(c => {
        if (!c.source_key || !c.option_id) return true;
        if (!visible.has(c.source_key)) return false;
        return answerMap.get(c.source_key) === c.option_id;
      });
      const pass = logic === 'all' ? results.every(Boolean) : results.some(Boolean);
      if (pass) visible.add(ti.item_key);
    }
    return visible;
  }, [items, templateItems]);

  const sections = templateItems.filter(ti => ti.type === 'section');
  const getQuestions = (sectionKey) => {
    const childKeys = templateItems.filter(ti => ti.parent_key === sectionKey && ti.type !== 'section').map(ti => ti.item_key);
    return items.filter(i => childKeys.includes(i.item_key) && visibleKeys.has(i.item_key));
  };
  const ungroupedKeys = templateItems.filter(ti => !ti.parent_key && ti.type !== 'section').map(ti => ti.item_key);
  const ungrouped = items.filter(i => ungroupedKeys.includes(i.item_key) && visibleKeys.has(i.item_key));

  const getAnswerSetForItem = (itemKey) => {
    const ti = tiMap.get(itemKey);
    if (!ti) return null;
    const meta = typeof ti.meta === 'string' ? JSON.parse(ti.meta || '{}') : (ti.meta || {});
    if (!meta.answer_set_id) return null;
    return answerSets.find(a => a.id === meta.answer_set_id) || null;
  };

  const isAnswered = (item) => !!(item.selected_option_id || (item.response_text && item.response_text.trim()));
  const visibleItems = items.filter(i => i.type !== 'section' && visibleKeys.has(i.item_key));
  const answeredCount = visibleItems.filter(isAnswered).length;
  const totalQuestions = visibleItems.length;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const isComplete = progressPct === 100;

  const getSectionProgress = (sectionItems) => {
    if (sectionItems.length === 0) return 0;
    const answered = sectionItems.filter(isAnswered).length;
    return Math.round((answered / sectionItems.length) * 100);
  };

  const flashSaved = (itemKey) => {
    setSaved(itemKey);
    setTimeout(() => setSaved(null), 1500);
  };

  const handleAnswer = async (itemKey, optionId, option) => {
    setSaving(itemKey);
    const existing = items.find(i => i.item_key === itemKey);
    try {
      const updated = await saveInspectionItem(id, itemKey, {
        selected_option_id: optionId,
        response_text: existing?.response_text || null,
        is_flagged: existing?.is_flagged || false,
        is_failed: option?.is_failed ? true : false,
        notes: existing?.notes || null,
      });
      setItems(prev => prev.map(i => i.item_key === itemKey ? { ...i, ...updated } : i));
      flashSaved(itemKey);
    } catch {
      showToast('Failed to save answer');
    } finally {
      setSaving(null);
    }
  };

  const handleTextResponse = async (itemKey, text) => {
    const existing = items.find(i => i.item_key === itemKey);
    setItems(prev => prev.map(i => i.item_key === itemKey ? { ...i, response_text: text } : i));
    try {
      await saveInspectionItem(id, itemKey, {
        selected_option_id: existing?.selected_option_id || null,
        response_text: text,
        is_flagged: existing?.is_flagged || false,
        is_failed: existing?.is_failed || false,
        notes: existing?.notes || null,
      });
    } catch {}
  };

  const handleNotes = async (itemKey, notes) => {
    const existing = items.find(i => i.item_key === itemKey);
    setItems(prev => prev.map(i => i.item_key === itemKey ? { ...i, notes } : i));
    try {
      await saveInspectionItem(id, itemKey, {
        selected_option_id: existing?.selected_option_id || null,
        response_text: existing?.response_text || null,
        is_flagged: existing?.is_flagged || false,
        is_failed: existing?.is_failed || false,
        notes,
      });
    } catch {}
  };

  const handleFlag = async (itemKey) => {
    const existing = items.find(i => i.item_key === itemKey);
    const newFlag = !existing?.is_flagged;
    setItems(prev => prev.map(i => i.item_key === itemKey ? { ...i, is_flagged: newFlag ? 1 : 0 } : i));
    try {
      await saveInspectionItem(id, itemKey, {
        selected_option_id: existing?.selected_option_id || null,
        response_text: existing?.response_text || null,
        is_flagged: newFlag,
        is_failed: existing?.is_failed || false,
        notes: existing?.notes || null,
      });
    } catch {}
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeInspection(id);
      showToast('Inspection completed!');
      navigate(`/inspections/${id}/report`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to complete');
    } finally {
      setCompleting(false);
      setShowComplete(false);
    }
  };

  const handleAbandon = async () => {
    setCompleting(true);
    try {
      await abandonInspection(id);
      showToast('Inspection abandoned');
      navigate('/inspections');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to abandon');
    } finally {
      setCompleting(false);
      setShowAbandon(false);
    }
  };

  const toggleNotes = (key) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="page ie-page">
        <div className="tp-skel" style={{ width: '100%', height: 6, borderRadius: 3, marginBottom: 28 }} />
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div className="tp-skel" style={{ width: 38, height: 38, borderRadius: 8 }} />
          <div><div className="tp-skel" style={{ width: 200, height: 18 }} /><div className="tp-skel" style={{ width: 120, height: 12, marginTop: 6 }} /></div>
        </div>
        {[1, 2].map(i => (
          <div key={i} className="tp-skel" style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 16 }} />
        ))}
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="page ie-page">
        <div className="ip-empty">
          <div className="ip-empty-title">Inspection not found</div>
          <button className="btn btn-primary" onClick={() => navigate('/inspections')}>Back to Inspections</button>
        </div>
      </div>
    );
  }

  const isEditable = inspection.status === 'in_progress';

  const renderQuestion = (item, qNum) => {
    const ti = tiMap.get(item.item_key);
    const as = getAnswerSetForItem(item.item_key);
    const isFlagged = item.is_flagged === 1;
    const isFailed = item.is_failed === 1;
    const answered = isAnswered(item);
    const notesOpen = expandedNotes.has(item.item_key) || !!item.notes;
    const meta = (typeof ti?.meta === 'object' && ti?.meta) || {};
    const isConditional = meta.conditions?.length > 0;

    return (
      <div key={item.item_key} className={`ie-question ${answered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''} ${isFailed ? 'failed' : ''} ${isConditional ? 'ie-question--conditional' : ''}`}>
        <div className={`ie-save-indicator ${saved === item.item_key ? 'visible' : ''}`}>
          <Icon name="check" size={12} /> Saved
        </div>

        <div className="ie-question-label">
          <span className="ie-question-num">{qNum}.</span>
          <span>{ti?.label || 'Question'}</span>
          {ti?.required ? <span className="req">*</span> : null}
        </div>

        {as && (
          <div className="ie-options">
            {as.options.map(opt => (
              <button
                key={opt.id}
                className={`ie-opt ${item.selected_option_id === opt.id ? 'selected' : ''} ${saving === item.item_key ? 'ie-opt-saving' : ''}`}
                style={{ '--opt-color': opt.color }}
                onClick={() => isEditable && handleAnswer(item.item_key, opt.id, opt)}
                disabled={!isEditable || saving === item.item_key}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {(ti?.type === 'text' || (!as && ti?.type === 'question')) && (
          <textarea
            className="ie-text-input"
            value={item.response_text || ''}
            onChange={e => handleTextResponse(item.item_key, e.target.value)}
            placeholder="Enter response..."
            disabled={!isEditable}
          />
        )}

        {ti?.type === 'checkbox' && (
          <label className="ie-checkbox">
            <input
              type="checkbox"
              checked={!!item.response_text}
              onChange={e => handleTextResponse(item.item_key, e.target.checked ? 'checked' : '')}
              disabled={!isEditable}
            />
            <span className="ie-checkbox-track" />
            {ti.label || 'Check'}
          </label>
        )}

        <div className="ie-question-actions">
          {isEditable && (
            <>
              <button className={`ie-notes-toggle ${notesOpen ? 'active' : ''}`} onClick={() => toggleNotes(item.item_key)}>
                <Icon name="edit" size={12} /> {expandedNotes.has(item.item_key) ? 'Hide notes' : 'Add notes'}
              </button>
              <button className={`ie-flag-btn ${isFlagged ? 'active' : ''}`} onClick={() => handleFlag(item.item_key)}>
                <Icon name="warning" size={12} /> {isFlagged ? 'Flagged' : 'Flag'}
              </button>
            </>
          )}
          {!isEditable && isFlagged && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sds-warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="warning" size={12} /> Flagged
            </span>
          )}
        </div>

        <div className={`ie-notes-area ${notesOpen ? 'open' : ''}`}>
          <textarea
            value={item.notes || ''}
            onChange={e => handleNotes(item.item_key, e.target.value)}
            placeholder="Add notes or observations..."
            disabled={!isEditable}
          />
        </div>
      </div>
    );
  };

  const renderSection = (key, sectionLabel, sectionItems, icon, sIdx) => {
    const secProgress = getSectionProgress(sectionItems);
    const secComplete = secProgress === 100;
    return (
      <div key={key} className="ie-section" style={sIdx > 0 ? { animationDelay: `${sIdx * 60}ms` } : undefined}>
        <div className="ie-section-head">
          <Icon name={icon} size={16} /> {sectionLabel}
          <span className="ie-section-count">{sectionItems.length}</span>
          <div className="ie-section-progress">
            <div className={`ie-section-progress-fill ${secComplete ? 'complete' : ''}`} style={{ width: `${secProgress}%` }} />
          </div>
        </div>
        <div className="ie-section-body">
          {sectionItems.map(item => renderQuestion(item, ++questionNum))}
        </div>
      </div>
    );
  };

  let questionNum = 0;

  return (
    <div className="page ie-page">
      {/* Progress Bar */}
      <div className="ie-progress-wrap">
        <div className="ie-progress-info">
          <span className="ie-progress-label">{answeredCount} of {totalQuestions} answered</span>
          <span className={`ie-progress-pct ${isComplete ? 'complete' : ''}`}>{progressPct}%</span>
        </div>
        <div className="ie-progress-bar">
          <div className={`ie-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Header */}
      <div className="ie-header">
        <div className="ie-header-left">
          <button className="ie-back" onClick={() => navigate('/inspections')}>
            <Icon name="arrowL" size={18} />
          </button>
          <div>
            <div className="ie-title">{inspection.title}</div>
            <div className="ie-number">
              {inspection.inspection_number} &middot; {inspection.template_name}
              {inspection.template_version_number && <span className="ie-version-tag">v{inspection.template_version_number}</span>}
            </div>
          </div>
        </div>
        <div className="ie-header-actions">
          <span className={`ip-status ip-status-${inspection.status}`}>
            <span className="dot" /> {inspection.status === 'in_progress' ? 'In Progress' : inspection.status}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="ie-sections">
        {ungrouped.length > 0 && renderSection('_ungrouped', 'General', ungrouped, 'file', 0)}

        {sections.map((sec, sIdx) => {
          const questions = getQuestions(sec.item_key);
          if (questions.length === 0) return null;
          return renderSection(sec.item_key, sec.label || 'Untitled Section', questions, 'shield', sIdx + (ungrouped.length > 0 ? 1 : 0));
        })}
      </div>

      {/* Footer */}
      {isEditable && (
        <div className="ie-footer">
          <button className="ie-btn-abandon" onClick={() => setShowAbandon(true)}>
            <Icon name="close" size={14} /> Abandon
          </button>
          <button className="ie-btn-complete" onClick={() => setShowComplete(true)}>
            <Icon name="check" size={16} /> Complete Inspection
          </button>
        </div>
      )}

      {!isEditable && (
        <div className="ie-footer">
          <button className="btn btn-secondary" onClick={() => navigate('/inspections')}>
            <Icon name="arrowL" size={14} /> Back to List
          </button>
          {inspection.status === 'completed' && (
            <button className="ie-btn-complete" onClick={() => navigate(`/inspections/${id}/report`)}>
              <Icon name="reports" size={16} /> View Report
            </button>
          )}
        </div>
      )}

      {/* Complete Modal */}
      {showComplete && createPortal(
        <div className="modal-backdrop" onClick={() => setShowComplete(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div>
                <div className="modal-title">Complete Inspection</div>
                <div className="modal-sub">Mark this inspection as finished</div>
              </div>
              <button className="icon-btn" onClick={() => setShowComplete(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="te-publish-info" style={{ background: 'var(--sds-brand-primary-tint)', borderColor: 'rgba(98,109,249,0.15)' }}>
                <strong>{answeredCount}</strong> of <strong>{totalQuestions}</strong> questions answered ({progressPct}%).
                {answeredCount < totalQuestions && (
                  <div style={{ marginTop: 8, color: 'var(--sds-warning)' }}>
                    <Icon name="warning" size={14} /> Some questions remain unanswered.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setShowComplete(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleComplete} disabled={completing}>
                {completing ? 'Completing...' : 'Complete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Abandon Modal */}
      {showAbandon && createPortal(
        <div className="modal-backdrop" onClick={() => setShowAbandon(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div>
                <div className="modal-title">Abandon Inspection</div>
                <div className="modal-sub">This cannot be undone</div>
              </div>
              <button className="icon-btn" onClick={() => setShowAbandon(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                Are you sure you want to abandon this inspection? All progress will be saved but the inspection will be marked as abandoned.
              </p>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setShowAbandon(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleAbandon} disabled={completing}>
                {completing ? 'Abandoning...' : 'Abandon Inspection'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && <div className="toast"><Icon name="check" size={16} /> {toast}</div>}
    </div>
  );
}
