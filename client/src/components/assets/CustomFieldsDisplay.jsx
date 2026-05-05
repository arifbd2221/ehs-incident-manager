// CustomFieldsDisplay.jsx — read-only display of an asset's custom fields.
//
// Used on the AssetDetail overview tab. Walks the category's current field
// definitions (so deleted fields aren't shown) and displays the stored
// value formatted for the type.
//
// Phase 2 W7 E7.1.

import Icon from '../shared/Icon';

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field.field_type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.field_type === 'date') return String(value).slice(0, 10);
  return String(value);
}

export default function CustomFieldsDisplay({ fields, values }) {
  if (!fields || fields.length === 0) return null;
  const v = values || {};

  return (
    <div className="card card-pad">
      <div className="card-h">
        <Icon name="settings" size={16}/> Asset type details
      </div>
      {fields.map(f => (
        <div className="kv" key={f.id}>
          <div className="kv-k">{f.field_label}</div>
          <div className="kv-v">
            {formatValue(f, v[f.field_key])}
            {f.is_required && (v[f.field_key] === null || v[f.field_key] === undefined || v[f.field_key] === '') && (
              <span className="cfd-missing"> (required, missing)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
