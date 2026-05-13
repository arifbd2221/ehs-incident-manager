import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';

export default function CloseInvestigationModal({ investigation, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  // Captured at closure rather than during the active investigation — this
  // is the "what does the organization carry forward" synthesis, not the
  // working notes. Once saved it locks into the read-only display on the
  // detail page.
  const [lessons, setLessons] = useState(investigation.lessons_learned || '');

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="close-inv-modal-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="close-inv-modal-title">Close investigation</div>
            <div className="idet-modal-sub">{investigation.investigation_number} · no CAPA required</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            The investigation will be marked closed and findings archived. No corrective or preventive actions will be tracked.
          </div>
          <div className="form-group">
            <label className="form-label">Lessons learned <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={lessons}
              onChange={setLessons}
              rows={4}
              examples={['Add secondary containment requirement to all chemical transfer SOPs site-wide. Roll out glove compatibility chart to all departments.', 'Pre-task hazard assessment must be the first item on every shift handover; tie compliance to monthly supervisor scorecard.']}
              chips={['SOP change required', 'Training refresher', 'Policy update', 'Cross-site rollout', 'Audit cadence change']}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Closure reason <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={reason}
              onChange={setReason}
              rows={3}
              examples={['Root cause addressed by existing control; no further action required.', 'Investigation findings show incident was non-work-related per OSHA criteria.', 'Duplicate investigation — findings consolidated into INV-023.']}
              chips={['Existing controls sufficient', 'Non-work-related', 'Consolidated into another INV']}
            />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={() => onConfirm({ reason, lessons_learned: lessons.trim() || null })}>
            <Icon name="check" size={14}/>Close investigation
          </button>
        </div>
      </div>
    </div>
  );
}
