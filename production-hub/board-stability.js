import { supabaseConfig } from './supabase-config.js';

// Board simples e previsivel:
// 1. drag nativo do navegador
// 2. destaque visual da coluna de destino
// 3. card real muda de coluna imediatamente no drop
// 4. Supabase persiste a mudanca em segundo plano

const projectRef = (() => {
  try { return new URL(supabaseConfig.url).hostname.split('.')[0]; }
  catch { return ''; }
})();

const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';

let dragContext = null;
let placeholder = null;
let activeZone = null;
let taskCache = { projectId: '', at: 0, rows: [] };
const updateChains = new Map();

const boardStyle = document.createElement('style');
boardStyle.textContent = `
  .task-card.board-drag-source {
    opacity: .35 !important;
    animation: none !important;
    transform: none !important;
  }

  .column.board-drop-target {
    border-color: rgba(95,99,242,.5) !important;
    background: rgba(95,99,242,.05) !important;
    box-shadow: inset 0 0 0 1px rgba(95,99,242,.1) !important;
  }

  .board-drop-placeholder {
    height: 88px;
    margin: 0 0 9px;
    border: 1.5px dashed rgba(95,99,242,.58);
    border-radius: 13px;
    background: rgba(95,99,242,.07);
    box-sizing: border-box;
    pointer-events: none;
  }

  .task-card.board-saving {
    opacity: .92;
  }
`;
document.head.appendChild(boardStyle);

function getAccessToken() {
  const keys = authStorageKey
    ? [authStorageKey, ...Object.keys(localStorage).filter(k => k !== authStorageKey && /^sb-.*-auth-token$/.test(k))]
    : Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k));

  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      if (value?.access_token) return value.access_token;
      if (value?.currentSession?.access_token) return value.currentSession.access_token;
    } catch {}
  }
  return '';
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusFromColumn(column) {
  if (!column) return '';
  const explicit = column.dataset.status || column.getAttribute('data-status');
  if (explicit) return String(explicit).toUpperCase();

  const text = (column.querySelector('.column-head')?.textContent || '').toUpperCase();
  if (text.includes('BACKLOG')) return 'BACKLOG';
  if (text.includes('FAZENDO')) return 'DOING';
  if (text.includes('REVIS')) return 'REVIEW';
  if (text.includes('FEITO')) return 'DONE';
  return '';
}

function directTaskId(card) {
  if (!card) return '';
  return [
    card.dataset.stableTaskId,
    card.dataset.taskId,
    card.dataset.id,
    card.getAttribute('data-task-id'),
    card.getAttribute('data-id'),
    card.querySelector('[data-task-id]')?.getAttribute('data-task-id'),
    card.querySelector('[data-id]')?.getAttribute('data-id'),
  ].find(Boolean) || '';
}

function currentProjectId() {
  return document.getElementById('taskProjectFilter')?.value || '';
}

async function getProjectTasks(projectId) {
  if (!projectId) return [];
  if (taskCache.projectId === projectId && Date.now() - taskCache.at < 2500) return taskCache.rows;

  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada. Recarregue a página.');

  const url = new URL(`${supabaseConfig.url}/rest/v1/tasks`);
  url.searchParams.set('select', 'id,project_id,title,status,module,updated_at');
  url.searchParams.set('project_id', `eq.${projectId}`);

  const response = await fetch(url, {
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error(`Falha ao carregar tarefas (${response.status})`);

  const rows = await response.json();
  taskCache = { projectId, at: Date.now(), rows };
  return rows;
}

async function resolveTask(card, sourceStatus) {
  const direct = directTaskId(card);
  if (direct) return { id: direct };

  const projectId = currentProjectId();
  const title = normalize(card?.querySelector('.task-title')?.textContent);
  const moduleText = normalize(card?.querySelector('.module')?.textContent);

  if (!projectId || !title) throw new Error('Não foi possível identificar a tarefa arrastada.');

  const rows = await getProjectTasks(projectId);
  let candidates = rows.filter(row => normalize(row.title) === title);

  if (sourceStatus) {
    const sameStatus = candidates.filter(row => row.status === sourceStatus);
    if (sameStatus.length) candidates = sameStatus;
  }

  if (moduleText) {
    const sameModule = candidates.filter(row => normalize(row.module) === moduleText);
    if (sameModule.length) candidates = sameModule;
  }

  if (!candidates.length) throw new Error('A tarefa não foi encontrada no projeto.');

  candidates.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return candidates[0];
}

async function patchStatus(taskId, status) {
  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada. Recarregue a página.');

  const url = new URL(`${supabaseConfig.url}/rest/v1/tasks`);
  url.searchParams.set('id', `eq.${taskId}`);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Não foi possível mover a tarefa (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  taskCache.at = 0;
}

function enqueueUpdate(taskId, status) {
  const previous = updateChains.get(taskId) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => patchStatus(taskId, status))
    .finally(() => {
      if (updateChains.get(taskId) === next) updateChains.delete(taskId);
    });

  updateChains.set(taskId, next);
  return next;
}

function updateCount(column) {
  if (!column) return;
  const bubble = column.querySelector('.column-count');
  if (!bubble) return;
  const next = String(column.querySelectorAll('.dropzone > .task-card').length);
  if (bubble.textContent !== next) bubble.textContent = next;
}

function updateAffectedCounts(...zones) {
  const columns = new Set(zones.filter(Boolean).map(zone => zone.closest('.column')).filter(Boolean));
  columns.forEach(updateCount);
}

function clearPlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

function clearTarget() {
  if (activeZone) {
    activeZone.closest('.column')?.classList.remove('board-drop-target');
  }
  activeZone = null;
}

function clearDragVisuals() {
  document.querySelectorAll('.task-card.board-drag-source, .task-card.dragging').forEach(card => {
    card.classList.remove('board-drag-source', 'dragging');
  });
  clearPlaceholder();
  clearTarget();
}

function showDropFeedback(zone) {
  if (!dragContext || !zone) return;

  if (activeZone !== zone) {
    clearTarget();
    activeZone = zone;
    zone.closest('.column')?.classList.add('board-drop-target');
  }

  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'board-drop-placeholder';
    const height = dragContext.card?.getBoundingClientRect().height || 88;
    placeholder.style.height = `${Math.max(72, Math.round(height))}px`;
  }

  if (placeholder.parentElement !== zone) zone.appendChild(placeholder);
}

function rollback(context) {
  const { card, sourceZone, sourceNextSibling } = context;
  if (!card || !sourceZone?.isConnected) return;

  card.classList.remove('board-saving', 'board-drag-source', 'dragging');

  if (sourceNextSibling?.isConnected && sourceNextSibling.parentElement === sourceZone) {
    sourceZone.insertBefore(card, sourceNextSibling);
  } else {
    sourceZone.appendChild(card);
  }

  updateAffectedCounts(sourceZone, card.closest('.dropzone'));
}

document.addEventListener('dragstart', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;

  // Bloqueia a logica antiga do app para existir apenas um sistema de drag.
  event.stopImmediatePropagation();
  clearDragVisuals();

  const sourceZone = card.closest('.dropzone');
  const sourceStatus = statusFromColumn(card.closest('.column'));

  dragContext = {
    card,
    sourceZone,
    sourceStatus,
    sourceNextSibling: card.nextSibling,
    taskPromise: resolveTask(card, sourceStatus),
  };

  card.classList.add('board-drag-source');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', 'task'); } catch {}
    // Sem setDragImage: usamos o ghost nativo do navegador, mais leve e confiavel.
  }
}, true);

document.addEventListener('dragover', event => {
  if (!dragContext) return;

  const zone = event.target?.closest?.('.dropzone');
  if (!zone) {
    clearPlaceholder();
    clearTarget();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  showDropFeedback(zone);
}, true);

document.addEventListener('drop', async event => {
  if (!dragContext) return;

  const zone = event.target?.closest?.('.dropzone');
  const context = dragContext;
  dragContext = null;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!zone) {
    clearDragVisuals();
    return;
  }

  const targetStatus = statusFromColumn(zone.closest('.column'));

  if (!targetStatus || targetStatus === context.sourceStatus) {
    clearDragVisuals();
    return;
  }

  const sourceZone = context.sourceZone;

  // Resposta visual imediata: o MESMO card real vai para o novo status.
  context.card.classList.remove('board-drag-source', 'dragging');
  context.card.classList.add('board-saving');

  if (placeholder?.parentElement === zone) zone.insertBefore(context.card, placeholder);
  else zone.appendChild(context.card);

  clearDragVisuals();
  updateAffectedCounts(sourceZone, zone);

  try {
    const task = await context.taskPromise;
    context.card.dataset.stableTaskId = task.id;
    await enqueueUpdate(task.id, targetStatus);
    context.card.classList.remove('board-saving');
  } catch (error) {
    console.error('[board]', error);
    rollback(context);
    toast(error?.message || 'Não foi possível mover a tarefa.');
  }
}, true);

document.addEventListener('dragend', () => {
  dragContext = null;
  clearDragVisuals();
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    dragContext = null;
    clearDragVisuals();
  }
}, true);

window.addEventListener('blur', () => {
  dragContext = null;
  clearDragVisuals();
});

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  taskCache = { projectId: '', at: 0, rows: [] };
  dragContext = null;
  clearDragVisuals();
});
