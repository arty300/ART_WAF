import { Building } from './building.js';
import { WSClient }  from './ws.js';

// ─── State ────────────────────────────────────────────────────────────────────
const EDGE_NAMES = ['С-В', 'В', 'Ю-В', 'Ю-З', 'З', 'С-З'];
let building  = null;
let wsClient  = null;
let ipMapData = [];    // [{floor, edge, ip, label}]

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const tabs         = document.querySelectorAll('.tab-btn');
const pages        = document.querySelectorAll('.page');
const canvas       = document.getElementById('building-canvas');
const sidebar      = document.getElementById('sidebar');
const sideTitle    = document.getElementById('side-title');
const ipList       = document.getElementById('ip-list');
const ipInput      = document.getElementById('ip-input');
const ipLabelInput = document.getElementById('ip-label-input');
const addIpBtn     = document.getElementById('add-ip-btn');
const closeSideBtn = document.getElementById('close-side-btn');
const logTbody     = document.getElementById('log-tbody');
const logCounter   = document.getElementById('log-counter');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const settingsForm = document.getElementById('settings-form');
const saveSettingsBtn = document.getElementById('save-settings-btn');

let sidebarState = { floor: null, edge: null };
let logCount = 0;

// ─── Tab routing ──────────────────────────────────────────────────────────────
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'settings') loadSettings();
  });
});

// ─── Building init ────────────────────────────────────────────────────────────
async function initBuilding() {
  ipMapData = await fetchIPMap();

  building = new Building(canvas, (floor, edge) => {
    openSidebar(floor, edge);
  });

  wsClient = new WSClient(building, handleEvent);
}

// ─── WebSocket event handler ──────────────────────────────────────────────────
function handleEvent(ev) {
  logCount++;
  logCounter.textContent = logCount;

  prependLogRow(ev);
}

function statusClass(s) {
  if (s >= 200 && s < 300) return 'status-ok';
  if (s >= 300 && s < 400) return 'status-redirect';
  if (s >= 400 && s < 500) return 'status-warn';
  return 'status-err';
}

function prependLogRow(ev) {
  const MAX_ROWS = 200;
  const tr = document.createElement('tr');
  const ts = new Date(ev.ts).toLocaleTimeString();
  const location = (ev.floor > 0)
    ? `Этаж ${ev.floor} / ${EDGE_NAMES[ev.edge] ?? ev.edge}`
    : '—';

  tr.innerHTML = `
    <td>${ts}</td>
    <td class="mono">${ev.ip}</td>
    <td>${location}</td>
    <td><span class="method method-${ev.method.toLowerCase()}">${ev.method}</span></td>
    <td class="mono ellipsis" title="${ev.path}">${ev.path}</td>
    <td><span class="${statusClass(ev.status)}">${ev.status}</span></td>
    <td>${ev.latency_ms}ms</td>
  `;
  logTbody.prepend(tr);

  while (logTbody.children.length > MAX_ROWS) {
    logTbody.removeChild(logTbody.lastChild);
  }
}

clearLogsBtn?.addEventListener('click', () => {
  logTbody.innerHTML = '';
  logCount = 0;
  logCounter.textContent = '0';
});

// ─── Sidebar (IP assignment) ──────────────────────────────────────────────────
function openSidebar(floor, edge) {
  sidebarState = { floor, edge };
  sideTitle.textContent = `Этаж ${floor} / Стена ${EDGE_NAMES[edge] ?? edge}`;
  renderIPList(floor, edge);
  sidebar.classList.add('open');
}

closeSideBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
});

function renderIPList(floor, edge) {
  ipList.innerHTML = '';
  const entries = ipMapData.filter(a => a.floor === floor && a.edge === edge);
  if (entries.length === 0) {
    ipList.innerHTML = '<li class="empty">Нет назначенных IP</li>';
    return;
  }
  entries.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="ip-chip">${a.ip}${a.label ? ` <em>${a.label}</em>` : ''}</span>
      <button class="del-btn" data-ip="${a.ip}" data-floor="${floor}" data-edge="${edge}">✕</button>
    `;
    li.querySelector('.del-btn').addEventListener('click', async (e) => {
      const { ip, floor: f, edge: eg } = e.currentTarget.dataset;
      await deleteIP(Number(f), Number(eg), ip);
    });
    ipList.appendChild(li);
  });
}

addIpBtn.addEventListener('click', async () => {
  const ip    = ipInput.value.trim();
  const label = ipLabelInput.value.trim();
  if (!ip) return;
  const { floor, edge } = sidebarState;
  await addIP(floor, edge, ip, label);
  ipInput.value = '';
  ipLabelInput.value = '';
});

ipInput.addEventListener('keydown', e => { if (e.key === 'Enter') addIpBtn.click(); });

async function addIP(floor, edge, ip, label) {
  const res = await fetch('/api/ip-map/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ floor, edge, ip, label }),
  });
  if (!res.ok) { alert('Ошибка добавления IP'); return; }
  ipMapData.push({ floor, edge, ip, label });
  renderIPList(floor, edge);
}

async function deleteIP(floor, edge, ip) {
  const res = await fetch('/api/ip-map/assign', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ floor, edge, ip }),
  });
  if (!res.ok) { alert('Ошибка удаления IP'); return; }
  ipMapData = ipMapData.filter(a => !(a.floor === floor && a.edge === edge && a.ip === ip));
  renderIPList(floor, edge);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchIPMap() {
  try {
    const res = await fetch('/api/ip-map');
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/logs?limit=100');
    if (!res.ok) return;
    const logs = await res.json();
    logs.reverse().forEach(e => prependLogRow({
      ip: e.ip, method: e.method, path: e.path,
      status: e.status, latency_ms: e.latency_ms, ts: e.ts,
      floor: -1, edge: -1,
    }));
    logCount = logs.length;
    logCounter.textContent = logCount;
  } catch { /* ignore */ }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    document.getElementById('cfg-target').value  = cfg.proxy_target  ?? '';
    document.getElementById('cfg-proxy').value   = cfg.proxy_listen  ?? '';
    document.getElementById('cfg-admin').value   = cfg.admin_listen  ?? '';
    document.getElementById('cfg-routes').value  = cfg.proxy_routes  ?? '';
  } catch { /* ignore */ }
}

saveSettingsBtn.addEventListener('click', async () => {
  const routesText = document.getElementById('cfg-routes').value.trim();
  if (routesText) {
    try {
      const parsed = JSON.parse(routesText);
      if (!Array.isArray(parsed)) {
        showToast('Proxy Routes должен быть JSON-массивом', true);
        return;
      }
    } catch {
      showToast('Некорректный JSON в Proxy Routes', true);
      return;
    }
  }

  const body = {
    proxy_target:  document.getElementById('cfg-target').value.trim(),
    proxy_listen:  document.getElementById('cfg-proxy').value.trim(),
    proxy_routes:  routesText,
    admin_listen:  document.getElementById('cfg-admin').value.trim(),
  };
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    showToast('Настройки сохранены. Proxy Routes/порты применяются после перезапуска.');
  } else {
    showToast('Ошибка сохранения', true);
  }
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' toast-err' : '');
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initBuilding();
loadHistory();
