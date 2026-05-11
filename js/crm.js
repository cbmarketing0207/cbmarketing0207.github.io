/* ===== State ===== */
let state = {
  contacts: [],
  activeId: null,
  view: 'dashboard',
  filter: null,
  method: null,
  search: '',
  pendingImport: [],
  selectedOutcome: null,
  settings: { name: '', company: '', apiKey: '', nudge: true }
};

/* ===== Storage ===== */
function save() { localStorage.setItem('crm_contacts', JSON.stringify(state.contacts)); }
function saveSettings() { localStorage.setItem('crm_settings', JSON.stringify(state.settings)); }

function load() {
  try {
    const c = localStorage.getItem('crm_contacts');
    if (c) { state.contacts = JSON.parse(c); return; }
  } catch(e) {}
  state.contacts = getSampleContacts();
  save();
}

function loadSettings() {
  try {
    const s = localStorage.getItem('crm_settings');
    if (s) state.settings = { ...state.settings, ...JSON.parse(s) };
  } catch(e) {}
}

/* ===== Helpers ===== */
function uid() { return 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2,6); }

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function daysLabel(n) {
  if (n === 0) return 'Today';
  if (n === 1) return '1 day ago';
  return n + ' days ago';
}

function recencyPhrase(n) {
  if (n === 0) return 'earlier today';
  if (n === 1) return 'yesterday';
  if (n < 7) return n + ' days ago';
  if (n < 14) return 'last week';
  return Math.floor(n / 7) + ' weeks ago';
}

function urgencyLevel(contact) {
  if (['replied','meeting_booked','dead'].includes(contact.status)) return 'none';
  const d = daysSince(contact.lastContactDate);
  const interval = contact.followUpDays || 3;
  if (d >= interval * 2) return 'high';
  if (d >= interval) return 'medium';
  if (d >= interval - 1) return 'low';
  return 'none';
}

function needsAttention(contact) {
  return urgencyLevel(contact) !== 'none';
}

function daysClass(contact) {
  const u = urgencyLevel(contact);
  if (u === 'high') return 'high';
  if (u === 'medium') return 'medium';
  if (u === 'low') return 'low';
  return 'neutral';
}

function statusLabel(s) {
  return { active:'Active', replied:'Replied', meeting_booked:'Meeting Booked', no_response:'No Response', dead:'Dead' }[s] || s;
}

function statusBadgeClass(s) {
  return { active:'badge-active', replied:'badge-replied', meeting_booked:'badge-meeting', no_response:'badge-no-response', dead:'badge-dead' }[s] || '';
}

function methodIcon(m) {
  return { email:'✉', sms:'💬', call:'📞' }[m] || '✉';
}

function methodLabel(m) {
  return { email:'Email', sms:'DM / SMS', call:'Call' }[m] || m;
}

function outcomeIcon(o) {
  return { replied:'💬', no_response:'🔇', meeting_booked:'📅', dead:'💀', added:'✦' }[o] || '•';
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function avatarColor(name) {
  const colors = ['#dc2626','#7c3aed','#0891b2','#059669','#d97706','#db2777'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

/* ===== CRUD ===== */
function addContact(data) {
  const c = {
    id: uid(),
    name: data.name,
    company: data.company || '',
    title: data.title || '',
    email: data.email || '',
    phone: data.phone || '',
    contactMethod: data.contactMethod || 'email',
    context: data.context || '',
    nextStep: data.nextStep || '',
    lastContactDate: data.lastContactDate || new Date().toISOString().split('T')[0],
    addedDate: new Date().toISOString(),
    followUpDays: parseInt(data.followUpDays) || 3,
    status: 'active',
    nudgeSent: false,
    history: [{ date: new Date().toISOString(), action: 'added', note: 'Contact added' }]
  };
  state.contacts.unshift(c);
  save();
  return c;
}

function updateContact(id, data) {
  const idx = state.contacts.findIndex(c => c.id === id);
  if (idx === -1) return;
  state.contacts[idx] = { ...state.contacts[idx], ...data };
  save();
}

function deleteContact(id) {
  state.contacts = state.contacts.filter(c => c.id !== id);
  if (state.activeId === id) state.activeId = null;
  save();
}

function logOutcome(id, outcome, note, nextDays) {
  const idx = state.contacts.findIndex(c => c.id === id);
  if (idx === -1) return;
  const c = state.contacts[idx];
  const entry = { date: new Date().toISOString(), action: 'outcome', outcome, note: note || '' };
  c.history = [entry, ...(c.history || [])];
  c.status = outcome;
  c.lastContactDate = new Date().toISOString().split('T')[0];
  c.nudgeSent = false;
  if (outcome === 'replied' || outcome === 'meeting_booked') {
    c.followUpDays = nextDays || 7;
  } else if (outcome === 'no_response') {
    c.followUpDays = nextDays || 5;
  }
  state.contacts[idx] = c;
  save();
}

/* ===== Message Generation ===== */
function generateMessage(contact, method) {
  const s = state.settings;
  const sender = s.name || 'Your Name';
  const company = s.company || 'CBMarketing';
  const firstName = (contact.name || '').split(' ')[0];
  const days = daysSince(contact.lastContactDate);

  if (method === 'email') return buildEmail(contact, firstName, sender, company, days);
  if (method === 'sms')   return buildSMS(contact, firstName, sender, company, days);
  if (method === 'call')  return buildCallScript(contact, firstName, sender, company, days);
  return '';
}

function buildEmail(contact, name, sender, company, days) {
  const ctx = contact.context || '';
  const next = contact.nextStep || 'connect for next steps';
  const recency = recencyPhrase(days);
  const isNoResp = contact.status === 'no_response';
  const isFinal = isNoResp && days > 14;

  let subject, body;

  if (isFinal) {
    subject = `Closing the loop — ${contact.company || 'our conversation'}`;
    body = `Hi ${name},

I wanted to send one last note before I close your file on my end.

We connected ${recency} and I shared some information about how ${company} helps businesses ${extractValue(ctx)}. I haven't heard back, which is totally fine — timing isn't always right.

If circumstances have changed and you'd like to revisit this, my door is always open. Just reply to this email and we can pick up where we left off.

Either way, I wish you and the team at ${contact.company || 'your company'} all the best.

${sender}
${company}`;
  } else if (isNoResp) {
    subject = `Quick follow-up, ${name}`;
    body = `Hi ${name},

Just circling back on my previous message. I know inboxes get busy, so I wanted to make sure this didn't slip through.

We last spoke ${recency} — I'd love to ${next.toLowerCase()}.

Is this still on your radar? Even a quick "not right now" is helpful so I can respect your time.

Best,
${sender}
${company}`;
  } else if (contact.status === 'replied') {
    subject = `Next steps — ${contact.company || 'following up'}`;
    body = `Hi ${name},

Thanks for getting back to me ${recency} — I appreciate it.

${next ? 'As discussed, I wanted to follow through on: ' + next + '.' : 'I wanted to keep the momentum going.'}

Would you have 20–30 minutes this week to connect? Happy to work around your schedule.

Looking forward to it,
${sender}
${company}`;
  } else {
    subject = `Following up — ${contact.company || 'our conversation'}`;
    body = `Hi ${name},

Hope things have been going well at ${contact.company || 'your end'}.

We connected ${recency} — ${summarizeContext(ctx)} I wanted to follow up and ${next.toLowerCase() || 'see if you had any questions'}.

Would you be open to a quick call this week? I can work around your schedule.

Best,
${sender}
${company}`;
  }

  return `Subject: ${subject}\n\n${body}`;
}

function buildSMS(contact, name, sender, company, days) {
  const next = contact.nextStep || 'catch up';
  const isNoResp = contact.status === 'no_response';

  if (isNoResp && days > 10) {
    return `Hey ${name}, last attempt here — still happy to ${next.toLowerCase()} when the timing works. Just reply and I'll pick it up. — ${sender}`;
  }
  if (isNoResp) {
    return `Hey ${name}! Wanted to follow up on my last message. Still interested in ${next.toLowerCase()}? Let me know — ${sender} @ ${company}`;
  }
  if (contact.status === 'replied') {
    return `Hey ${name}! Great connecting recently. Wanted to ${next.toLowerCase()} — when's a good time to chat? — ${sender}`;
  }
  return `Hey ${name}! ${sender} here from ${company}. Just wanted to check in — ${next.toLowerCase()}. Got a sec to connect?`;
}

function buildCallScript(contact, name, sender, company, days) {
  const ctx = contact.context || '';
  const next = contact.nextStep || 'discuss next steps';

  return `📞 CALL SCRIPT — ${contact.name}
${contact.company ? contact.company + ' | ' : ''}${contact.phone || 'No phone on file'}

──────────────────────────────
OPENER
──────────────────────────────
"Hi, is this ${name}? Great — this is ${sender} calling from ${company}. Hope I'm catching you at a good time. Do you have about 5 minutes?"

[If busy] → "Totally understand. When's a better time to reach you? I can call back at _______."

──────────────────────────────
CONTEXT REFRESHER
──────────────────────────────
"We connected ${recencyPhrase(days)} — ${summarizeContext(ctx, true)}"

──────────────────────────────
KEY POINTS TO COVER
──────────────────────────────
→ ${next}
→ Address any hesitations or questions they had
→ Confirm their main pain point: ${extractPain(ctx)}

──────────────────────────────
CLOSE / CTA
──────────────────────────────
"Based on everything we've discussed, I think the next best step is [X]. Does that make sense to you?"

"Can we lock in [specific commitment] before we hang up?"

──────────────────────────────
VOICEMAIL (if no answer)
──────────────────────────────
"Hi ${name}, this is ${sender} from ${company}. I'm calling to follow up on ${summarizeContext(ctx, true)} — I'd love to connect this week. Give me a call back at [your number] or shoot me a text. Talk soon!"`;
}

function summarizeContext(ctx, short = false) {
  if (!ctx) return short ? 'our previous conversation' : 'our last conversation';
  const s = ctx.slice(0, short ? 80 : 120);
  return s.length < ctx.length ? s + '...' : s;
}

function extractValue(ctx) {
  if (!ctx) return 'automate and grow their business';
  if (ctx.toLowerCase().includes('follow-up') || ctx.toLowerCase().includes('follow up')) return 'automate follow-ups';
  if (ctx.toLowerCase().includes('call') || ctx.toLowerCase().includes('receiptionist')) return 'handle calls automatically';
  if (ctx.toLowerCase().includes('review')) return 'generate more reviews';
  if (ctx.toLowerCase().includes('lead')) return 'capture and convert more leads';
  return 'save time and grow revenue';
}

function extractPain(ctx) {
  if (!ctx) return 'main challenge they want solved';
  if (ctx.toLowerCase().includes('overwhelm')) return 'overwhelmed with admin work';
  if (ctx.toLowerCase().includes('voicemail') || ctx.toLowerCase().includes('miss')) return 'missing calls / leads going to voicemail';
  if (ctx.toLowerCase().includes('crm') || ctx.toLowerCase().includes('manual')) return 'manual CRM work not getting done';
  if (ctx.toLowerCase().includes('review')) return 'not getting enough reviews';
  return 'time-consuming manual processes';
}

/* ===== Sidebar Counts ===== */
function updateSidebar() {
  const all = state.contacts;
  const needAction = all.filter(needsAttention);
  const active    = all.filter(c => c.status === 'active').length;
  const replied   = all.filter(c => c.status === 'replied').length;
  const meeting   = all.filter(c => c.status === 'meeting_booked').length;
  const noResp    = all.filter(c => c.status === 'no_response').length;
  const dead      = all.filter(c => c.status === 'dead').length;
  const total     = all.length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const badge = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    el.classList.toggle('empty', val === 0);
  };

  badge('badge-today', needAction.length);
  const tb = document.getElementById('badge-total');
  if (tb) { tb.textContent = total; tb.className = 'sidebar-badge secondary' + (total === 0 ? ' empty' : ''); }

  set('count-active', active);
  set('count-replied', replied);
  set('count-meeting', meeting);
  set('count-noresponse', noResp);
  set('count-dead', dead);

  const replied_total = replied + meeting;
  const rate = total ? Math.round((replied_total / total) * 100) : 0;
  const mrate = total ? Math.round((meeting / total) * 100) : 0;
  set('stat-replied-rate', rate + '%');
  set('stat-meeting-rate', mrate + '%');
}

/* ===== Render Helpers ===== */
function contactCardHTML(c, compact) {
  const d = daysSince(c.lastContactDate);
  const urg = urgencyLevel(c);
  const dc = daysClass(c);
  const urgClass = urg !== 'none' ? `urgency-${urg}` : '';
  const sel = c.id === state.activeId ? ' selected' : '';
  const label = d === 0 ? 'Today' : d + 'd ago';

  return `<div class="contact-card ${urgClass}${sel}" data-id="${c.id}" onclick="selectContact('${c.id}')">
    <div class="contact-avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
    <div class="contact-card-body">
      <div class="contact-card-name">${esc(c.name)}</div>
      ${c.company ? `<div class="contact-card-company">${esc(c.company)}</div>` : ''}
      ${c.context ? `<div class="contact-card-context">${esc(c.context)}</div>` : ''}
      <div class="contact-card-meta">
        <span class="badge ${statusBadgeClass(c.status)}">${statusLabel(c.status)}</span>
        <span style="font-size:12px;color:var(--g3)">${methodIcon(c.contactMethod)}</span>
      </div>
    </div>
    <div class="contact-card-right">
      <span class="days-badge ${dc}">${label}</span>
    </div>
  </div>`;
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ===== Views ===== */
function renderDashboard() {
  const all = state.contacts;
  const overdue   = all.filter(c => urgencyLevel(c) === 'high');
  const dueToday  = all.filter(c => urgencyLevel(c) === 'medium');
  const comingUp  = all.filter(c => urgencyLevel(c) === 'low');
  const nudge7    = all.filter(c => !['dead','meeting_booked'].includes(c.status) && daysSince(c.lastContactDate) >= 7 && !c.nudgeSent);
  const total     = all.length;
  const meetings  = all.filter(c => c.status === 'meeting_booked').length;
  const active    = all.filter(c => ['active','no_response','replied'].includes(c.status)).length;
  const needAct   = overdue.length + dueToday.length;

  const main = document.getElementById('crm-main');
  if (!main) return;

  let nudgeBanner = '';
  if (nudge7.length > 0) {
    nudgeBanner = `<div class="nudge-banner">
      <span class="nudge-banner-icon">⚠</span>
      <span><strong>${nudge7.length} contact${nudge7.length > 1 ? 's' : ''}</strong> with no action in 7+ days — don't let them go cold.</span>
    </div>`;
  }

  const sectionHTML = (title, badge, contacts, emptyMsg) => {
    if (contacts.length === 0) return `<div class="dashboard-section">
      <div class="section-heading">${title}</div>
      <div class="empty-state">${emptyMsg}</div>
    </div>`;
    return `<div class="dashboard-section">
      <div class="section-heading">${title}${badge ? `<span class="section-heading-badge">${badge}</span>` : ''}</div>
      ${contacts.map(c => contactCardHTML(c)).join('')}
    </div>`;
  };

  let emptyState = '';
  if (total === 0) {
    emptyState = `<div class="empty-cta">
      <div class="empty-cta-icon">🎯</div>
      <h3>No contacts yet</h3>
      <p>Start adding people you need to follow up with and never let an opportunity die from silence.</p>
      <button class="btn btn-primary" onclick="openAddContact()">+ Add Your First Contact</button>
    </div>`;
  }

  main.innerHTML = `
    <div class="dashboard-header">
      <div class="dashboard-title">Today's Focus</div>
      <div class="dashboard-subtitle">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
    </div>
    <div class="stats-row">
      <div class="stat-card${needAct > 0 ? ' urgent' : ''}">
        <div class="stat-card-value">${needAct}</div>
        <div class="stat-card-label">Need Follow-up</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${active}</div>
        <div class="stat-card-label">Active Contacts</div>
      </div>
      <div class="stat-card success">
        <div class="stat-card-value">${meetings}</div>
        <div class="stat-card-label">Meetings Booked</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${total}</div>
        <div class="stat-card-label">Total Contacts</div>
      </div>
    </div>
    ${nudgeBanner}
    ${emptyState}
    ${total > 0 ? sectionHTML('Overdue', overdue.length || null, overdue, 'No overdue follow-ups. You\'re on top of it. ✓') : ''}
    ${total > 0 ? sectionHTML('Follow Up Today', dueToday.length || null, dueToday, 'Nothing due today.') : ''}
    ${total > 0 ? sectionHTML('Coming Up', null, comingUp, '') : ''}
  `;
}

function renderContacts() {
  const main = document.getElementById('crm-main');
  if (!main) return;

  let contacts = state.contacts;

  if (state.filter) contacts = contacts.filter(c => c.status === state.filter);
  if (state.method) contacts = contacts.filter(c => c.contactMethod === state.method);
  if (state.search) {
    const q = state.search.toLowerCase();
    contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.context || '').toLowerCase().includes(q)
    );
  }

  contacts.sort((a, b) => {
    const ua = urgencyLevel(a) === 'none' ? 0 : urgencyLevel(a) === 'high' ? 3 : urgencyLevel(a) === 'medium' ? 2 : 1;
    const ub = urgencyLevel(b) === 'none' ? 0 : urgencyLevel(b) === 'high' ? 3 : urgencyLevel(b) === 'medium' ? 2 : 1;
    return ub - ua;
  });

  const title = state.filter ? statusLabel(state.filter) :
                state.method ? methodLabel(state.method) + ' Contacts' : 'All Contacts';

  main.innerHTML = `
    <div class="contacts-header">
      <div class="contacts-title">${title}</div>
      <button class="btn btn-primary btn-sm" onclick="openAddContact()">+ Add Contact</button>
    </div>
    <div class="search-bar-wrap">
      <input class="search-input" type="text" placeholder="Search contacts..." value="${esc(state.search)}" oninput="onSearch(this.value)"/>
    </div>
    <div class="contacts-grid">
      ${contacts.length === 0
        ? `<div class="empty-state">No contacts match your filters.</div>`
        : contacts.map(c => contactCardHTML(c)).join('')}
    </div>
  `;
}

function renderDetail(id) {
  const c = state.contacts.find(x => x.id === id);
  const panel = document.getElementById('crm-detail');
  if (!panel) return;

  if (!c) {
    panel.classList.add('hidden');
    panel.classList.remove('mobile-open');
    return;
  }

  panel.classList.remove('hidden');
  panel.classList.add('mobile-open');

  const d = daysSince(c.lastContactDate);
  const dc = daysClass(c);

  const historyHTML = (c.history || []).map(h => `
    <div class="timeline-item">
      <div class="timeline-dot ${h.outcome || h.action}">${outcomeIcon(h.outcome || h.action)}</div>
      <div class="timeline-body">
        <div class="timeline-action">${h.outcome ? statusLabel(h.outcome) : 'Added'}</div>
        ${h.note ? `<div class="timeline-note">${esc(h.note)}</div>` : ''}
        <div class="timeline-date">${formatDate(h.date)}</div>
      </div>
    </div>
  `).join('');

  panel.innerHTML = `
    <button class="detail-close" onclick="closeDetail()">×</button>
    <div class="detail-header">
      <div class="detail-avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
      <div>
        <div class="detail-name">${esc(c.name)}</div>
        ${c.company ? `<div class="detail-company">${esc(c.company)}${c.title ? ' · ' + esc(c.title) : ''}</div>` : ''}
        <div class="detail-badges">
          <span class="badge ${statusBadgeClass(c.status)}">${statusLabel(c.status)}</span>
          <span class="badge" style="background:var(--bg3);color:var(--g2)">${methodIcon(c.contactMethod)} ${methodLabel(c.contactMethod)}</span>
          <span class="days-badge ${dc}">${daysLabel(d)}</span>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" onclick="openOutcome('${c.id}')">Log Outcome</button>
      <button class="btn btn-ghost btn-sm" onclick="openAddContact('${c.id}')">Edit</button>
      <button class="btn btn-ghost btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,.3)" onclick="confirmDelete('${c.id}')">Delete</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Contact Info</div>
      ${c.email ? `<div class="detail-row"><span class="detail-row-label">Email</span><span class="detail-row-value"><a href="mailto:${esc(c.email)}" style="color:var(--red)">${esc(c.email)}</a></span></div>` : ''}
      ${c.phone ? `<div class="detail-row"><span class="detail-row-label">Phone</span><span class="detail-row-value"><a href="tel:${esc(c.phone)}" style="color:var(--red)">${esc(c.phone)}</a></span></div>` : ''}
      <div class="detail-row"><span class="detail-row-label">Follow up</span><span class="detail-row-value">Every ${c.followUpDays} day${c.followUpDays !== 1 ? 's' : ''}</span></div>
      <div class="detail-row"><span class="detail-row-label">Added</span><span class="detail-row-value">${formatDate(c.addedDate)}</span></div>
    </div>

    ${c.context ? `<div class="detail-section">
      <div class="detail-section-title">Last Interaction</div>
      <div class="detail-context">${esc(c.context)}</div>
    </div>` : ''}

    ${c.nextStep ? `<div class="detail-section">
      <div class="detail-section-title">Next Step</div>
      <div class="detail-nextstep">${esc(c.nextStep)}</div>
    </div>` : ''}

    <div class="composer" id="composer-section">
      <div class="composer-title">Draft Message</div>
      <div class="method-tabs">
        <button class="method-tab ${c.contactMethod === 'email' ? 'active' : ''}" data-method="email" onclick="switchMethod('email')">✉ Email</button>
        <button class="method-tab ${c.contactMethod === 'sms' ? 'active' : ''}" data-method="sms" onclick="switchMethod('sms')">💬 SMS</button>
        <button class="method-tab ${c.contactMethod === 'call' ? 'active' : ''}" data-method="call" onclick="switchMethod('call')">📞 Call</button>
      </div>
      <textarea class="draft-area" id="draft-area" placeholder="Click Generate Draft to create a personalized message…"></textarea>
      <div class="composer-actions">
        <button class="btn btn-primary btn-sm" onclick="generateDraft()">✦ Generate Draft</button>
        <button class="btn btn-ghost btn-sm" onclick="copyDraft()">Copy</button>
        <button class="btn btn-ghost btn-sm" onclick="clearDraft()" style="margin-left:auto">Clear</button>
      </div>
    </div>

    ${historyHTML ? `<div class="detail-section">
      <div class="detail-section-title">History</div>
    </div>
    <div class="timeline">${historyHTML}</div>` : ''}
  `;
}

/* ===== Interaction ===== */
function selectContact(id) {
  state.activeId = id;
  renderDetail(id);
  // Re-render current view to update selected state
  if (state.view === 'dashboard') renderDashboard();
  else renderContacts();
}

function closeDetail() {
  state.activeId = null;
  const panel = document.getElementById('crm-detail');
  if (panel) { panel.classList.add('hidden'); panel.classList.remove('mobile-open'); }
}

function setView(view, el) {
  state.view = view;
  state.filter = null;
  state.method = null;

  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  if (view === 'dashboard') renderDashboard();
  else renderContacts();
}

function setFilter(filter, el) {
  state.view = 'contacts';
  state.filter = filter;
  state.method = null;
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderContacts();
}

function setMethod(method, el) {
  state.view = 'contacts';
  state.method = method;
  state.filter = null;
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderContacts();
}

function onSearch(val) {
  state.search = val;
  renderContacts();
}

function switchMethod(method) {
  document.querySelectorAll('.method-tab').forEach(t => t.classList.toggle('active', t.dataset.method === method));
  document.getElementById('draft-area').value = '';
}

function getActiveMethod() {
  const active = document.querySelector('.method-tab.active');
  return active ? active.dataset.method : 'email';
}

function generateDraft() {
  const c = state.contacts.find(x => x.id === state.activeId);
  if (!c) return;
  const method = getActiveMethod();
  const area = document.getElementById('draft-area');
  if (!area) return;

  area.value = '';
  area.placeholder = 'Drafting…';

  // Simulate typing effect
  const draft = generateMessage(c, method);
  let i = 0;
  const speed = Math.max(4, Math.floor(3000 / draft.length));
  const interval = setInterval(() => {
    area.value += draft[i];
    i++;
    area.scrollTop = area.scrollHeight;
    if (i >= draft.length) {
      clearInterval(interval);
      area.placeholder = '';
      showToast('Draft generated', 'success');
    }
  }, speed);
}

function copyDraft() {
  const area = document.getElementById('draft-area');
  if (!area || !area.value.trim()) { showToast('Nothing to copy', 'error'); return; }
  navigator.clipboard.writeText(area.value).then(() => showToast('Copied to clipboard', 'success'));
}

function clearDraft() {
  const area = document.getElementById('draft-area');
  if (area) area.value = '';
}

/* ===== Modals ===== */
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function openAddContact(id) {
  const form = document.getElementById('form-contact');
  form.reset();
  document.getElementById('contact-id').value = '';
  document.getElementById('modal-contact-title').textContent = 'Add Contact';
  document.getElementById('contact-lastdate').value = new Date().toISOString().split('T')[0];
  document.getElementById('contact-interval').value = 3;

  if (id) {
    const c = state.contacts.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modal-contact-title').textContent = 'Edit Contact';
    document.getElementById('contact-id').value = c.id;
    document.getElementById('contact-name').value = c.name;
    document.getElementById('contact-company').value = c.company;
    document.getElementById('contact-title').value = c.title;
    document.getElementById('contact-email').value = c.email;
    document.getElementById('contact-phone').value = c.phone;
    document.getElementById('contact-method').value = c.contactMethod;
    document.getElementById('contact-context').value = c.context;
    document.getElementById('contact-nextstep').value = c.nextStep;
    document.getElementById('contact-lastdate').value = c.lastContactDate;
    document.getElementById('contact-interval').value = c.followUpDays;
  }

  openModal('modal-contact');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('form-contact').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('contact-id').value;
    const data = {
      name:           document.getElementById('contact-name').value.trim(),
      company:        document.getElementById('contact-company').value.trim(),
      title:          document.getElementById('contact-title').value.trim(),
      email:          document.getElementById('contact-email').value.trim(),
      phone:          document.getElementById('contact-phone').value.trim(),
      contactMethod:  document.getElementById('contact-method').value,
      context:        document.getElementById('contact-context').value.trim(),
      nextStep:       document.getElementById('contact-nextstep').value.trim(),
      lastContactDate:document.getElementById('contact-lastdate').value,
      followUpDays:   document.getElementById('contact-interval').value
    };

    if (id) {
      updateContact(id, data);
      showToast('Contact updated', 'success');
      if (state.activeId === id) renderDetail(id);
    } else {
      const c = addContact(data);
      showToast('Contact added', 'success');
      state.activeId = c.id;
    }

    closeModal('modal-contact');
    updateSidebar();
    if (state.view === 'dashboard') renderDashboard();
    else renderContacts();
    if (state.activeId) renderDetail(state.activeId);
  });
});

function openOutcome(id) {
  state.activeId = id;
  state.selectedOutcome = null;
  document.getElementById('outcome-note').value = '';
  document.getElementById('outcome-next-days').value = 3;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('selected'));
  openModal('modal-outcome');
}

function confirmDelete(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  if (confirm(`Delete ${c.name}? This cannot be undone.`)) {
    deleteContact(id);
    closeDetail();
    updateSidebar();
    if (state.view === 'dashboard') renderDashboard();
    else renderContacts();
    showToast('Contact deleted');
  }
}

/* ===== Import ===== */
function importCSV(input, type) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let contacts = [];
    if (type === 'linkedin') contacts = parseLinkedIn(text);
    else if (type === 'apollo') contacts = parseApollo(text);
    else contacts = parseGenericCSV(text);

    state.pendingImport = contacts;
    showImportPreview(contacts);
  };
  reader.readAsText(file);
}

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuote = !inQuote; continue; }
    if (line[i] === ',' && !inQuote) { result.push(current.trim()); current = ''; continue; }
    current += line[i];
  }
  result.push(current.trim());
  return result;
}

function parseLinkedIn(text) {
  const lines = text.trim().split('\n');
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = parseCSVLine(line);
    const get = (...keys) => { for (const k of keys) { const i = header.indexOf(k); if (i >= 0 && cols[i]) return cols[i]; } return ''; };
    return {
      name: [get('first name','firstname'), get('last name','lastname')].filter(Boolean).join(' ') || get('name'),
      company: get('company','organization','employer'),
      email: get('email address','email'),
      phone: get('phone','mobile'),
      title: get('position','title','job title'),
      context: 'LinkedIn connection',
      contactMethod: 'email'
    };
  }).filter(c => c.name);
}

function parseApollo(text) {
  const lines = text.trim().split('\n');
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = parseCSVLine(line);
    const get = (...keys) => { for (const k of keys) { const i = header.indexOf(k); if (i >= 0 && cols[i]) return cols[i]; } return ''; };
    return {
      name: get('name','full name','first name') || [get('first name'), get('last name')].filter(Boolean).join(' '),
      company: get('company','account name','organization'),
      email: get('email','work email'),
      phone: get('phone','mobile phone','direct phone'),
      title: get('title','job title'),
      context: 'Apollo.io export',
      contactMethod: 'email'
    };
  }).filter(c => c.name);
}

function parseGenericCSV(text) {
  const lines = text.trim().split('\n');
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = parseCSVLine(line);
    const get = (...keys) => { for (const k of keys) { const i = header.indexOf(k); if (i >= 0 && cols[i]) return cols[i]; } return ''; };
    return {
      name: get('name','full name'),
      company: get('company','organization','employer'),
      email: get('email','email address'),
      phone: get('phone','mobile','telephone'),
      title: get('title','role','position'),
      context: get('context','notes','') || 'Imported contact',
      contactMethod: 'email'
    };
  }).filter(c => c.name);
}

function showImportPreview(contacts) {
  const preview = document.getElementById('import-preview');
  const list = document.getElementById('import-list');
  const count = document.getElementById('import-count');
  if (!preview) return;

  count.textContent = `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} ready to import`;
  list.innerHTML = contacts.slice(0, 10).map(c =>
    `<div class="import-preview-item">
      <span class="import-preview-name">${esc(c.name)}</span>
      <span class="import-preview-co">${esc(c.company || '')}</span>
    </div>`
  ).join('') + (contacts.length > 10 ? `<div class="import-preview-item"><span style="color:var(--g3)">...and ${contacts.length - 10} more</span></div>` : '');

  preview.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  const importBtn = document.getElementById('btn-confirm-import');
  if (importBtn) importBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    state.pendingImport.forEach(data => addContact({ ...data, lastContactDate: today, followUpDays: 3 }));
    showToast(`${state.pendingImport.length} contacts imported`, 'success');
    state.pendingImport = [];
    closeModal('modal-import');
    updateSidebar();
    if (state.view === 'dashboard') renderDashboard();
    else renderContacts();
  });
});

/* ===== Settings ===== */
function openSettings() {
  document.getElementById('settings-name').value    = state.settings.name;
  document.getElementById('settings-company').value  = state.settings.company;
  document.getElementById('settings-api-key').value  = state.settings.apiKey;
  document.getElementById('settings-nudge').checked  = state.settings.nudge;
  openModal('modal-settings');
}

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('btn-save-settings');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    state.settings.name    = document.getElementById('settings-name').value.trim();
    state.settings.company = document.getElementById('settings-company').value.trim();
    state.settings.apiKey  = document.getElementById('settings-api-key').value.trim();
    state.settings.nudge   = document.getElementById('settings-nudge').checked;
    saveSettings();
    closeModal('modal-settings');
    showToast('Settings saved', 'success');
  });
});

/* ===== Outcome Modal ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.outcome-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedOutcome = btn.dataset.outcome;
      const hideNext = ['dead','meeting_booked'].includes(state.selectedOutcome);
      const g = document.getElementById('next-followup-group');
      if (g) g.style.display = hideNext ? 'none' : 'block';
    });
  });

  const saveOutcomeBtn = document.getElementById('btn-save-outcome');
  if (saveOutcomeBtn) saveOutcomeBtn.addEventListener('click', () => {
    if (!state.selectedOutcome) { showToast('Please select an outcome', 'error'); return; }
    const note = document.getElementById('outcome-note').value.trim();
    const days = parseInt(document.getElementById('outcome-next-days').value) || 3;
    logOutcome(state.activeId, state.selectedOutcome, note, days);
    closeModal('modal-outcome');
    updateSidebar();
    if (state.view === 'dashboard') renderDashboard();
    else renderContacts();
    renderDetail(state.activeId);
    showToast('Outcome logged', 'success');
  });
});

/* ===== Toast ===== */
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span class="toast-icon">${icon}</span> ${msg}`;
  el.className = `toast ${type}`;
  el.style.display = 'flex';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

/* ===== Keyboard shortcuts ===== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-contact','modal-outcome','modal-import','modal-settings'].forEach(closeModal);
    closeDetail();
  }
});

/* ===== Modal overlay click to close ===== */
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});

/* ===== Sample Data ===== */
function getSampleContacts() {
  const d = n => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
  const dt = n => new Date(Date.now() - n * 86400000).toISOString();

  return [
    {
      id: 'demo_1', name: 'Alex Rivera', company: 'Apex Plumbing', title: 'Owner',
      email: 'alex@apexplumbing.com', phone: '+1 555 010 0001', contactMethod: 'email',
      context: 'Met at the Home Services Summit in Austin. Runs a 12-person plumbing company losing leads to voicemail overnight. Very interested in our AI receptionist. Said budget isn\'t a problem if ROI is clear.',
      nextStep: 'Send the Miami Plumbing case study + a custom ROI estimate',
      lastContactDate: d(3), addedDate: dt(3), followUpDays: 3, status: 'active', nudgeSent: false,
      history: [{ date: dt(3), action: 'added', note: 'Met at Home Services Summit' }]
    },
    {
      id: 'demo_2', name: 'Sarah Chen', company: 'Glow HVAC', title: 'Operations Manager',
      email: 'sarah@glowhvac.com', phone: '+1 555 010 0002', contactMethod: 'call',
      context: 'Responded to LinkedIn outreach. Runs HVAC operations for a mid-size company. Frustrated with their current CRM — says the team doesn\'t use it. Looking for something simpler with automation built in.',
      nextStep: 'Call to walk through a live demo of the follow-up automation',
      lastContactDate: d(5), addedDate: dt(5), followUpDays: 4, status: 'replied', nudgeSent: false,
      history: [
        { date: dt(5), action: 'added', note: 'LinkedIn connection' },
        { date: dt(4), action: 'outcome', outcome: 'replied', note: 'Replied on LinkedIn, asked for more info' }
      ]
    },
    {
      id: 'demo_3', name: 'Mike Torres', company: 'Torres Electrical', title: 'Owner',
      email: 'mike@torreselectrical.com', phone: '+1 555 010 0003', contactMethod: 'sms',
      context: 'Referral from Alex Rivera. Solo electrician overwhelmed with admin. Interested in automating appointment reminders and review requests. Texted him, no reply yet.',
      nextStep: 'Follow up with a quick text, offer a 15-min demo call',
      lastContactDate: d(10), addedDate: dt(12), followUpDays: 5, status: 'no_response', nudgeSent: false,
      history: [
        { date: dt(12), action: 'added', note: 'Referral from Alex Rivera' },
        { date: dt(10), action: 'outcome', outcome: 'no_response', note: 'Sent intro text, no reply' }
      ]
    },
    {
      id: 'demo_4', name: 'Jennifer Walsh', company: 'Walsh Landscaping', title: 'CEO',
      email: 'jennifer@walshlandscaping.com', phone: '+1 555 010 0004', contactMethod: 'email',
      context: 'Cold outreach via email. Runs a regional landscaping company with 20+ employees. Booked a demo after seeing our Google Ads. Very engaged — asked detailed questions about Twilio integration.',
      nextStep: 'Prepare proposal with custom automation map for their business',
      lastContactDate: d(1), addedDate: dt(7), followUpDays: 7, status: 'meeting_booked', nudgeSent: false,
      history: [
        { date: dt(7), action: 'added', note: 'Cold email outreach' },
        { date: dt(5), action: 'outcome', outcome: 'replied', note: 'Booked a demo call' },
        { date: dt(1), action: 'outcome', outcome: 'meeting_booked', note: 'Demo went great, sending proposal' }
      ]
    },
    {
      id: 'demo_5', name: 'David Kim', company: 'Kim Roofing & Repair', title: 'Owner',
      email: 'david@kimroofing.com', phone: '+1 555 010 0005', contactMethod: 'email',
      context: 'Inbound inquiry from website contact form. Needs a system to handle after-hours calls and automate follow-up on estimates. Sent him pricing 2 days ago — waiting on a response.',
      nextStep: 'Follow up if no response to pricing email',
      lastContactDate: d(2), addedDate: dt(4), followUpDays: 3, status: 'active', nudgeSent: false,
      history: [
        { date: dt(4), action: 'added', note: 'Inbound website inquiry' },
        { date: dt(2), action: 'outcome', outcome: 'replied', note: 'Initial contact made, sent pricing' }
      ]
    },
    {
      id: 'demo_6', name: 'Lisa Park', company: 'Park Cleaning Services', title: 'Founder',
      email: 'lisa@parkcleaning.com', phone: '+1 555 010 0006', contactMethod: 'email',
      context: 'LinkedIn cold outreach. Initially interested in review automation. Said she\'d check with her business partner. Never heard back after the follow-up email 2 weeks ago.',
      nextStep: 'One final follow-up email, then close the loop',
      lastContactDate: d(14), addedDate: dt(21), followUpDays: 7, status: 'no_response', nudgeSent: true,
      history: [
        { date: dt(21), action: 'added', note: 'LinkedIn outreach' },
        { date: dt(18), action: 'outcome', outcome: 'replied', note: 'Showed interest, said she\'d check with partner' },
        { date: dt(14), action: 'outcome', outcome: 'no_response', note: 'Follow-up sent, no response' }
      ]
    }
  ];
}

/* ===== Init ===== */
function init() {
  load();
  loadSettings();
  updateSidebar();
  renderDashboard();

  // Wire up sidebar items
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view, btn));
  });
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter, btn));
  });
  document.querySelectorAll('[data-method-filter]').forEach(btn => {
    btn.addEventListener('click', () => setMethod(btn.dataset.methodFilter, btn));
  });
}

document.addEventListener('DOMContentLoaded', init);
