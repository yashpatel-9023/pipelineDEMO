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

/** Parse HTML string and extract clean text/structure */
function parseHtmlContent(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return null;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    // Check if it's a full HTML document
    const isFullDoc = htmlString.includes('<!DOCTYPE') || htmlString.includes('<html');
    
    if (isFullDoc) {
      // Extract body content for full documents
      const bodyContent = doc.body.innerHTML;
      return { type: 'html', content: bodyContent };
    }
    
    // For fragments, check what we have
    const root = doc.body;
    if (!root || root.children.length === 0) return null;
    
    // Check if it's a table
    if (root.querySelector('table')) {
      return { type: 'table', content: root.innerHTML };
    }
    
    // Check if it's a list
    if (root.querySelector('ul, ol')) {
      return { type: 'list', content: root.innerHTML };
    }
    
    // Check if it contains multiple paragraphs or mixed content
    if (root.querySelector('p, br, div')) {
      return { type: 'html', content: root.innerHTML };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/** Render parsed HTML content safely */
function HtmlRenderer({ content, type }) {
  if (!content) return null;
  
  if (type === 'table') {
    return (
      <div className="html-table-wrapper">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    );
  }
  
  if (type === 'list') {
    return (
      <div className="html-list-wrapper">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    );
  }
  
  // Generic HTML content
  return (
    <div className="html-content-wrapper">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
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
  
  if (typeof val === 'string') {
    // Check if this string contains HTML
    if (val.includes('<') && val.includes('>')) {
      const parsed = parseHtmlContent(val);
      if (parsed) {
        return (
          <span className="summary-value">
            <HtmlRenderer content={parsed.content} type={parsed.type} />
          </span>
        );
      }
    }
    return <span className="summary-value">{val}</span>;
  }

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
        <label className="eligibility-title">{rule.criterion || rule.title || `Rule ${idx + 1}`}</label>
        <span className={`badge ${isComplied ? 'badge-completed' : 'badge-failed'}`} style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>
          {isComplied ? 'Passed' : 'Failed'}
        </span>
      </div>
      <p className={`eligibility-desc ${isLong ? 'eligibility-desc--clamped' : ''}`}>
        {description}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="eligibility-read-more"
        >
          {expanded ? '▲ Show Less' : '▼ Read More'}
        </button>
      )}
      {expanded && isLong && (
        <p className="eligibility-desc" style={{ marginTop: '0.5rem' }}>
          {description}
        </p>
      )}
      {rule.evidence && (
        <div className="eligibility-footer">
          <span className="eligibility-footer-label">Evidence:</span>
          <span className="eligibility-footer-value">{rule.evidence}</span>
        </div>
      )}
    </div>
  );
}

function EligibilityView({ data }) {
  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No eligibility data available.</p>;

  // Unwrap single key wrapper if present
  const keys = Object.keys(data);
  const content = keys.length === 1 && typeof data[keys[0]] === 'object' ? data[keys[0]] : data;

  // Extract rules/results array
  let rules = [];
  if (Array.isArray(content)) {
    rules = content;
  } else if (content.rules) {
    rules = Array.isArray(content.rules) ? content.rules : [content.rules];
  } else if (content.results) {
    rules = Array.isArray(content.results) ? content.results : [content.results];
  } else if (content.checks) {
    rules = Array.isArray(content.checks) ? content.checks : [content.checks];
  }

  if (rules.length === 0) {
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

  // Calculate pass/fail stats
  const passCount = rules.filter(r => r.complied === 'complied' || r.passed === true).length;
  const failCount = rules.length - passCount;

  return (
    <div className="custom-card">
      <div className="eligibility-score-bar">
        <span className="eligibility-score-pass">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {passCount} Passed
        </span>
        <span className="eligibility-score-fail">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {failCount} Failed
        </span>
        <span className="eligibility-score-total">
          {Math.round((passCount / rules.length) * 100)}% Compliant
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
          
          // Extract html_template separately
          const htmlTemplate = tmpl.html_template;
          const fields = Object.entries(tmpl).filter(([k]) => 
            !['title', 'annexure_title', 'template_name', 'name', 'annexure_code', 'code', 'annexure_id', 'status', 'html_template'].includes(k)
          );

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
              
              {/* Show metadata fields */}
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
              
              {/* Show HTML template in a preview box */}
              {htmlTemplate && (
                <div className="template-html-preview">
                  <div className="template-html-label">Template Preview</div>
                  <div className="template-html-content">
                    <div dangerouslySetInnerHTML={{ __html: htmlTemplate }} />
                  </div>
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
          
          // Extract filled_template separately (the HTML document)
          const filledTemplate = item.filled_template;
          
          const filledData = item.filled_data || item.data || item.fields || {};
          const filledEntries = typeof filledData === 'object' && !Array.isArray(filledData)
            ? Object.entries(filledData)
            : [];
          
          // Also show other simple fields from the item itself
          const metaFields = Object.entries(item).filter(([k]) => 
            !['title', 'annexure_title', 'template_name', 'name', 'annexure_code', 'code', 'annexure_id', 'filled_data', 'data', 'fields', 'filled_template'].includes(k) &&
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
              
              {/* Show metadata fields */}
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
              
              {/* Show filled data grid */}
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
              
              {/* Show filled template preview */}
              {filledTemplate && (
                <div className="template-html-preview">
                  <div className="template-html-label">Filled Document Preview</div>
                  <div className="template-html-content">
                    <div dangerouslySetInnerHTML={{ __html: filledTemplate }} />
                  </div>
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
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState('');

  const API_BASE = 'http://localhost:8000/api';

  // ─────────────────────────────────────────────────────────────────────────────
  // API Calls
  // ─────────────────────────────────────────────────────────────────────────────

  const login = async () => {
    try {
      setLoginError('');
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok && data.access_token) {
        setToken(data.access_token);
        localStorage.setItem('token', data.access_token);
        await fetchMetadata(data.access_token);
      } else {
        setLoginError(data.detail || 'Login failed');
      }
    } catch (err) {
      setLoginError(`Error: ${err.message}`);
    }
  };

  const fetchMetadata = async (authToken) => {
    try {
      setIsLoadingMetadata(true);
      const headers = { Authorization: `Bearer ${authToken}` };
      
      const [companiesRes, tendersRes, runsRes] = await Promise.all([
        fetch(`${API_BASE}/metadata/companies`, { headers }),
        fetch(`${API_BASE}/metadata/tenders`, { headers }),
        fetch(`${API_BASE}/metadata/runs`, { headers })
      ]);

      if (companiesRes.ok) setCompanies(await companiesRes.json());
      if (tendersRes.ok) setTenders(await tendersRes.json());
      if (runsRes.ok) setRuns(await runsRes.json());
    } catch (err) {
      console.error('Metadata fetch error:', err);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const runPipeline = async () => {
    if (!selectedCompanyId || !selectedTenderId) {
      setPipelineError('Please select both company and tender');
      return;
    }

    try {
      setIsRunningPipeline(true);
      setPipelineError('');
      const response = await fetch(`${API_BASE}/pipeline/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          company_id: selectedCompanyId,
          tender_id: selectedTenderId
        })
      });

      const data = await response.json();
      if (response.ok) {
        setSelectedRun(data.run_id);
        await fetchRunDetails(data.run_id);
      } else {
        setPipelineError(data.detail || 'Pipeline execution failed');
      }
    } catch (err) {
      setPipelineError(`Error: ${err.message}`);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  const fetchRunDetails = async (runId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [stepsRes, artifactsRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/pipeline/runs/${runId}/steps`, { headers }),
        fetch(`${API_BASE}/pipeline/runs/${runId}/artifacts`, { headers }),
        fetch(`${API_BASE}/pipeline/runs/${runId}/status`, { headers })
      ]);

      if (stepsRes.ok) setRunSteps(await stepsRes.json());
      if (artifactsRes.ok) setRunArtifacts(await artifactsRes.json());
      if (statusRes.ok) setWorkflowStatus(await statusRes.json());
    } catch (err) {
      console.error('Run details fetch error:', err);
    }
  };

  const logout = () => {
    setToken('');
    localStorage.removeItem('token');
    setCompanies([]);
    setTenders([]);
    setRuns([]);
    setSelectedRun(null);
    setCurrentView('dashboard');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Logic
  // ─────────────────────────────────────────────────────────────────────────────

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '2rem', border: '1px solid hsl(var(--border-color))' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <Icons.Login /> Tender Bid Orchestrator
          </h1>
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label>Username</label>
            <input
              type="text"
              className="input-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label>Password</label>
            <input
              type="password"
              className="input-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>
          {loginError && <p style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem', marginBottom: '1rem' }}>{loginError}</p>}
          <button className="btn-primary" onClick={login} style={{ width: '100%' }}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid hsl(var(--border-color))',
        padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <h1 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎯</span> Tender Bid Orchestrator
        </h1>
        <button className="btn-secondary" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icons.Logout /> Logout
        </button>
      </div>

      <div className="container">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '1rem' }}>
          <button
            onClick={() => setCurrentView('dashboard')}
            style={{
              background: currentView === 'dashboard' ? 'hsla(var(--primary), 0.2)' : 'transparent',
              border: currentView === 'dashboard' ? '1px solid hsl(var(--primary))' : '1px solid transparent',
              color: currentView === 'dashboard' ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))',
              padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('pipeline')}
            style={{
              background: currentView === 'pipeline' ? 'hsla(var(--primary), 0.2)' : 'transparent',
              border: currentView === 'pipeline' ? '1px solid hsl(var(--primary))' : '1px solid transparent',
              color: currentView === 'pipeline' ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))',
              padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600
            }}
          >
            Pipeline Results
          </button>
        </div>

        {currentView === 'dashboard' && (
          <div className="grid grid-cols-2">
            {/* Left: New Run */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1.5rem', border: '1px solid hsl(var(--border-color))' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icons.Play /> Start New Pipeline Run
              </h2>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label>Select Company</label>
                <select
                  className="input-control"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={isLoadingMetadata}
                >
                  <option value="">Choose a company...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <label>Select Tender</label>
                <select
                  className="input-control"
                  value={selectedTenderId}
                  onChange={(e) => setSelectedTenderId(e.target.value)}
                  disabled={isLoadingMetadata}
                >
                  <option value="">Choose a tender...</option>
                  {tenders.map(t => (
                    <option key={t.id} value={t.id}>{t.reference_number}</option>
                  ))}
                </select>
              </div>
              {pipelineError && <p style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem', marginBottom: '1rem' }}>{pipelineError}</p>}
              <button
                className="btn-primary"
                onClick={runPipeline}
                disabled={isRunningPipeline || !selectedCompanyId || !selectedTenderId}
                style={{ width: '100%' }}
              >
                {isRunningPipeline ? 'Running...' : 'Execute Pipeline'}
              </button>
            </div>

            {/* Right: Recent Runs */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1.5rem', border: '1px solid hsl(var(--border-color))' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icons.History /> Recent Runs
              </h2>
              {runs.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>No runs yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {runs.slice(0, 10).map(run => (
                    <button
                      key={run.id}
                      onClick={() => {
                        setSelectedRun(run.id);
                        setCurrentView('pipeline');
                        fetchRunDetails(run.id);
                      }}
                      style={{
                        background: selectedRun === run.id ? 'hsla(var(--primary), 0.2)' : 'rgba(0,0,0,0.2)',
                        border: '1px solid hsl(var(--border-color))',
                        borderRadius: '6px', padding: '0.75rem', textAlign: 'left', cursor: 'pointer',
                        color: 'hsl(var(--text-primary))', fontSize: '0.85rem'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>Run #{run.id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>{new Date(run.created_at).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'pipeline' && selectedRun && (
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>Pipeline Run #{selectedRun}</h2>
            
            {/* Workflow Status */}
            {workflowStatus && (
              <div style={{ marginBottom: '2rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1.5rem', border: '1px solid hsl(var(--border-color))' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 600 }}>Workflow Status</h3>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.8rem' }}>Status:</span>
                    <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>{workflowStatus.status}</span>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.8rem' }}>Progress:</span>
                    <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>{workflowStatus.progress}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Steps */}
            {runSteps.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 600 }}>Pipeline Steps</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {runSteps.map((step, idx) => (
                    <details key={idx} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid hsl(var(--border-color))' }}>
                      <summary style={{ padding: '1rem', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{step.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                          {step.status === 'completed' && <Icons.Check />}
                          {step.status === 'failed' && <Icons.Warning />}
                          {step.status === 'running' && '⏳'}
                        </span>
                      </summary>
                      <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid hsl(var(--border-color))', marginTop: '0.5rem' }}>
                        {step.name === 'Tender Summary' && step.output && <TenderSummaryView data={step.output} />}
                        {step.name === 'Eligibility Check' && step.output && <EligibilityView data={step.output} />}
                        {step.name === 'Annexures Selection' && step.output && <StepOutputRenderer output={step.output} stepName={step.name} />}
                        {step.name === 'Template Generation' && step.output && <TemplateGenerationView data={step.output} />}
                        {step.name === 'Autofill Templates' && step.output && <AutofillView data={step.output} />}
                        {step.name === 'Final Response Assembly' && step.output && <StepOutputRenderer output={step.output} stepName={step.name} />}
                        {!step.output && <p style={{ color: 'hsl(var(--text-muted))' }}>No output</p>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
