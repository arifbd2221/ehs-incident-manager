// AssetTypesModal.jsx — manage asset types (categories) and their fields.
//
// Two-pane layout:
//   - Left: list of asset types with a field-count badge and Default tag
//     for the 6 predefined types. "+ New asset type" affordance below.
//   - Right: the selected type's field definitions, plus an inline
//     "Add field" form. Each field can be toggled required or removed.
//
// Internally categories === asset types. The user-facing copy says
// "asset type" because that's the semantic concept (the thing that has
// fields), and matches SafetyCulture's terminology.
//
// Phase 2 W7 E7.1.

import { useState, useEffect, useMemo } from 'react';
import Icon from '../shared/Icon';
import {
  listAssetCategories,
  createAssetCategory,
  deleteAssetCategory,
  listCategoryFields,
  addCategoryField,
  updateCategoryField,
  deleteCategoryField,
} from '../../api/asset_categories';
import { ASSET_TYPE_TEMPLATES } from '../assets/asset_type_templates';

// Names that come pre-loaded via migration 004. Used to mark them as
// Default in the UI; we still allow soft-delete with a warning so users
// can clean up if they really want.
const PREDEFINED_TYPES = new Set(['Machine', 'Vehicle', 'Building', 'Area', 'Tool', 'Chemical', 'Other']);

const FIELD_TYPES = [
  { id: 'text',     label: 'Short text' },
  { id: 'textarea', label: 'Long text' },
  { id: 'number',   label: 'Number' },
  { id: 'date',     label: 'Date' },
  { id: 'select',   label: 'Dropdown' },
  { id: 'checkbox', label: 'Checkbox' },
];

const EMPTY_DRAFT = {
  field_label: '',
  field_type: 'text',
  is_required: false,
  helper_text: '',
  options: '',
};

export default function AssetTypesModal({ onClose }) {
  const [types, setTypes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [fields, setFields] = useState([]);
  const [fieldCounts, setFieldCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  // start-from picker state. mode = 'blank' | 'existing' | 'template'
  const [startMode, setStartMode] = useState('blank');
  const [startSourceTypeId, setStartSourceTypeId] = useState('');
  const [startTemplateId, setStartTemplateId] = useState('');

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [addingField, setAddingField] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const refreshTypes = async () => {
    const list = await listAssetCategories();
    setTypes(list);
    return list;
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await refreshTypes();
        if (list.length > 0) setActiveId(list[0].id);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) { setFields([]); return; }
    setLoading(true);
    listCategoryFields(activeId)
      .then((list) => {
        setFields(list);
        setFieldCounts(prev => ({ ...prev, [activeId]: list.length }));
      })
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, [activeId]);

  // Lazy-load counts for non-active types so each list row shows an
  // accurate field-count badge.
  useEffect(() => {
    types.forEach(t => {
      if (fieldCounts[t.id] !== undefined) return;
      listCategoryFields(t.id)
        .then(list => setFieldCounts(prev => ({ ...prev, [t.id]: list.length })))
        .catch(() => setFieldCounts(prev => ({ ...prev, [t.id]: 0 })));
    });
  }, [types]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeType = useMemo(
    () => types.find(t => t.id === activeId) || null,
    [types, activeId],
  );
  const isPredefined = (t) => PREDEFINED_TYPES.has(t?.name);

  // Resolve the field set the new type should start with based on the
  // user's "Start from" choice. Returns an array of field-create payloads.
  const resolveStarterFields = async () => {
    if (startMode === 'template' && startTemplateId) {
      const tpl = ASSET_TYPE_TEMPLATES.find(t => t.id === startTemplateId);
      return tpl?.fields || [];
    }
    if (startMode === 'existing' && startSourceTypeId) {
      const sourceFields = await listCategoryFields(Number(startSourceTypeId));
      // Strip ids and clone the relevant fields. Options come back parsed
      // already; the create endpoint also expects them as arrays.
      return sourceFields.map(f => ({
        field_label: f.field_label,
        field_type: f.field_type,
        is_required: !!f.is_required,
        helper_text: f.helper_text || null,
        options: Array.isArray(f.options) ? f.options : (f.options ? [] : undefined),
      }));
    }
    return [];
  };

  const handleAddType = async () => {
    setError(null);
    if (!newName.trim()) { setError('Name is required'); return; }
    setSavingNew(true);
    try {
      const starter = await resolveStarterFields();

      const cat = await createAssetCategory({ name: newName.trim() });

      // Sequentially create starter fields. We don't fail the whole flow
      // if one field create errors — better to show a partial success than
      // lose the just-created category. Errors collected and toasted.
      const errors = [];
      for (const f of starter) {
        try {
          await addCategoryField(cat.id, f);
        } catch (e) {
          errors.push(`${f.field_label}: ${e?.response?.data?.error || 'failed'}`);
        }
      }

      await refreshTypes();
      setActiveId(cat.id);
      setFieldCounts(prev => ({ ...prev, [cat.id]: starter.length - errors.length }));
      setNewName('');
      setStartMode('blank');
      setStartSourceTypeId('');
      setStartTemplateId('');
      setAdding(false);
      showToast(
        starter.length > 0
          ? `Added "${cat.name}" with ${starter.length - errors.length} starter field${starter.length - errors.length === 1 ? '' : 's'}`
          : `Added "${cat.name}"`
      );
      if (errors.length > 0) setError(`Some starter fields failed: ${errors.join(' · ')}`);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to add asset type');
    } finally {
      setSavingNew(false);
    }
  };

  const handleDeleteType = async (t) => {
    const msg = isPredefined(t)
      ? `"${t.name}" is a default type. Archive it anyway? (Existing assets keep working.)`
      : `Archive asset type "${t.name}"? Existing assets keep working.`;
    if (!confirm(msg)) return;
    try {
      await deleteAssetCategory(t.id);
      const list = await refreshTypes();
      if (activeId === t.id) setActiveId(list[0]?.id || null);
      showToast(`Archived "${t.name}"`);
    } catch (e) {
      showToast(e?.response?.data?.error || 'Failed to archive');
    }
  };

  const handleAddField = async () => {
    setError(null);
    if (!draft.field_label.trim()) { setError('Label is required.'); return; }
    if (draft.field_type === 'select' && !draft.options.trim()) {
      setError('At least one option is required for a dropdown.');
      return;
    }
    setAddingField(true);
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
      const created = await addCategoryField(activeId, payload);
      setFields(prev => [...prev, created]);
      setFieldCounts(prev => ({ ...prev, [activeId]: (prev[activeId] || 0) + 1 }));
      setDraft(EMPTY_DRAFT);
      showToast(`Added "${created.field_label}"`);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to add field');
    } finally {
      setAddingField(false);
    }
  };

  const handleToggleRequired = async (field) => {
    try {
      const updated = await updateCategoryField(activeId, field.id, { is_required: !field.is_required });
      setFields(prev => prev.map(f => f.id === field.id ? updated : f));
    } catch (e) {
      showToast(e?.response?.data?.error || 'Failed to update');
    }
  };

  const handleDeleteField = async (field) => {
    if (!confirm(`Delete field "${field.field_label}"? Existing assets keep their stored value but the field stops rendering.`)) return;
    try {
      await deleteCategoryField(activeId, field.id);
      setFields(prev => prev.filter(f => f.id !== field.id));
      setFieldCounts(prev => ({ ...prev, [activeId]: Math.max(0, (prev[activeId] || 1) - 1) }));
      showToast(`Removed "${field.field_label}"`);
    } catch (e) {
      showToast(e?.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="atm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="asset-types-modal-title">
        <div className="atm-header">
          <div>
            <div className="atm-title" id="asset-types-modal-title">Asset types</div>
            <div className="atm-sub">Define the categories your team registers and the fields each one captures</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18}/></button>
        </div>

        <div className="atm-body">
          {/* LEFT — type list */}
          <div className="atm-pane atm-pane-left">
            <div className="atm-pane-h">
              <span>Types</span>
              <span className="atm-count">{types.length}</span>
            </div>

            <div className="atm-type-list">
              {types.map(t => {
                const fc = fieldCounts[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`atm-type-item ${t.id === activeId ? 'is-active' : ''}`}
                    onClick={() => setActiveId(t.id)}
                  >
                    <span className="atm-type-dot" style={{ background: t.color || '#90A4AE' }}/>
                    <span className="atm-type-name">{t.name}</span>
                    {isPredefined(t) && <span className="atm-type-tag">DEFAULT</span>}
                    <span className="atm-type-fc">{fc === undefined ? '…' : `${fc} field${fc === 1 ? '' : 's'}`}</span>
                  </button>
                );
              })}
            </div>

            {!adding && (
              <button className="atm-add-trigger" onClick={() => setAdding(true)}>
                <Icon name="plus" size={14}/> New asset type
              </button>
            )}
          </div>

          {/* RIGHT — fields for selected type */}
          <div className="atm-pane atm-pane-right">
            {adding ? (
              <NewTypeForm
                name={newName}
                setName={setNewName}
                startMode={startMode}
                setStartMode={setStartMode}
                startSourceTypeId={startSourceTypeId}
                setStartSourceTypeId={setStartSourceTypeId}
                startTemplateId={startTemplateId}
                setStartTemplateId={setStartTemplateId}
                existingTypes={types}
                templates={ASSET_TYPE_TEMPLATES}
                error={error}
                saving={savingNew}
                onCancel={() => {
                  setAdding(false);
                  setNewName('');
                  setStartMode('blank');
                  setStartSourceTypeId('');
                  setStartTemplateId('');
                  setError(null);
                }}
                onCreate={handleAddType}
              />
            ) : activeType ? (
              <>
                <div className="atm-pane-h atm-detail-h">
                  <div>
                    <div className="atm-detail-name">
                      <span className="atm-type-dot" style={{ background: activeType.color || '#90A4AE' }}/>
                      {activeType.name}
                      {isPredefined(activeType) && <span className="atm-type-tag">DEFAULT</span>}
                    </div>
                    <div className="atm-detail-sub">
                      Fields rendered when registering an asset of this type
                    </div>
                  </div>
                  <button
                    className="atm-detail-archive"
                    onClick={() => handleDeleteType(activeType)}
                    title="Archive this type"
                  >
                    <Icon name="close" size={14}/>
                  </button>
                </div>

                <div className="atm-fields">
                  {loading ? (
                    <div className="atm-loading">Loading fields…</div>
                  ) : fields.length === 0 ? (
                    <div className="atm-empty">No fields yet — add one below.</div>
                  ) : (
                    fields.map(f => (
                      <div className="atm-field" key={f.id}>
                        <div className="atm-field-main">
                          <div className="atm-field-label">
                            {f.field_label}
                            <span className={`atm-type-pill atm-type-${f.field_type}`}>{f.field_type}</span>
                            {f.is_required && <span className="atm-req-pill">REQUIRED</span>}
                          </div>
                          {f.helper_text && <div className="atm-field-hint">{f.helper_text}</div>}
                          {f.field_type === 'select' && Array.isArray(f.options) && (
                            <div className="atm-field-hint">options: {f.options.join(' · ')}</div>
                          )}
                        </div>
                        <div className="atm-field-actions">
                          <button
                            className={`atm-toggle ${f.is_required ? 'on' : ''}`}
                            onClick={() => handleToggleRequired(f)}
                            title={f.is_required ? 'Make optional' : 'Make required'}
                          >
                            {f.is_required ? 'Required' : 'Optional'}
                          </button>
                          <button className="atm-icon-btn" onClick={() => handleDeleteField(f)} title="Remove">
                            <Icon name="close" size={13}/>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="atm-add-field">
                  <div className="atm-add-field-h">
                    <Icon name="plus" size={13}/> Add a new field to <b>{activeType.name}</b>
                  </div>
                  <div className="atm-add-grid">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Label <span className="req">*</span></label>
                      <input
                        className="input"
                        placeholder="e.g. Max PSI Rating"
                        value={draft.field_label}
                        onChange={e => setDraft(d => ({ ...d, field_label: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Type</label>
                      <select
                        className="select"
                        value={draft.field_type}
                        onChange={e => setDraft(d => ({ ...d, field_type: e.target.value }))}
                      >
                        {FIELD_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
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

                  <label className="atm-required-row">
                    <input
                      type="checkbox"
                      checked={draft.is_required}
                      onChange={e => setDraft(d => ({ ...d, is_required: e.target.checked }))}
                    />
                    Required when registering an asset
                  </label>

                  {error && <div className="atm-error">{error}</div>}

                  <button
                    className="btn btn-primary atm-add-field-btn"
                    onClick={handleAddField}
                    disabled={addingField}
                  >
                    <Icon name="plus" size={13}/>
                    {addingField ? 'Adding…' : 'Add field'}
                  </button>
                </div>
              </>
            ) : (
              <div className="atm-empty atm-empty-large">
                <div className="atm-empty-icon"><Icon name="settings" size={28}/></div>
                <div>Pick an asset type on the left, or create a new one.</div>
              </div>
            )}
          </div>
        </div>

        <div className="atm-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>

        {toast && <div className="atm-toast"><Icon name="check" size={13}/>{toast}</div>}
      </div>
    </div>
  );
}

// Inline new-type form rendered in the right pane while `adding` is true.
// Three "Start from" cards: Blank | From an existing type | From a template.
// On submit, the parent runs handleAddType which clones the chosen field
// set into the new category.
function NewTypeForm({
  name, setName,
  startMode, setStartMode,
  startSourceTypeId, setStartSourceTypeId,
  startTemplateId, setStartTemplateId,
  existingTypes, templates,
  error, saving,
  onCancel, onCreate,
}) {
  const canCreate = !!name.trim() && (
    startMode === 'blank' ||
    (startMode === 'existing' && startSourceTypeId) ||
    (startMode === 'template' && startTemplateId)
  );

  return (
    <div className="atm-newtype">
      <div className="atm-newtype-h">
        <div>
          <div className="atm-newtype-title">New asset type</div>
          <div className="atm-newtype-sub">Pick a starting point — you can add or remove fields after creation</div>
        </div>
      </div>

      <div className="field">
        <label className="label">Name <span className="req">*</span></label>
        <input
          className="input"
          placeholder="e.g. Solar panel array"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field">
        <label className="label">Start from</label>
        <div className="atm-start-grid">
          <button
            type="button"
            className={`atm-start-card ${startMode === 'blank' ? 'is-on' : ''}`}
            onClick={() => setStartMode('blank')}
          >
            <div className="atm-start-icon"><Icon name="plus" size={16}/></div>
            <div>
              <div className="atm-start-title">Blank</div>
              <div className="atm-start-desc">Define every field from scratch</div>
            </div>
          </button>
          <button
            type="button"
            className={`atm-start-card ${startMode === 'existing' ? 'is-on' : ''}`}
            onClick={() => setStartMode('existing')}
          >
            <div className="atm-start-icon"><Icon name="export" size={16}/></div>
            <div>
              <div className="atm-start-title">From existing type</div>
              <div className="atm-start-desc">Copy fields from one of your current types</div>
            </div>
          </button>
          <button
            type="button"
            className={`atm-start-card ${startMode === 'template' ? 'is-on' : ''}`}
            onClick={() => setStartMode('template')}
          >
            <div className="atm-start-icon"><Icon name="settings" size={16}/></div>
            <div>
              <div className="atm-start-title">From template</div>
              <div className="atm-start-desc">Office, IT, lab, forklift, fire safety…</div>
            </div>
          </button>
        </div>
      </div>

      {startMode === 'existing' && (
        <div className="field">
          <label className="label">Source type <span className="req">*</span></label>
          <select
            className="select"
            value={startSourceTypeId}
            onChange={e => setStartSourceTypeId(e.target.value)}
          >
            <option value="">— pick a type —</option>
            {existingTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="helper">All current fields will be cloned into the new type</span>
        </div>
      )}

      {startMode === 'template' && (
        <div className="field">
          <label className="label">Template <span className="req">*</span></label>
          <div className="atm-tpl-grid">
            {templates.map(tpl => (
              <button
                type="button"
                key={tpl.id}
                className={`atm-tpl-card ${startTemplateId === tpl.id ? 'is-on' : ''}`}
                onClick={() => {
                  setStartTemplateId(tpl.id);
                  // helpful default: if the user hasn't named it yet, copy
                  // the template's name as a starting point.
                  if (!name.trim()) setName(tpl.name);
                }}
              >
                <div className="atm-tpl-card-h">
                  <span className="atm-tpl-dot" style={{ background: tpl.color }}/>
                  <span className="atm-tpl-name">{tpl.name}</span>
                  <span className="atm-tpl-fc">{tpl.fields.length}</span>
                </div>
                <div className="atm-tpl-desc">{tpl.description}</div>
                <div className="atm-tpl-fields">
                  {tpl.fields.slice(0, 3).map((f, i) => (
                    <span key={i} className="atm-tpl-field-chip">{f.field_label}</span>
                  ))}
                  {tpl.fields.length > 3 && (
                    <span className="atm-tpl-field-chip atm-tpl-field-chip-more">+{tpl.fields.length - 3} more</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="atm-error">{error}</div>}

      <div className="atm-newtype-actions">
        <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={onCreate} disabled={!canCreate || saving}>
          {saving ? 'Creating…' : (
            <>
              <Icon name="check" size={13}/> Create asset type
            </>
          )}
        </button>
      </div>
    </div>
  );
}
