import React, { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SMART JSON RENDERER — turns any JSON payload into a human-readable UI
// ─────────────────────────────────────────────────────────────────────────────

/** Format a camelCase/snake_case key into a readable label */
function formatKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

/** Detect if a value looks like a URL/file path */
function isFilePath(val) {
  return typeof val === 'string' && (val.startsWith('/') || val.includes('://') || val.endsWith('.pdf') || val.endsWith('.docx'));
}

/** Render a single primitive value with appropriate styling */
function PrimitiveValue({ val, depth = 0 }) {
  if (val === null || val === undefined) {
    return <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>—</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <span style={{
        background: val ? 'hsla(var(--success), 0.15)' : 'hsla(var(--danger), 0.15)',
        color: val ? 'hsl(var(--success))' : 'hsl(var(--danger))',
        padding: '0.1rem 0.5rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700
      }}>
        {val ? '✓ Yes' : '✗ No'}
      </span>
    );
  }
  if (typeof val === 'number') {
    return <span style={{ color: 'hsl(var(--info))', fontWeight: 600 }}>{val}</span>;
  }
  if (isFilePath(val)) {
    return <span style={{ color: 'hsl(var(--secondary))', fontFamily: 'var(--font-mono)', fontSize: '0.8em', wordBreak: 'break-all' }}>{val.split('/').pop() || val}</span>;
  }
  // Long text → paragraph, short → inline
  if (typeof val === 'string' && val.length > 120) {
    return <p style={{ color: 'hsl(var(--text-primary))', lineHeight: 1.6, fontSize: '0.88rem', marginTop: '0.25rem' }}>{val}</p>;
  }
  return <span style={{ color: 'hsl(var(--text-primary))' }}>{String(val)}</span>;
}

/** Recursive smart renderer */
function SmartValue({ val, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (val === null || val === undefined || typeof val !== 'object') {
    return <PrimitiveValue val={val} />;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>Empty list</span>;

    // Array of primitives → pill list
    if (val.every(v => typeof v !== 'object' || v === null)) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
          {val.map((v, i) => (
            <span key={i} style={{
              background: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))',
              padding: '0.15rem 0.6rem', borderRadius: '9999px', fontSize: '0.8rem',
              border: '1px solid hsla(var(--primary), 0.2)'
            }}>{String(v)}</span>
          ))}
        </div>
      );
    }

    // Array of objects → expandable list
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
        {val.map((item, i) => (
          <div key={i} style={{
            background: 'rgba(0,0,0,0.15)', borderRadius: '8px',
            padding: '0.75rem 1rem', border: '1px solid hsl(var(--border-color))'
          }}>
            <SmartObject data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  // Object
  const keys = Object.keys(val);
  if (keys.length === 0) return <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>—</span>;

  if (depth > 0) {
    return (
      <div>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'hsla(var(--border-color), 0.5)', border: '1px solid hsl(var(--border-color))',
            borderRadius: '4px', padding: '0.1rem 0.5rem', fontSize: '0.75rem',
            color: 'hsl(var(--text-secondary))', cursor: 'pointer', marginBottom: collapsed ? 0 : '0.5rem'
          }}
        >
          {collapsed ? `▶ Show ${keys.length} field${keys.length > 1 ? 's' : ''}` : '▼ Collapse'}
        </button>
        {!collapsed && <SmartObject data={val} depth={depth + 1} />}
      </div>
    );
  }
  return <SmartObject data={val} depth={depth + 1} />;
}

function SmartObject({ data, depth = 0 }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: depth === 0 ? '0.85rem' : '0.5rem' }}>
      {entries.map(([key, val]) => (
        <div key={key} style={{
          display: typeof val === 'object' && val !== null && !Array.isArray(val) ? 'flex' : 'grid',
          gridTemplateColumns: typeof val === 'string' && val.length < 60 && typeof val !== 'boolean' ? '200px 1fr' : '1fr',
          flexDirection: 'column',
          gap: '0.3rem 1rem',
          alignItems: 'start'
        }}>
          <span style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))',
            textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', paddingTop: '0.1rem'
          }}>{formatKey(key)}</span>
          <SmartValue val={val} depth={depth} />
        </div>
      ))}
    </div>
  );
}

/** Top-level step output renderer with section detection */
function StepOutputRenderer({ output, stepName }) {
  if (!output || Object.keys(output).length === 0) {
    return <p style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', fontSize: '0.85rem' }}>No output recorded.</p>;
  }

  // Flatten single-key wrappers
  const keys = Object.keys(output);
  const data = keys.length === 1 && typeof output[keys[0]] === 'object' ? output[keys[0]] : output;

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)', borderRadius: '10px',
      padding: '1rem', border: '1px solid hsl(var(--border-color))'
    }}>
      <SmartObject data={data} depth={0} />
    </div>
  );
}

/** Render a bidding document's content_json in a magazine-style layout */
function BiddingDocumentRenderer({ doc }) {
  const [expanded, setExpanded] = useState(false);
  const content = doc.content_json || {};
  const keys = Object.keys(content);

  // Detect top-level string sections (e.g. executive_summary, cover_letter…)
  const sections = keys.filter(k => typeof content[k] === 'string' && content[k].length > 30);
  const fields   = keys.filter(k => !sections.includes(k));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Key fields row */}
      {fields.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.75rem'
        }}>
          {fields.map(k => (
            <div key={k} style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: '8px',
              padding: '0.75rem', border: '1px solid hsl(var(--border-color))'
            }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                {formatKey(k)}
              </p>
              <SmartValue val={content[k]} depth={1} />
            </div>
          ))}
        </div>
      )}

      {/* Text sections */}
      {sections.slice(0, expanded ? sections.length : 2).map(k => (
        <div key={k} style={{
          background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
          padding: '1rem', border: '1px solid hsl(var(--border-color))'
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            {formatKey(k)}
          </p>
          <p style={{ fontSize: '0.88rem', color: 'hsl(var(--text-primary))', lineHeight: 1.7 }}>
            {content[k]}
          </p>
        </div>
      ))}

      {sections.length > 2 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            alignSelf: 'flex-start', background: 'hsla(var(--primary), 0.1)',
            border: '1px solid hsla(var(--primary), 0.2)', borderRadius: '6px',
            padding: '0.4rem 1rem', fontSize: '0.8rem', color: 'hsl(var(--primary))', cursor: 'pointer'
          }}
        >
          {expanded ? '▲ Show Less' : `▼ Show ${sections.length - 2} More Section${sections.length - 2 > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

/** Render a filled annexure's data as a clean form-like display */
function FilledAnnexureRenderer({ filledData }) {
  if (!filledData || Object.keys(filledData).length === 0) {
    return <p style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', fontSize: '0.85rem' }}>No filled data available.</p>;
  }
  const entries = Object.entries(filledData);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '0.75rem'
    }}>
      {entries.map(([key, val]) => (
        <div key={key} style={{
          background: 'rgba(0,0,0,0.15)', borderRadius: '8px',
          padding: '0.75rem 1rem', border: '1px solid hsl(var(--border-color))',
          display: 'flex', flexDirection: 'column', gap: '0.3rem'
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--secondary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {formatKey(key)}
          </span>
          <SmartValue val={val} depth={1} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Step View Renderers
// ─────────────────────────────────────────────────────────────────────────────

/** Render a summary value that may contain rich content (lists, tables, objects) */
function SummaryRichValue({ val }) {
  if (val === null || val === undefined) return <span className="summary-value">—</span>;
  if (typeof val === 'boolean') return <span className="summary-value">{val ? 'Yes' : 'No'}</span>;
  if (typeof val === 'number') return <span className="summary-value">{val}</span>;
  if (typeof val === 'string') return <span className="summary-value">{val}</span>;

  if (Array.isArray(val)) {
    // Array of primitives → bullet list
    if (val.every(v => typeof v !== 'object' || v === null)) {
      return (
        <span className="summary-value">
          <ul className="summary-list">
            {val.map((item, i) => <li key={i}>{String(item)}</li>)}
          </ul>
        </span>
      );
    }
    // Array of objects (e.g. corrigendum items) → table
    const allKeys = [...new Set(val.flatMap(item => Object.keys(item || {})))];
    return (
      <span className="summary-value" style={{ width: '100%' }}>
        <div className="summary-table-wrapper">
          <table className="summary-table">
            <thead>
              <tr>{allKeys.map(k => <th key={k}>{formatKey(k)}</th>)}</tr>
            </thead>
            <tbody>
              {val.map((row, i) => (
                <tr key={i}>
                  {allKeys.map(k => (
                    <td key={k}>
                      {typeof row[k] === 'object' && row[k] !== null
                        ? JSON.stringify(row[k])
                        : String(row[k] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </span>
    );
  }

  if (typeof val === 'object') {
    // Nested object → render as sub-rows
    return (
      <span className="summary-value" style={{ width: '100%' }}>
        <div className="summary-nested">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="summary-row summary-nested-row">
              <span className="summary-label">{formatKey(k)}</span>
              <SummaryRichValue val={v} />
            </div>
          ))}
        </div>
      </span>
    );
  }

  return <span className="summary-value">{String(val)}</span>;
}

function TenderSummaryView({ data }) {
  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No summary data available.</p>;
  
  // Unwrap single key wrapper if present
  const keys = Object.keys(data);
  const content = keys.length === 1 && typeof data[keys[0]] === 'object' ? data[keys[0]] : data;
  
  return (
    <div className="custom-card">
      <div className="summary-container">
        {Object.entries(content).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
          <div key={key} className="summary-row">
            <span className="summary-label">{formatKey(key)}</span>
            <span className="summary-colon">:</span>
            <SummaryRichValue val={val} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Individual eligibility card with Read More toggle */
function EligibilityCard({ rule, idx }) {
  const [expanded, setExpanded] = useState(false);
  const isComplied = rule.complied === 'complied' || rule.passed === true;
  const description = rule.reason || rule.remarks || rule.citation || 'AI verified compliance match in company records.';
  const isLong = description.length > 180;

  return (
    <div className="eligibility-item">
      <div className="eligibility-header">
        {isComplied ? (
          <span className="eligibility-icon eligibility-icon--pass">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        ) : (
          <span className="eligibility-icon eligibility-icon--fail">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        )}
        <label className="eligibility-title">
          {rule.clause || rule.requirement_name || `Requirement #${idx+1}`}
        </label>
      </div>
      <div className={`eligibility-desc ${!expanded && isLong ? 'eligibility-desc--clamped' : ''}`}>
        {description}
      </div>
      {isLong && (
        <button className="eligibility-read-more" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show Less' : 'Read More'}
        </button>
      )}
      {rule.documents_complied && (
        <div className="eligibility-footer">
          <span className="eligibility-footer-label">Complied Documents:</span>
          <span className="eligibility-footer-value">
            {Array.isArray(rule.documents_complied) ? rule.documents_complied.join(', ') : String(rule.documents_complied)}
          </span>
        </div>
      )}
    </div>
  );
}

function EligibilityView({ data }) {
  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No eligibility data available.</p>;
  
  let rules = [];
  if (data.score !== undefined) {
    rules = data.details?.rules || [];
  } else if (data.Data && data.Data.length > 0) {
    const details = data.Data[0].company_eligibility_details || {};
    rules = details.ai_eligibility || [];
  } else if (Array.isArray(data)) {
    rules = data;
  } else if (data.rules) {
    rules = data.rules;
  }

  if (rules.length === 0) {
    return (
      <div className="custom-card">
        <SmartObject data={data} />
      </div>
    );
  }

  // Count complied vs not-complied
  const compliedCount = rules.filter(r => r.complied === 'complied' || r.passed === true).length;
  const totalCount = rules.length;

  return (
    <div className="custom-card" style={{ padding: '0.75rem' }}>
      {/* Score summary bar */}
      <div className="eligibility-score-bar">
        <span className="eligibility-score-pass">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {compliedCount} Complied
        </span>
        <span className="eligibility-score-fail">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {totalCount - compliedCount} Not Complied
        </span>
        <span className="eligibility-score-total">
          Total: {totalCount} Criteria
        </span>
      </div>

      <div className="eligibility-container">
        {rules.map((rule, idx) => (
          <EligibilityCard key={idx} rule={rule} idx={idx} />
        ))}
      </div>
    </div>
  );
}

function FinalResponseView({ run, artifacts, selectedTab, setSelectedTab }) {
  if (!artifacts) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No artifacts available yet.</p>;

  return (
    <div className="custom-card" style={{ padding: 0 }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid hsl(var(--border-color))' }}>
        <div className="final-response-header">
          <div className="final-response-stat">
            <span className="final-response-label">Company :</span>
            <span className="final-response-value" style={{ color: 'hsl(var(--primary))' }}>{run?.company_name}</span>
          </div>
          <div className="final-response-stat">
            <span className="final-response-label">Tender Ref :</span>
            <span className="final-response-value">{run?.tender_reference}</span>
          </div>
          <div className="final-response-stat">
            <span className="final-response-label">Status :</span>
            <span className="final-response-value">{run?.status}</span>
          </div>
        </div>
        
        <div className="flex-between">
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>Prepare Response</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn-secondary ${selectedTab === 'documents' ? 'btn-primary' : ''}`} 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px' }}
              onClick={() => setSelectedTab('documents')}
            >
              Bidding Documents
            </button>
            <button 
              className={`btn-secondary ${selectedTab === 'annexures' ? 'btn-primary' : ''}`} 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px' }}
              onClick={() => setSelectedTab('annexures')}
            >
              Filled Annexures
            </button>
          </div>
        </div>
      </div>
      
      <div style={{ padding: '1.25rem' }}>
        {selectedTab === 'documents' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {artifacts?.bidding_documents?.map(doc => (
              <div key={doc.id} className="eligibility-item">
                <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                  <h4 style={{ fontWeight: 600, fontSize: '0.95rem', color: 'hsl(var(--primary))' }}>{doc.title || doc.document_type}</h4>
                  <span className="badge badge-completed" style={{ fontSize: '0.65rem' }}>{doc.status}</span>
                </div>
                <BiddingDocumentRenderer doc={doc} />
              </div>
            ))}
            {(!artifacts?.bidding_documents || artifacts.bidding_documents.length === 0) && (
              <p style={{ color: 'hsl(var(--text-muted))' }}>No bidding documents generated.</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {artifacts?.filled_annexures?.map(fa => (
              <div key={fa.id} className="eligibility-item">
                <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                  <h4 style={{ fontWeight: 600, fontSize: '0.95rem', color: 'hsl(var(--secondary))' }}>
                    {fa.annexure_code}: {fa.annexure_title}
                  </h4>
                  <span className="badge badge-completed" style={{ fontSize: '0.65rem' }}>Filled</span>
                </div>
                <FilledAnnexureRenderer filledData={fa.filled_data} />
              </div>
            ))}
            {(!artifacts?.filled_annexures || artifacts.filled_annexures.length === 0) && (
              <p style={{ color: 'hsl(var(--text-muted))' }}>No annexures generated.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Dedicated view for Annexure Template Generation step output */
function TemplateGenerationView({ data }) {
  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No template generation data available.</p>;

  // Unwrap single key wrapper if present
  const keys = Object.keys(data);
  const content = keys.length === 1 && typeof data[keys[0]] === 'object' ? data[keys[0]] : data;

  // Try to extract templates/results array from various possible shapes
  let templates = [];
  if (Array.isArray(content)) {
    templates = content;
  } else if (content.templates) {
    templates = Array.isArray(content.templates) ? content.templates : [content.templates];
  } else if (content.results) {
    templates = Array.isArray(content.results) ? content.results : [content.results];
  } else if (content.generated_templates) {
    templates = Array.isArray(content.generated_templates) ? content.generated_templates : [content.generated_templates];
  }

  if (templates.length === 0) {
    // Fallback: render as key-value summary
    return (
      <div className="custom-card">
        <div className="summary-container">
          {Object.entries(content).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
            <div key={key} className="summary-row">
              <span className="summary-label">{formatKey(key)}</span>
              <span className="summary-colon">:</span>
              <SummaryRichValue val={val} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="custom-card" style={{ padding: '0.75rem' }}>
      <div className="template-gen-header">
        <span className="template-gen-count">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          {templates.length} Template{templates.length !== 1 ? 's' : ''} Generated
        </span>
      </div>
      <div className="eligibility-container">
        {templates.map((tmpl, idx) => {
          const title = tmpl.title || tmpl.annexure_title || tmpl.template_name || tmpl.name || tmpl.annexure_code || `Template #${idx + 1}`;
          const code = tmpl.annexure_code || tmpl.code || tmpl.annexure_id || '';
          const status = tmpl.status || 'generated';
          const fields = Object.entries(tmpl).filter(([k]) => !['title', 'annexure_title', 'template_name', 'name', 'annexure_code', 'code', 'annexure_id', 'status'].includes(k));

          return (
            <div key={idx} className="eligibility-item">
              <div className="eligibility-header">
                <span className="eligibility-icon eligibility-icon--pass">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </span>
                <label className="eligibility-title">{title}</label>
                {code && <span className="template-code-badge">{code}</span>}
                <span className={`badge badge-completed`} style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>{status}</span>
              </div>
              {fields.length > 0 && (
                <div className="template-fields">
                  {fields.map(([k, v]) => (
                    <div key={k} className="template-field-row">
                      <span className="template-field-label">{formatKey(k)}</span>
                      <span className="template-field-value">
                        {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dedicated view for Autofill Template step output */
function AutofillView({ data }) {
  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No autofill data available.</p>;

  // Unwrap single key wrapper if present
  const keys = Object.keys(data);
  const content = keys.length === 1 && typeof data[keys[0]] === 'object' ? data[keys[0]] : data;

  // Try to extract filled items from various possible shapes
  let filledItems = [];
  if (Array.isArray(content)) {
    filledItems = content;
  } else if (content.filled_templates) {
    filledItems = Array.isArray(content.filled_templates) ? content.filled_templates : [content.filled_templates];
  } else if (content.results) {
    filledItems = Array.isArray(content.results) ? content.results : [content.results];
  } else if (content.autofilled) {
    filledItems = Array.isArray(content.autofilled) ? content.autofilled : [content.autofilled];
  }

  if (filledItems.length === 0) {
    // Fallback: render as key-value summary (same style as summary view)
    return (
      <div className="custom-card">
        <div className="summary-container">
          {Object.entries(content).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
            <div key={key} className="summary-row">
              <span className="summary-label">{formatKey(key)}</span>
              <span className="summary-colon">:</span>
              <SummaryRichValue val={val} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="custom-card" style={{ padding: '0.75rem' }}>
      <div className="template-gen-header">
        <span className="template-gen-count">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {filledItems.length} Template{filledItems.length !== 1 ? 's' : ''} Auto-filled
        </span>
      </div>
      <div className="eligibility-container">
        {filledItems.map((item, idx) => {
          const title = item.title || item.annexure_title || item.template_name || item.name || item.annexure_code || `Template #${idx + 1}`;
          const code = item.annexure_code || item.code || item.annexure_id || '';
          const filledData = item.filled_data || item.data || item.fields || {};
          const filledEntries = typeof filledData === 'object' && !Array.isArray(filledData)
            ? Object.entries(filledData)
            : [];
          // Also show other simple fields from the item itself
          const metaFields = Object.entries(item).filter(([k]) => 
            !['title', 'annexure_title', 'template_name', 'name', 'annexure_code', 'code', 'annexure_id', 'filled_data', 'data', 'fields'].includes(k) &&
            typeof item[k] !== 'object'
          );

          return (
            <div key={idx} className="eligibility-item">
              <div className="eligibility-header">
                <span className="eligibility-icon" style={{ color: 'hsl(var(--secondary))', display: 'flex' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </span>
                <label className="eligibility-title" style={{ color: 'hsl(var(--secondary))' }}>{title}</label>
                {code && <span className="template-code-badge">{code}</span>}
                <span className="badge badge-completed" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>Filled</span>
              </div>
              {metaFields.length > 0 && (
                <div className="template-fields" style={{ marginBottom: '0.5rem' }}>
                  {metaFields.map(([k, v]) => (
                    <div key={k} className="template-field-row">
                      <span className="template-field-label">{formatKey(k)}</span>
                      <span className="template-field-value">{String(v ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}
              {filledEntries.length > 0 && (
                <div className="autofill-data-grid">
                  {filledEntries.map(([k, v]) => (
                    <div key={k} className="autofill-data-cell">
                      <span className="autofill-data-label">{formatKey(k)}</span>
                      <span className="autofill-data-value">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom SVG Icons to avoid external icon package dependency issues
const Icons = {
  Login: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
  ),
  Logout: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  ),
  History: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M3.3 7A10 10 0 1 1 3.3 17"/></svg>
  ),
  Play: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  ),
  ExternalLink: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
  ),
  Refresh: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  ),
  Info: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  Warning: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
  ArrowLeft: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
  ),
  FileText: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  ),
  Eye: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  )
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password123');
  const [loginError, setLoginError] = useState('');

  // Metadata Lists
  const [companies, setCompanies] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [runs, setRuns] = useState([]);
  
  // App view states
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'pipeline'
  const [selectedRun, setSelectedRun] = useState(null);
  const [runSteps, setRunSteps] = useState([]);
  const [runArtifacts, setRunArtifacts] = useState(null);
  const [workflowStatus, setWorkflowStatus] = useState(null);

  // New Run inputs
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [signalTimeout, setSignalTimeout] = useState(3600);
  const [customPayload, setCustomPayload] = useState('{\n  "additional_requirements": "Fast delivery requested"\n}');
  const [startLoading, setStartLoading] = useState(false);

  // Inspector / Modal states
  const [inspectedStep, setInspectedStep] = useState(null);
  const [selectedArtifactTab, setSelectedArtifactTab] = useState('documents'); // 'documents' | 'annexures'

  // HITL selection checkboxes
  const [selectedAnnexureIds, setSelectedAnnexureIds] = useState([]);
  const [submittingHITL, setSubmittingHITL] = useState(false);

  // Loading indicator for background fetches
  const [globalLoading, setGlobalLoading] = useState(false);

  // Reference for polling interval
  const pollTimerRef = useRef(null);

  // Auth Header helper
  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!res.ok) {
        throw new Error('Invalid username or password');
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentView('dashboard');
    setSelectedRun(null);
    setRunSteps([]);
    setRunArtifacts(null);
    setWorkflowStatus(null);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  // Fetch Companies & Tenders
  const fetchMetadata = async () => {
    if (!token) return;
    try {
      setGlobalLoading(true);
      const [compRes, tendRes, runsRes] = await Promise.all([
        fetch('/metadata/companies', { headers: getAuthHeaders() }),
        fetch('/metadata/tenders', { headers: getAuthHeaders() }),
        fetch('/metadata/runs', { headers: getAuthHeaders() })
      ]);

      if (compRes.status === 401 || tendRes.status === 401) {
        handleLogout();
        return;
      }

      const compData = await compRes.json();
      const tendData = await tendRes.json();
      const runsData = await runsRes.json();

      setCompanies(compData);
      setTenders(tendData);
      setRuns(runsData);

      if (compData.length > 0) setSelectedCompanyId(compData[0].id);
      if (tendData.length > 0) setSelectedTenderId(tendData[0].id);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Fetch historical runs
  const fetchRunsOnly = async () => {
    if (!token) return;
    try {
      const res = await fetch('/metadata/runs', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch active run details
  const fetchRunDetails = async (run) => {
    if (!token || !run) return;
    try {
      // 1. Fetch database steps
      const stepsRes = await fetch(`/metadata/runs/${run.id}/steps`, { headers: getAuthHeaders() });
      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        setRunSteps(stepsData);
      }

      // 2. Fetch workflow status from Temporal (if workflow_id exists)
      if (run.workflow_id && run.workflow_id !== 'pending') {
        const wfRes = await fetch(`/pipeline/${run.workflow_id}/status`, { headers: getAuthHeaders() });
        if (wfRes.ok) {
          const wfData = await wfRes.json();
          setWorkflowStatus(wfData);
          
          // Pre-populate HITL annexure check if we just transitioned to wait state
          if (wfData.status === 'waiting_for_selection' && selectedAnnexureIds.length === 0) {
            const listStep = wfData.workflow_state?.annexure_listing;
            const detectedAnnexureIds = [];
            for (const fileResult of (listStep?.results || [])) {
              for (const temp of (fileResult?.result?.templates || [])) {
                if (temp.annexure_id) detectedAnnexureIds.push(temp.annexure_id);
              }
            }
            setSelectedAnnexureIds(detectedAnnexureIds);
          }
        }
      }

      // 3. Fetch artifacts (if completed)
      if (run.status === 'completed') {
        const artRes = await fetch(`/metadata/runs/${run.id}/artifacts`, { headers: getAuthHeaders() });
        if (artRes.ok) {
          const artData = await artRes.json();
          setRunArtifacts(artData);
        }
      }
    } catch (err) {
      console.error('Error fetching run details:', err);
    }
  };

  // Initial metadata fetch
  useEffect(() => {
    if (token) {
      fetchMetadata();
    }
  }, [token]);

  // Handle active run polling
  useEffect(() => {
    if (selectedRun) {
      fetchRunDetails(selectedRun);

      // Start polling if run is active
      const isActive = selectedRun.status === 'running' || selectedRun.status === 'pending';
      if (isActive) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          // Refresh run record first to see if status updated in DB
          const runsRes = await fetch('/metadata/runs', { headers: getAuthHeaders() });
          if (runsRes.ok) {
            const runsData = await runsRes.json();
            setRuns(runsData);
            const updated = runsData.find(r => r.id === selectedRun.id);
            if (updated) {
              setSelectedRun(updated);
              fetchRunDetails(updated);
              if (updated.status === 'completed' || updated.status === 'failed') {
                clearInterval(pollTimerRef.current);
              }
            }
          }
        }, 2000);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedRun]);

  // Start Pipeline Trigger
  const handleStartPipeline = async () => {
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(customPayload);
    } catch (err) {
      alert('Invalid custom payload JSON format.');
      return;
    }

    setStartLoading(true);
    try {
      const res = await fetch('/pipeline/start', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tender_id: selectedTenderId,
          company_id: selectedCompanyId,
          payload: parsedPayload,
          selection_signal_timeout_seconds: signalTimeout
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to start pipeline');
      }

      const data = await res.json();
      
      // Refresh list and navigate to visualizer
      await fetchMetadata();
      
      // Find the new run and set it as active
      const activeRun = runs.find(r => r.workflow_id === data.workflow_id);
      if (activeRun) {
        setSelectedRun(activeRun);
      } else {
        // Fallback: poll until it shows up or view dashboard
        const refreshRuns = await fetch('/metadata/runs', { headers: getAuthHeaders() });
        const runsData = await refreshRuns.json();
        setRuns(runsData);
        const newRun = runsData.find(r => r.workflow_id === data.workflow_id);
        if (newRun) setSelectedRun(newRun);
      }
      setCurrentView('pipeline');
    } catch (err) {
      alert(`Error starting pipeline: ${err.message}`);
    } finally {
      setStartLoading(false);
    }
  };

  // Submit HITL Annexure Selection
  const handleResumePipeline = async () => {
    if (selectedAnnexureIds.length === 0) {
      alert('Please select at least one annexure.');
      return;
    }

    setSubmittingHITL(true);
    try {
      // 1. Signal workflow
      const resumeRes = await fetch(`/pipeline/${selectedRun.workflow_id}/resume`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          annexure_ids: selectedAnnexureIds
        })
      });

      if (!resumeRes.ok) {
        throw new Error('Failed to signal Temporal workflow');
      }

      // 2. Submit Approval step details to DB
      await fetch(`/approvals/${selectedRun.workflow_id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          step_name: 'list_annexures',
          approval_type: 'annexure_selection',
          actor: 'admin',
          decision: 'approve',
          comments: `Approved selection of ${selectedAnnexureIds.length} annexure templates`,
          payload: { selected_annexure_ids: selectedAnnexureIds }
        })
      });

      // Refresh status immediately
      fetchRunDetails(selectedRun);
    } catch (err) {
      alert(`Error submitting approval: ${err.message}`);
    } finally {
      setSubmittingHITL(false);
    }
  };

  // Stepper steps configuration
  const stepsConfig = [
    { name: 'fetch_tender_summary', label: 'Tender Summary', desc: 'AI summarizes tender specifications', type: 'ai_call' },
    { name: 'evaluate_eligibility', label: 'Eligibility Check', desc: 'AI compliance evaluation', type: 'ai_call' },
    { name: 'list_annexures', label: 'Annexures Selection', desc: 'AI extracts templates & HITL approval', type: 'hitl' },
    { name: 'generate_templates', label: 'Template Generation', desc: 'AI structures response templates', type: 'ai_call' },
    { name: 'autofill_template', label: 'Autofill templates', desc: 'AI populates company data', type: 'ai_call' },
    { name: 'generate_final_response', label: 'Final Response Assembly', desc: 'AI generates finalized bid document', type: 'ai_call' }
  ];

  // Helper to determine step status
  const getStepStatus = (stepName) => {
    // If run failed, find where it failed
    const dbStep = runSteps.find(s => s.step_name === stepName);
    
    // HITL Checkpoint check
    if (stepName === 'list_annexures') {
      if (workflowStatus?.status === 'waiting_for_selection') {
        return 'waiting';
      }
      if (workflowStatus?.status === 'selected') {
        return 'completed';
      }
    }

    if (dbStep) {
      return dbStep.status; // 'pending' | 'in_progress' | 'completed' | 'failed'
    }

    // Fallback: If previous steps are completed, this one might be next or pending
    return 'pending';
  };

  // Login Screen Render
  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ 
              display: 'inline-flex', 
              padding: '1rem', 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
              color: 'hsl(var(--primary))',
              marginBottom: '1rem',
              border: '1px solid rgba(99, 102, 241, 0.2)'
            }}>
              <Icons.Login />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
              Tender Orchestrator
            </h1>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.875rem' }}>
              Durable AI Bidding & Document Pipeline
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label>Username</label>
              <input
                type="text"
                className="input-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                className="input-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            {loginError && (
              <div style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem', fontWeight: 500 }}>
                ⚠️ {loginError}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
              Sign In to Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Premium Header */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '1rem 2rem', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="container" style={{ padding: 0, display: 'flex', justifyContent: 'between', alignItems: 'center', maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => { setCurrentView('dashboard'); setSelectedRun(null); }}>
            <div style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '8px', 
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              color: 'white',
              boxShadow: 'var(--shadow-glow)'
            }}>
              T
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Tender Bid Orchestrator</h2>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                System Online <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--success))', display: 'inline-block' }}></span>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a 
              href="http://localhost:8088" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-secondary" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '6px' }}
            >
              Temporal Dashboard <Icons.ExternalLink />
            </a>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1rem', borderLeft: '1px solid hsl(var(--border-color))' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{username}</p>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>Orchestrator Admin</p>
              </div>
              <button 
                onClick={handleLogout} 
                className="btn-secondary" 
                style={{ padding: '0.5rem', borderRadius: '6px', color: 'hsl(var(--danger))' }}
                title="Log Out"
              >
                <Icons.Logout />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main View Container */}
      <main className="container">
        {currentView === 'dashboard' ? (
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
            
            {/* Left Column: Launch Form */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Execute Pipeline</h3>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem' }}>Create durable Temporal bid workflow</p>
              </div>

              <div className="input-group">
                <label>Target Company Profile</label>
                <select 
                  className="input-control" 
                  value={selectedCompanyId} 
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.country})</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Tender Document Reference</label>
                <select 
                  className="input-control" 
                  value={selectedTenderId} 
                  onChange={(e) => setSelectedTenderId(e.target.value)}
                >
                  {tenders.map(t => (
                    <option key={t.id} value={t.id}>{t.tender_reference}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>HITL Signal Timeout (Seconds)</label>
                <input 
                  type="number" 
                  className="input-control" 
                  value={signalTimeout} 
                  onChange={(e) => setSignalTimeout(parseInt(e.target.value))} 
                />
              </div>

              <div className="input-group">
                <label>Workflow Input Payload (JSON)</label>
                <textarea 
                  className="input-control" 
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', height: '100px', resize: 'vertical' }}
                  value={customPayload}
                  onChange={(e) => setCustomPayload(e.target.value)}
                />
              </div>

              <button 
                onClick={handleStartPipeline} 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={startLoading || companies.length === 0 || tenders.length === 0}
              >
                {startLoading ? 'Spawning Workflow...' : <><Icons.Play /> Start AI Pipeline</>}
              </button>
            </div>

            {/* Right Column: Run History */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Pipeline Executions</h3>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem' }}>Durable runs persisted in PostgreSQL</p>
                  </div>
                  <button onClick={fetchMetadata} className="btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                    <Icons.Refresh /> Refresh
                  </button>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Workflow ID</th>
                        <th>Tender Ref</th>
                        <th>Company Name</th>
                        <th>Status</th>
                        <th>Triggered At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'hsl(var(--text-secondary))' }}>
                            No pipeline runs found. Click "Start AI Pipeline" to trigger the first run!
                          </td>
                        </tr>
                      ) : (
                        runs.map(run => {
                          const date = new Date(run.created_at);
                          return (
                            <tr key={run.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'hsl(var(--primary))' }} title={run.workflow_id}>
                                {run.workflow_id.length > 25 ? run.workflow_id.substring(0, 25) + '...' : run.workflow_id}
                              </td>
                              <td style={{ fontWeight: 500 }}>{run.tender_reference}</td>
                              <td>{run.company_name}</td>
                              <td>
                                <span className={`badge badge-${run.status}`}>
                                  {run.status === 'waiting_for_selection' ? 'Reviewing' : run.status}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td>
                                <button 
                                  onClick={() => { setSelectedRun(run); setCurrentView('pipeline'); }} 
                                  className="btn-secondary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                  <Icons.Eye /> Monitor
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Seeded Data Information */}
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Available Local Seed Profiles</h3>
                <div className="grid grid-cols-2">
                  <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '10px' }}>
                    <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: 'hsl(var(--primary))', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icons.FileText /> Company Files
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '0.5rem' }}>
                      <strong>18 documents</strong> uploaded for eligibility checking and template autofilling.
                    </p>
                    <ul style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', paddingLeft: '1.2rem' }}>
                      <li>Financial Audit Certificates (Work Experience)</li>
                      <li>Tax Registration documents (PAN, TAN, GST)</li>
                      <li>Quality assurance credentials (ISO, BIS)</li>
                    </ul>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '10px' }}>
                    <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: 'hsl(var(--secondary))', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Icons.FileText /> Tender Attachment Files
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '0.5rem' }}>
                      <strong>15 PDF/HTML specifications</strong> extracted for AI parsing and requirements checklists.
                    </p>
                    <ul style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', paddingLeft: '1.2rem' }}>
                      <li>Scope of Work documents</li>
                      <li>Technical requirement attachments</li>
                      <li>Pre-qualification annexure templates</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* Pipeline Visualizer View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Controls Bar */}
            <div className="glass-panel" style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
              <button onClick={() => { setCurrentView('dashboard'); setSelectedRun(null); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem' }}>
                <Icons.ArrowLeft /> Back to Dashboard
              </button>

              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Workflow: {selectedRun?.workflow_id}</h3>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
                  Status: <span className={`badge badge-${selectedRun?.status}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.5rem' }}>{selectedRun?.status}</span>
                </p>
              </div>

              <button onClick={() => fetchRunDetails(selectedRun)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.6rem 1.2rem' }}>
                <Icons.Refresh /> Refresh State
              </button>
            </div>

            {/* Visual Stepper */}
            <div className="glass-panel" style={{ padding: '3rem 2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', width: '100%' }}>
                
                {/* Horizontal Connector Line background */}
                <div style={{ 
                  position: 'absolute', 
                  top: '24px', 
                  left: '50px', 
                  right: '50px', 
                  height: '4px', 
                  backgroundColor: 'hsl(var(--border-color))',
                  zIndex: 1 
                }}></div>

                {/* Horizontal Connector Line Active progress */}
                <div style={{ 
                  position: 'absolute', 
                  top: '24px', 
                  left: '50px', 
                  width: `${(() => {
                    const completedCount = stepsConfig.filter(s => getStepStatus(s.name) === 'completed').length;
                    return (completedCount / (stepsConfig.length - 1)) * 90;
                  })()}%`,
                  height: '4px', 
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))',
                  zIndex: 2,
                  transition: 'width 0.5s ease'
                }}></div>

                {stepsConfig.map((step, idx) => {
                  const status = getStepStatus(step.name);
                  
                  let circleClass = 'pending';
                  let styleGlow = {};
                  if (status === 'completed') {
                    circleClass = 'completed';
                  } else if (status === 'in_progress' || status === 'running') {
                    circleClass = 'running';
                    styleGlow = { boxShadow: '0 0 15px hsla(var(--primary), 0.6)', border: '2px solid hsl(var(--primary))' };
                  } else if (status === 'waiting') {
                    circleClass = 'waiting';
                    styleGlow = { boxShadow: '0 0 15px hsla(var(--warning), 0.6)', border: '2px solid hsl(var(--warning))' };
                  } else if (status === 'failed') {
                    circleClass = 'failed';
                  }

                  return (
                    <div 
                      key={step.name} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        zIndex: 3, 
                        width: '120px', 
                        cursor: 'pointer' 
                      }}
                      onClick={() => {
                        const dbStep = runSteps.find(s => s.step_name === step.name);
                        if (dbStep) setInspectedStep(dbStep);
                      }}
                    >
                      <div 
                        style={{ 
                          width: '48px', 
                          height: '48px', 
                          borderRadius: '50%', 
                          background: circleClass === 'completed' 
                            ? 'linear-gradient(135deg, hsl(var(--success)), #059669)'
                            : circleClass === 'running'
                            ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))'
                            : circleClass === 'waiting'
                            ? 'linear-gradient(135deg, hsl(var(--warning)), #d97706)'
                            : circleClass === 'failed'
                            ? 'linear-gradient(135deg, hsl(var(--danger)), #e11d48)'
                            : 'hsl(var(--bg-main))',
                          border: circleClass === 'pending' ? '2px solid hsl(var(--border-color))' : 'none',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 700,
                          transition: 'all 0.3s ease',
                          ...styleGlow
                        }}
                        className={circleClass === 'running' ? 'badge-running' : circleClass === 'waiting' ? 'badge-waiting' : ''}
                      >
                        {status === 'completed' ? (
                          <Icons.Check />
                        ) : status === 'waiting' ? (
                          '!'
                        ) : (
                          idx + 1
                        )}
                      </div>
                      
                      <span style={{ 
                        marginTop: '0.75rem', 
                        fontSize: '0.85rem', 
                        fontWeight: 600, 
                        textAlign: 'center',
                        color: status === 'pending' ? 'hsl(var(--text-secondary))' : 'hsl(var(--text-primary))'
                      }}>
                        {step.label}
                      </span>
                      
                      <span style={{ 
                        fontSize: '0.65rem', 
                        color: 'hsl(var(--text-secondary))', 
                        textAlign: 'center',
                        marginTop: '0.2rem',
                        lineHeight: 1.2
                      }}>
                        {step.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area: Changes based on inspected step */}
            <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {!inspectedStep ? (
                  <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ color: 'hsl(var(--primary))', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                      <Icons.Info />
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Select a Pipeline Step</h3>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>
                      Click on any step in the timeline above to view its detailed outputs and associated UI.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tender Summary View */}
                    {inspectedStep.step_name === 'fetch_tender_summary' && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Icons.Info /> Tender Summary
                        </h3>
                        <TenderSummaryView data={inspectedStep.output} />
                      </div>
                    )}

                    {/* Eligibility View */}
                    {inspectedStep.step_name === 'evaluate_eligibility' && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Icons.Info /> AI Eligibility Check Summary
                        </h3>
                        <EligibilityView data={inspectedStep.output} />
                      </div>
                    )}

                    {/* Annexure Selection (HITL) View */}
                    {inspectedStep.step_name === 'list_annexures' && (
                      <div className="glass-panel" style={{ padding: '2rem', border: workflowStatus?.status === 'waiting_for_selection' ? '1px solid hsla(var(--warning), 0.3)' : undefined, boxShadow: workflowStatus?.status === 'waiting_for_selection' ? 'var(--shadow-warning)' : undefined }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'start', marginBottom: '1.5rem' }}>
                          {workflowStatus?.status === 'waiting_for_selection' && (
                            <div style={{ color: 'hsl(var(--warning))', padding: '0.5rem', background: 'hsla(var(--warning), 0.1)', borderRadius: '8px' }}>
                              <Icons.Warning />
                            </div>
                          )}
                          <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                              {workflowStatus?.status === 'waiting_for_selection' ? 'Human-in-the-Loop Action Required' : 'Annexures Selection'}
                            </h3>
                            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem' }}>
                              {workflowStatus?.status === 'waiting_for_selection' 
                                ? 'AI has processed the tender and detected the following Annexure response templates. Please select which templates are required for compilation.'
                                : 'Annexure templates extracted by the AI.'}
                            </p>
                          </div>
                        </div>

                        <div className="custom-card" style={{ padding: 0, marginBottom: '1.5rem' }}>
                          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                            <table>
                              <thead>
                                <tr>
                                  <th style={{ width: '40px' }}>Select</th>
                                  <th>Annexure Code</th>
                                  <th>Description / Title</th>
                                  <th>Source File</th>
                                  <th>Page Range</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  // Fallback to inspectedStep.output if workflowStatus is missing
                                  const listStep = workflowStatus?.workflow_state?.annexure_listing || inspectedStep.output;
                                  const items = [];
                                  for (const fileResult of (listStep?.results || [])) {
                                    for (const temp of (fileResult?.result?.templates || [])) {
                                      items.push({
                                        code: temp.annexure_id,
                                        title: temp.title || temp.description || 'Response template',
                                        file_path: fileResult.file_path,
                                        range: `${temp.start_page || 0} - ${temp.end_page || 0}`
                                      });
                                    }
                                  }

                                  if (items.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No templates detected in workflow state.</td>
                                      </tr>
                                    );
                                  }

                                  return items.map(item => (
                                    <tr key={item.code}>
                                      <td>
                                        <input 
                                          type="checkbox" 
                                          checked={selectedAnnexureIds.includes(item.code)} 
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedAnnexureIds([...selectedAnnexureIds, item.code]);
                                            } else {
                                              setSelectedAnnexureIds(selectedAnnexureIds.filter(id => id !== item.code));
                                            }
                                          }}
                                          disabled={workflowStatus?.status !== 'waiting_for_selection'}
                                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                      </td>
                                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'hsl(var(--secondary))' }}>{item.code}</td>
                                      <td>{item.title}</td>
                                      <td style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>{item.file_path?.split('/').pop()}</td>
                                      <td>{item.range}</td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {workflowStatus?.status === 'waiting_for_selection' && (
                          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'end' }}>
                            <button 
                              onClick={() => {
                                const listStep = workflowStatus.workflow_state?.annexure_listing;
                                const codes = [];
                                for (const fileResult of (listStep?.results || [])) {
                                  for (const temp of (fileResult?.result?.templates || [])) {
                                    if (temp.annexure_id) codes.push(temp.annexure_id);
                                  }
                                }
                                setSelectedAnnexureIds(codes);
                              }} 
                              className="btn-secondary" 
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                              Select All
                            </button>
                            <button 
                              onClick={() => setSelectedAnnexureIds([])} 
                              className="btn-secondary" 
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                              Clear Selection
                            </button>
                            <button 
                              onClick={handleResumePipeline} 
                              className="btn-primary" 
                              style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem', boxShadow: 'var(--shadow-warning)' }}
                              disabled={submittingHITL}
                            >
                              {submittingHITL ? 'Signaling Workflow...' : 'Approve & Resume Pipeline'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Final Response View */}
                    {inspectedStep.step_name === 'generate_final_response' && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Generated Bid Artifacts</h3>
                        <FinalResponseView 
                          run={selectedRun} 
                          artifacts={runArtifacts} 
                          selectedTab={selectedArtifactTab} 
                          setSelectedTab={setSelectedArtifactTab} 
                        />
                      </div>
                    )}

                    {/* Template Generation View */}
                    {inspectedStep.step_name === 'generate_templates' && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Icons.FileText /> Annexure Template Generation
                        </h3>
                        <TemplateGenerationView data={inspectedStep.output} />
                      </div>
                    )}

                    {/* Autofill View */}
                    {inspectedStep.step_name === 'autofill_template' && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Icons.FileText /> Auto-filled Templates
                        </h3>
                        <AutofillView data={inspectedStep.output} />
                      </div>
                    )}

                    {/* Generic Step View for any remaining steps without a dedicated view */}
                    {!['fetch_tender_summary', 'evaluate_eligibility', 'list_annexures', 'generate_final_response', 'generate_templates', 'autofill_template'].includes(inspectedStep.step_name) && (
                      <div className="glass-panel" style={{ padding: '2rem' }}>
                        <div className="flex-between" style={{ borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                          <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatKey(inspectedStep.step_name)}</h3>
                            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
                              Step: <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--secondary))' }}>{inspectedStep.step_name}</span>
                              {' · '}
                              Status: <span className={`badge badge-${inspectedStep.status}`} style={{ fontSize: '0.65rem' }}>{inspectedStep.status}</span>
                            </p>
                          </div>
                        </div>
                        {inspectedStep.output && Object.keys(inspectedStep.output).length > 0 ? (
                          <div className="custom-card">
                            <div className="summary-container">
                              {Object.entries(inspectedStep.output).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
                                <div key={key} className="summary-row">
                                  <span className="summary-label">{formatKey(key)}</span>
                                  <span className="summary-colon">:</span>
                                  <SummaryRichValue val={val} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>No output data recorded for this step.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Error display below the main content */}
              {inspectedStep?.error && Object.keys(inspectedStep.error).length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <strong style={{ color: 'hsl(var(--danger))', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Icons.Warning /> Error Details
                  </strong>
                  <div style={{
                    background: 'hsla(var(--danger), 0.05)', borderRadius: '8px',
                    padding: '0.85rem 1rem', border: '1px solid hsla(var(--danger), 0.2)',
                    fontSize: '0.83rem', color: 'hsl(var(--danger))', lineHeight: 1.6
                  }}>
                    {typeof inspectedStep.error === 'string'
                      ? inspectedStep.error
                      : inspectedStep.error.message || inspectedStep.error.detail || JSON.stringify(inspectedStep.error)}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}
      </main>
    </div>
  );
}
