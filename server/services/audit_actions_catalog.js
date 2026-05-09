// audit_actions_catalog.js — canonical list of every (entity_type, action)
// pair the application can write to activity_log.
//
// Maintenance rule: when a route adds a new writeActivity / INSERT INTO
// activity_log call with a new action verb, append it here. The audit-log
// filter UI (ReportsPage → Audit Log tab) sources its action picker from
// this catalog merged with the DB's distinct rows, so a fresh tenant or
// just-deployed action verb is filterable BEFORE the first trigger.
//
// Order within each entity is roughly lifecycle: create → update →
// status changes → delete/archive → bulk operations. EHS supervisors
// scan top-to-bottom in that order when narrating to inspectors.
//
// Naming drift note (open follow-up): some verbs are bare (`created`,
// `closed`, `completed`, `updated` for incident/investigation/capa/
// inspection/template) while others are entity-prefixed (`asset_created`,
// `site_updated`, etc.). The composite-key picker fix in ReportsPage
// papers over the bare-verb collision in the UI; CSV exports still
// require the entity_type column alongside `action` to disambiguate.
// Normalizing them is a separate slice — touches every mutation route.

export const AUDIT_ACTIONS_CATALOG = [
  // Compliance-critical: incident lifecycle
  { entity_type: 'incident', action: 'created' },
  { entity_type: 'incident', action: 'incident_updated' },
  { entity_type: 'incident', action: 'assigned' },
  { entity_type: 'incident', action: 'escalated' },
  { entity_type: 'incident', action: 'severity_overridden' },
  { entity_type: 'incident', action: 'recordability_verified' },
  { entity_type: 'incident', action: 'witness_added' },
  { entity_type: 'incident', action: 'witness_updated' },
  { entity_type: 'incident', action: 'witness_removed' },
  { entity_type: 'incident', action: 'note' },
  { entity_type: 'incident', action: 'stop_work_submitted' },
  { entity_type: 'incident', action: 'stop_work_acknowledged' },
  { entity_type: 'incident', action: 'stop_work_resolved' },
  { entity_type: 'incident', action: 'stop_work_cancelled' },
  { entity_type: 'incident', action: 'closure_requested' },
  { entity_type: 'incident', action: 'closure_approved' },
  { entity_type: 'incident', action: 'closure_rejected' },
  { entity_type: 'incident', action: 'closed' },
  { entity_type: 'incident', action: 'auto_closed' },
  { entity_type: 'incident', action: 'force_closed' },
  { entity_type: 'incident', action: 'incident_reopened' },

  // Investigation lifecycle
  { entity_type: 'investigation', action: 'created' },
  { entity_type: 'investigation', action: 'started' },
  { entity_type: 'investigation', action: 'team_member_added' },
  { entity_type: 'investigation', action: 'five_why_added' },
  { entity_type: 'investigation', action: 'five_why_removed' },
  { entity_type: 'investigation', action: 'capa_assigned' },
  { entity_type: 'investigation', action: 'closed' },

  // CAPA lifecycle
  { entity_type: 'capa', action: 'created' },
  { entity_type: 'capa', action: 'progress_updated' },
  { entity_type: 'capa', action: 'completed' },
  { entity_type: 'capa', action: 'verified' },
  { entity_type: 'capa', action: 'rejected' },

  // Inspection lifecycle
  { entity_type: 'inspection', action: 'created' },
  { entity_type: 'inspection', action: 'updated' },
  { entity_type: 'inspection', action: 'completed' },
  { entity_type: 'inspection', action: 'abandoned' },
  { entity_type: 'inspection', action: 'deleted' },

  // Inspection answer set
  { entity_type: 'answer_set', action: 'answer_set_created' },
  { entity_type: 'answer_set', action: 'answer_set_updated' },
  { entity_type: 'answer_set', action: 'answer_set_deleted' },

  // Inspection template
  { entity_type: 'template', action: 'created' },
  { entity_type: 'template', action: 'updated' },
  { entity_type: 'template', action: 'items_updated' },
  { entity_type: 'template', action: 'published' },
  { entity_type: 'template', action: 'archived' },

  // Site
  { entity_type: 'site', action: 'site_created' },
  { entity_type: 'site', action: 'site_updated' },
  { entity_type: 'site', action: 'site_deleted' },
  { entity_type: 'site', action: 'sites_imported' },

  // Work hours (P3-OB2)
  { entity_type: 'work_hours', action: 'work_hours_created' },
  { entity_type: 'work_hours', action: 'work_hours_updated' },
  { entity_type: 'work_hours', action: 'work_hours_deleted' },
  { entity_type: 'work_hours', action: 'work_hours_imported' },
  { entity_type: 'work_hours', action: 'work_hours_exported' },

  // Asset register
  { entity_type: 'asset', action: 'asset_created' },
  { entity_type: 'asset', action: 'asset_updated' },
  { entity_type: 'asset', action: 'asset_archived' },
  { entity_type: 'asset', action: 'assets_imported' },

  // Asset categories + custom fields
  { entity_type: 'asset_category', action: 'asset_category_created' },
  { entity_type: 'asset_category', action: 'asset_category_updated' },
  { entity_type: 'asset_category', action: 'asset_category_deleted' },
  { entity_type: 'asset_category', action: 'asset_category_reactivated' },
  { entity_type: 'asset_category', action: 'asset_category_field_added' },
  { entity_type: 'asset_category', action: 'asset_category_field_updated' },
  { entity_type: 'asset_category', action: 'asset_category_field_deleted' },
  { entity_type: 'asset_category', action: 'asset_category_fields_reordered' },

  // Documents + folders
  { entity_type: 'document', action: 'document_uploaded' },
  { entity_type: 'document', action: 'document_deleted' },
  { entity_type: 'folder', action: 'folder_created' },
  { entity_type: 'folder', action: 'folder_deleted' },

  // Cross-entity links
  { entity_type: 'link', action: 'link_created' },
  { entity_type: 'link', action: 'link_deleted' },

  // User / member admin
  { entity_type: 'user', action: 'user_created' },
  { entity_type: 'user', action: 'user_updated' },
  { entity_type: 'user', action: 'user_password_reset' },
  { entity_type: 'user', action: 'profile_updated' },
  { entity_type: 'user', action: 'password_changed' },
  { entity_type: 'user', action: 'users_imported' },

  // Organization
  { entity_type: 'organization', action: 'org_created' },

  // System / cross-cutting
  { entity_type: 'system', action: 'voice_extracted' },
  { entity_type: 'system', action: 'audit_log_exported' },
  { entity_type: 'system', action: 'osha_300a_signed' },
];
