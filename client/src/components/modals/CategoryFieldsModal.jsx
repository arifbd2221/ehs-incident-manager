// CategoryFieldsModal.jsx — define custom fields per asset category.
//
// SafetyCulture-style: pick a category, add typed fields (text/number/date/
// select/textarea/checkbox), mark required, give helper text. Fields render
// as a dynamic sub-form when creating an asset of that category.
//
// Phase 2 W7 E7.1 (FE part).

import { useState, useEffect, useMemo } from 'react';
import Icon from '../shared/Icon';
import {
  listAssetCategories,
  listCategoryFields,
  addCategoryField,
  updateCategoryField,
  deleteCategoryField,
} from '../../api/asset_categories';

const FIELD_TYPES = [
  { id: 'text',      label: 'Short text',  desc: 'One-line input' },
  { id: 'textarea',  label: 'Long text',   desc: 'Multi-line input' },
  { id: 'number',    label: 'Number',      desc: 'Numeric input' },
  { id: 'date',      label: 'Date',        desc: 'YYYY-MM-DD' },
  { id: 'select',    label: 'Dropdown',    desc: 'One of N options' },
  { id: 'checkbox',  label: 'Checkbox',    desc: 'Yes / no' },
];

export default function CategoryFieldsModal({ onClose }) {
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [draft, setDraft] = useState({
    field_label: '',
    field_type: 'text',
    is_required: false,
    helper_text: '',
    options: '',  // comma-separated string for select
  });
  const [adding, setAdding] = useState(false);

  // Load categories on mount; pick the first one.
  useEffect(() => {
    listAssetCategories().then(cats => {
      setCategories(cats);
      if (cats.length > 0) setActiveCategoryId(cats[0].id);
    }).catch(() => {});
  }, []);

  // Reload fields when the active category changes.
  useEffect(() => {
    if (!activeCategoryId) { setFields([]); return; }
    setLoading(true);
    listCategoryFields(activeCategoryId)
      .then(setFields)
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [activeCategoryId]);

  const activeCategory = useMemo(
    () => categories.find(c => c.id === activeCategoryId) || null,
    [categories, activeCategoryId],
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleAdd = async () => {
    setError(null);
    if (!draft.field_label.trim()) {
      setError('Label is required.');
      return;
    }
    if (draft.field_type === 'select' && !draft.options.trim()) {
      setError('At least one option is required for a dropdown.');
      return;
    }
    setAdding(true);
    try {
      const payload = {
        field_label: draft.field_label.trim(),
        field_type: draft.field_type,
        is_required: !!draft.is_required,
        helper_text: draft.helper_text.trim() || null,
      };
      if (draft.field_type === 'select') {
        payload.options = draft.options.split(',').map(s => s.trim()).filter(Boolean);
      }
      const created = await addCategoryField(activeCategoryId, payload);
      setFields(prev => [...prev, created]);
      setDraft({ field_label: '', field_type: 'text', is_required: false, helper_text: '', options: '' });
      showToast(`Added "${created.field_label}"`);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to add field');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleRequired = async (field) => {
    try {
      const updated = await updateCategoryField(activeCategoryId, field.id, {
        is_required: !field.is_required,
      });
      setFields(prev => prev.map(f => f.id === field.id ? updated : f));
    } catch (e) {
      showToast(e?.response?.data?.error || 'Failed to update');
    }
  };

  const handleDelete = async (field) => {
    if (!confirm(`Delete field "${field.field_label}"? Existing assets keep their stored value but it stops rendering.`)) return;
    try {
      await deleteCategoryField(activeCategoryId, field.id);
      setFields(prev => prev.filter(f => f.id !== field.id));
      showToast(`Removed "${field.field_label}"`);
    } catch (e) {
      showToast(e?.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg cfm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Custom fields per category</div>
            <div className="modal-sub">Define the data captured when an asset is registered in a category</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Category <span className="req">*</span></label>
            <select
              className="select"
              value={activeCategoryId || ''}
              onChange={e => setActiveCategoryId(Number(e.target.value))}
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {activeCategory && (
            <>
              <div className="cfm-section-h">
                <Icon name="settings" size={14}/>
                Fields on <b>{activeCategory.name}</b>
                <span className="cfm-count">{fields.length}</span>
              </div>

              {loading ? (
                <div className="cfm-loading">Loading fields…</div>
              ) : fields.length === 0 ? (
                <div className="cfm-empty">No custom fields yet. Add one below.</div>
              ) : (
                <div className="cfm-fields">
                  {fields.map(f => (
                    <div className="cfm-field" key={f.id}>
                      <div className="cfm-field-main">
                        <div className="cfm-field-label">
                          {f.field_label}
                          <span className={`cfm-type-tag cfm-type-${f.field_type}`}>{f.field_type}</span>
                          {f.is_required && <span className="cfm-req-tag">REQUIRED</span>}
                        </div>
                        {f.helper_text && <div className="cfm-field-helper">{f.helper_text}</div>}
                        {f.field_type === 'select' && f.options && (
                          <div className="cfm-field-options">
                            options: {f.options.join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="cfm-field-actions">
                        <button
                          className={`cfm-toggle ${f.is_required ? 'on' : ''}`}
                          onClick={() => handleToggleRequired(f)}
                          title={f.is_required ? 'Make optional' : 'Make required'}
                        >
                          {f.is_required ? 'Required' : 'Optional'}
                        </button>
                        <button
                          className="cfm-delete"
                          onClick={() => handleDelete(f)}
                          title="Remove this field"
                        >
                          <Icon name="close" size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cfm-add">
                <div className="cfm-add-h">+ Add a new field</div>
                <div className="field-row">
                  <div className="field">
                    <label className="label">Label <span className="req">*</span></label>
                    <input
                      className="input"
                      placeholder="e.g. Max PSI Rating"
                      value={draft.field_label}
                      onChange={e => setDraft(d => ({ ...d, field_label: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Type</label>
                    <select
                      className="select"
                      value={draft.field_type}
                      onChange={e => setDraft(d => ({ ...d, field_type: e.target.value }))}
                    >
                      {FIELD_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {draft.field_type === 'select' && (
                  <div className="field">
                    <label className="label">Options (comma-separated) <span className="req">*</span></label>
                    <input
                      className="input"
                      placeholder="Bronze, Silver, Gold"
                      value={draft.options}
                      onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                    />
                  </div>
                )}

                <div className="field">
                  <label className="label">Helper text <span className="optional">(optional)</span></label>
                  <input
                    className="input"
                    placeholder="Shown under the input on the asset form"
                    value={draft.helper_text}
                    onChange={e => setDraft(d => ({ ...d, helper_text: e.target.value }))}
                  />
                </div>

                <label className="cfm-required-toggle">
                  <input
                    type="checkbox"
                    checked={draft.is_required}
                    onChange={e => setDraft(d => ({ ...d, is_required: e.target.checked }))}
                  />
                  Required when registering an asset
                </label>

                {error && <div className="cfm-error">{error}</div>}

                <button
                  className="btn btn-primary cfm-add-btn"
                  onClick={handleAdd}
                  disabled={adding}
                >
                  <Icon name="plus" size={14}/>
                  {adding ? 'Adding…' : 'Add field'}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-f">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
        {toast && <div className="cfm-toast"><Icon name="check" size={13}/>{toast}</div>}
      </div>
    </div>
  );
}
