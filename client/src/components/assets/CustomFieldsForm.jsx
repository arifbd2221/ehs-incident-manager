// CustomFieldsForm.jsx — render the dynamic per-category inputs.
//
// Used inside the asset create/edit modal. Driven by the field defs
// returned from /api/asset-categories/:id/fields. Each input writes back
// into a flat values object keyed by field_key.
//
// Phase 2 W7 E7.1.

import Icon from '../shared/Icon';

export default function CustomFieldsForm({ fields, values, onChange, error }) {
  if (!fields || fields.length === 0) return null;

  const set = (key, val) => onChange({ ...(values || {}), [key]: val });

  return (
    <div className="cff-wrap">
      <div className="cff-header">
        <Icon name="settings" size={14}/>
        <span>Asset type details</span>
        <span className="cff-count">{fields.length} field{fields.length > 1 ? 's' : ''}</span>
      </div>
      <div className="cff-grid">
        {fields.map(f => (
          <CustomField key={f.id} field={f} value={values?.[f.field_key]} onChange={v => set(f.field_key, v)}/>
        ))}
      </div>
      {error && <div className="cff-error">{error}</div>}
    </div>
  );
}

function CustomField({ field, value, onChange }) {
  const id = `cff-${field.id}`;
  const reqStar = field.is_required ? <span className="req">*</span> : null;
  return (
    <div className={`field cff-field cff-field-${field.field_type}`}>
      <label className="label" htmlFor={id}>
        {field.field_label} {reqStar}
      </label>
      {field.field_type === 'textarea' ? (
        <textarea
          id={id}
          className="textarea"
          rows={3}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      ) : field.field_type === 'select' ? (
        <select
          id={id}
          className="select"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.field_type === 'checkbox' ? (
        <label className="cff-checkbox-row">
          <input
            id={id}
            type="checkbox"
            checked={value === true || value === 1 || value === '1' || value === 'true'}
            onChange={e => onChange(e.target.checked)}
          />
          <span>{field.helper_text || 'Yes'}</span>
        </label>
      ) : field.field_type === 'number' ? (
        <input
          id={id}
          className="input"
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      ) : field.field_type === 'date' ? (
        <input
          id={id}
          className="input"
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="input"
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.field_type !== 'checkbox' && field.helper_text && (
        <span className="helper">{field.helper_text}</span>
      )}
    </div>
  );
}
