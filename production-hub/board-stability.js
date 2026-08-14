import { supabaseConfig } from './supabase-config.js';

// Board estável: o Supabase continua sendo a única fonte de verdade.
// A resposta imediata do drop é apenas uma prévia visual temporária.

const projectRef = (() => {
  try { return new URL(supabaseConfig.url).hostname.split('.')[0]; }
  catch { return ''; }
})();
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';
let dragContext = null;
let taskCache = { projectId: '', at: 0, rows: [] };
const updateChains = new Map();
const pendingVisuals = new Set();

const optimisticStyle = document.createElement('style');
optimisticStyle.textContent = `
  .task-card.optimistic-source-hidden {
    display: none !important;
  }
  .task-card.optimistic-preview {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
    transition: none !important;
    pointer-events: none !important;
    cursor: default !important;
    box-shadow: 0 6px 16px rgba(30,40,60,.06) !important;
  }
`;
document.head.appendChild(optimisticStyle);

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

function findZoneByStatus(status) {
  return [...document.querySelectorAll('.column')]
    .find(column => statusFromColumn(column) === status)
    ?.querySelector('.dropzone') || null;
}

function directTaskId(card) {
  if (!card) return '';
  return [
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
  url.searchParams.set('select', 'id,project_id,title,status,module,deadline,owner_id,updated_at');
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

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function cardFingerprint(card) {
  return {
    title: normalize(card?.querySelector('.task-title')?.textContent),
    module: normalize(card?.querySelector('.module')?.textContent),
  };
}

function cardMatches(card, fingerprint) {
  if (!card || !fingerprint?.title) return false;
  const current = cardFingerprint(card);
  if (current.title !== fingerprint.title) return false;
  if (fingerprint.module && current.module && current.module !== fingerprint.module) return false;
  return true;
}

async function resolveTask(card) {
  const direct = directTaskId(card);
  if (direct) return { id: direct };
  const projectId = currentProjectId();
  const sourceStatus = statusFromColumn(card?.closest('.column'));
  const title = normalize(card?.querySelector('.task-title')?.textContent);
  const moduleText = normalize(card?.querySelector('.module')?.textContent);
  if (!projectId || !title) throw new Error('Não foi possível identificar a tarefa arrastada.');
  const rows = await getProjectTasks(projectId);
  let candidates = rows.filter(row => normalize(row.title) === title);
  if (sourceStatus) {
    const byStatus = candidates.filter(row => row.status === sourceStatus);
    if (byStatus.length) candidates = byStatus;
  }
  if (moduleText) {
    const byModule = candidates.filter(row => normalize(row.module) === moduleText);
    if (byModule.length) candidates = byModule;
  }
  if (!candidates.length) throw new Error('A tarefa não foi encontrada no projeto.');
  if (candidates.length > 1) {
    candidates.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }
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

function refreshVisualCounts() {
  document.querySelectorAll('.column').forEach(column => {
    const count = [...column.querySelectorAll('.dropzone .task-card')]
      .filter(card => !card.classList.contains('optimistic-source-hidden')).length;
    const bubble = column.querySelector('.column-count');
    if (bubble) bubble.textContent = String(count);
  });
}

function createOptimisticVisual(card, targetZone, targetStatus) {
  if (!card || !targetZone) return null;

  const fingerprint = cardFingerprint(card);
  const preview = card.cloneNode(true);
  preview.classList.remove('dragging', 'motion-dragging', 'motion-enter', 'optimistic-moving');
  preview.classList.add('optimistic-preview');
  preview.removeAttribute('draggable');
  preview.draggable = false;
  preview.setAttribute('aria-hidden', 'true');

  card.classList.remove('dragging', 'motion-dragging');
  card.classList.add('optimistic-source-hidden');
  targetZone.appendChild(preview);
  refreshVisualCounts();

  const visual = {
    source: card,
    preview,
    fingerprint,
    targetStatus,
    resolvedTaskId: '',
    finished: false,
  };
  pendingVisuals.add(visual);
  return visual;
}

function rollbackVisual(visual) {
  if (!visual || visual.finished) return;
  visual.finished = true;
  visual.preview?.remove();
  visual.source?.classList.remove('optimistic-source-hidden');
  pendingVisuals.delete(visual);
  refreshVisualCounts();
}

function finishVisual(visual) {
  if (!visual || visual.finished) return;
  visual.finished = true;
  visual.preview?.remove();
  visual.source?.remove();
  pendingVisuals.delete(visual);
  refreshVisualCounts();
}

function reconcileVisuals() {
  for (const visual of [...pendingVisuals]) {
    if (!visual.preview?.isConnected && !visual.source?.isConnected) {
      visual.finished = true;
      pendingVisuals.delete(visual);
      continue;
    }

    const targetZone = findZoneByStatus(visual.targetStatus);
    if (!targetZone) continue;
    const realTarget = [...targetZone.querySelectorAll('.task-card:not(.optimistic-preview)')]
      .find(card => cardMatches(card, visual.fingerprint));
    if (realTarget) finishVisual(visual);
  }
}

const boardObserver = new MutationObserver(() => reconcileVisuals());
const taskBoard = document.getElementById('taskBoard');
if (taskBoard) boardObserver.observe(taskBoard, { childList: true, subtree: true });

document.addEventListener('dragstart', (event) => {
  const card = event.target?.closest?.('.task-card');
  if (!card || card.classList.contains('optimistic-preview')) return;
  dragContext = {
    card,
    sourceStatus: statusFromColumn(card.closest('.column')),
    taskPromise: resolveTask(card),
  };
}, true);

document.addEventListener('dragover', (event) => {
  if (!dragContext) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('drop', async (event) => {
  if (!dragContext) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) return;

  // Impede o handler antigo de também mover/renderizar a tarefa.
  event.preventDefault();
  event.stopImmediatePropagation();

  const targetStatus = statusFromColumn(zone.closest('.column'));
  const context = dragContext;
  dragContext = null;
  if (!targetStatus || targetStatus === context.sourceStatus) return;

  // Feedback imediato: nenhuma espera de rede para o usuário ver a mudança.
  const visual = createOptimisticVisual(context.card, zone, targetStatus);

  try {
    const task = await context.taskPromise;
    if (visual) {
      visual.resolvedTaskId = task.id;
      visual.preview.dataset.optimisticTaskId = task.id;
    }
    await enqueueUpdate(task.id, targetStatus);

    // Normalmente o realtime substitui a prévia quase imediatamente.
    // Se o DOM já tiver sido atualizado antes deste await terminar, reconciliamos agora.
    reconcileVisuals();
  } catch (error) {
    console.error('[board-stability]', error);
    rollbackVisual(visual);
    toast(error?.message || 'Não foi possível mover a tarefa.');
  }
}, true);

document.addEventListener('dragend', () => {
  dragContext = null;
}, true);

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  taskCache = { projectId: '', at: 0, rows: [] };
  for (const visual of [...pendingVisuals]) rollbackVisual(visual);
});
