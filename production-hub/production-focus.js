import { supabaseConfig } from './supabase-config.js';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_LABEL = { urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baixa' };
const STATUS_LABEL = { BACKLOG: 'Backlog', DOING: 'Fazendo', REVIEW: 'Revisão', DONE: 'Feito' };

let state = {
  uid: '',
  me: null,
  projects: [],
  project: null,
  profiles: [],
  tasks: [],
  sprints: [],
  blockers: [],
  requests: [],
  decisions: [],
  builds: [],
  activities: [],
  loading: false,
};

const focusStyle = document.createElement('style');
focusStyle.textContent = `
  #home > .hero,
  #home > #announcement,
  #home > .home-grid,
  #projects > .hero,
  #projects > .section-head,
  #projects > #projectList,
  #docs > .hero,
  #docs > #docsGrid,
  .nav button[data-view="assets"] { display:none!important; }

  .focus-shell { display:grid; gap:18px; }
  .focus-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin:6px 0 4px; }
  .focus-hero h1 { margin:0; font-size:clamp(28px,3vw,42px); letter-spacing:-.035em; }
  .focus-hero p { margin:7px 0 0; color:#737987; max-width:720px; }
  .focus-kicker { font-size:12px; font-weight:800; letter-spacing:.11em; text-transform:uppercase; color:#777ce5; margin-bottom:6px; }
  .focus-project-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 11px; border:1px solid #e2e4ea; border-radius:999px; background:#fff; color:#565d6c; font-size:13px; font-weight:700; white-space:nowrap; }
  .focus-project-pill::before { content:''; width:8px; height:8px; border-radius:50%; background:#5f63f2; }

  .focus-grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:14px; }
  .focus-card { grid-column:span 4; background:#fff; border:1px solid #e5e7ec; border-radius:18px; padding:18px; box-shadow:0 5px 18px rgba(35,43,70,.035); min-width:0; }
  .focus-card.wide { grid-column:span 8; }
  .focus-card.full { grid-column:1/-1; }
  .focus-card.half { grid-column:span 6; }
  .focus-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .focus-card-head h2, .focus-card-head h3 { margin:0; font-size:17px; letter-spacing:-.015em; }
  .focus-card-head p { margin:4px 0 0; color:#8a909d; font-size:13px; }
  .focus-count { min-width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; padding:0 8px; border-radius:999px; background:#f0f1f5; color:#686f7c; font-size:12px; font-weight:800; }
  .focus-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .focus-btn { appearance:none; border:1px solid #dfe2e9; background:#fff; color:#535a68; border-radius:10px; padding:8px 11px; font:inherit; font-size:12px; font-weight:750; cursor:pointer; }
  .focus-btn:hover { border-color:#cfd3dd; background:#fafafd; }
  .focus-btn.primary { color:#fff; background:#5f63f2; border-color:#5f63f2; }
  .focus-btn.danger { color:#a54141; background:#fff8f8; border-color:#f0d5d5; }
  .focus-btn:disabled { opacity:.45; cursor:not-allowed; }

  .focus-sprint { position:relative; overflow:hidden; background:linear-gradient(145deg,#575be9,#7377f2); color:#fff; border:0; }
  .focus-sprint::after { content:''; position:absolute; width:220px; height:220px; border-radius:50%; right:-90px; top:-120px; background:rgba(255,255,255,.09); }
  .focus-sprint .focus-kicker { color:rgba(255,255,255,.72); }
  .focus-sprint h2 { margin:0 0 7px; font-size:21px; position:relative; z-index:1; }
  .focus-sprint p { margin:0; color:rgba(255,255,255,.82); line-height:1.45; position:relative; z-index:1; }
  .focus-sprint-meta { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:20px; position:relative; z-index:1; }
  .focus-progress { flex:1; min-width:120px; height:7px; border-radius:999px; background:rgba(255,255,255,.18); overflow:hidden; }
  .focus-progress > i { display:block; height:100%; border-radius:inherit; background:#fff; }
  .focus-progress-label { font-size:12px; font-weight:800; white-space:nowrap; }
  .focus-sprint .focus-btn { background:rgba(255,255,255,.14); color:#fff; border-color:rgba(255,255,255,.26); }

  .focus-list { display:grid; gap:8px; }
  .focus-empty { padding:20px 6px; color:#969ca7; font-size:13px; text-align:center; }
  .focus-item { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:11px 0; border-bottom:1px solid #f0f1f4; }
  .focus-item:last-child { border-bottom:0; padding-bottom:0; }
  .focus-item:first-child { padding-top:0; }
  .focus-item-main { min-width:0; }
  .focus-item-title { color:#303643; font-size:14px; font-weight:780; line-height:1.3; overflow-wrap:anywhere; }
  .focus-item-sub { margin-top:4px; color:#8a909c; font-size:12px; line-height:1.35; }
  .focus-item-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .focus-tag { display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:5px 8px; font-size:10px; font-weight:850; text-transform:uppercase; letter-spacing:.045em; background:#f1f2f5; color:#747b88; white-space:nowrap; }
  .focus-tag.urgent { background:#fff0f0; color:#b54a4a; }
  .focus-tag.high { background:#fff5e9; color:#a96c26; }
  .focus-tag.doing { background:#eceeff; color:#565bd5; }
  .focus-tag.review { background:#f6efff; color:#8359bd; }
  .focus-tag.blocker { background:#fff1f1; color:#b54545; }
  .focus-tag.request { background:#eef7ff; color:#477aa6; }

  .focus-now { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:13px 14px; border:1px solid #e8e9ee; border-radius:14px; background:#fcfcfe; }
  .focus-now + .focus-now { margin-top:8px; }
  .focus-now strong { display:block; font-size:14px; color:#313744; }
  .focus-now span { display:block; margin-top:4px; color:#8a909c; font-size:12px; }

  .focus-links { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .focus-link { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #e5e7ec; border-radius:14px; padding:14px; background:#fcfcfd; text-decoration:none; color:#343a47; font-weight:760; }
  .focus-link small { display:block; color:#969ca8; font-weight:600; margin-top:3px; }
  .focus-link.disabled { opacity:.45; pointer-events:none; }

  .focus-build { display:grid; gap:14px; }
  .focus-build-version { font-size:28px; font-weight:900; letter-spacing:-.035em; color:#2f3542; }
  .focus-build-copy { color:#747b87; font-size:13px; line-height:1.55; white-space:pre-wrap; }
  .focus-issues { padding:12px 13px; border-radius:12px; background:#fff8f0; color:#8b6537; font-size:12px; line-height:1.5; white-space:pre-wrap; }

  .focus-team { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .focus-person { border:1px solid #e5e7ec; border-radius:15px; padding:14px; background:#fff; }
  .focus-person-top { display:flex; align-items:center; gap:10px; }
  .focus-avatar { width:36px; height:36px; border-radius:50%; object-fit:cover; background:#eef0f4; display:grid; place-items:center; font-size:12px; font-weight:850; color:#656c79; overflow:hidden; }
  .focus-person strong { display:block; color:#303643; font-size:14px; }
  .focus-person small { display:block; color:#949aa5; margin-top:2px; }
  .focus-person-work { margin-top:12px; padding-top:10px; border-top:1px solid #f0f1f4; color:#686f7c; font-size:12px; line-height:1.45; }

  #focusProduction { margin-bottom:18px; }
  #tasks > .board-top { margin-top:4px; }
  #tasks > #taskBoard { margin-top:14px; }

  #focusDialog { border:0; padding:0; border-radius:20px; width:min(560px,calc(100vw - 28px)); box-shadow:0 24px 80px rgba(26,32,52,.24); }
  #focusDialog::backdrop { background:rgba(24,28,42,.42); backdrop-filter:blur(2px); }
  .focus-modal { padding:22px; display:grid; gap:16px; }
  .focus-modal-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .focus-modal h2 { margin:0; font-size:21px; }
  .focus-modal-close { border:0; background:#f1f2f5; width:34px; height:34px; border-radius:10px; cursor:pointer; font-size:20px; color:#6f7581; }
  .focus-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .focus-field { display:grid; gap:6px; }
  .focus-field.full { grid-column:1/-1; }
  .focus-field label { font-size:12px; font-weight:800; color:#656c79; }
  .focus-field input, .focus-field textarea, .focus-field select { width:100%; box-sizing:border-box; border:1px solid #dfe2e8; border-radius:11px; padding:10px 11px; font:inherit; color:#303642; background:#fff; }
  .focus-field textarea { min-height:92px; resize:vertical; }
  .focus-modal-actions { display:flex; justify-content:flex-end; gap:8px; }

  @media (max-width:900px) {
    .focus-card, .focus-card.wide, .focus-card.half { grid-column:1/-1; }
    .focus-team, .focus-links { grid-template-columns:1fr; }
    .focus-hero { align-items:flex-start; flex-direction:column; }
  }
  @media (max-width:600px) {
    .focus-form-grid { grid-template-columns:1fr; }
    .focus-field.full { grid-column:auto; }
    .focus-card { padding:15px; border-radius:15px; }
  }
`;
document.head.appendChild(focusStyle);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAccessToken() {
  for (const key of Object.keys(localStorage)) {
    if (!/^sb-.*-auth-token$/.test(key)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      const token = value?.access_token || value?.currentSession?.access_token;
      if (token) return token;
    } catch {}
  }
  return '';
}

function uidFromToken(token) {
  try {
    const raw = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
    return JSON.parse(atob(padded)).sub || '';
  } catch { return ''; }
}

async function api(table, { method = 'GET', query = {}, body } = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada.');
  const url = new URL(`${supabaseConfig.url}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const headers = {
    apikey: supabaseConfig.publishableKey,
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers.Prefer = 'return=representation';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(detail || `Erro ${response.status}`);
  }
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

function fmtDate(value, withYear = false) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('pt-BR', withYear ? { day:'2-digit', month:'short', year:'numeric' } : { day:'2-digit', month:'short' }).format(new Date(y, m - 1, d));
}

function fmtDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(date);
}

function personName(id) {
  return state.profiles.find(p => p.id === id)?.display_name || 'Equipe';
}

function isProducer() {
  return state.me?.role === 'producer';
}

function projectIdFromUI() {
  const filter = document.getElementById('taskProjectFilter');
  if (filter?.value && state.projects.some(p => p.id === filter.value)) return filter.value;
  if (state.me?.last_project_id && state.projects.some(p => p.id === state.me.last_project_id)) return state.me.last_project_id;
  return state.projects[0]?.id || '';
}

function ensureRoots() {
  const home = document.getElementById('home');
  const tasks = document.getElementById('tasks');
  const projects = document.getElementById('projects');
  const docs = document.getElementById('docs');
  if (!home || !tasks || !projects || !docs) return false;

  if (!document.getElementById('focusHome')) {
    const el = document.createElement('div');
    el.id = 'focusHome';
    el.className = 'focus-shell';
    home.prepend(el);
  }
  if (!document.getElementById('focusProduction')) {
    const el = document.createElement('div');
    el.id = 'focusProduction';
    el.className = 'focus-shell';
    tasks.prepend(el);
  }
  if (!document.getElementById('focusProject')) {
    const el = document.createElement('div');
    el.id = 'focusProject';
    el.className = 'focus-shell';
    projects.prepend(el);
  }
  if (!document.getElementById('focusTeam')) {
    const el = document.createElement('div');
    el.id = 'focusTeam';
    el.className = 'focus-shell';
    docs.prepend(el);
  }
  if (!document.getElementById('focusDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'focusDialog';
    document.body.appendChild(dialog);
  }

  const navMap = {
    home: 'Hoje',
    tasks: 'Produção',
    projects: 'Projeto',
    docs: 'Equipe',
  };
  for (const [view, label] of Object.entries(navMap)) {
    const button = document.querySelector(`.nav button[data-view="${view}"]`);
    if (button) button.textContent = label;
  }
  return true;
}

async function loadState() {
  if (state.loading) return;
  state.loading = true;
  try {
    const token = getAccessToken();
    const uid = uidFromToken(token);
    if (!uid) return;
    state.uid = uid;

    const [projects, profiles, meRows] = await Promise.all([
      api('projects', { query: { select:'*', active:'eq.true', order:'created_at.asc' } }),
      api('profiles', { query: { select:'id,display_name,email,avatar_url,role,last_project_id,last_visit_at', order:'created_at.asc' } }),
      api('profiles', { query: { select:'*', id:`eq.${uid}`, limit:'1' } }),
    ]);
    state.projects = projects;
    state.profiles = profiles;
    state.me = meRows[0] || profiles.find(p => p.id === uid) || null;

    const projectId = projectIdFromUI();
    state.project = projects.find(p => p.id === projectId) || projects[0] || null;
    if (!state.project) {
      renderAll();
      return;
    }

    const pid = state.project.id;
    const [tasks, sprints, blockers, requests, decisions, builds, activities] = await Promise.all([
      api('tasks', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.asc' } }),
      api('sprints', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.desc' } }),
      api('blockers', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.desc' } }),
      api('requests', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.desc' } }),
      api('decisions', { query: { select:'*', project_id:`eq.${pid}`, order:'decided_at.desc,created_at.desc', limit:'20' } }),
      api('builds', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.desc', limit:'20' } }),
      api('activities', { query: { select:'*', project_id:`eq.${pid}`, order:'created_at.desc', limit:'15' } }),
    ]);
    state.tasks = tasks;
    state.sprints = sprints;
    state.blockers = blockers;
    state.requests = requests;
    state.decisions = decisions;
    state.builds = builds;
    state.activities = activities;
    renderAll();
  } catch (error) {
    console.error('[production-focus]', error);
  } finally {
    state.loading = false;
  }
}

function activeSprint() {
  return state.sprints.find(s => s.active) || null;
}

function taskProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.status === 'DONE').length;
  return { total, done, percent: total ? Math.round(done / total * 100) : 0 };
}

function taskItem(task) {
  const priority = task.priority || 'normal';
  const statusClass = task.status === 'DOING' ? 'doing' : task.status === 'REVIEW' ? 'review' : '';
  const deadline = task.deadline ? `Prazo ${fmtDate(task.deadline)}` : 'Sem prazo';
  const owner = personName(task.owner_id);
  return `<div class="focus-item">
    <div class="focus-item-main">
      <div class="focus-item-title">${escapeHtml(task.title)}</div>
      <div class="focus-item-sub">${escapeHtml(owner)} · ${escapeHtml(deadline)}${task.module ? ` · ${escapeHtml(task.module)}` : ''}</div>
    </div>
    <div class="focus-item-actions">
      ${priority !== 'normal' ? `<span class="focus-tag ${escapeHtml(priority)}">${escapeHtml(PRIORITY_LABEL[priority] || priority)}</span>` : ''}
      <span class="focus-tag ${statusClass}">${escapeHtml(STATUS_LABEL[task.status] || task.status)}</span>
    </div>
  </div>`;
}

function renderSprintCard() {
  const sprint = activeSprint();
  const progress = taskProgress();
  const producerButton = isProducer() ? `<button class="focus-btn" data-focus-action="sprint">${sprint ? 'Editar sprint' : 'Definir sprint'}</button>` : '';
  if (!sprint) {
    return `<section class="focus-card wide focus-sprint">
      <div class="focus-kicker">Objetivo atual</div>
      <h2>Nenhuma sprint ativa</h2>
      <p>Defina um objetivo curto para a equipe saber o que precisa existir no próximo build.</p>
      <div class="focus-sprint-meta">
        <div class="focus-progress"><i style="width:${progress.percent}%"></i></div>
        <span class="focus-progress-label">${progress.done}/${progress.total} tarefas feitas</span>
        ${producerButton}
      </div>
    </section>`;
  }
  const period = [fmtDate(sprint.starts_on), fmtDate(sprint.ends_on)].filter(Boolean).join(' até ');
  return `<section class="focus-card wide focus-sprint">
    <div class="focus-kicker">Sprint atual${period ? ` · ${escapeHtml(period)}` : ''}</div>
    <h2>${escapeHtml(sprint.name)}</h2>
    <p>${escapeHtml(sprint.objective || 'Sem objetivo registrado.')}</p>
    <div class="focus-sprint-meta">
      <div class="focus-progress"><i style="width:${progress.percent}%"></i></div>
      <span class="focus-progress-label">${progress.done}/${progress.total} tarefas feitas</span>
      ${producerButton}
    </div>
  </section>`;
}

function renderHome() {
  const root = document.getElementById('focusHome');
  if (!root) return;
  if (!state.project) {
    root.innerHTML = `<div class="focus-empty">Nenhum projeto ativo.</div>`;
    return;
  }

  const myTasks = state.tasks
    .filter(t => t.owner_id === state.uid && t.status !== 'DONE')
    .sort((a, b) => (PRIORITY_ORDER[a.priority || 'normal'] - PRIORITY_ORDER[b.priority || 'normal']) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')))
    .slice(0, 5);

  const waitingRequests = state.requests.filter(r => r.status === 'OPEN' && r.requested_from_id === state.uid);
  const reviewTasks = isProducer() ? state.tasks.filter(t => t.status === 'REVIEW') : [];
  const openBlockers = state.blockers.filter(b => b.status === 'OPEN').slice(0, 5);
  const recent = state.activities.slice(0, 6);

  root.innerHTML = `
    <div class="focus-hero">
      <div>
        <div class="focus-kicker">Visão operacional</div>
        <h1>O que importa agora.</h1>
        <p>Abra o Hub e descubra em poucos segundos o que fazer, quem está esperando você e o que está bloqueando a equipe.</p>
      </div>
      <span class="focus-project-pill">${escapeHtml(state.project.name)}</span>
    </div>

    <div class="focus-grid">
      ${renderSprintCard()}
      <section class="focus-card">
        <div class="focus-card-head">
          <div><h2>Faça agora</h2><p>Suas próximas tarefas</p></div>
          <span class="focus-count">${myTasks.length}</span>
        </div>
        <div class="focus-list">${myTasks.length ? myTasks.map(taskItem).join('') : '<div class="focus-empty">Nada pendente para você.</div>'}</div>
      </section>

      <section class="focus-card half">
        <div class="focus-card-head">
          <div><h2>Esperando você</h2><p>Pedidos e revisões que dependem da sua ação</p></div>
          <span class="focus-count">${waitingRequests.length + reviewTasks.length}</span>
        </div>
        <div class="focus-list">
          ${waitingRequests.map(r => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(r.title)}</div><div class="focus-item-sub">Pedido de ${escapeHtml(personName(r.requester_id))}${r.due_date ? ` · Até ${escapeHtml(fmtDate(r.due_date))}` : ''}</div></div><span class="focus-tag request">Pedido</span></div>`).join('')}
          ${reviewTasks.map(t => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(t.title)}</div><div class="focus-item-sub">${escapeHtml(personName(t.owner_id))} enviou para revisão</div></div><span class="focus-tag review">Revisão</span></div>`).join('')}
          ${!waitingRequests.length && !reviewTasks.length ? '<div class="focus-empty">Ninguém está esperando uma ação sua.</div>' : ''}
        </div>
      </section>

      <section class="focus-card half">
        <div class="focus-card-head">
          <div><h2>Blockers da equipe</h2><p>O que está impedindo o projeto de avançar</p></div>
          <span class="focus-count">${openBlockers.length}</span>
        </div>
        <div class="focus-list">
          ${openBlockers.length ? openBlockers.map(b => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(b.title)}</div><div class="focus-item-sub">${escapeHtml(b.detail || (b.owner_id ? `Responsável: ${personName(b.owner_id)}` : 'Sem detalhe'))}</div></div><span class="focus-tag blocker">Blocker</span></div>`).join('') : '<div class="focus-empty">Nenhum blocker aberto.</div>'}
        </div>
      </section>

      <section class="focus-card full">
        <div class="focus-card-head">
          <div><h2>Mudanças recentes</h2><p>O que aconteceu no projeto enquanto você estava em outra coisa</p></div>
          <span class="focus-count">${recent.length}</span>
        </div>
        <div class="focus-list">
          ${recent.length ? recent.map(a => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(a.text)}</div><div class="focus-item-sub">${escapeHtml(personName(a.actor_id))} · ${escapeHtml(fmtDateTime(a.created_at))}</div></div></div>`).join('') : '<div class="focus-empty">Ainda não há mudanças registradas.</div>'}
        </div>
      </section>
    </div>`;
}

function canUpdateRequest(r) {
  return isProducer() || r.requester_id === state.uid || r.requested_from_id === state.uid;
}

function canResolveBlocker(b) {
  return isProducer() || b.created_by === state.uid || b.owner_id === state.uid;
}

function renderProduction() {
  const root = document.getElementById('focusProduction');
  if (!root || !state.project) return;
  const openRequests = state.requests.filter(r => r.status === 'OPEN');
  const openBlockers = state.blockers.filter(b => b.status === 'OPEN');
  const progress = taskProgress();

  root.innerHTML = `
    <div class="focus-hero">
      <div>
        <div class="focus-kicker">Produção</div>
        <h1>${escapeHtml(state.project.name)}</h1>
        <p>Objetivo da sprint, dependências da equipe e fluxo de tarefas em um só lugar.</p>
      </div>
      <div class="focus-actions">
        <button class="focus-btn" data-focus-action="request">Novo pedido</button>
        <button class="focus-btn" data-focus-action="blocker">Novo blocker</button>
        <button class="focus-btn primary" data-focus-action="new-task">Nova tarefa</button>
      </div>
    </div>

    <div class="focus-grid">
      ${renderSprintCard()}
      <section class="focus-card">
        <div class="focus-card-head"><div><h2>Estado</h2><p>Resumo do fluxo atual</p></div></div>
        <div class="focus-now"><div><strong>${progress.percent}% concluído</strong><span>${progress.done} de ${progress.total} tarefas em Feito</span></div></div>
        <div class="focus-now"><div><strong>${state.tasks.filter(t => t.status === 'DOING').length} em andamento</strong><span>${state.tasks.filter(t => t.status === 'REVIEW').length} aguardando revisão</span></div></div>
      </section>

      <section class="focus-card half">
        <div class="focus-card-head">
          <div><h2>Pedidos</h2><p>Quem precisa de quem para continuar</p></div>
          <span class="focus-count">${openRequests.length}</span>
        </div>
        <div class="focus-list">
          ${openRequests.length ? openRequests.map(r => `<div class="focus-item">
            <div class="focus-item-main"><div class="focus-item-title">${escapeHtml(r.title)}</div><div class="focus-item-sub">${escapeHtml(personName(r.requester_id))} precisa de ${escapeHtml(personName(r.requested_from_id))}${r.due_date ? ` · Até ${escapeHtml(fmtDate(r.due_date))}` : ''}${r.detail ? `<br>${escapeHtml(r.detail)}` : ''}</div></div>
            <div class="focus-item-actions">${canUpdateRequest(r) ? `<button class="focus-btn" data-focus-action="finish-request" data-id="${r.id}">Concluir</button>` : ''}</div>
          </div>`).join('') : '<div class="focus-empty">Nenhum pedido aberto.</div>'}
        </div>
      </section>

      <section class="focus-card half">
        <div class="focus-card-head">
          <div><h2>Blockers</h2><p>Problemas que impedem o trabalho de seguir</p></div>
          <span class="focus-count">${openBlockers.length}</span>
        </div>
        <div class="focus-list">
          ${openBlockers.length ? openBlockers.map(b => `<div class="focus-item">
            <div class="focus-item-main"><div class="focus-item-title">${escapeHtml(b.title)}</div><div class="focus-item-sub">${escapeHtml(b.detail || 'Sem detalhe')}${b.owner_id ? `<br>Responsável: ${escapeHtml(personName(b.owner_id))}` : ''}</div></div>
            <div class="focus-item-actions">${canResolveBlocker(b) ? `<button class="focus-btn" data-focus-action="resolve-blocker" data-id="${b.id}">Resolver</button>` : ''}</div>
          </div>`).join('') : '<div class="focus-empty">Nenhum blocker aberto.</div>'}
        </div>
      </section>

      <section class="focus-card full" style="padding-bottom:8px">
        <div class="focus-card-head" style="margin-bottom:0"><div><h2>Fluxo de tarefas</h2><p>Arraste o card para atualizar o status. O board continua logo abaixo.</p></div></div>
      </section>
    </div>`;
}

function renderProject() {
  const root = document.getElementById('focusProject');
  if (!root || !state.project) return;
  const currentBuild = state.builds.find(b => b.is_current) || state.builds[0] || null;
  const sprintHistory = state.sprints.slice(0, 5);

  root.innerHTML = `
    <div class="focus-hero">
      <div>
        <div class="focus-kicker">Projeto</div>
        <h1>${escapeHtml(state.project.name)}</h1>
        <p>${escapeHtml(state.project.description || 'Builds, decisões e links essenciais do projeto.')}</p>
      </div>
      <div class="focus-actions">
        ${isProducer() ? '<button class="focus-btn" data-focus-action="decision">Registrar decisão</button><button class="focus-btn primary" data-focus-action="build">Registrar build</button>' : ''}
      </div>
    </div>

    <div class="focus-grid">
      <section class="focus-card half">
        <div class="focus-card-head"><div><h2>Build atual</h2><p>A versão que a equipe deve testar agora</p></div>${isProducer() ? '<button class="focus-btn" data-focus-action="build">Atualizar</button>' : ''}</div>
        ${currentBuild ? `<div class="focus-build">
          <div class="focus-build-version">${escapeHtml(currentBuild.version)}</div>
          <div class="focus-build-copy">${escapeHtml(currentBuild.summary || 'Sem resumo registrado.')}</div>
          ${currentBuild.known_issues ? `<div class="focus-issues"><strong>Problemas conhecidos</strong><br>${escapeHtml(currentBuild.known_issues)}</div>` : ''}
          ${currentBuild.url ? `<div><button class="focus-btn primary" data-focus-action="open-url" data-url="${escapeHtml(currentBuild.url)}">Abrir build</button></div>` : ''}
        </div>` : '<div class="focus-empty">Nenhuma build registrada ainda.</div>'}
      </section>

      <section class="focus-card half">
        <div class="focus-card-head"><div><h2>Links essenciais</h2><p>Sem transformar o Hub em outro Drive</p></div></div>
        <div class="focus-links">
          <a class="focus-link ${state.project.doc_url ? '' : 'disabled'}" ${state.project.doc_url ? `href="${escapeHtml(state.project.doc_url)}" target="_blank" rel="noopener"` : ''}><div>GDD<small>Documento principal</small></div><span>↗</span></a>
          <a class="focus-link ${state.project.assets_url ? '' : 'disabled'}" ${state.project.assets_url ? `href="${escapeHtml(state.project.assets_url)}" target="_blank" rel="noopener"` : ''}><div>Assets<small>Pasta compartilhada</small></div><span>↗</span></a>
        </div>
      </section>

      <section class="focus-card wide">
        <div class="focus-card-head"><div><h2>Decisões</h2><p>O que foi decidido e não deve se perder no Discord</p></div>${isProducer() ? '<button class="focus-btn" data-focus-action="decision">Registrar</button>' : ''}</div>
        <div class="focus-list">
          ${state.decisions.length ? state.decisions.map(d => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(d.title)}</div><div class="focus-item-sub">${escapeHtml(d.decision)}<br>${escapeHtml(fmtDate(d.decided_at, true))} · ${escapeHtml(personName(d.created_by))}</div></div></div>`).join('') : '<div class="focus-empty">Nenhuma decisão registrada.</div>'}
        </div>
      </section>

      <section class="focus-card">
        <div class="focus-card-head"><div><h2>Sprints</h2><p>Histórico dos objetivos do projeto</p></div></div>
        <div class="focus-list">
          ${sprintHistory.length ? sprintHistory.map(s => `<div class="focus-item"><div class="focus-item-main"><div class="focus-item-title">${escapeHtml(s.name)}</div><div class="focus-item-sub">${escapeHtml(s.objective || 'Sem objetivo')}${s.ends_on ? `<br>Até ${escapeHtml(fmtDate(s.ends_on, true))}` : ''}</div></div>${s.active ? '<span class="focus-tag doing">Atual</span>' : ''}</div>`).join('') : '<div class="focus-empty">Nenhuma sprint registrada.</div>'}
        </div>
      </section>
    </div>`;
}

function renderTeam() {
  const root = document.getElementById('focusTeam');
  if (!root || !state.project) return;
  root.innerHTML = `
    <div class="focus-hero">
      <div>
        <div class="focus-kicker">Equipe</div>
        <h1>Quem está fazendo o quê.</h1>
        <p>Uma leitura rápida de carga, tarefa atual, pedidos e blockers por pessoa.</p>
      </div>
      <span class="focus-project-pill">${state.profiles.length} pessoas</span>
    </div>
    <div class="focus-team">
      ${state.profiles.map(p => {
        const active = state.tasks.filter(t => t.owner_id === p.id && t.status !== 'DONE');
        const doing = active.filter(t => t.status === 'DOING');
        const waiting = state.requests.filter(r => r.status === 'OPEN' && r.requested_from_id === p.id).length;
        const blockers = state.blockers.filter(b => b.status === 'OPEN' && b.owner_id === p.id).length;
        const initials = (p.display_name || p.email || '?').split(/\s+/).slice(0,2).map(v => v[0]).join('').toUpperCase();
        return `<article class="focus-person">
          <div class="focus-person-top">
            <div class="focus-avatar">${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : escapeHtml(initials)}</div>
            <div><strong>${escapeHtml(p.display_name || p.email || 'Membro')}</strong><small>${p.role === 'producer' ? 'Produção' : 'Equipe'} · ${active.length} pendentes</small></div>
          </div>
          <div class="focus-person-work">
            <strong style="font-size:12px;color:#555c69">Agora</strong><br>
            ${doing.length ? doing.slice(0,2).map(t => escapeHtml(t.title)).join('<br>') : 'Nenhuma tarefa em Fazendo'}
            ${(waiting || blockers) ? `<br><br>${waiting ? `${waiting} pedido${waiting > 1 ? 's' : ''} esperando` : ''}${waiting && blockers ? ' · ' : ''}${blockers ? `${blockers} blocker${blockers > 1 ? 's' : ''}` : ''}` : ''}
          </div>
        </article>`;
      }).join('') || '<div class="focus-empty">Nenhum membro encontrado.</div>'}
    </div>`;
}

function renderAll() {
  ensureRoots();
  renderHome();
  renderProduction();
  renderProject();
  renderTeam();
}

function profileOptions(selected = '') {
  return `<option value="">Sem responsável</option>` + state.profiles.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${escapeHtml(p.display_name || p.email || 'Membro')}</option>`).join('');
}

function openDialog(kind) {
  const dialog = document.getElementById('focusDialog');
  if (!dialog || !state.project) return;
  const sprint = activeSprint();
  let title = '';
  let fields = '';

  if (kind === 'sprint') {
    title = sprint ? 'Editar sprint' : 'Definir sprint';
    fields = `
      <div class="focus-field full"><label>Nome</label><input name="name" required value="${escapeHtml(sprint?.name || '')}" placeholder="Ex.: First Playable"></div>
      <div class="focus-field full"><label>Objetivo</label><textarea name="objective" required placeholder="O que precisa existir quando esta sprint terminar?">${escapeHtml(sprint?.objective || '')}</textarea></div>
      <div class="focus-field"><label>Início</label><input name="starts_on" type="date" value="${escapeHtml(sprint?.starts_on || '')}"></div>
      <div class="focus-field"><label>Fim</label><input name="ends_on" type="date" value="${escapeHtml(sprint?.ends_on || '')}"></div>`;
  }
  if (kind === 'blocker') {
    title = 'Novo blocker';
    fields = `
      <div class="focus-field full"><label>O que está bloqueando?</label><input name="title" required placeholder="Ex.: Falta animação de caminhada"></div>
      <div class="focus-field full"><label>Contexto</label><textarea name="detail" placeholder="Explique o que não consegue avançar enquanto isso não for resolvido."></textarea></div>
      <div class="focus-field full"><label>Responsável por destravar</label><select name="owner_id">${profileOptions()}</select></div>`;
  }
  if (kind === 'request') {
    title = 'Novo pedido';
    fields = `
      <div class="focus-field full"><label>Preciso de</label><input name="title" required placeholder="Ex.: Animação de caminhada"></div>
      <div class="focus-field"><label>De quem?</label><select name="requested_from_id" required>${profileOptions().replace('<option value="">Sem responsável</option>','<option value="">Selecione</option>')}</select></div>
      <div class="focus-field"><label>Até quando?</label><input name="due_date" type="date"></div>
      <div class="focus-field full"><label>Por quê?</label><textarea name="detail" placeholder="Ex.: Bloqueia a integração do player."></textarea></div>`;
  }
  if (kind === 'decision') {
    title = 'Registrar decisão';
    fields = `
      <div class="focus-field full"><label>Título</label><input name="title" required placeholder="Ex.: Resolução definida"></div>
      <div class="focus-field full"><label>O que foi decidido?</label><textarea name="decision" required placeholder="Registre a decisão de forma objetiva."></textarea></div>`;
  }
  if (kind === 'build') {
    const current = state.builds.find(b => b.is_current) || state.builds[0];
    title = 'Registrar build';
    fields = `
      <div class="focus-field"><label>Versão</label><input name="version" required placeholder="Ex.: 0.2.1"></div>
      <div class="focus-field"><label>Link</label><input name="url" type="url" placeholder="https://..."></div>
      <div class="focus-field full"><label>O que entrou?</label><textarea name="summary" placeholder="Movimentação, cenário inicial, primeira interação..."></textarea></div>
      <div class="focus-field full"><label>Problemas conhecidos</label><textarea name="known_issues" placeholder="Liste apenas o que a equipe precisa saber antes de testar."></textarea></div>`;
  }

  dialog.innerHTML = `<form method="dialog" class="focus-modal" id="focusForm" data-kind="${escapeHtml(kind)}">
    <div class="focus-modal-head"><div><div class="focus-kicker">${escapeHtml(state.project.name)}</div><h2>${escapeHtml(title)}</h2></div><button type="button" class="focus-modal-close" data-focus-action="close-dialog">×</button></div>
    <div class="focus-form-grid">${fields}</div>
    <div class="focus-modal-actions"><button type="button" class="focus-btn" data-focus-action="close-dialog">Cancelar</button><button type="submit" class="focus-btn primary">Salvar</button></div>
  </form>`;
  dialog.showModal();
}

async function saveDialog(form) {
  const kind = form.dataset.kind;
  const data = Object.fromEntries(new FormData(form).entries());
  const pid = state.project.id;

  if (kind === 'sprint') {
    const sprint = activeSprint();
    const body = { project_id:pid, name:data.name, objective:data.objective, starts_on:data.starts_on || null, ends_on:data.ends_on || null, active:true };
    if (sprint) await api('sprints', { method:'PATCH', query:{ id:`eq.${sprint.id}` }, body });
    else await api('sprints', { method:'POST', body });
  }
  if (kind === 'blocker') {
    await api('blockers', { method:'POST', body:{ project_id:pid, title:data.title, detail:data.detail || '', owner_id:data.owner_id || null, created_by:state.uid } });
  }
  if (kind === 'request') {
    await api('requests', { method:'POST', body:{ project_id:pid, title:data.title, detail:data.detail || '', requested_from_id:data.requested_from_id, due_date:data.due_date || null, requester_id:state.uid } });
  }
  if (kind === 'decision') {
    await api('decisions', { method:'POST', body:{ project_id:pid, title:data.title, decision:data.decision, created_by:state.uid } });
  }
  if (kind === 'build') {
    const currents = state.builds.filter(b => b.is_current);
    for (const build of currents) await api('builds', { method:'PATCH', query:{ id:`eq.${build.id}` }, body:{ is_current:false } });
    await api('builds', { method:'POST', body:{ project_id:pid, version:data.version, url:data.url || '', summary:data.summary || '', known_issues:data.known_issues || '', is_current:true, created_by:state.uid } });
  }

  document.getElementById('focusDialog')?.close();
  await loadState();
}

async function handleAction(button) {
  const action = button.dataset.focusAction;
  if (['sprint','blocker','request','decision','build'].includes(action)) {
    openDialog(action);
    return;
  }
  if (action === 'close-dialog') {
    document.getElementById('focusDialog')?.close();
    return;
  }
  if (action === 'new-task') {
    document.getElementById('newTaskBoard')?.click();
    return;
  }
  if (action === 'open-url') {
    const url = button.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }
  if (action === 'finish-request') {
    await api('requests', { method:'PATCH', query:{ id:`eq.${button.dataset.id}` }, body:{ status:'DONE' } });
    await loadState();
    return;
  }
  if (action === 'resolve-blocker') {
    await api('blockers', { method:'PATCH', query:{ id:`eq.${button.dataset.id}` }, body:{ status:'RESOLVED', resolved_at:new Date().toISOString() } });
    await loadState();
  }
}

document.addEventListener('click', event => {
  const button = event.target?.closest?.('[data-focus-action]');
  if (!button) return;
  event.preventDefault();
  handleAction(button).catch(error => {
    console.error('[production-focus action]', error);
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = error?.message || 'Não foi possível concluir a ação.';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3200);
    }
  });
});

document.addEventListener('submit', event => {
  if (event.target?.id !== 'focusForm') return;
  event.preventDefault();
  saveDialog(event.target).catch(error => {
    console.error('[production-focus form]', error);
    const submit = event.target.querySelector('[type="submit"]');
    if (submit) {
      submit.textContent = 'Erro ao salvar';
      setTimeout(() => { submit.textContent = 'Salvar'; }, 1800);
    }
  });
});

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  setTimeout(loadState, 80);
});

document.querySelectorAll('.nav button').forEach(button => {
  button.addEventListener('click', () => setTimeout(loadState, 60));
});

function boot() {
  if (!ensureRoots()) return false;
  const token = getAccessToken();
  if (!token) return false;
  loadState();
  return true;
}

if (!boot()) {
  const shell = document.getElementById('appShell');
  if (shell) {
    const observer = new MutationObserver(() => {
      if (!shell.classList.contains('hidden') && boot()) observer.disconnect();
    });
    observer.observe(shell, { attributes:true, attributeFilter:['class'] });
  }
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (boot() || attempts > 20) clearInterval(timer);
  }, 500);
}
