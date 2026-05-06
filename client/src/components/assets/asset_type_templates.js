// asset_type_templates.js — curated starter packs for new asset types.
//
// When the user creates a custom asset type from AssetTypesModal, they can
// "Start from" one of these templates instead of an empty field list. The
// modal walks each template's `fields` array and POSTs them after the
// category is created.
//
// Each template is a self-contained record:
//   - id           stable key for the picker
//   - name         human-readable name (also used as the default category name)
//   - description  one-line explainer in the picker
//   - icon         shared/Icon name
//   - color        hex used for the color dot
//   - fields[]     same shape as POST /api/asset-categories/:id/fields body
//
// Phase 2 W7 E7.1 follow-up.

export const ASSET_TYPE_TEMPLATES = [
  {
    id: 'office',
    name: 'Office equipment',
    description: 'Desks, chairs, printers, monitors — general office assets',
    icon: 'factory',
    color: '#0DB4F0',
    fields: [
      { field_label: 'Manufacturer', field_type: 'text' },
      { field_label: 'Model', field_type: 'text' },
      { field_label: 'Purchase date', field_type: 'date' },
      { field_label: 'Warranty expiry', field_type: 'date' },
      { field_label: 'Assigned to', field_type: 'text', helper_text: 'Employee name or department' },
    ],
  },
  {
    id: 'it',
    name: 'IT / Computer',
    description: 'Laptops, desktops, servers, network gear',
    icon: 'gear',
    color: '#626DF9',
    fields: [
      { field_label: 'Hostname', field_type: 'text', is_required: true },
      { field_label: 'Make', field_type: 'text' },
      { field_label: 'Model', field_type: 'text' },
      { field_label: 'Operating system', field_type: 'select', options: ['Windows 11', 'Windows 10', 'macOS', 'Linux', 'ChromeOS', 'Other'] },
      { field_label: 'IP address', field_type: 'text', helper_text: 'Static or DHCP-assigned' },
      { field_label: 'Assigned to', field_type: 'text' },
      { field_label: 'Purchase date', field_type: 'date' },
      { field_label: 'Warranty expiry', field_type: 'date' },
    ],
  },
  {
    id: 'lab',
    name: 'Laboratory instrument',
    description: 'Calibrated instruments, scales, spectrometers, pH meters',
    icon: 'leaf',
    color: '#0d9488',
    fields: [
      { field_label: 'Manufacturer', field_type: 'text', is_required: true },
      { field_label: 'Model', field_type: 'text', is_required: true },
      { field_label: 'Calibration interval (months)', field_type: 'number', is_required: true },
      { field_label: 'Last calibration', field_type: 'date', is_required: true },
      { field_label: 'Next calibration due', field_type: 'date', is_required: true },
      { field_label: 'Calibration certificate #', field_type: 'text' },
      { field_label: 'Calibration provider', field_type: 'text' },
    ],
  },
  {
    id: 'forklift',
    name: 'Forklift',
    description: 'Powered industrial trucks subject to OSHA 1910.178',
    icon: 'reports',
    color: '#ED6C02',
    fields: [
      { field_label: 'VIN', field_type: 'text', is_required: true },
      { field_label: 'Make', field_type: 'text' },
      { field_label: 'Model', field_type: 'text' },
      { field_label: 'Year', field_type: 'number' },
      { field_label: 'Capacity (kg)', field_type: 'number', helper_text: 'Maximum load rating' },
      { field_label: 'Power source', field_type: 'select', options: ['Electric', 'LPG', 'Diesel', 'Gasoline'] },
      { field_label: 'Operator certification required', field_type: 'checkbox' },
      { field_label: 'Last pre-shift inspection', field_type: 'date' },
      { field_label: 'Last service', field_type: 'date' },
    ],
  },
  {
    id: 'hvac',
    name: 'HVAC unit',
    description: 'Heating, ventilation, AC — filter & refrigerant tracking',
    icon: 'gear',
    color: '#5C00FF',
    fields: [
      { field_label: 'Make', field_type: 'text' },
      { field_label: 'Model', field_type: 'text' },
      { field_label: 'Filter type', field_type: 'text', helper_text: 'e.g. MERV 13' },
      { field_label: 'Filter change interval (days)', field_type: 'number' },
      { field_label: 'Last filter change', field_type: 'date' },
      { field_label: 'Last refrigerant check', field_type: 'date' },
      { field_label: 'Refrigerant type', field_type: 'select', options: ['R-22', 'R-410A', 'R-134a', 'R-32', 'R-454B', 'Other'] },
    ],
  },
  {
    id: 'fire_extinguisher',
    name: 'Fire extinguisher',
    description: 'Class A/B/C/D/K — monthly visual + annual maintenance',
    icon: 'fire',
    color: '#D32F2F',
    fields: [
      { field_label: 'Class', field_type: 'select', options: ['Class A', 'Class B', 'Class C', 'Class D', 'Class K', 'ABC multipurpose'], is_required: true },
      { field_label: 'Capacity (kg)', field_type: 'number' },
      { field_label: 'Last visual check', field_type: 'date', is_required: true },
      { field_label: 'Last annual maintenance', field_type: 'date', is_required: true },
      { field_label: 'Next maintenance due', field_type: 'date', is_required: true },
      { field_label: 'Service company', field_type: 'text' },
    ],
  },
  {
    id: 'first_aid',
    name: 'First aid kit',
    description: 'Stocked kits — OSHA 1910.151 compliance',
    icon: 'shield',
    color: '#22c55e',
    fields: [
      { field_label: 'Location notes', field_type: 'text', helper_text: 'e.g. "Wall mount, near east exit"' },
      { field_label: 'Last restock', field_type: 'date', is_required: true },
      { field_label: 'Next check due', field_type: 'date', is_required: true },
      { field_label: 'Inspector', field_type: 'text' },
      { field_label: 'AED on site', field_type: 'checkbox' },
    ],
  },
  {
    id: 'eyewash',
    name: 'Eye wash / safety shower',
    description: 'ANSI Z358.1 — weekly activation, annual inspection',
    icon: 'eye',
    color: '#0ea5e9',
    fields: [
      { field_label: 'Type', field_type: 'select', options: ['Eye wash only', 'Combination eye/face wash', 'Drench shower', 'Combination shower + eye wash'] },
      { field_label: 'Last weekly activation', field_type: 'date', is_required: true },
      { field_label: 'Last annual inspection', field_type: 'date', is_required: true },
      { field_label: 'Flow check OK', field_type: 'checkbox', helper_text: 'Continuous flow ≥15 minutes' },
      { field_label: 'Water tempered (16-38°C)', field_type: 'checkbox' },
    ],
  },
];
