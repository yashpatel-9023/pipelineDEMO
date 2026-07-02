import React, { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// API BASE URL - change to your backend server (e.g., http://localhost:8000)
// You can also set REACT_APP_API_URL in .env for flexibility
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE_URL = '';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Extract meaningful content from wrapped API responses
// ─────────────────────────────────────────────────────────────────────────────

/** Common metadata keys to hide from non‑tech users */
const METADATA_KEYS = new Set([
  'Success', 'Message', 'TotalRecord', 'IsAuthFailure', 'StatusCode',
  'status', 'status_code', 'timestamp', 'from_cache', 'operation_id',
  'processing_time', 'file_size_mb', 'tokens_used', 'output_filename',
  'split_time', 'total_time', 'split_error', 'processing_error',
  'template_id', 'is_duplicate', 'duplicate_of', 'confidence',
  'bms_gui_id', 'company_id', 'created_by', 'created_date_time',
  'document_source_id', 'document_path', 'is_delete', 'response_type_id',
  'is_letterhead', 'company_bidding_document_id',
  'tender_id', 'folder_path', 'merged_pdf', 'annexure_id'
]);

function extractContent(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if ('Data' in obj) return obj.Data;
  if ('data' in obj) return obj.data;
  return obj;
}

const isUUID = (str) => {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

function getCleanTitle(tmpl, idx) {
  if (!tmpl) return `Template #${idx + 1}`;
  const fields = [
    tmpl.template_title,
    tmpl.title,
    tmpl.annexure_title,
    tmpl.template_name,
    tmpl.name,
    tmpl.annexure_code
  ];
  return fields.find(t => t && typeof t === 'string' && !isUUID(t)) || `Template #${idx + 1}`;
}

function SafeHtmlPreview({ html, maxHeight = '400px' }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Template Preview"
      style={{
        width: '100%',
        height: '400px',
        maxHeight: maxHeight,
        border: 'none',
        background: '#ffffff',
        borderRadius: '6px',
        display: 'block'
      }}
      sandbox="allow-same-origin"
    />
  );
}

function filterMetadata(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => filterMetadata(item));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!METADATA_KEYS.has(key)) {
        result[key] = filterMetadata(value);
      }
    }
    return result;
  }
  return obj;
}

function getDisplayData(raw) {
  return filterMetadata(extractContent(raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART JSON RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function formatKey(key) {
  if (!key) return '';
  let clean = String(key);
  if (clean.includes('_')) {
    clean = clean.replace(/_/g, ' ');
  } else {
    // Split camelCase/Acronyms properly
    clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2')
                 .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  }
  return clean
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function isFilePath(val) {
  return typeof val === 'string' && (val.startsWith('/') || val.includes('://') || val.endsWith('.pdf') || val.endsWith('.docx'));
}

/** Parse HTML string and extract clean text/structure */
function parseHtmlContent(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const isFullDoc = htmlString.includes('<!DOCTYPE') || htmlString.includes('<html');
    if (isFullDoc) {
      const bodyContent = doc.body.innerHTML;
      return { type: 'html', content: bodyContent };
    }
    const root = doc.body;
    if (!root || root.children.length === 0) return null;
    if (root.querySelector('table')) {
      return { type: 'table', content: root.innerHTML };
    }
    if (root.querySelector('ul, ol')) {
      return { type: 'list', content: root.innerHTML };
    }
    // Fallback to rendering as html if it contains HTML nodes
    return { type: 'html', content: root.innerHTML };
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
  return (
    <div className="html-content-wrapper">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

function PrimitiveValue({ val }) {
  if (val === null || val === undefined) {
    return <span className="value-null">—</span>;
  }
  if (typeof val === 'boolean') {
    return <span className={`value-badge ${val ? 'value-true' : 'value-false'}`}>{val ? '✓ Yes' : '✗ No'}</span>;
  }
  if (typeof val === 'number') {
    return <span className="value-number">{val}</span>;
  }
  if (isFilePath(val)) {
    return <span className="value-file">{val.split('/').pop() || val}</span>;
  }
  if (typeof val === 'string' && val.length > 120) {
    return <p className="value-long-text">{val}</p>;
  }
  return <span className="value-text">{String(val)}</span>;
}

function SmartValue({ val, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (val === null || val === undefined || typeof val !== 'object') {
    return <PrimitiveValue val={val} />;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="value-empty">Empty list</span>;
    if (val.every(v => typeof v !== 'object' || v === null)) {
      return (
        <div className="pill-list">
          {val.map((v, i) => (
            <span key={i} className="pill">{String(v)}</span>
          ))}
        </div>
      );
    }
    return (
      <div className="array-object-list">
        {val.map((item, i) => (
          <div key={i} className="array-object-item">
            <SmartObject data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const keys = Object.keys(val);
  if (keys.length === 0) return <span className="value-empty">—</span>;

  if (depth > 0) {
    return (
      <div>
        <button className="collapse-toggle" onClick={() => setCollapsed(c => !c)}>
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
    <div className={`smart-object depth-${depth}`}>
      {entries.map(([key, val]) => (
        <div key={key} className="smart-row">
          <span className="smart-label">{formatKey(key)}</span>
          <SmartValue val={val} depth={depth} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP OUTPUT RENDERER (generic)
// ─────────────────────────────────────────────────────────────────────────────

function StepOutputRenderer({ output }) {
  if (!output || Object.keys(output).length === 0) {
    return <p className="no-output">No output recorded.</p>;
  }
  const displayData = getDisplayData(output);
  if (Array.isArray(displayData)) {
    return (
      <div className="array-result-list">
        {displayData.map((item, idx) => (
          <div key={idx} className="array-result-item">
            <SmartObject data={item} depth={0} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="step-output">
      <SmartObject data={displayData} depth={0} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM VIEWS (TenderSummary, Eligibility, TemplateGen, Autofill, Final)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PARSERS & HELPERS FOR CORRIGENDUM UPDATES
// ─────────────────────────────────────────────────────────────────────────────

function parseCorrigendumTable(tableHtml) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length <= 1) return null;

    const corrigenda = [];
    let currentCorrigendum = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length === 0) continue;

      if (cells.length >= 6) {
        currentCorrigendum = {
          name: cells[0].textContent.trim(),
          reference: cells[1].textContent.trim(),
          closedDate: cells[2].textContent.trim(),
          changes: []
        };
        corrigenda.push(currentCorrigendum);

        const field = cells[3].textContent.trim();
        const prev = cells[4].textContent.trim();
        const next = cells[5].textContent.trim();
        if (field || prev || next) {
          currentCorrigendum.changes.push({ field, prev, next });
        }
      } else if (cells.length === 3 && currentCorrigendum) {
        const field = cells[0].textContent.trim();
        const prev = cells[1].textContent.trim();
        const next = cells[2].textContent.trim();
        if (field || prev || next) {
          currentCorrigendum.changes.push({ field, prev, next });
        }
      } else {
        const textValues = cells.map(c => c.textContent.trim());
        if (textValues.length >= 3) {
          if (!currentCorrigendum) {
            currentCorrigendum = { name: 'Update', reference: 'NA', closedDate: '', changes: [] };
            corrigenda.push(currentCorrigendum);
          }
          currentCorrigendum.changes.push({
            field: textValues[0] || '',
            prev: textValues[1] || '',
            next: textValues[2] || ''
          });
        }
      }
    }
    return corrigenda.length > 0 ? corrigenda : null;
  } catch (e) {
    console.error('Failed to parse corrigendum table', e);
    return null;
  }
}

function CorrigendumList({ corrigenda }) {
  if (!corrigenda) return null;
  return (
    <div className="corrigendum-timeline">
      {corrigenda.map((corr, idx) => (
        <div key={idx} className="corrigendum-card-item">
          <div className="corrigendum-card-header">
            <h4 className="corrigendum-card-title">✨ {corr.name}</h4>
            <div className="corrigendum-card-meta">
              {corr.reference && corr.reference !== 'NA' && (
                <span className="corrigendum-meta-badge">Ref: {corr.reference}</span>
              )}
              {corr.closedDate && (
                <span className="corrigendum-meta-date">🕒 Closed: {corr.closedDate}</span>
              )}
            </div>
          </div>
          <div className="corrigendum-card-body">
            <ul className="corrigendum-changes-list">
              {corr.changes.map((change, cIdx) => (
                <li key={cIdx} className="corrigendum-change-row">
                  <span className="change-field">{change.field}</span>
                  <div className="change-details">
                    {change.prev && change.prev !== 'NA' && (
                      <>
                        <span className="change-prev">{change.prev}</span>
                        <span className="change-arrow">→</span>
                      </>
                    )}
                    <span className="change-next">{change.next}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryRichValue({ val }) {
  if (val === null || val === undefined) return <span className="summary-value">—</span>;
  if (typeof val === 'boolean') return <span className="summary-value">{val ? 'Yes' : 'No'}</span>;
  if (typeof val === 'number') return <span className="summary-value">{val}</span>;
  
  if (typeof val === 'string') {
    if (val.includes('<') && val.includes('>')) {
      const parsed = parseHtmlContent(val);
      if (parsed) {
        if (parsed.type === 'table') {
          const corrigenda = parseCorrigendumTable(val);
          if (corrigenda) {
            return (
              <span className="summary-value">
                <CorrigendumList corrigenda={corrigenda} />
              </span>
            );
          }
        }
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
    if (val.every(v => typeof v !== 'object' || v === null)) {
      return (
        <span className="summary-value">
          <ul className="summary-list">
            {val.map((item, i) => <li key={i}>{String(item)}</li>)}
          </ul>
        </span>
      );
    }
    const allKeys = [...new Set(val.flatMap(item => Object.keys(item || {})))];
    return (
      <span className="summary-value">
        <div className="summary-table-wrapper">
          <table className="summary-table">
            <thead><tr>{allKeys.map(k => <th key={k}>{formatKey(k)}</th>)}</tr></thead>
            <tbody>
              {val.map((row, i) => (
                <tr key={i}>
                  {allKeys.map(k => (
                    <td key={k}>{typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k] ?? '—')}</td>
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
    return (
      <span className="summary-value">
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
  if (!data) return <p className="no-data">No summary data available.</p>;
  let displayData = getDisplayData(data);
  if (displayData && displayData.summary_json && displayData.summary_json.results && displayData.summary_json.results.length > 0) {
    displayData = displayData.summary_json.results[0].result || displayData;
  }
  const content = displayData && typeof displayData === 'object' && !Array.isArray(displayData) ? displayData : {};
  return (
    <div className="custom-card">
      <div className="summary-container">
        {Object.entries(content).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => {
          const isTable = (typeof val === 'string' && val.includes('<table')) || Array.isArray(val);
          return (
            <div key={key} className={`summary-row ${isTable ? 'summary-row-block' : ''}`}>
              <span className="summary-label">{formatKey(key)}</span>
              {!isTable && <span className="summary-colon">:</span>}
              <SummaryRichValue val={val} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EligibilityCard({ rule, idx }) {
  const [expanded, setExpanded] = useState(false);
  const isComplied = rule.complied === 'complied' || rule.passed === true;
  const title = rule.name || rule.clause || rule.requirement_name || `Requirement #${idx + 1}`;
  const description = rule.reason || rule.remarks || rule.citation || 'AI verified compliance match in company records.';
  const isLong = description.length > 180;

  // Extract evidence/documents
  const docs = Array.isArray(rule.complied_documents) 
    ? rule.complied_documents 
    : rule.evidence 
    ? [rule.evidence] 
    : [];

  return (
    <div className={`eligibility-item ${isComplied ? 'eligibility-item--pass' : 'eligibility-item--fail'}`}>
      <div className="eligibility-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isComplied ? (
            <span className="eligibility-status-badge eligibility-status-badge--pass">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Complied
            </span>
          ) : (
            <span className="eligibility-status-badge eligibility-status-badge--fail">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Not Complied
            </span>
          )}
          <h4 className="eligibility-title">{title}</h4>
        </div>
      </div>

      {rule.question && (
        <p className="eligibility-question">
          <strong>Requirement Checklist:</strong> {rule.question}
        </p>
      )}

      <div className="eligibility-desc-container">
        <p className={`eligibility-desc ${isLong && !expanded ? 'eligibility-desc--clamped' : ''}`}>
          {description}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="eligibility-read-more"
            style={{ display: 'block', margin: '0.5rem 0 0 0' }}
          >
            {expanded ? '▲ Show Less' : '▼ Read More'}
          </button>
        )}
      </div>

      {docs.length > 0 && (
        <div className="eligibility-footer" style={{ borderTop: '1px solid hsla(var(--border-color), 0.5)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
          <span className="eligibility-footer-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', color: 'hsl(var(--text-secondary))' }}>
            Verified Source Evidence:
          </span>
          <div className="eligibility-docs-list" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {docs.map((doc, dIdx) => (
              <span key={dIdx} className="eligibility-doc-pill">📄 {doc}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EligibilityView({ data }) {
  const [filter, setFilter] = useState('all');

  if (!data) return <p style={{ color: 'hsl(var(--text-muted))', padding: '1rem' }}>No eligibility data available.</p>;
  
  let rules = [];
  if (data.Data && data.Data.length > 0) {
    const details = data.Data[0].company_eligibility_details || {};
    rules = details.ai_eligibility || [];
  } else if (data.company_eligibility_details) {
    rules = data.company_eligibility_details.ai_eligibility || [];
  } else if (data.details?.rules) {
    rules = data.details.rules;
  } else if (data.rules) {
    rules = data.rules;
  } else if (data.ai_eligibility) {
    rules = data.ai_eligibility;
  } else if (Array.isArray(data)) {
    rules = data;
  }

  if (rules.length === 0) {
    return (
      <div className="custom-card">
        <SmartObject data={data} />
      </div>
    );
  }

  const compliedCount = rules.filter(r => r.complied === 'complied' || r.passed === true).length;
  const totalCount = rules.length;
  const scoreVal = data.score !== undefined ? data.score : Math.round((compliedCount / totalCount) * 100);

  const filteredRules = rules.filter(rule => {
    const isComplied = rule.complied === 'complied' || rule.passed === true;
    if (filter === 'complied') return isComplied;
    if (filter === 'failed') return !isComplied;
    return true;
  });

  return (
    <div className="custom-card" style={{ padding: '0.75rem' }}>
      <div className="eligibility-score-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className={`eligibility-filter-btn ${filter === 'all' ? 'eligibility-filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({totalCount})
          </button>
          <button 
            className={`eligibility-filter-btn ${filter === 'complied' ? 'eligibility-filter-btn--active' : ''}`}
            onClick={() => setFilter('complied')}
          >
            ✓ Complied ({compliedCount})
          </button>
          <button 
            className={`eligibility-filter-btn ${filter === 'failed' ? 'eligibility-filter-btn--active' : ''}`}
            onClick={() => setFilter('failed')}
          >
            ✗ Not Complied ({totalCount - compliedCount})
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>Compliance Score:</span>
          <span style={{ 
            fontSize: '1rem', 
            fontWeight: 800, 
            color: scoreVal === 100 ? 'hsl(var(--success))' : 'hsl(var(--danger))',            background: 'rgba(0,0,0,0.2)',
            padding: '0.2rem 0.6rem',
            borderRadius: '6px',
            border: '1px solid hsla(var(--border-color), 0.8)'
          }}>
            {scoreVal}%
          </span>
        </div>
      </div>

      <div className="eligibility-container">
        {filteredRules.map((rule, idx) => (
          <EligibilityCard key={idx} rule={rule} idx={idx} />
        ))}
      </div>
    </div>
  );
}

// ─── BiddingDocumentRenderer and FilledAnnexureRenderer ───
function BiddingDocumentRenderer({ doc }) {
  const [expanded, setExpanded] = useState(false);
  const content = doc.content_json || {};
  const keys = Object.keys(content);
  const sections = keys.filter(k => typeof content[k] === 'string' && content[k].length > 30);
  const fields = keys.filter(k => !sections.includes(k));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {fields.length > 0 && (
        <div className="bidding-fields-grid">
          {fields.map(k => (
            <div key={k} className="bidding-field-card">
              <p className="bidding-field-label">{formatKey(k)}</p>
              <SmartValue val={content[k]} depth={1} />
            </div>
          ))}
        </div>
      )}
      {sections.slice(0, expanded ? sections.length : 2).map(k => (
        <div key={k} className="bidding-section-card">
          <p className="bidding-section-title">{formatKey(k)}</p>
          <p className="bidding-section-text">{content[k]}</p>
        </div>
      ))}
      {sections.length > 2 && (
        <button className="bidding-toggle-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? '▲ Show Less' : `▼ Show ${sections.length - 2} More Section${sections.length - 2 > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

function FilledAnnexureRenderer({ filledData }) {
  if (!filledData || Object.keys(filledData).length === 0) {
    return <p className="no-data">No filled data available.</p>;
  }
  return (
    <div className="filled-annexure-grid">
      {Object.entries(filledData).map(([key, val]) => (
        <div key={key} className="filled-annexure-cell">
          <span className="filled-annexure-label">{formatKey(key)}</span>
          <SmartValue val={val} depth={1} />
        </div>
      ))}
    </div>
  );
}

function FinalResponseView({ run, token }) {
  const [biddingDocs, setBiddingDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!run || !token) return;
    const fetchDocs = async () => {
      try {
        const res = await fetch(`/pipeline/${run.workflow_id}/bidding-documents`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setBiddingDocs(data);
        }
      } catch (err) {
        console.error("Failed to fetch bidding docs", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
    const interval = setInterval(fetchDocs, 5000);
    return () => clearInterval(interval);
  }, [run, token]);

  const handleUpload = async (docId, file) => {
    if (!file || !token) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/pipeline/${run.workflow_id}/bidding-documents/${docId}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const updatedRes = await fetch(`/pipeline/${run.workflow_id}/bidding-documents`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (updatedRes.ok) {
          setBiddingDocs(await updatedRes.json());
        }
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  if (loading && biddingDocs.length === 0) return <p className="no-data">Loading checklist...</p>;

  return (
    <div className="custom-card" style={{ padding: 0 }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid hsl(var(--border-color))' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>Final Bid Checklist</h3>
      </div>
      <div className="table-responsive" style={{ padding: '1.25rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid hsl(var(--border-color))' }}>
              <th style={{ padding: '0.75rem', fontWeight: 600, width: '40px' }}>#</th>
              <th style={{ padding: '0.75rem', fontWeight: 600 }}>Checklist Document</th>
              <th style={{ padding: '0.75rem', fontWeight: 600 }}>Mapped Document</th>
              <th style={{ padding: '0.75rem', fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {biddingDocs.map((doc, index) => (
              <tr key={doc.id} style={{ borderBottom: '1px solid hsl(var(--border-color))', background: doc.status === 'missing' ? 'hsla(var(--destructive), 0.05)' : 'transparent' }}>
                <td style={{ padding: '1rem 0.75rem', fontWeight: 500 }}>{index + 1}</td>
                <td style={{ padding: '1rem 0.75rem' }}>{doc.title}</td>
                <td style={{ padding: '1rem 0.75rem' }}>
                  {doc.status === 'missing' ? (
                    <span className="badge badge-failed">Missing</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-completed">{doc.source === 'manual_upload' ? 'Uploaded' : (doc.source === 'filled_annexure' ? 'Auto-filled' : 'Company Doc')}</span>
                      {doc.file_path && (
                        <a href={`/pipeline/documents/preview?path=${encodeURIComponent(doc.file_path)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(var(--primary))', textDecoration: 'underline', fontSize: '0.85rem' }}>Preview</a>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ padding: '1rem 0.75rem' }}>
                  {doc.status === 'missing' || doc.source === 'manual_upload' ? (
                    <input type="file" onChange={(e) => handleUpload(doc.id, e.target.files[0])} style={{ fontSize: '0.8rem', maxWidth: '200px' }} />
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>Auto-mapped</span>
                  )}
                </td>
              </tr>
            ))}
            {biddingDocs.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: '1rem', textAlign: 'center' }}>No checklist documents found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplateGenerationView({ data }) {
  if (!data) return <p className="no-data">No template generation data available.</p>;
  let displayData = extractContent(data);
  let templates = [];
  if (Array.isArray(displayData)) {
    templates = displayData;
  } else if (displayData.results) {
    templates = Array.isArray(displayData.results) ? displayData.results : [displayData.results];
  } else if (displayData.templates) {
    templates = Array.isArray(displayData.templates) ? displayData.templates : [displayData.templates];
  }

  if (templates.length === 0) {
    return (
      <div className="custom-card">
        <div className="summary-container">
          {Object.entries(displayData).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
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
    <div className="custom-card">
      <div className="template-gen-header">
        <span className="template-gen-count">📄 {templates.length} Template{templates.length !== 1 ? 's' : ''} Generated</span>
      </div>
      <div className="eligibility-container">
        {templates.map((tmpl, idx) => {
          const title = getCleanTitle(tmpl, idx);
          const code = tmpl.annexure_code || tmpl.code || tmpl.annexure_id || '';
          const status = tmpl.status || 'generated';
          const templateHtml = tmpl.html_template || tmpl.template_html || tmpl.html || tmpl.content || tmpl.template_content || '';

          return (
            <div key={idx} className="eligibility-item">
              <div className="eligibility-header">
                <span className="eligibility-icon eligibility-icon--pass">📄</span>
                <label className="eligibility-title">{title}</label>
                {code && <span className="template-code-badge">{code}</span>}
                <span className="badge badge-completed" style={{ marginLeft: 'auto' }}>{status}</span>
              </div>
              
              {templateHtml && (
                <div className="template-html-preview">
                  <div className="template-html-label">Template Preview</div>
                  <div className="template-html-content" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                    <SafeHtmlPreview html={templateHtml} />
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

function AutofillView({ data }) {
  if (!data) return <p className="no-data">No autofill data available.</p>;
  let displayData = extractContent(data);
  let filledItems = [];
  if (Array.isArray(displayData)) {
    filledItems = displayData;
  } else if (displayData.filled_templates) {
    filledItems = Array.isArray(displayData.filled_templates) ? displayData.filled_templates : [displayData.filled_templates];
  } else if (displayData.results) {
    filledItems = Array.isArray(displayData.results) ? displayData.results : [displayData.results];
  } else if (displayData.autofilled) {
    filledItems = Array.isArray(displayData.autofilled) ? displayData.autofilled : [displayData.autofilled];
  } else if (displayData.filled_template || displayData.html || displayData.content) {
    filledItems = [displayData];
  }

  if (filledItems.length === 0) {
    return (
      <div className="custom-card">
        <div className="summary-container">
          {Object.entries(displayData).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, val]) => (
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
    <div className="custom-card">
      <div className="template-gen-header">
        <span className="template-gen-count">✏️ {filledItems.length} Template{filledItems.length !== 1 ? 's' : ''} Auto-filled</span>
      </div>
      <div className="eligibility-container">
        {filledItems.map((item, idx) => {
          const title = getCleanTitle(item, idx);
          const code = item.annexure_code || item.code || item.annexure_id || '';
          const filledTemplate = item.filled_template || item.html || item.content || '';
          const filledData = item.filled_data || item.data || item.fields || {};

          return (
            <div key={idx} className="eligibility-item">
              <div className="eligibility-header">
                <span className="eligibility-icon" style={{ color: 'hsl(var(--secondary))' }}>✏️</span>
                <label className="eligibility-title" style={{ color: 'hsl(var(--secondary))' }}>{title}</label>
                {code && <span className="template-code-badge">{code}</span>}
                <span className="badge badge-completed" style={{ marginLeft: 'auto' }}>Filled</span>
              </div>
              
              {filledTemplate && (
                <div className="template-html-preview">
                  <div className="template-html-label">Filled Document Preview</div>
                  <div className="template-html-content" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                    <SafeHtmlPreview html={filledTemplate} />
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
// ICONS
// ─────────────────────────────────────────────────────────────────────────────

const Icons = {
  Login: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>,
  Logout: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  History: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /><path d="M3.3 7A10 10 0 1 1 3.3 17" /></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  ExternalLink: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
  Info: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Warning: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  ArrowLeft: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
  FileText: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  Eye: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
};

// ─────────────────────────────────────────────────────────────────────────────
// APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ========== STATE ==========
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password123');
  const [loginError, setLoginError] = useState('');

  const [companies, setCompanies] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [runs, setRuns] = useState([]);

  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedRun, setSelectedRun] = useState(null);
  const [runSteps, setRunSteps] = useState([]);
  const [runArtifacts, setRunArtifacts] = useState(null);
  const [workflowStatus, setWorkflowStatus] = useState(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [signalTimeout, setSignalTimeout] = useState(3600);
  const [customPayload, setCustomPayload] = useState('{\n  "additional_requirements": "Fast delivery requested"\n}');
  const [startLoading, setStartLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState('');

  // Inspector / Modal states
  const [inspectedStep, setInspectedStep] = useState(null);
  const [manuallyInspectedStepName, setManuallyInspectedStepName] = useState(null);
  const [selectedArtifactTab, setSelectedArtifactTab] = useState('documents');

  // HITL selection checkboxes
  const [selectedAnnexureIds, setSelectedAnnexureIds] = useState([]);
  const [submittingHITL, setSubmittingHITL] = useState(false);
  const [expandedTemplates, setExpandedTemplates] = useState({});

  const [globalLoading, setGlobalLoading] = useState(false);
  const pollTimerRef = useRef(null);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  // Stepper steps configuration
  const stepsConfig = [
    { name: 'fetch_tender_summary', label: 'Tender Summary', desc: 'AI summarizes tender specifications', type: 'ai_call' },
    { name: 'evaluate_eligibility', label: 'Eligibility Check', desc: 'AI compliance evaluation', type: 'ai_call' },
    { name: 'list_annexures', label: 'Annexure Listing', desc: 'AI lists discovered templates', type: 'ai_call' },
    { name: 'generate_templates', label: 'Template Generation', desc: 'AI structures templates & selection', type: 'hitl' },
    { name: 'autofill_template', label: 'Autofill templates', desc: 'AI populates company data', type: 'ai_call' },
    { name: 'generate_final_response', label: 'Final Response Assembly', desc: 'AI generates finalized bid document', type: 'ai_call' }
  ];

  // Helper to determine step status
  const getStepStatus = (stepName) => {
    // If the run is failed or waiting for retry, find which step failed it
    const isRunFailed = selectedRun?.status === 'failed' || workflowStatus?.status === 'failed' || selectedRun?.status === 'waiting_for_retry' || workflowStatus?.status === 'waiting_for_retry';
    if (isRunFailed) {
      // 1. Check if there is an explicit failed step in DB
      const explicitFailed = [...runSteps].reverse().find(s => s.status === 'failed');
      if (explicitFailed) {
        if (explicitFailed.step_name === stepName) return 'failed';
      } else {
        // 2. Otherwise, the last executed step is the one that failed/aborted the pipeline
        let lastExecutedName = null;
        for (let i = stepsConfig.length - 1; i >= 0; i--) {
          const name = stepsConfig[i].name;
          if (runSteps.some(s => s.step_name === name)) {
            lastExecutedName = name;
            break;
          }
        }
        if (lastExecutedName === stepName) return 'failed';
      }
    }

    const dbStep = [...runSteps].reverse().find(s => s.step_name === stepName);
    
    if (stepName === 'generate_templates') {
      if (workflowStatus?.status === 'waiting_for_selection') {
        return 'waiting';
      }
      if (workflowStatus?.status === 'selected' || workflowStatus?.status === 'completed') {
        return 'completed';
      }
    }

    if (dbStep) {
      if (dbStep.status === 'completed' || dbStep.status === 'approved') {
        return 'completed';
      }
      return dbStep.status;
    }

    if (workflowStatus?.status === 'completed') {
      return 'completed';
    }

    return 'pending';
  };

  // Helper to determine currently active step index
  const getActiveStepIdx = () => {
    const activeOrFailedIdx = stepsConfig.findIndex(s => {
      const status = getStepStatus(s.name);
      return status === 'running' || status === 'waiting' || status === 'failed';
    });
    if (activeOrFailedIdx !== -1) return activeOrFailedIdx;

    const pendingIdx = stepsConfig.findIndex(s => getStepStatus(s.name) === 'pending');
    if (pendingIdx !== -1) return pendingIdx;

    return stepsConfig.length - 1;
  };

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE_URL}/token`, {
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
      setLoginError(`Error: ${err.message}`);
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
        fetch(`${API_BASE_URL}/metadata/companies`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/metadata/tenders`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/metadata/runs`, { headers: getAuthHeaders() })
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
      console.error('Metadata fetch error:', err);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Fetch historical runs
  const fetchRunsOnly = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/metadata/runs`, { headers: getAuthHeaders() });
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
      const stepsRes = await fetch(`${API_BASE_URL}/metadata/runs/${run.id}/steps`, { headers: getAuthHeaders() });
      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        setRunSteps(stepsData);
      }

      // 2. Fetch workflow status from Temporal (if workflow_id exists)
      if (run.workflow_id && run.workflow_id !== 'pending') {
        const wfRes = await fetch(`${API_BASE_URL}/pipeline/${run.workflow_id}/status`, { headers: getAuthHeaders() });
        if (wfRes.ok) {
          const wfData = await wfRes.json();
          setWorkflowStatus(wfData);
          
          if (wfData.status === 'waiting_for_selection' && selectedAnnexureIds.length === 0) {
            const tempStep = wfData.workflow_state?.template_response;
            const detectedAnnexureIds = [];
            for (const temp of (tempStep?.results || [])) {
              if (temp.annexure_id) detectedAnnexureIds.push(temp.annexure_id);
            }
            setSelectedAnnexureIds(detectedAnnexureIds);
          }
        }
      }

      // 3. Fetch artifacts (if completed)
      if (run.status === 'completed') {
        const artRes = await fetch(`${API_BASE_URL}/metadata/runs/${run.id}/artifacts`, { headers: getAuthHeaders() });
        if (artRes.ok) {
          const artData = await artRes.json();
          setRunArtifacts(artData);
        }
      } else {
        setRunArtifacts(null);
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

      const isActive = selectedRun.status === 'running' || selectedRun.status === 'pending' || selectedRun.status === 'waiting_for_retry';
      if (isActive) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          const runsRes = await fetch(`${API_BASE_URL}/metadata/runs`, { headers: getAuthHeaders() });
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
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedRun]);

  // Reset inspected step when switching runs to avoid displaying stale step data
  const prevRunIdRef = useRef(null);
  useEffect(() => {
    if (selectedRun?.id !== prevRunIdRef.current) {
      setInspectedStep(null);
      setManuallyInspectedStepName(null);
      prevRunIdRef.current = selectedRun?.id || null;
    }
  }, [selectedRun]);

  // Keep inspectedStep in sync with updated runSteps (real-time updates during polling)
  useEffect(() => {
    if (runSteps.length > 0) {
      // 1. Determine which step name we should be inspecting
      let targetStepName = manuallyInspectedStepName;
      
      if (!targetStepName) {
        // Find the active step name or fallback
        const activeIdx = getActiveStepIdx();
        targetStepName = stepsConfig[activeIdx]?.name;
      }
      
      // 2. Find the corresponding database step
      let targetDbStep = [...runSteps].reverse().find(s => s.step_name === targetStepName);
      
      // 3. Fallback logic: if we are in auto mode and the active step doesn't have a DB record yet,
      // search backwards to find the last step that does have a DB record.
      if (!manuallyInspectedStepName && !targetDbStep) {
        const activeIdx = getActiveStepIdx();
        for (let i = activeIdx - 1; i >= 0; i--) {
          const stepName = stepsConfig[i]?.name;
          const dbStep = [...runSteps].reverse().find(s => s.step_name === stepName);
          if (dbStep) {
            targetDbStep = dbStep;
            break;
          }
        }
      }
      
      // If still not found and we have no manual inspection, fallback to runSteps[0]
      if (!manuallyInspectedStepName && !targetDbStep) {
        targetDbStep = runSteps[0];
      }

      // 4. Update inspectedStep if needed
      if (targetDbStep) {
        if (!inspectedStep || inspectedStep.step_name !== targetDbStep.step_name) {
          setInspectedStep(targetDbStep);
        } else {
          // If the step is the same, check if status, output, or error has changed to update details panel in real-time
          const hasChanged =
            targetDbStep.status !== inspectedStep.status ||
            JSON.stringify(targetDbStep.output) !== JSON.stringify(inspectedStep.output) ||
            JSON.stringify(targetDbStep.error) !== JSON.stringify(inspectedStep.error);
          if (hasChanged) {
            setInspectedStep(targetDbStep);
          }
        }
      }
    }
  }, [runSteps, workflowStatus, manuallyInspectedStepName, inspectedStep]);

  // Start Pipeline Trigger - NOW USING /pipeline/start
  const handleStartPipeline = async () => {
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(customPayload);
    } catch (err) {
      alert('Invalid custom payload JSON format.');
      return;
    }

    setStartLoading(true);
    setPipelineError('');
    try {
      const response = await fetch(`${API_BASE_URL}/pipeline/start`, {  // ✅ corrected endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          company_id: selectedCompanyId,
          tender_id: selectedTenderId,
          signal_timeout: signalTimeout,
          custom_payload: parsedPayload
        })
      });

      if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        try {
          const errorJson = await response.json();
          if (errorJson.detail) errorMsg = errorJson.detail;
          else if (errorJson.message) errorMsg = errorJson.message;
        } catch (e) {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      
      // Refresh list and navigate to visualizer
      await fetchMetadata();
      
      // Find the new run and set it as active
      const activeRun = runs.find(r => r.workflow_id === data.workflow_id);
      if (activeRun) {
        setSelectedRun(activeRun);
        setCurrentView('pipeline');
      } else {
        // Fallback: poll until it shows up or view dashboard
        const refreshRuns = await fetch(`${API_BASE_URL}/metadata/runs`, { headers: getAuthHeaders() });
        const runsData = await refreshRuns.json();
        setRuns(runsData);
        const newRun = runsData.find(r => r.workflow_id === data.workflow_id);
        if (newRun) {
          setSelectedRun(newRun);
          setCurrentView('pipeline');
        }
      }
    } catch (err) {
      setPipelineError(`Error: ${err.message}`);
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

    setManuallyInspectedStepName(null);
    setSubmittingHITL(true);
    try {
      const resumeRes = await fetch(`${API_BASE_URL}/pipeline/${selectedRun.workflow_id}/resume`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          annexure_ids: selectedAnnexureIds
        })
      });

      if (!resumeRes.ok) {
        throw new Error('Failed to signal Temporal workflow');
      }

      await fetch(`${API_BASE_URL}/approvals/${selectedRun.workflow_id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          step_name: 'generate_templates',
          approval_type: 'annexure_selection',
          actor: 'admin',
          decision: 'approve',
          comments: `Approved selection of ${selectedAnnexureIds.length} annexure templates`,
          payload: { selected_annexure_ids: selectedAnnexureIds }
        })
      });

      fetchRunDetails(selectedRun);
    } catch (err) {
      alert(`Error submitting approval: ${err.message}`);
    } finally {
      setSubmittingHITL(false);
    }
  };

  // Retry Pipeline
  const handleRetryWorkflow = async () => {
    if (!selectedRun?.workflow_id) return;
    
    setManuallyInspectedStepName(null);
    try {
      const res = await fetch(`${API_BASE_URL}/pipeline/${selectedRun.workflow_id}/retry`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Failed to trigger retry');
      }
      fetchRunDetails(selectedRun);
    } catch (err) {
      alert(`Error retrying workflow: ${err.message}`);
    }
  };

  // Login Screen Render
  if (!token) {
    return (
      <div className="login-scene">
        <div className="login-bg">
          <div className="login-bg-orb"></div>
          <div className="login-bg-orb"></div>
          <div className="login-bg-orb"></div>
        </div>
        <div className="login-grid"></div>
        <div className="login-card">
          <div className="login-logo-wrap">T</div>
          <h1 className="login-title">Tender Orchestrator</h1>
          <p className="login-subtitle">Durable AI Bidding &amp; Document Pipeline</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="input-group">
              <label>Username</label>
              <input type="text" className="input-control" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" className="input-control" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
            </div>

            {loginError && (
              <div style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem', fontWeight: 600, background: 'hsla(var(--danger), 0.08)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid hsla(var(--danger), 0.12)' }}>
                ⚠️ {loginError}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', width: '100%', marginTop: '0.25rem' }}>
              Sign In to Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Computed stats
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'pending' || r.status === 'waiting_for_selection').length;
  const failedRuns = runs.filter(r => r.status === 'failed').length;

  // ========== MAIN APP WITH SIDEBAR ==========
  return (
    <div className="app-shell">
      {/* ═══ SIDEBAR ═══ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">T</div>
          <div className="sidebar-brand-text">
            <h1>Tender Orchestrator</h1>
            <span>AI Pipeline Engine <span className="online-dot"></span></span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          <button
            className={`sidebar-nav-item ${currentView === 'dashboard' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => { setCurrentView('dashboard'); setSelectedRun(null); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Dashboard
          </button>
          {selectedRun && (
            <button
              className={`sidebar-nav-item ${currentView === 'pipeline' ? 'sidebar-nav-item--active' : ''}`}
              onClick={() => setCurrentView('pipeline')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Pipeline Monitor
            </button>
          )}

          <div className="sidebar-section-label">Quick Links</div>
          <a
            href={`http://${window.location.hostname}:8088`}
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-nav-item"
            style={{ textDecoration: 'none' }}
          >
            <Icons.ExternalLink />
            Temporal Dashboard
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-name">{username}</span>
            <span className="sidebar-user-role">Orchestrator Admin</span>
          </div>
          <button onClick={handleLogout} className="sidebar-logout-btn" title="Sign Out">
            <Icons.Logout />
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="main-area">
        <div className="main-scroll">

          {currentView === 'dashboard' ? (
            <>
              {/* Page Header */}
              <div className="page-header">
                <h2>Dashboard</h2>
                <p>Manage AI pipeline workflows and monitor bid document generation</p>
              </div>

              {/* Stats Row */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon stat-icon--blue">
                    <Icons.History />
                  </div>
                  <div>
                    <div className="stat-value">{runs.length}</div>
                    <div className="stat-label">Total Runs</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--green">
                    <Icons.Check />
                  </div>
                  <div>
                    <div className="stat-value">{completedRuns}</div>
                    <div className="stat-label">Completed</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--amber">
                    <Icons.Play />
                  </div>
                  <div>
                    <div className="stat-value">{activeRuns}</div>
                    <div className="stat-label">Active</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--violet">
                    <Icons.FileText />
                  </div>
                  <div>
                    <div className="stat-value">{companies.length}</div>
                    <div className="stat-label">Companies</div>
                  </div>
                </div>
              </div>

              {/* Dashboard Grid: Launch Form + Run History */}
              <div className="dash-grid">
                {/* Launch Form Panel */}
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Execute Pipeline</h3>
                      <p>Create durable Temporal bid workflow</p>
                    </div>
                    <Icons.Play />
                  </div>
                  <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="input-group">
                      <label>Target Company Profile</label>
                      <select className="input-control" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.country})</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Tender Document Reference</label>
                      <select className="input-control" value={selectedTenderId} onChange={(e) => setSelectedTenderId(e.target.value)}>
                        {tenders.map(t => (
                          <option key={t.id} value={t.id}>{t.tender_reference}</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>HITL Signal Timeout (s)</label>
                      <input type="number" className="input-control" value={signalTimeout} onChange={(e) => setSignalTimeout(parseInt(e.target.value))} />
                    </div>
                    <div className="input-group">
                      <label>Workflow Input Payload (JSON)</label>
                      <textarea
                        className="input-control"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', height: '90px', resize: 'vertical' }}
                        value={customPayload}
                        onChange={(e) => setCustomPayload(e.target.value)}
                      />
                    </div>

                    {pipelineError && (
                      <div style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem', fontWeight: 500, background: 'hsla(var(--danger), 0.06)', padding: '0.65rem', borderRadius: '8px', border: '1px solid hsla(var(--danger), 0.1)' }}>
                        ⚠️ {pipelineError}
                      </div>
                    )}

                    <button
                      onClick={handleStartPipeline}
                      className="btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={startLoading || companies.length === 0 || tenders.length === 0}
                    >
                      {startLoading ? 'Spawning Workflow...' : <><Icons.Play /> Start AI Pipeline</>}
                    </button>
                  </div>
                </div>

                {/* Right Column: Runs + Seed Data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Run History Panel */}
                  <div className="panel">
                    <div className="panel-header">
                      <div>
                        <h3>Pipeline Executions</h3>
                        <p>Durable runs persisted in PostgreSQL</p>
                      </div>
                      <button onClick={fetchMetadata} className="btn-ghost">
                        <Icons.Refresh /> Refresh
                      </button>
                    </div>
                    <div className="panel-body">
                      {runs.length === 0 ? (
                        <div className="empty-state">
                          <Icons.History />
                          <h4>No runs yet</h4>
                          <p>Click "Start AI Pipeline" to trigger the first run</p>
                        </div>
                      ) : (
                        <div className="run-list">
                          {runs.map(run => {
                            const date = new Date(run.created_at);
                            const statusClass = run.status === 'completed' ? 'completed' : run.status === 'running' || run.status === 'pending' ? 'running' : run.status === 'failed' ? 'failed' : 'pending';
                            return (
                              <div
                                key={run.id}
                                className="run-card"
                                onClick={() => { setSelectedRun(run); setCurrentView('pipeline'); }}
                              >
                                <div className={`run-card-icon run-card-icon--${statusClass}`}>
                                  {statusClass === 'completed' ? <Icons.Check /> : statusClass === 'failed' ? <Icons.Warning /> : <Icons.Play />}
                                </div>
                                <div className="run-card-info">
                                  <div className="run-card-title">{run.tender_reference}</div>
                                  <div className="run-card-meta">
                                    <span>{run.company_name}</span>
                                    <span>·</span>
                                    <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </div>
                                <div className="run-card-badge">
                                  <span className={`badge badge-${run.status}`}>
                                    {run.status === 'waiting_for_selection' ? 'Reviewing' : run.status}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seed Data */}
                  <div className="seed-grid">
                    <div className="seed-card">
                      <div className="seed-card-header">
                        <div className="seed-card-icon" style={{ background: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
                          <Icons.FileText />
                        </div>
                        <h4 style={{ color: 'hsl(var(--primary))' }}>Company Files</h4>
                      </div>
                      <p><strong>18 documents</strong> uploaded for eligibility checking and template autofilling.</p>
                      <ul>
                        <li>Financial Audit Certificates (Work Experience)</li>
                        <li>Tax Registration documents (PAN, TAN, GST)</li>
                        <li>Quality assurance credentials (ISO, BIS)</li>
                      </ul>
                    </div>
                    <div className="seed-card">
                      <div className="seed-card-header">
                        <div className="seed-card-icon" style={{ background: 'hsla(var(--secondary), 0.1)', color: 'hsl(var(--secondary))' }}>
                          <Icons.FileText />
                        </div>
                        <h4 style={{ color: 'hsl(var(--secondary))' }}>Tender Attachments</h4>
                      </div>
                      <p><strong>15 PDF/HTML specifications</strong> extracted for AI parsing and checklists.</p>
                      <ul>
                        <li>Scope of Work documents</li>
                        <li>Technical requirement attachments</li>
                        <li>Pre-qualification annexure templates</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ═══ PIPELINE VIEW ═══ */
            <>
              {/* Back + Run Banner */}
              <div className="run-banner">
                <div className="run-banner-left">
                  <button onClick={() => { setCurrentView('dashboard'); setSelectedRun(null); }} className="btn-ghost">
                    <Icons.ArrowLeft /> Back
                  </button>
                  <div>
                    <div className="run-banner-id" title={selectedRun?.workflow_id}>{selectedRun?.workflow_id}</div>
                    <span className={`badge badge-${selectedRun?.status}`} style={{ fontSize: '0.65rem' }}>
                      {selectedRun?.status}
                    </span>
                  </div>
                </div>
                <button onClick={() => fetchRunDetails(selectedRun)} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                  <Icons.Refresh /> Refresh
                </button>
              </div>

              {/* Split: Timeline Sidebar + Content */}
              <div className="pipeline-split">
                {/* Vertical Timeline */}
                <div className="v-timeline">
                  <div className="v-timeline-title">Pipeline Steps</div>
                  {stepsConfig.map((step, idx) => {
                    const status = getStepStatus(step.name);
                    const isInspected = inspectedStep?.step_name === step.name;
                    const isLast = idx === stepsConfig.length - 1;

                    return (
                      <div
                        key={step.name}
                        className={`v-step ${isInspected ? 'v-step--inspected' : ''} ${status === 'pending' ? 'v-step--pending' : ''}`}
                        onClick={() => {
                          const dbStep = [...runSteps].reverse().find(s => s.step_name === step.name);
                          if (dbStep) {
                            setInspectedStep(dbStep);
                            setManuallyInspectedStepName(step.name);
                          }
                        }}
                      >
                        <div className="v-step-rail">
                          <div className={`v-step-node v-step-node--${status === 'in_progress' ? 'running' : status}`}>
                            {status === 'completed' ? (
                              <Icons.Check />
                            ) : status === 'waiting' ? (
                              '!'
                            ) : (
                              idx + 1
                            )}
                          </div>
                          {!isLast && <div className={`v-step-line ${status === 'completed' ? 'v-step-line--done' : ''}`}></div>}
                        </div>
                        <div className="v-step-content">
                          <div className="v-step-label">{step.label}</div>
                          <div className="v-step-desc">{step.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Step Detail Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {!inspectedStep ? (
                    <div className="panel">
                      <div className="empty-state">
                        <Icons.Info />
                        <h4>Select a Pipeline Step</h4>
                        <p>Click on any step in the timeline to view its detailed outputs.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Tender Summary View */}
                      {inspectedStep.step_name === 'fetch_tender_summary' && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <h3><Icons.Info /> Tender Summary</h3>
                          </div>
                          <div className="step-panel-body">
                            <TenderSummaryView data={inspectedStep.output} />
                          </div>
                        </div>
                      )}

                      {/* Eligibility View */}
                      {inspectedStep.step_name === 'evaluate_eligibility' && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <h3><Icons.Info /> AI Eligibility Check Summary</h3>
                            {(selectedRun?.status === 'failed' || workflowStatus?.status === 'waiting_for_retry') && (
                              <button onClick={handleRetryWorkflow} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>
                                <Icons.Refresh /> Retry
                              </button>
                            )}
                          </div>
                          <div className="step-panel-body">
                            <EligibilityView data={inspectedStep.output} />
                          </div>
                        </div>
                      )}

                      {/* Annexure Listing View */}
                      {inspectedStep.step_name === 'list_annexures' && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <h3>Discovered Annexure Templates</h3>
                          </div>
                          <div className="step-panel-body">
                            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', marginBottom: '1rem' }}>
                              The following annexure templates were detected in the tender documents.
                            </p>
                            <div className="custom-card" style={{ padding: 0 }}>
                              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Annexure Code</th>
                                      <th>Description / Title</th>
                                      <th>Source File</th>
                                      <th>Page Range</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const listStep = inspectedStep.output;
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
                                        return (<tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No templates detected.</td></tr>);
                                      }
                                      return items.map((item, idx) => (
                                        <tr key={item.code || idx}>
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
                          </div>
                        </div>
                      )}

                      {/* Final Response View */}
                      {inspectedStep.step_name === 'generate_final_response' && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <h3>Generated Bid Artifacts</h3>
                          </div>
                          <div className="step-panel-body">
                            <FinalResponseView run={selectedRun} token={token} />
                          </div>
                        </div>
                      )}

                      {/* Template Generation & Selection View */}
                      {inspectedStep.step_name === 'generate_templates' && (
                        <div className="step-panel" style={{ border: workflowStatus?.status === 'waiting_for_selection' ? '1px solid hsla(var(--warning), 0.25)' : undefined }}>
                          {workflowStatus?.status === 'waiting_for_selection' ? (
                            <>
                              <div className="step-panel-header" style={{ borderBottomColor: 'hsla(var(--warning), 0.15)' }}>
                                <h3><Icons.Warning /> Template Review &amp; Selection</h3>
                              </div>
                              <div className="step-panel-body">
                                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                                  AI has generated the following response templates. Select which templates to autofill and include in the final bid.
                                </p>

                                <div className="custom-card" style={{ padding: 0, marginBottom: '1.25rem' }}>
                                  <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                                    <table>
                                      <thead>
                                        <tr>
                                          <th style={{ width: '40px' }}>Select</th>
                                          <th>Annexure Code</th>
                                          <th>Description / Title</th>
                                          <th>Source File</th>
                                          <th>Page Range</th>
                                          <th>Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          const tempStep = workflowStatus?.workflow_state?.template_response || inspectedStep.output;
                                          const items = [];
                                          let tempIdx = 0;
                                          for (const temp of (tempStep?.results || [])) {
                                            items.push({
                                              code: temp.annexure_id,
                                              title: getCleanTitle(temp, tempIdx),
                                              file_path: temp.file_path,
                                              range: `${temp.start_page || 0} - ${temp.end_page || 0}`,
                                              html: temp.html_template
                                            });
                                            tempIdx++;
                                          }
                                          if (items.length === 0) {
                                            return (<tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No templates generated yet.</td></tr>);
                                          }
                                          return items.map((item, idx) => (
                                            <React.Fragment key={item.code || idx}>
                                              <tr>
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
                                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                  />
                                                </td>
                                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'hsl(var(--secondary))' }}>{item.code}</td>
                                                <td>{item.title}</td>
                                                <td style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>{item.file_path?.split('/').pop()}</td>
                                                <td>{item.range}</td>
                                                <td>
                                                  <button className="btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                                    onClick={() => {
                                                      const newExpanded = { ...expandedTemplates };
                                                      newExpanded[item.code] = !newExpanded[item.code];
                                                      setExpandedTemplates(newExpanded);
                                                    }}
                                                  >
                                                    {expandedTemplates[item.code] ? 'Hide' : 'Preview'}
                                                  </button>
                                                </td>
                                              </tr>
                                              {expandedTemplates[item.code] && item.html && (
                                                <tr>
                                                  <td colSpan="6" style={{ padding: '1rem' }}>
                                                    <div className="template-html-preview" style={{ margin: 0, padding: '0.5rem' }}>
                                                      <div className="template-html-content" style={{ maxHeight: '420px', padding: 0, background: 'transparent', border: 'none' }}>
                                                        <SafeHtmlPreview html={item.html} maxHeight="400px" />
                                                      </div>
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          ));
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => {
                                      const tempStep = workflowStatus?.workflow_state?.template_response || inspectedStep.output;
                                      const codes = (tempStep?.results || []).map(r => r.annexure_id).filter(Boolean);
                                      setSelectedAnnexureIds(codes);
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                                  >
                                    Select All
                                  </button>
                                  <button onClick={() => setSelectedAnnexureIds([])} className="btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                    Clear
                                  </button>
                                  <button
                                    onClick={handleResumePipeline}
                                    className="btn-primary"
                                    style={{ padding: '0.45rem 1.2rem', fontSize: '0.82rem' }}
                                    disabled={submittingHITL}
                                  >
                                    {submittingHITL ? 'Signaling...' : 'Approve & Resume'}
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="step-panel-header">
                                <h3><Icons.FileText /> Annexure Template Generation</h3>
                              </div>
                              <div className="step-panel-body">
                                <TemplateGenerationView data={inspectedStep.output} />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Autofill View */}
                      {inspectedStep.step_name === 'autofill_template' && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <h3><Icons.FileText /> Auto-filled Templates</h3>
                          </div>
                          <div className="step-panel-body">
                            <AutofillView data={runSteps.filter(s => s.step_name === 'autofill_template').map(s => s.output)} />
                          </div>
                        </div>
                      )}

                      {/* Generic Step View */}
                      {!['fetch_tender_summary', 'evaluate_eligibility', 'list_annexures', 'generate_final_response', 'generate_templates', 'autofill_template'].includes(inspectedStep.step_name) && (
                        <div className="step-panel">
                          <div className="step-panel-header">
                            <div>
                              <h3>{formatKey(inspectedStep.step_name)}</h3>
                              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                                Step: <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--secondary))' }}>{inspectedStep.step_name}</span>
                                {' · '}Status: <span className={`badge badge-${inspectedStep.status}`} style={{ fontSize: '0.6rem' }}>{inspectedStep.status}</span>
                              </p>
                            </div>
                          </div>
                          <div className="step-panel-body">
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
                        </div>
                      )}
                    </>
                  )}

                  {/* Error display */}
                  {inspectedStep?.error && Object.keys(inspectedStep.error).length > 0 && (
                    <div className="panel" style={{ borderColor: 'hsla(var(--danger), 0.2)' }}>
                      <div className="panel-body">
                        <strong style={{ color: 'hsl(var(--danger))', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <Icons.Warning /> Error Details
                        </strong>
                        <div style={{
                          background: 'hsla(var(--danger), 0.04)', borderRadius: '8px',
                          padding: '0.85rem 1rem', border: '1px solid hsla(var(--danger), 0.12)',
                          fontSize: '0.83rem', color: 'hsl(var(--danger))', lineHeight: 1.6
                        }}>
                          {typeof inspectedStep.error === 'string'
                            ? inspectedStep.error
                            : inspectedStep.error.message || inspectedStep.error.detail || JSON.stringify(inspectedStep.error)}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
