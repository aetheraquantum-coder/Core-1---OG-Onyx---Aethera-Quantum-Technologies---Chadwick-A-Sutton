'use strict';

// Offline presentation only. This module never loads files, executes the core,
// recalculates engine results, or sends report information anywhere.
const TITLE = 'Core 1 - OG Onyx';
const EVIDENCE = 'user-supplied; not independently verified';
const CORE_SHA256 = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const CORE_BYTES = 3089;
const FAMILIES = Object.freeze({
  'aethera-health-export/v1': ['Website health', 'Inspect the state of the pages you reviewed.'],
  'aethera-game-design-handoff/v1': ['Game design handoff', 'Bring explicit player ratings into the next design conversation.'],
  'aethera-game-learning/v1': ['Game learning', 'Read the feedback collected across learning contexts.'],
  'aethera-iterations/v1': ['Iteration risk', 'Review completed sets, blocked sets, and the maximum reported risk.'],
  'aethera-save-export/v1': ['Save export', 'Review the number of save records in the supplied export.'],
});
const SCHEMA_KEYS = Object.freeze({
  'aethera-health-export/v1': ['pages', 'activeIssues', 'stalePages'],
  'aethera-game-design-handoff/v1': ['helpfulRatings', 'funRatings', 'learningContexts'],
  'aethera-game-learning/v1': ['helpfulRatings', 'funRatings', 'learningContexts'],
  'aethera-iterations/v1': ['completedSets', 'blockedSets', 'maxRisk'],
  'aethera-save-export/v1': ['saveRecords'],
});
const METRICS = Object.freeze({
  pages: 'Page count', activeIssues: 'Active issues', stalePages: 'Stale pages',
  helpfulRatings: 'Helpful ratings', funRatings: 'Fun ratings', learningContexts: 'Learning contexts',
  completedSets: 'Completed sets', blockedSets: 'Blocked sets', maxRisk: 'Maximum reported risk', saveRecords: 'Save records',
});
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const exact = value => Object.is(value, -0) ? '-0' : String(value);
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function display(value, unit, signed = false) {
  const rounded = unit === 'score' ? Math.round(value * 1000) / 1000 : value;
  const approximate = rounded !== value;
  const magnitude = unit === 'count' ? integer.format(Math.abs(rounded)) : String(Math.abs(rounded));
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${approximate ? '≈ ' : ''}${sign}${magnitude}`;
}
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
function validate(model) {
  const invalid = () => { throw new TypeError('Invalid report model.'); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validNumber = (key, value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
    (key === 'maxRisk' ? value <= 1 : Number.isSafeInteger(value));
  if (!record(model) || model.title !== TITLE || !['summary', 'comparison', 'showcase'].includes(model.mode) || !iso(model.generatedAt) ||
      typeof model.synthetic !== 'boolean' || model.evidence !== EVIDENCE ||
      !record(model.source) || model.source.sha256 !== CORE_SHA256 || model.source.bytes !== CORE_BYTES ||
      model.source.version !== null || !record(model.runtime) || model.runtime.name !== 'node' ||
      typeof model.runtime.version !== 'string' || !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(model.runtime.version) ||
      !Array.isArray(model.reports)) invalid();
  const showcase = model.mode === 'showcase';
  const comparison = model.mode !== 'summary';
  if (model.reports.length !== (showcase ? Object.keys(SCHEMA_KEYS).length : 1) || (showcase && !model.synthetic)) invalid();
  const seenSchemas = new Set();
  const seenIds = new Set();
  for (const report of model.reports) {
    if (!record(report) || typeof report.schema !== 'string' || !own(SCHEMA_KEYS, report.schema) ||
        typeof report.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(report.id) || seenIds.has(report.id) ||
        report.family !== FAMILIES[report.schema][0] || !Array.isArray(report.metrics) ||
        typeof report.suggestion !== 'string' || report.suggestion.length > 10000 || !record(report.execution) ||
        !iso(report.execution.startedAt) || !iso(report.execution.completedAt) ||
        Date.parse(report.execution.completedAt) < Date.parse(report.execution.startedAt)) invalid();
    if (showcase && seenSchemas.has(report.schema)) invalid();
    seenSchemas.add(report.schema);
    seenIds.add(report.id);
    const expectedKeys = SCHEMA_KEYS[report.schema];
    if (report.metrics.length !== expectedKeys.length || (comparison ? !record(report.before) : report.before !== null)) invalid();
    function validateSnapshot(snapshot) {
      if (!record(snapshot) || snapshot.schema !== report.schema || snapshot.evidence !== EVIDENCE ||
          !record(snapshot.metrics) || Object.keys(snapshot.metrics).length !== expectedKeys.length ||
          !expectedKeys.every(key => own(snapshot.metrics, key) && validNumber(key, snapshot.metrics[key]))) invalid();
    }
    validateSnapshot(report.after);
    if (comparison) validateSnapshot(report.before);
    const keys = new Set();
    for (const metric of report.metrics) {
      if (!record(metric) || !expectedKeys.includes(metric.key) || keys.has(metric.key) ||
          metric.label !== METRICS[metric.key] || metric.unit !== (metric.key === 'maxRisk' ? 'score' : 'count') ||
          !validNumber(metric.key, metric.after) || !Object.is(metric.after, report.after.metrics[metric.key])) invalid();
      keys.add(metric.key);
      if (comparison) {
        if (!validNumber(metric.key, metric.before) || !Object.is(metric.before, report.before.metrics[metric.key]) ||
            typeof metric.difference !== 'number' || !Number.isFinite(metric.difference) ||
            !Object.is(metric.difference, metric.after - metric.before)) invalid();
      } else if (metric.before !== null || metric.difference !== null) invalid();
    }
  }
}
function publicSummary(summary) {
  if (summary === null) return null;
  // validate() established exact schema-specific keys and types. Copy only the
  // validated summary fields; never substitute schema/evidence or carry raw data.
  const metrics = Object.fromEntries(SCHEMA_KEYS[summary.schema].map(key => [key, summary.metrics[key]]));
  return { schema: summary.schema, metrics, evidence: summary.evidence };
}
function publicModel(model) {
  return {
    mode: model.mode, title: TITLE, generatedAt: model.generatedAt,
    source: { sha256: model.source.sha256, bytes: model.source.bytes, version: null },
    runtime: { name: model.runtime.name, version: model.runtime.version }, synthetic: model.synthetic, evidence: EVIDENCE,
    reports: model.reports.map(report => ({
      id: report.id,
      schema: report.schema, family: FAMILIES[report.schema][0],
      before: publicSummary(report.before), after: publicSummary(report.after),
      metrics: report.metrics.map(metric => ({ key: metric.key, label: METRICS[metric.key], unit: metric.unit,
        before: metric.before, after: metric.after, difference: metric.difference })),
      suggestion: report.suggestion,
      execution: { startedAt: report.execution.startedAt, completedAt: report.execution.completedAt },
    })),
  };
}
function serialize(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  })[character]);
}
function metricCard(metric) {
  const maximum = metric.unit === 'score' ? 1 : Math.max(1, metric.before ?? 0, metric.after);
  const bar = (value, label, kind) => `<div class="bar-row"><span>${label}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill ${kind}" style="width:${value / maximum * 100}%"></div></div><span class="bar-value">${escape(display(value, metric.unit))}</span></div>`;
  const change = metric.difference === null ? '<span class="delta">Single report</span>' : `<span class="delta">${escape(display(metric.difference, metric.unit, true))}<span class="delta-note"> change</span></span>`;
  return `<article class="metric-card" data-metric="${metric.key}" data-unit="${metric.unit}" data-scale-max="${exact(maximum)}">
  <div class="metric-top"><h4>${METRICS[metric.key]}</h4><span class="unit">${metric.unit === 'score' ? '0–1 score' : 'Count'}</span></div>
  <div class="metric-value">${escape(display(metric.after, metric.unit))}<span class="metric-period">${metric.before === null ? 'reported' : 'after'}</span></div>
  ${change}<div class="bars" aria-label="${escape(METRICS[metric.key])}: independent ${metric.unit} scale from 0 to ${exact(maximum)}">
  ${metric.before === null ? '' : bar(metric.before, 'Before', 'before')}${bar(metric.after, metric.before === null ? 'Report' : 'After', 'after')}
  <div class="axis" aria-hidden="true"><span>0</span><span>${escape(display(maximum, metric.unit))}</span></div></div>
  </article>`;
}
function reportPanel(report, index, multiple) {
  const [family, description] = FAMILIES[report.schema];
  const comparison = report.before !== null;
  const rounded = report.metrics.some(metric => metric.unit === 'score' && [metric.before, metric.after, metric.difference].some(value => value !== null && Math.round(value * 1000) / 1000 !== value));
  const rows = report.metrics.map(metric => `<tr><th scope="row">${METRICS[metric.key]}</th><td>${metric.unit === 'score' ? '0–1 score' : 'count'}</td><td>${metric.before === null ? '<span class="empty-value">Not supplied</span>' : exact(metric.before)}</td><td>${exact(metric.after)}</td><td>${metric.difference === null ? '<span class="empty-value">Not supplied</span>' : exact(metric.difference)}</td></tr>`).join('');
  return `<section class="report-panel" id="report-${index}"${multiple ? ` role="tabpanel" aria-labelledby="tab-${index}" tabindex="0"` : ` aria-labelledby="report-title-${index}"`}>
    <div class="section-heading"><div><div class="eyebrow">${String(index + 1).padStart(2, '0')} / Report view</div><h3 id="report-title-${index}">${family}</h3><p>${description}</p></div><span class="view-tag">${comparison ? 'Before → After' : 'Single report'}</span></div>
    <div class="metrics-grid">${report.metrics.map(metricCard).join('')}</div>
    <p class="chart-note">Each metric has its own scale.${report.metrics.some(metric => metric.unit === 'score') ? ' Maximum reported risk is a normalized 0–1 score.' : ''}${rounded ? ' Rounded chart labels use ≈; exact values are below.' : ''} Changes are descriptive, not proof of improvement.</p>
    <aside class="next-test" aria-labelledby="next-test-${index}"><div class="next-symbol" aria-hidden="true">↗</div><div><div class="eyebrow">The original core suggests</div><h4 id="next-test-${index}">Choose the next test.</h4><p>${escape(report.suggestion)}</p><span class="advisory">Original rule-based advice · Advisory only</span></div></aside>
    <div class="data-section"><div class="sub-heading"><h4>The numbers, exactly.</h4><span>Unrounded engine output</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="Exact metric values for ${family}"><table><caption>Exact metric values · ${family}</caption><thead><tr><th scope="col">Metric</th><th scope="col">Unit</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">After − before</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="execution-detail"><span class="eyebrow">Observed execution</span><dl><div><dt>Started</dt><dd><time datetime="${escape(report.execution.startedAt)}">${escape(report.execution.startedAt)}</time></dd></div><div><dt>Completed</dt><dd><time datetime="${escape(report.execution.completedAt)}">${escape(report.execution.completedAt)}</time></dd></div><div><dt>Schema</dt><dd>${escape(report.schema)}</dd></div></dl></div>
  </section>`;
}
const CSS = `
:root{color-scheme:dark;--bg:#101015;--panel:#19191f;--panel-2:#1e1e26;--ink:#f4f2fc;--muted:#aaa8ba;--line:#34323e;--violet:#c3b4ff;--violet-deep:#8065cd;--before:#9299ae;--after:#c3b4ff;--radius:16px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-synthesis:none}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit}a{color:inherit}button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--violet);outline-offset:5px}::selection{background:#594483;color:white}.shell{width:min(1248px,calc(100% - 96px));margin:0 auto}.skip-link{position:absolute;left:24px;top:-80px;z-index:20;background:var(--ink);color:var(--bg);padding:12px 20px;border-radius:10px}.skip-link:focus{top:12px}.topbar{height:102px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:13px;font-size:13px;font-weight:700;letter-spacing:.17em}.brand-symbol{display:inline-block;width:25px;height:30px;background:linear-gradient(135deg,#efe7ff 0 35%,#aa91ef 36% 64%,#68509e 65%);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.topbar-meta{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted)}.hero{padding:64px 0 56px;position:relative;overflow:hidden}.hero-copy{position:relative;z-index:1;max-width:930px}.eyebrow{font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:var(--violet)}.hero .eyebrow{margin-bottom:18px}.hero h1{font-size:clamp(36px,5.6vw,70px);font-weight:650;letter-spacing:-.065em;line-height:1.05;margin:0 0 24px;max-width:940px}.hero-line{font-size:clamp(24px,3.1vw,38px);letter-spacing:-.045em;line-height:1.2;margin:0 0 20px;font-weight:450;color:#d8d4e4}.hero-line span{color:var(--violet)}.hero-description{color:var(--muted);font-size:16px;max-width:490px;margin:0;line-height:1.7}.hero-art{position:absolute;width:245px;height:245px;right:10px;top:70px;opacity:.34;transform:rotate(-18deg);pointer-events:none}.hero-art:before,.hero-art:after{content:"";position:absolute;inset:0;border:1px solid #9b7eeb;border-radius:38px;transform:rotate(45deg)}.hero-art:after{inset:42px;border-color:#c0a8ff;border-radius:20px;box-shadow:0 0 80px #8f5deb1a}.hero-art i{position:absolute;inset:85px;background:linear-gradient(135deg,#b499f04d,#5b447b0a);transform:rotate(45deg);border:1px solid #b9a0ef;border-radius:10px}.status-strip{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px;border:1px solid #494057;border-radius:var(--radius);background:linear-gradient(105deg,#25202f,#1a1921);margin-bottom:40px}.status-label{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:650;white-space:nowrap}.status-dot{width:7px;height:7px;border-radius:50%;background:var(--violet)}.evidence-notice{margin:0;font-size:12px;color:#c5bed2;text-align:right}.evidence-notice strong{font-weight:500;color:var(--ink)}.report-nav-label{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.report-nav-label span:last-child{color:var(--muted);font-size:11px}.tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:0 0 40px}.tab{padding:18px 16px;text-align:left;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:11px;cursor:pointer;line-height:1.35;transition:border-color .16s,background .16s,color .16s;min-height:87px}.tab:hover{background:#262330;border-color:#685579;color:var(--ink)}.tab[aria-selected="true"]{background:#30283e;border-color:#9780c8;color:var(--ink)}.tab-number{display:block;color:#a78ccc;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;margin-bottom:10px}.tab-text{font-size:12px;font-weight:550}.report-panel{padding-bottom:24px}.report-panel+.report-panel{padding-top:40px;border-top:1px solid var(--line)}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 0 26px}.section-heading h3{font-size:30px;line-height:1.2;letter-spacing:-.045em;font-weight:550;margin:9px 0 9px}.section-heading p{color:var(--muted);font-size:13px;margin:0;max-width:680px}.view-tag{flex-shrink:0;border:1px solid var(--line);color:#cbc5d7;font-size:10px;letter-spacing:.08em;padding:8px 12px;border-radius:6px;white-space:nowrap}.metrics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.metric-card{background:linear-gradient(150deg,#1e1d25,#18181e);border:1px solid var(--line);border-radius:var(--radius);padding:24px;min-width:0;overflow:hidden}.metric-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-height:35px}.metric-top h4{font-size:13px;color:#d1cbdc;font-weight:500;margin:0}.unit{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:#aaa3b9;white-space:nowrap;line-height:1.9}.metric-value{font-size:54px;letter-spacing:-.065em;font-weight:550;line-height:1.15;margin:13px 0 10px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.metric-period{font-size:11px;letter-spacing:0;color:var(--muted);font-weight:450;display:inline-block;margin-left:9px}.delta{display:inline-block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;padding:5px 9px;border:1px solid #4a4258;border-radius:6px;color:#d4c5ef;background:#2b2434}.delta-note{color:#aaa0ba}.bars{margin-top:25px}.bar-row{display:grid;grid-template-columns:39px minmax(30px,1fr) auto;align-items:center;gap:12px;margin:13px 0;font-size:10px;color:var(--muted)}.bar-track{height:7px;border-radius:3px;background:#30303b;overflow:hidden}.bar-fill{height:100%;border-radius:3px}.bar-fill.before{background:var(--before)}.bar-fill.after{background:var(--after)}.bar-value{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#d1cbdc;min-width:18px;text-align:right}.axis{display:flex;justify-content:space-between;margin-left:51px;margin-right:30px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#a59daf;font-size:9px;padding-top:2px}.chart-note{margin:15px 0 29px;color:var(--muted);font-size:11px;line-height:1.7;max-width:990px}.next-test{display:flex;gap:21px;padding:29px 30px;background:linear-gradient(105deg,#252030,#1c1a25);border:1px solid #4b3d5e;border-radius:var(--radius);margin-bottom:40px}.next-symbol{width:42px;height:42px;border:1px solid #66527f;flex-shrink:0;display:grid;place-items:center;font-size:26px;font-weight:300;border-radius:12px;color:var(--violet);background:#332942}.next-test h4{font-size:25px;letter-spacing:-.04em;font-weight:500;margin:6px 0 11px}.next-test p{font-size:14px;line-height:1.75;color:#ded7e8;max-width:870px;margin:0 0 17px;overflow-wrap:anywhere}.advisory{font-size:10px;color:#b4a7c5;letter-spacing:.02em}.sub-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:18px}.sub-heading h4{font-size:17px;font-weight:500;letter-spacing:-.02em;margin:0}.sub-heading>span{font-size:10px;color:var(--muted)}.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;text-align:left;font-size:12px;font-variant-numeric:tabular-nums}caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}th,td{padding:16px 20px;white-space:nowrap}thead th{background:#1c1b23;color:#b6aebf;font-size:10px;font-weight:500}tbody tr+tr{border-top:1px solid #2b2933}tbody th{font-weight:450;color:#d4cede}tbody td{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#e6dff0}td:nth-child(2){color:#aaa1b7;font-size:10px}.empty-value{font-size:10px;color:var(--muted)}.execution-detail{margin:28px 0 0;padding:22px 0 0;border-top:1px solid var(--line)}.execution-detail dl{display:flex;flex-wrap:wrap;gap:20px 48px;margin:14px 0 0}.execution-detail dl>div{min-width:0}.execution-detail dt{font-size:10px;color:var(--muted);margin-bottom:5px}.execution-detail dd{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:#c1b8cd;margin:0;overflow-wrap:anywhere}.receipt{border:1px solid var(--line);border-radius:var(--radius);background:#17171d;padding:28px;margin:16px 0 42px}.receipt-heading{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:22px}.receipt-heading h2{font-size:17px;letter-spacing:-.025em;margin:0;font-weight:500}.receipt-heading span{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}.receipt-grid{display:grid;grid-template-columns:1.8fr 1fr 1fr;gap:25px;margin:0}.receipt-grid dt{font-size:10px;color:var(--muted);margin:0 0 8px}.receipt-grid dd{margin:0;font-size:11px;color:#d2cbdc;overflow-wrap:anywhere;line-height:1.7}.hash{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px!important}.receipt-small{display:block;color:var(--muted);font-size:10px;margin-top:6px}.footer{border-top:1px solid var(--line);padding:28px 0 40px;display:flex;align-items:flex-start;justify-content:space-between;gap:25px;font-size:10px;color:var(--muted)}.footer-name{font-size:11px;color:#d3cddd;margin-bottom:6px}.footer p{margin:0;line-height:1.8}.footer-right{text-align:right;max-width:380px}.no-script{font-size:12px;padding:14px;border:1px solid var(--line);border-radius:10px;color:var(--muted)}
@media(min-width:1050px){.metrics-grid:has(.metric-card:only-child){grid-template-columns:minmax(280px,400px)}.hero-copy{padding-right:75px}.hero-description{max-width:650px}}
@media(max-width:900px){.shell{width:calc(100% - 48px)}.topbar{height:84px}.hero{padding:48px 0 38px}.hero-art{right:-75px;opacity:.2}.metrics-grid{gap:12px}.metric-card{padding:19px}.metric-value{font-size:46px}.metric-top{min-height:42px}.metric-top h4{font-size:12px}.unit{font-size:8px}.bar-row{gap:8px}.tab{padding:15px 12px}.receipt-grid{grid-template-columns:1.4fr 1fr}.receipt-grid>div:first-child{grid-column:1/-1}.status-strip{margin-bottom:32px}}
@media(max-width:640px){.shell{width:calc(100% - 36px)}.topbar{height:72px}.brand{font-size:11px;gap:10px}.brand-symbol{width:21px;height:26px}.topbar-meta{font-size:8px;letter-spacing:.1em}.hero{padding:40px 0 33px}.hero h1{font-size:39px;max-width:350px;line-height:1.08;letter-spacing:-.055em;margin-bottom:21px}.hero-line{font-size:27px;max-width:340px;line-height:1.2}.hero-description{font-size:13px;max-width:310px;line-height:1.8}.hero-art{width:180px;height:180px;right:-80px;top:75px;opacity:.23}.hero-art i{inset:62px}.hero-art:after{inset:30px}.hero .eyebrow{font-size:9px}.status-strip{display:block;padding:17px 18px;margin-bottom:30px}.evidence-notice{text-align:left;font-size:10px;margin-top:8px;line-height:1.7}.status-label{font-size:11px}.tabs{display:flex;overflow-x:auto;gap:8px;margin-bottom:31px;padding:5px 3px 12px;scrollbar-color:#6e598e transparent;scrollbar-width:thin}.tab{min-width:144px;min-height:78px;padding:13px}.tab-number{margin-bottom:8px}.tab-text{font-size:11px}.report-nav-label{margin-bottom:8px}.report-nav-label span:last-child{font-size:9px}.section-heading{align-items:flex-start;gap:13px;margin-bottom:22px}.section-heading h3{font-size:26px;margin:8px 0}.section-heading p{font-size:12px}.section-heading .eyebrow{font-size:9px}.view-tag{font-size:8px;padding:7px 8px;margin-top:3px}.metrics-grid{grid-template-columns:1fr;gap:12px}.metric-card{padding:21px 23px}.metric-top{min-height:auto}.metric-top h4{font-size:13px}.unit{font-size:9px}.metric-value{font-size:49px;margin:13px 0 9px}.bars{margin-top:20px}.bar-row{font-size:11px;margin:12px 0;gap:13px}.bar-track{height:8px}.axis{margin-right:31px}.chart-note{font-size:10px;margin:14px 0 24px}.next-test{padding:22px 19px;gap:14px;margin-bottom:29px}.next-symbol{width:32px;height:32px;border-radius:9px;font-size:22px}.next-test h4{font-size:22px}.next-test .eyebrow{font-size:8px}.next-test p{font-size:12px;line-height:1.85}.advisory{font-size:9px}.sub-heading{display:block;margin-bottom:13px}.sub-heading h4{font-size:16px}.sub-heading>span{display:block;margin-top:4px;font-size:9px}th,td{padding:14px 16px}.execution-detail{margin-top:24px}.execution-detail dl{gap:16px}.execution-detail dl>div{width:100%}.receipt{padding:21px 19px;margin:4px 0 28px}.receipt-heading{display:block;margin-bottom:20px}.receipt-heading span{display:block;margin-top:5px;font-size:8px}.receipt-grid{grid-template-columns:1fr;gap:20px}.receipt-grid>div:first-child{grid-column:auto}.footer{display:block;padding:22px 0 30px}.footer-right{text-align:left;margin-top:17px}.footer{font-size:9px}.footer-name{font-size:10px}}
@media(prefers-reduced-motion: reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:white;color:#18151e}.shell{width:100%;max-width:none}.skip-link,.tabs,.report-nav-label,.hero-art,.no-script{display:none}.topbar{height:55px;border-color:#aaa}.topbar-meta,.hero-description,.section-heading p,.chart-note,.footer,.evidence-notice,.execution-detail dt{color:#49414e}.hero{padding:25px 0}.hero h1{font-size:36px}.hero-line{font-size:25px;color:#292030}.hero-line span,.eyebrow{color:#624188}.status-strip,.metric-card,.next-test,.receipt{background:#f7f5fa;border-color:#b7abc7;color:#23192d}.status-label,.evidence-notice strong{color:#23192d}.report-panel[hidden]{display:block!important}.report-panel{break-inside:avoid;padding-bottom:22px}.report-panel+.report-panel{padding-top:24px;break-before:page;border-top:0}.section-heading{margin-bottom:15px}.metrics-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric-card{padding:15px}.metric-top h4,.unit,.metric-period,.bar-row,.bar-value,.axis,.delta-note{color:#51445b}.metric-value{font-size:36px}.delta{color:#342340;background:#e9e1f1;border-color:#c1b0d0}.bar-track{background:#ddd7e4}.next-test{padding:20px;margin-bottom:25px}.next-test p,.advisory{color:#3c3047}.next-symbol{color:#624188;background:#eee6f6}.table-scroll{overflow:visible;border-color:#b7abc7}th,td{padding:11px 10px}thead th{background:#f1edf5;color:#51445b}tbody th,tbody td,td:nth-child(2),.empty-value{color:#292030}.execution-detail dd,.receipt-grid dd{color:#2b2034}.receipt-small,.receipt-heading span,.receipt-grid dt{color:#51445b}.receipt{break-inside:avoid;margin-bottom:22px}.footer-name{color:#292030}.view-tag{color:#51445b;border-color:#b7abc7}.footer{padding:20px 0}}
`;
const SCRIPT = `
(function () {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  function select(index, focus) {
    tabs.forEach(function (tab, position) {
      const active = position === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[position].hidden = !active;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { select(index, false); });
    tab.addEventListener('keydown', function (event) {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(next, true); }
    });
  });
  select(0, false);
})();
`;
function renderReport(model) {
  validate(model);
  const multiple = model.reports.length > 1;
  const navigation = multiple ? `<div class="report-nav-label"><span class="eyebrow">Explore the report families</span><span>${model.reports.length} views · One original core</span></div><nav class="tabs" role="tablist" aria-label="Report schema">${model.reports.map((report, index) => `<button class="tab" type="button" role="tab" id="tab-${index}" aria-controls="report-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"><span class="tab-number">${String(index + 1).padStart(2, '0')}</span><span class="tab-text">${FAMILIES[report.schema][0]}</span></button>`).join('')}</nav><noscript><p class="no-script">JavaScript is off. All report views are shown below.</p></noscript>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="color-scheme" content="dark light"><title>${TITLE}</title><style>${CSS}</style></head>
<body><a class="skip-link" href="#report-content">Skip to report</a><div class="shell">
<header class="topbar"><div class="brand"><span class="brand-symbol" aria-hidden="true"></span><span>ONYX / CORE 01</span></div><span class="topbar-meta">Local report review</span></header>
<main><section class="hero" aria-labelledby="launch-title"><div class="hero-copy"><div class="eyebrow">A clearer view of your evidence</div><h1 id="launch-title">${TITLE}</h1><h2 class="hero-line">Original engine. <span>Clearer view.</span></h2><p class="hero-description">Review evidence, compare changes, choose the next test.<br>A focused view of the original Onyx core’s report output.</p></div><div class="hero-art" aria-hidden="true"><i></i></div></section>
<aside class="status-strip" aria-label="Evidence status"><div class="status-label"><span class="status-dot" aria-hidden="true"></span>${model.synthetic ? 'Synthetic example' : 'User-supplied reports'}</div><p class="evidence-notice"><strong>Evidence:</strong> ${EVIDENCE}${model.synthetic ? '<br>Illustrative inputs · Executed by the original core' : ''}</p></aside>
<div id="report-content" tabindex="-1">${navigation}${model.reports.map((report, index) => reportPanel(report, index, multiple)).join('')}</div>
<section class="receipt" aria-labelledby="receipt-title"><div class="receipt-heading"><h2 id="receipt-title">The execution receipt.</h2><span>Preserved core · Local Node.js runtime</span></div><dl class="receipt-grid"><div><dt>Core source SHA-256</dt><dd class="hash">${escape(model.source.sha256)}</dd><dd class="receipt-small">${integer.format(model.source.bytes)} bytes · Version not declared</dd></div><div><dt>Runtime</dt><dd>Node.js ${escape(model.runtime.version)}</dd><dd class="receipt-small">Original core, unchanged</dd></div><div><dt>Report generated</dt><dd><time datetime="${escape(model.generatedAt)}">${escape(model.generatedAt)}</time></dd><dd class="receipt-small">UTC · Execution timestamps in each view</dd></div></dl></section></main>
<footer class="footer"><div><div class="footer-name">Core 1 - OG Onyx</div><p>Chadwick A. Sutton / Aethera Quantum Technologies</p></div><p class="footer-right">${EVIDENCE}<br>Offline report · No external resources</p></footer></div>
<script type="application/json" id="core1-report-model">${serialize(publicModel(model))}</script><script>${SCRIPT}</script></body></html>`;
}
module.exports = { renderReport };
