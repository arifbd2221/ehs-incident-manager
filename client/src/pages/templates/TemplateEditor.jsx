import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getTemplate, updateTemplate, publishTemplate, updateTemplateItems, uploadTemplateCover, removeTemplateCover } from '../../api/templates';
import { getAnswerSets, createAnswerSet } from '../../api/answer_sets';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import '../../styles/templates.css';

let keyCounter = 0;
const nextKey = () => `item_${Date.now()}_${++keyCounter}`;

const ITEM_TYPES = [
  { id: 'question', label: 'Question', icon: 'help', hasAnswerSet: true },
  { id: 'text', label: 'Text Input', icon: 'textFields', hasAnswerSet: false },
  { id: 'checkbox', label: 'Checkbox', icon: 'checkBox', hasAnswerSet: false },
];

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [answerSets, setAnswerSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);
  const [focusedItem, setFocusedItem] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [dragKey, setDragKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showAnswerSets, setShowAnswerSets] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [newAsName, setNewAsName] = useState('');
  const [newAsOptions, setNewAsOptions] = useState([{ label: '', score: 1, color: '#2E7D32', is_failed: false }]);

  const saveTimeout = useRef(null);
  const editorRef = useRef(null);
  const [toolbarY, setToolbarY] = useState(0);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // Click outside to unfocus — exclude toolbar, cards, sections, modals
  useEffect(() => {
    const handler = (e) => {
      if (!editorRef.current) return;
      if (e.target.closest('.te-card') || e.target.closest('.modal-backdrop') ||
          e.target.closest('.te-toolbar-float') || e.target.closest('.te-section-head')) return;
      setFocusedItem(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Track focused item position → slide toolbar beside it
  useEffect(() => {
    if (!focusedItem || !editorRef.current) {
      setToolbarY(0);
      return;
    }
    requestAnimationFrame(() => {
      const el = editorRef.current?.querySelector(`[data-item-key="${focusedItem}"]`);
      const sections = editorRef.current?.querySelector('.te-sections');
      if (!el || !sections) { setToolbarY(0); return; }
      const sectionsRect = sections.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setToolbarY(Math.max(0, elRect.top - sectionsRect.top));
    });
  }, [focusedItem, items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, asData] = await Promise.all([getTemplate(id), getAnswerSets()]);
      setTemplate(tpl);
      setItems(tpl.items || []);
      setAnswerSets(asData.answer_sets || []);
    } catch {
      showToast('Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // --- Data helpers ---
  const sections = items.filter(i => i.type === 'section');
  const getChildren = (sectionKey) => items.filter(i => i.parent_key === sectionKey && i.type !== 'section');
  const ungrouped = items.filter(i => !i.parent_key && i.type !== 'section');

  const parseMeta = (item) => {
    if (!item.meta) return {};
    return typeof item.meta === 'string' ? JSON.parse(item.meta) : item.meta;
  };

  const getAnswerSetForItem = (item) => {
    const meta = parseMeta(item);
    if (!meta.answer_set_id) return null;
    return answerSets.find(a => a.id === meta.answer_set_id) || null;
  };

  // Auto-numbering
  const questionNumbers = {};
  let qNum = 0;
  const orderedItems = items.filter(i => i.type !== 'section');
  for (const item of orderedItems) {
    questionNumbers[item.item_key] = ++qNum;
  }

  // --- Save logic ---
  const saveItems = useCallback(async (newItems) => {
    setSaveStatus('saving');
    try {
      const existingKeys = new Set((template?.items || []).map(i => i.item_key));
      const newKeys = new Set(newItems.map(i => i.item_key));
      const deletes = [...existingKeys].filter(k => !newKeys.has(k));
      const upserts = newItems.map((item, idx) => ({
        item_key: item.item_key,
        parent_key: item.parent_key || null,
        type: item.type,
        label: item.label || null,
        region: item.region || 'body',
        sort_order: idx,
        required: item.required ? 1 : 0,
        meta: item.meta ? (typeof item.meta === 'string' ? item.meta : JSON.stringify(item.meta)) : null,
      }));
      await updateTemplateItems(id, { upserts, deletes });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
      showToast('Failed to save');
    }
  }, [id, template]);

  const debouncedSave = useCallback((newItems) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveItems(newItems), 600);
  }, [saveItems]);

  const updateItems = (newItems) => {
    setItems(newItems);
    setSaveStatus('saving');
    debouncedSave(newItems);
  };

  // --- Template metadata ---
  const nameTimeout = useRef(null);
  const descTimeout = useRef(null);

  const handleNameChange = (name) => {
    setTemplate(t => ({ ...t, name }));
    clearTimeout(nameTimeout.current);
    nameTimeout.current = setTimeout(() => { updateTemplate(id, { name }).catch(() => {}); }, 600);
  };
  const handleDescChange = (description) => {
    setTemplate(t => ({ ...t, description }));
    clearTimeout(descTimeout.current);
    descTimeout.current = setTimeout(() => { updateTemplate(id, { description }).catch(() => {}); }, 600);
  };

  const [uploadingCover, setUploadingCover] = useState(false);
  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    uploadTemplateCover(id, file)
      .then(data => { setTemplate(t => ({ ...t, cover_image: data.cover_image })); showToast('Cover image updated'); })
      .catch(() => showToast('Failed to upload image'))
      .finally(() => setUploadingCover(false));
    e.target.value = '';
  };
  const handleCoverRemove = () => {
    removeTemplateCover(id)
      .then(() => { setTemplate(t => ({ ...t, cover_image: null })); showToast('Cover image removed'); })
      .catch(() => showToast('Failed to remove image'));
  };

  // --- Item CRUD ---
  const addSection = () => {
    const key = nextKey();
    const newItems = [...items, { item_key: key, type: 'section', label: '', parent_key: null, region: 'body', sort_order: items.length, required: 0, meta: null }];
    updateItems(newItems);
    setFocusedItem(key);
  };

  const addItem = (type = 'question', parentKey = null) => {
    const key = nextKey();
    let insertParent = parentKey;
    let insertIdx = items.length;

    // If an item is focused, insert after it within same parent
    if (focusedItem) {
      const focusedIdx = items.findIndex(i => i.item_key === focusedItem);
      if (focusedIdx >= 0) {
        const focused = items[focusedIdx];
        if (focused.type !== 'section') {
          insertParent = focused.parent_key;
          insertIdx = focusedIdx + 1;
        } else {
          insertParent = focused.item_key;
          // Insert at end of this section's children
          const lastChildIdx = items.reduce((last, it, idx) => it.parent_key === focused.item_key ? idx : last, focusedIdx);
          insertIdx = lastChildIdx + 1;
        }
      }
    }

    const newItem = { item_key: key, type, label: '', parent_key: insertParent, region: 'body', sort_order: 0, required: 0, meta: null };
    const newItems = [...items];
    newItems.splice(insertIdx, 0, newItem);
    updateItems(newItems);
    setFocusedItem(key);
  };

  const updateItem = (itemKey, updates) => {
    updateItems(items.map(i => i.item_key === itemKey ? { ...i, ...updates } : i));
  };

  const removeItem = (itemKey) => {
    const item = items.find(i => i.item_key === itemKey);
    let newItems;
    if (item?.type === 'section') {
      newItems = items.filter(i => i.item_key !== itemKey && i.parent_key !== itemKey);
    } else {
      newItems = items.filter(i => i.item_key !== itemKey);
    }
    // Clean up orphaned conditions referencing the deleted item(s)
    const removedKeys = new Set(items.filter(i => !newItems.find(n => n.item_key === i.item_key)).map(i => i.item_key));
    newItems = newItems.map(i => {
      const m = parseMeta(i);
      if (!m.conditions?.length) return i;
      const cleaned = m.conditions.filter(c => !removedKeys.has(c.source_key));
      if (cleaned.length === m.conditions.length) return i;
      const newMeta = { ...m };
      if (cleaned.length === 0) { delete newMeta.conditions; delete newMeta.condition_logic; }
      else newMeta.conditions = cleaned;
      return { ...i, meta: Object.keys(newMeta).length ? newMeta : null };
    });
    updateItems(newItems);
    if (focusedItem === itemKey) setFocusedItem(null);
    setDeleteConfirm(null);
  };

  const duplicateItem = (itemKey) => {
    const original = items.find(i => i.item_key === itemKey);
    if (!original || original.type === 'section') return;
    const newKey = nextKey();
    const clone = { ...original, item_key: newKey, label: original.label ? `${original.label} (copy)` : '' };
    const idx = items.findIndex(i => i.item_key === itemKey);
    const newItems = [...items];
    newItems.splice(idx + 1, 0, clone);
    updateItems(newItems);
    setFocusedItem(newKey);
  };

  // --- Drag and drop ---
  const handleDragStart = (e, key) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    requestAnimationFrame(() => setDragKey(key));
  };

  const handleDragOver = (e, targetKey, position) => {
    e.preventDefault();
    if (targetKey === dragKey) return;
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ key: targetKey, position });
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e, targetKey) => {
    e.preventDefault();
    if (!dragKey || dragKey === targetKey) { setDragKey(null); setDropTarget(null); return; }

    const newItems = [...items];
    const dragIdx = newItems.findIndex(i => i.item_key === dragKey);
    const [dragged] = newItems.splice(dragIdx, 1);

    const targetItem = newItems.find(i => i.item_key === targetKey);

    // If dropping on a section header, move into that section
    if (targetItem?.type === 'section' && dragged.type !== 'section') {
      dragged.parent_key = targetItem.item_key;
    } else if (dragged.type !== 'section') {
      dragged.parent_key = targetItem?.parent_key || null;
    }

    const targetIdx = newItems.findIndex(i => i.item_key === targetKey);
    const insertIdx = dropTarget?.position === 'after' ? targetIdx + 1 : targetIdx;
    newItems.splice(insertIdx, 0, dragged);

    updateItems(newItems);
    setDragKey(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => { setDragKey(null); setDropTarget(null); };

  // --- Section collapse ---
  const toggleCollapse = (key) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // --- Publish ---
  const handlePublish = async () => {
    setPublishing(true);
    try {
      clearTimeout(saveTimeout.current);
      await saveItems(items);
      await publishTemplate(id);
      setShowPublish(false);
      showToast('Template published!');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  // --- Answer set CRUD ---
  const handleCreateAnswerSet = async () => {
    if (!newAsName.trim() || newAsOptions.some(o => !o.label.trim())) return;
    try {
      await createAnswerSet({
        name: newAsName.trim(),
        options: newAsOptions.map((o, i) => ({ ...o, label: o.label.trim(), position: i })),
      });
      setNewAsName('');
      setNewAsOptions([{ label: '', score: 1, color: '#2E7D32', is_failed: false }]);
      const asData = await getAnswerSets();
      setAnswerSets(asData.answer_sets || []);
      showToast('Answer set created');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create');
    }
  };

  // --- Render helpers ---
  if (loading) {
    return (
      <div className="page te-page">
        <div className="te-header">
          <div className="te-header-left">
            <div className="tp-skel" style={{ width: 38, height: 38, borderRadius: 8 }} />
            <div><div className="tp-skel" style={{ width: 240, height: 22 }} /><div className="tp-skel" style={{ width: 160, height: 14, marginTop: 8 }} /></div>
          </div>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="tp-skel" style={{ width: '100%', height: 80, borderRadius: 10, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (!template) {
    return (
      <div className="page te-page">
        <div className="tp-empty">
          <div className="tp-empty-title">Template not found</div>
          <button className="btn btn-primary" onClick={() => navigate('/templates')}>Back to Templates</button>
        </div>
      </div>
    );
  }

  const isArchived = template.status === 'archived';
  const isDraft = !isArchived;
  const questionCount = items.filter(i => i.type !== 'section').length;
  const latestVersion = template.latest_version || 0;
  const nextVersion = latestVersion + 1;
  const hasUnpublished = template.has_unpublished_changes;
  const versions = template.versions || [];

  return (
    <div className="page te-page" ref={editorRef}>
      {/* Editor body: sections + floating toolbar */}
      <div className="te-editor-body">
        <div className="te-sections">
          {/* Header — inside sections so it matches card width */}
          <div className="te-header">
            <div className="te-header-top">
              <button className="te-back" onClick={() => navigate('/templates')}>
                <Icon name="arrowL" size={18} />
              </button>
              <div className="te-header-actions">
                {latestVersion > 0 && (
                  <button className="te-version-badge" onClick={() => setShowVersions(true)} title="View version history">
                    v{latestVersion}
                  </button>
                )}
                {hasUnpublished && latestVersion > 0 && (
                  <span className="te-unpublished-badge">Unpublished changes</span>
                )}
                {latestVersion === 0 && (
                  <span className={`te-status tp-status-draft`}>
                    <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                    draft
                  </span>
                )}
                <div className={`te-save te-save--${saveStatus}`}>
                  <span className="te-save-dot" />
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
                </div>
                <button className="btn btn-secondary" onClick={() => setShowAnswerSets(true)}>
                  <Icon name="settings" size={14} /> Answer Sets
                </button>
                {isDraft && (
                  <button className="tp-btn-create" onClick={() => setShowPublish(true)} disabled={questionCount === 0}>
                    <Icon name="check" size={16} /> Publish{latestVersion > 0 ? ` v${nextVersion}` : ''}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="te-hero-card">
            <div className="te-hero-image-area">
              {template.cover_image ? (
                <div className="te-hero-image-wrap">
                  <img src={template.cover_image} alt="Template cover" className="te-hero-image" />
                  {isDraft && (
                    <div className="te-hero-image-overlay">
                      <label className="te-hero-img-btn">
                        <Icon name="photo" size={14} /> Change
                        <input type="file" accept="image/*" hidden onChange={handleCoverUpload} />
                      </label>
                      <button className="te-hero-img-btn te-hero-img-btn--remove" onClick={handleCoverRemove}>
                        <Icon name="close" size={14} /> Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <label className={`te-hero-placeholder ${uploadingCover ? 'is-uploading' : ''}`}>
                  {uploadingCover ? (
                    <><span className="login-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} /> Uploading...</>
                  ) : (
                    <><Icon name="photo" size={26} /><span>Add cover</span></>
                  )}
                  {isDraft && !uploadingCover && <input type="file" accept="image/*" hidden onChange={handleCoverUpload} />}
                </label>
              )}
            </div>
            <div className="te-hero-meta">
              <input className="te-title-input" value={template.name || ''} onChange={e => handleNameChange(e.target.value)} placeholder="Untitled template..." disabled={isArchived} />
              <input className="te-desc-input" value={template.description || ''} onChange={e => handleDescChange(e.target.value)} placeholder="Add a description..." disabled={isArchived} />
            </div>
          </div>
          {/* Ungrouped items */}
          {ungrouped.length > 0 && (
            <div className="te-section">
              <div className="te-section-head">
                <div className="te-section-left">
                  <div className="te-section-icon"><Icon name="file" size={16} /></div>
                  <span className="te-section-title-text">General</span>
                  <span className="te-section-count">{ungrouped.length}</span>
                </div>
              </div>
              <div className="te-section-body">
                {ungrouped.map(item => (
                  <QuestionCard
                    key={item.item_key}
                    item={item}
                    qNum={questionNumbers[item.item_key]}
                    isFocused={focusedItem === item.item_key}
                    isDraft={isDraft}
                    answerSets={answerSets}
                    answerSet={getAnswerSetForItem(item)}
                    allItems={items}
                    questionNumbers={questionNumbers}
                    parseMeta={parseMeta}
                    onFocus={() => setFocusedItem(item.item_key)}
                    onUpdate={updateItem}
                    onRemove={() => setDeleteConfirm(item.item_key)}
                    onDuplicate={() => duplicateItem(item.item_key)}
                    isDragging={dragKey === item.item_key}
                    dropPos={dropTarget?.key === item.item_key ? dropTarget.position : null}
                    onDragStart={e => handleDragStart(e, item.item_key)}
                    onDragOver={(e, pos) => handleDragOver(e, item.item_key, pos)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, item.item_key)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {sections.map((sec, sIdx) => {
            const children = getChildren(sec.item_key);
            const isCollapsed = collapsedSections.has(sec.item_key);
            return (
              <div
                key={sec.item_key}
                data-item-key={sec.item_key}
                className={`te-section ${focusedItem === sec.item_key ? 'te-section--focused' : ''} ${dragKey === sec.item_key ? 'te-section--dragging' : ''} ${dropTarget?.key === sec.item_key && dropTarget.position === 'before' ? 'te-section--drop-before' : ''} ${dropTarget?.key === sec.item_key && dropTarget.position === 'after' ? 'te-section--drop-after' : ''}`}
                style={{ animationDelay: `${sIdx * 50}ms` }}
                onDragOver={e => { if (dragKey && items.find(i => i.item_key === dragKey)?.type === 'section') handleDragOver(e, sec.item_key, 'after'); }}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, sec.item_key)}
              >
                <div className="te-section-head" onClick={() => setFocusedItem(sec.item_key)}>
                  <div className="te-section-left">
                    {isDraft && (
                      <div className="te-section-drag" draggable onDragStart={e => handleDragStart(e, sec.item_key)} onDragEnd={handleDragEnd}>
                        <Icon name="drag" size={16} />
                      </div>
                    )}
                    <div className="te-section-icon"><Icon name="sort" size={16} /></div>
                    {isDraft ? (
                      <input
                        className="te-section-title-input"
                        value={sec.label || ''}
                        onChange={e => updateItem(sec.item_key, { label: e.target.value })}
                        placeholder="Section title..."
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="te-section-title-text">{sec.label || 'Untitled Section'}</span>
                    )}
                    <span className="te-section-count">{children.length}</span>
                  </div>
                  <div className="te-section-actions">
                    <button className={`icon-btn te-section-collapse-btn ${isCollapsed ? 'collapsed' : ''}`} onClick={() => toggleCollapse(sec.item_key)}>
                      <Icon name="chevDown" size={16} />
                    </button>
                    {isDraft && (
                      <button className="icon-btn" title="Delete section" onClick={() => setDeleteConfirm(sec.item_key)}>
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className={`te-section-body ${isCollapsed ? 'collapsed' : ''}`} style={isCollapsed ? {} : { maxHeight: 9999 }}>
                  {children.length === 0 && isDraft && !isCollapsed && (
                    <div className="te-empty-prompt">
                      <div className="te-empty-prompt-icon"><Icon name="plus" size={20} /></div>
                      <span>Use the toolbar to add questions</span>
                    </div>
                  )}
                  {children.map(item => (
                    <QuestionCard
                      key={item.item_key}
                      item={item}
                      qNum={questionNumbers[item.item_key]}
                      isFocused={focusedItem === item.item_key}
                      isDraft={isDraft}
                      answerSets={answerSets}
                      answerSet={getAnswerSetForItem(item)}
                      allItems={items}
                      questionNumbers={questionNumbers}
                      parseMeta={parseMeta}
                      onFocus={() => setFocusedItem(item.item_key)}
                      onUpdate={updateItem}
                      onRemove={() => setDeleteConfirm(item.item_key)}
                      onDuplicate={() => duplicateItem(item.item_key)}
                      isDragging={dragKey === item.item_key}
                      dropPos={dropTarget?.key === item.item_key ? dropTarget.position : null}
                      onDragStart={e => handleDragStart(e, item.item_key)}
                      onDragOver={(e, pos) => handleDragOver(e, item.item_key, pos)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, item.item_key)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {sections.length === 0 && ungrouped.length === 0 && (
            <div className="tp-empty" style={{ padding: '60px 20px' }}>
              <div className="tp-empty-icon"><Icon name="file" size={28} /></div>
              <div className="tp-empty-title">Start building your template</div>
              <div className="tp-empty-desc">Add a section, then use the toolbar on the right to add questions</div>
            </div>
          )}

          {/* Add section */}
          {isDraft && (
            <button className="te-add-section" onClick={addSection}>
              <Icon name="plus" size={18} /> Add Section
            </button>
          )}
        </div>

        {/* Floating toolbar — follows focused card */}
        {isDraft && (
          <div className="te-toolbar-float" style={{ transform: `translateY(${toolbarY}px)` }}>
            {ITEM_TYPES.map((t, i) => (
              <button
                key={t.id}
                className="te-toolbar-btn"
                data-tooltip={t.label}
                onClick={() => addItem(t.id)}
                style={{ animationDelay: `${200 + i * 40}ms` }}
              >
                <Icon name={t.icon} size={20} />
              </button>
            ))}
            <div className="te-toolbar-divider" />
            <button className="te-toolbar-btn" data-tooltip="Add Section" onClick={addSection}>
              <Icon name="sort" size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && createPortal(
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-item-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="delete-item-modal-title">Delete Item</div>
                <div className="modal-sub">
                  {items.find(i => i.item_key === deleteConfirm)?.type === 'section'
                    ? `This will also delete ${getChildren(deleteConfirm).length} question(s) inside this section.`
                    : 'This action cannot be undone.'}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setDeleteConfirm(null)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => removeItem(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Publish modal */}
      {showPublish && createPortal(
        <div className="modal-backdrop" onClick={() => setShowPublish(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="publish-modal-title">Publish {latestVersion > 0 ? `v${nextVersion}` : 'Template'}</div>
                <div className="modal-sub">{latestVersion > 0 ? `Create version ${nextVersion} from current changes` : 'Make this template available for inspections'}</div>
              </div>
              <button className="icon-btn" onClick={() => setShowPublish(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="te-publish-info">
                <strong>{template.name}</strong> has <strong>{questionCount} question{questionCount !== 1 ? 's' : ''}</strong> across <strong>{sections.length} section{sections.length !== 1 ? 's' : ''}</strong>.
                {latestVersion > 0
                  ? <> This will create <strong>v{nextVersion}</strong>. New inspections will use this version. Existing inspections keep their original version.</>
                  : <> Once published, you can start inspections using this template. You can continue editing and publish new versions at any time.</>
                }
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setShowPublish(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publishing...' : latestVersion > 0 ? `Publish v${nextVersion}` : 'Publish'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Version history modal */}
      {showVersions && createPortal(
        <div className="modal-backdrop" onClick={() => setShowVersions(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="version-history-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="version-history-modal-title">Version History</div>
                <div className="modal-sub">{versions.length} version{versions.length !== 1 ? 's' : ''} published</div>
              </div>
              <button className="icon-btn" onClick={() => setShowVersions(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-body">
              {versions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>
                  No versions published yet
                </div>
              ) : (
                <div className="te-version-list">
                  {versions.map(v => (
                    <div key={v.id} className="te-version-row">
                      <div className="te-version-num">v{v.version_number}</div>
                      <div className="te-version-info">
                        <div className="te-version-date">
                          {new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="te-version-by">by {v.published_by_name || 'Unknown'}</div>
                      </div>
                      {v.version_number === latestVersion && (
                        <span className="te-version-current">Current</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Answer set manager modal */}
      {showAnswerSets && createPortal(
        <div className="modal-backdrop" onClick={() => setShowAnswerSets(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="answer-sets-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="answer-sets-modal-title">Answer Sets</div>
                <div className="modal-sub">Manage reusable response options for questions</div>
              </div>
              <button className="icon-btn" onClick={() => setShowAnswerSets(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="te-as-list">
                {answerSets.map(as => (
                  <div key={as.id} className="te-as-item">
                    <div className="te-as-item-name">{as.name}</div>
                    <div className="te-as-options">
                      {as.options?.map(opt => (
                        <span key={opt.id} className="te-as-opt" style={{ background: `${opt.color}18`, color: opt.color }}>{opt.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--sds-border)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sds-fg-heading)', marginBottom: 12 }}>Create New Answer Set</div>
                <div className="field">
                  <label className="label">Name</label>
                  <input className="input" placeholder="e.g. Compliant / Non-Compliant" value={newAsName} onChange={e => setNewAsName(e.target.value)} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sds-fg-secondary)', marginBottom: 8, marginTop: 12 }}>Options</div>
                {newAsOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input className="input" style={{ flex: 1 }} placeholder="Label" value={opt.label} onChange={e => {
                      const copy = [...newAsOptions]; copy[i] = { ...copy[i], label: e.target.value }; setNewAsOptions(copy);
                    }} />
                    <input type="color" value={opt.color} onChange={e => {
                      const copy = [...newAsOptions]; copy[i] = { ...copy[i], color: e.target.value }; setNewAsOptions(copy);
                    }} style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--sds-fg-tertiary)', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={opt.is_failed} onChange={e => {
                        const copy = [...newAsOptions]; copy[i] = { ...copy[i], is_failed: e.target.checked }; setNewAsOptions(copy);
                      }} /> Fail
                    </label>
                    {newAsOptions.length > 1 && (
                      <button className="icon-btn" onClick={() => setNewAsOptions(newAsOptions.filter((_, j) => j !== i))}>
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn btn-text" onClick={() => setNewAsOptions([...newAsOptions, { label: '', score: 0, color: '#90A4AE', is_failed: false }])} style={{ marginBottom: 12 }}>
                  <Icon name="plus" size={14} /> Add Option
                </button>
                <button className="btn btn-primary" onClick={handleCreateAnswerSet} disabled={!newAsName.trim() || newAsOptions.some(o => !o.label.trim())} style={{ width: '100%' }}>
                  Create Answer Set
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={16} /> {toast}</div>}
    </div>
  );
}

// ---- Question Card Component ----
function QuestionCard({
  item, qNum, isFocused, isDraft, answerSets, answerSet,
  allItems, questionNumbers, parseMeta: parseMetaParent,
  onFocus, onUpdate, onRemove, onDuplicate,
  isDragging, dropPos, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) {
  const cardRef = useRef(null);

  const parseMeta = () => {
    if (!item.meta) return {};
    return typeof item.meta === 'string' ? JSON.parse(item.meta) : item.meta;
  };

  const meta = parseMeta();
  const typeInfo = ITEM_TYPES.find(t => t.id === item.type) || ITEM_TYPES[0];

  const handleTypeChange = (newType) => {
    const updates = { type: newType };
    const t = ITEM_TYPES.find(t => t.id === newType);
    if (!t?.hasAnswerSet && meta.answer_set_id) {
      const newMeta = { ...meta };
      delete newMeta.answer_set_id;
      updates.meta = Object.keys(newMeta).length ? newMeta : null;
    }
    onUpdate(item.item_key, updates);
  };

  const handleAnswerSetChange = (asId) => {
    const newMeta = { ...meta };
    if (asId) newMeta.answer_set_id = Number(asId);
    else delete newMeta.answer_set_id;
    onUpdate(item.item_key, { meta: Object.keys(newMeta).length ? newMeta : null });
  };

  const handleRequiredToggle = () => {
    onUpdate(item.item_key, { required: item.required ? 0 : 1 });
  };

  // --- Condition helpers ---
  const priorQuestions = (allItems || []).filter((it, idx) => {
    if (it.item_key === item.item_key) return false;
    const targetIdx = allItems.findIndex(i => i.item_key === item.item_key);
    if (idx >= targetIdx) return false;
    if (it.type === 'section') return false;
    const m = parseMetaParent ? parseMetaParent(it) : {};
    return !!m.answer_set_id;
  });

  const getSourceAnswerSet = (sourceKey) => {
    const src = allItems?.find(i => i.item_key === sourceKey);
    if (!src) return null;
    const m = parseMetaParent ? parseMetaParent(src) : {};
    if (!m.answer_set_id) return null;
    return answerSets.find(a => a.id === m.answer_set_id) || null;
  };

  const addCondition = () => {
    const newMeta = { ...meta };
    newMeta.conditions = [...(meta.conditions || []), { source_key: '', option_id: null }];
    if (!newMeta.condition_logic) newMeta.condition_logic = 'all';
    onUpdate(item.item_key, { meta: newMeta });
  };

  const removeCondition = (idx) => {
    const newMeta = { ...meta };
    newMeta.conditions = (meta.conditions || []).filter((_, i) => i !== idx);
    if (newMeta.conditions.length === 0) { delete newMeta.conditions; delete newMeta.condition_logic; }
    onUpdate(item.item_key, { meta: Object.keys(newMeta).length ? newMeta : null });
  };

  const updateCondition = (idx, field, value) => {
    const newMeta = { ...meta };
    const conditions = [...(meta.conditions || [])];
    conditions[idx] = { ...conditions[idx], [field]: value };
    if (field === 'source_key') conditions[idx].option_id = null;
    newMeta.conditions = conditions;
    onUpdate(item.item_key, { meta: newMeta });
  };

  const handleConditionLogicChange = (logic) => {
    onUpdate(item.item_key, { meta: { ...meta, condition_logic: logic } });
  };

  // Determine drop position from mouse Y relative to card center
  const getDropPos = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const hasConditions = meta.conditions?.length > 0;

  const className = [
    'te-card',
    isFocused && 'te-card--focused',
    isDragging && 'te-card--dragging',
    dropPos === 'before' && 'te-card--drop-before',
    dropPos === 'after' && 'te-card--drop-after',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={className}
      data-item-key={item.item_key}
      style={{ animationDelay: `${(qNum || 0) * 25}ms` }}
      onClick={() => { if (!isFocused && isDraft) onFocus(); }}
      onDragOver={e => onDragOver(e, getDropPos(e))}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Top row: always visible */}
      <div className="te-card-row">
        {isDraft && (
          <div className="te-card-drag" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <Icon name="drag" size={16} />
          </div>
        )}
        <div className="te-card-num">Q{qNum}</div>

        {isFocused && isDraft ? (
          <input
            className="te-card-label-input"
            value={item.label || ''}
            onChange={e => onUpdate(item.item_key, { label: e.target.value })}
            placeholder="Enter your question..."
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`te-card-label ${!item.label ? 'te-card-label--empty' : ''}`}>
            {item.label || 'Untitled question'}
          </span>
        )}

        {!isFocused && (
          <div className="te-card-badges">
            <span className="te-card-type-badge">{typeInfo.label}</span>
            {answerSet && <span className="te-card-as-badge">{answerSet.name}</span>}
            {item.required ? <span className="te-card-req-dot" title="Required" /> : null}
            {hasConditions && <span className="te-card-cond-badge" title={`${meta.conditions.length} condition(s)`}><Icon name="branch" size={12} /></span>}
          </div>
        )}
      </div>

      {/* Expanded content: only when focused */}
      {isFocused && isDraft && (
        <div className="te-card-expanded" onClick={e => e.stopPropagation()}>
          {/* Type + Answer set selectors */}
          <div className="te-card-config-row">
            <div className="te-card-config-field">
              <label>Question Type</label>
              <ComboBox options={ITEM_TYPES.map(t => ({value: t.id, label: t.label}))} value={item.type} onChange={val => handleTypeChange(val)} />
            </div>
            {typeInfo.hasAnswerSet && (
              <div className="te-card-config-field">
                <label>Answer Set</label>
                <ComboBox options={[{value: '', label: 'No answer set (text only)'}, ...answerSets.map(as => ({value: String(as.id), label: as.name}))]} value={String(meta.answer_set_id || '')} onChange={val => handleAnswerSetChange(val)} />
              </div>
            )}
          </div>

          {/* Answer set chip preview */}
          {answerSet && (
            <div className="te-card-chips">
              {answerSet.options?.map(opt => (
                <span key={opt.id} className="te-card-chip" style={{ color: opt.color, borderColor: opt.color, background: `${opt.color}12` }}>
                  {opt.label}
                </span>
              ))}
            </div>
          )}

          {/* Condition configuration */}
          <div className="te-card-conditions">
            <div className="te-card-conditions-header">
              <Icon name="branch" size={14} />
              <span>Conditional logic</span>
              {meta.conditions?.length > 1 && (
                <ComboBox options={[{value: 'all', label: 'ALL conditions met'}, {value: 'any', label: 'ANY condition met'}]} value={meta.condition_logic || 'all'} onChange={val => handleConditionLogicChange(val)} />
              )}
            </div>

            {(meta.conditions || []).map((cond, idx) => {
              const sourceAs = getSourceAnswerSet(cond.source_key);
              return (
                <div key={idx} className="te-condition-row">
                  <ComboBox options={priorQuestions.map(pq => ({value: pq.item_key, label: `Q${questionNumbers[pq.item_key]}: ${pq.label || 'Untitled'}`}))} value={cond.source_key || ''} onChange={val => updateCondition(idx, 'source_key', val)} placeholder="Select question..." />
                  <span className="te-condition-eq">is</span>
                  <ComboBox options={(sourceAs?.options || []).map(opt => ({value: String(opt.id), label: opt.label}))} value={String(cond.option_id || '')} onChange={val => updateCondition(idx, 'option_id', Number(val))} placeholder="Select answer..." disabled={!cond.source_key} />
                  <button className="icon-btn" onClick={() => removeCondition(idx)} title="Remove condition">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              );
            })}

            {priorQuestions.length > 0 ? (
              <button className="te-condition-add" onClick={addCondition}>
                <Icon name="plus" size={14} /> Add condition
              </button>
            ) : (
              !hasConditions && (
                <div className="te-condition-empty">No prior questions with answer sets available</div>
              )
            )}
          </div>

          {/* Footer: required toggle + actions */}
          <div className="te-card-footer">
            <div className="te-card-footer-left">
              <label className="te-toggle">
                <input type="checkbox" checked={!!item.required} onChange={handleRequiredToggle} />
                <span className="te-toggle-track"><span className="te-toggle-thumb" /></span>
                <span className="te-toggle-label">Required</span>
              </label>
            </div>
            <div className="te-card-footer-right">
              <button className="icon-btn" title="Duplicate" onClick={onDuplicate}><Icon name="copy" size={16} /></button>
              <button className="icon-btn" title="Delete" onClick={onRemove}><Icon name="close" size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only expanded for published templates */}
      {isFocused && !isDraft && (
        <div className="te-card-expanded" onClick={e => e.stopPropagation()}>
          <div className="te-card-config-row">
            <div className="te-card-config-field">
              <label>Type</label>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sds-fg-primary)', padding: '8px 0' }}>{typeInfo.label}</div>
            </div>
            {answerSet && (
              <div className="te-card-config-field">
                <label>Answer Set</label>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sds-fg-primary)', padding: '8px 0' }}>{answerSet.name}</div>
              </div>
            )}
          </div>
          {answerSet && (
            <div className="te-card-chips">
              {answerSet.options?.map(opt => (
                <span key={opt.id} className="te-card-chip" style={{ color: opt.color, borderColor: opt.color, background: `${opt.color}12` }}>
                  {opt.label}
                </span>
              ))}
            </div>
          )}
          {hasConditions && (
            <div className="te-card-conditions" style={{ opacity: 0.7 }}>
              <div className="te-card-conditions-header">
                <Icon name="branch" size={14} />
                <span>Shown when {meta.conditions.map((c, i) => {
                  const src = allItems?.find(it => it.item_key === c.source_key);
                  const srcAs = getSourceAnswerSet(c.source_key);
                  const opt = srcAs?.options?.find(o => o.id === c.option_id);
                  return <span key={i}>{i > 0 ? (meta.condition_logic === 'any' ? ' or ' : ' and ') : ''}Q{questionNumbers[c.source_key]} = "{opt?.label || '?'}"</span>;
                })}</span>
              </div>
            </div>
          )}
          {item.required ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sds-error)' }}>Required</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
