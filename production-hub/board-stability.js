import { supabaseConfig } from './supabase-config.js';

// Board estável: um único caminho altera o status.
// O drop original do app é interceptado para evitar a corrida entre
// atualização local + realtime, que gerava cards duplicados temporariamente.

const projectRef = (() => {
  try { return new URL(supabaseConfig.url).hostname.split('.')[0]; }
  catch { return ''; }
})();
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';
let dragContext = null;
let taskCache = { projectId: '', at: 0, rows: [] };
const updateChains = new Map();

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

document.addEventListener('dragstart', (event) => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;
  dragContext = {
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

  // Corrige a duplicação: impede o handler antigo de também atualizar/renderizar.
  event.preventDefault();
  event.stopImmediatePropagation();

  const targetStatus = statusFromColumn(zone.closest('.column'));
  const context = dragContext;
  dragContext = null;
  if (!targetStatus || targetStatus === context.sourceStatus) return;

  try {
    const task = await context.taskPromise;
    await enqueueUpdate(task.id, targetStatus);
    // Não move, duplica, anima ou recria card aqui.
    // O realtime já existente no Hub atualiza o board uma única vez.
  } catch (error) {
    console.error('[board-stability]', error);
    toast(error?.message || 'Não foi possível mover a tarefa.');
  }
}, true);

document.addEventListener('dragend', () => {
  dragContext = null;
}, true);

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  taskCache = { projectId: '', at: 0, rows: [] };
});
