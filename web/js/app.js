import { WSClient }  from './ws.js';

const EDGE_NAMES = ['С-В', 'В', 'Ю-В', 'Ю-З', 'З', 'С-З'];
const AUTH_USER = 'admin';
const AUTH_PASSWORD = 'wafadmin';
const AUTH_KEY = 'academ_waf_auth';

let building  = null;
let wsClient  = null;
let ipMapData = [];
let logCount = 0;
let sidebarState = { floor: null, edge: null };
let servicesData = [];
let poolsData = [];
let selectedLogIP = null;
let isNight = true;

const tabs = document.querySelectorAll('.tab-btn');
const pages = document.querySelectorAll('.page');
const canvas = document.getElementById('building-canvas');
const sidebar = document.getElementById('sidebar');
const sideTitle = document.getElementById('side-title');
const ipList = document.getElementById('ip-list');
const ipInput = document.getElementById('ip-input');
const ipLabelInput = document.getElementById('ip-label-input');
const addIpBtn = document.getElementById('add-ip-btn');
const closeSideBtn = document.getElementById('close-side-btn');
const logTbody = document.getElementById('log-tbody');
const logCounter = document.getElementById('log-counter');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const toggleDayNightBtn = document.getElementById('toggle-day-night-btn');

const poolNameInput = document.getElementById('pool-name');
const poolCIDRInput = document.getElementById('pool-cidr');
const addPoolBtn = document.getElementById('add-pool-btn');
const poolList = document.getElementById('pool-list');

const svcNameInput = document.getElementById('svc-name');
const svcUpstreamInput = document.getElementById('svc-upstream');
const svcListenInput = document.getElementById('svc-listen');
const addServiceBtn = document.getElementById('add-service-btn');
const serviceList = document.getElementById('service-list');

function showApp() { loginScreen.classList.add('hidden'); appShell.classList.remove('app-hidden'); }
function showLogin() { loginScreen.classList.remove('hidden'); appShell.classList.add('app-hidden'); loginPassword.value = ''; }
function isAuthorized() { return localStorage.getItem(AUTH_KEY) === '1'; }
function setAuthorized(value) { value ? localStorage.setItem(AUTH_KEY, '1') : localStorage.removeItem(AUTH_KEY); }

async function doLogin() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (username !== AUTH_USER || password !== AUTH_PASSWORD) {
    showToast('Неверный логин или пароль', true);
    return;
  }
  setAuthorized(true);
  showApp();
  if (!wsClient) {
    await initBuilding();
    await loadHistory();
    await loadServicesState();
  }
  showToast('Добро пожаловать!');
}

function doLogout() { setAuthorized(false); location.reload(); }
loginBtn?.addEventListener('click', () => { doLogin(); });
loginForm?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
logoutBtn?.addEventListener('click', () => { doLogout(); });

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return;
    tabs.forEach(t => t.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'settings') loadSettings();
    if (btn.dataset.tab === 'services') loadServicesState();
  });
});

async function initBuilding() {
  ipMapData = await fetchIPMap();

  try {
    const { Building } = await import('./building.js');
    building = new Building(canvas, (floor, edge) => openSidebar(floor, edge));
    canvas.title = '';
  } catch (err) {
    console.error('Не удалось инициализировать 3D карту, включаю упрощённый режим:', err);
    const { Building } = await import('./building-fallback.js');
    building = new Building(canvas, (floor, edge) => openSidebar(floor, edge));
    canvas.title = 'Включён упрощённый режим карты (без 3D).';
    showToast('3D-карта недоступна, включён упрощённый режим.', true);
  }

  wsClient = new WSClient(building, handleEvent);
  building.setNightMode?.(isNight);
}

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
    <td class="mono"><button class="ip-link" data-ip="${ev.ip}">${ev.ip}</button></td>
    <td>${location}</td>
    <td><span class="method method-${ev.method.toLowerCase()}">${ev.method}</span></td>
    <td class="mono ellipsis" title="${ev.path}">${ev.path}</td>
    <td><span class="${statusClass(ev.status)}">${ev.status}</span></td>
    <td>${ev.latency_ms}ms</td>
  `;

  tr.querySelector('.ip-link').addEventListener('click', () => {
    focusIPOnMap(ev.ip);
  });

  logTbody.prepend(tr);
  while (logTbody.children.length > MAX_ROWS) logTbody.removeChild(logTbody.lastChild);
}

function focusIPOnMap(ip) {
  const assignment = ipMapData.find(a => a.ip === ip);
  if (!assignment) {
    showToast(`IP ${ip} не привязан к стене`, true);
    return;
  }

  selectedLogIP = ip;
  const mapTab = document.querySelector('[data-tab="map"]');
  mapTab?.click();
  openSidebar(assignment.floor, assignment.edge);
  building?.pulsePanel?.(assignment.floor, assignment.edge);
  showToast(`Показан ${ip}: этаж ${assignment.floor}, стена ${EDGE_NAMES[assignment.edge] ?? assignment.edge}`);
}

clearLogsBtn?.addEventListener('click', () => {
  logTbody.innerHTML = '';
  logCount = 0;
  logCounter.textContent = '0';
});

function openSidebar(floor, edge) {
  sidebarState = { floor, edge };
  sideTitle.textContent = `Этаж ${floor} / Стена ${EDGE_NAMES[edge] ?? edge}`;
  renderIPList(floor, edge);
  sidebar.classList.add('open');
}
closeSideBtn.addEventListener('click', () => { sidebar.classList.remove('open'); });

function renderIPList(floor, edge) {
  ipList.innerHTML = '';
  const entries = ipMapData.filter(a => a.floor === floor && a.edge === edge);
  if (entries.length === 0) {
    ipList.innerHTML = '<li class="empty">Нет назначенных IP/пулов</li>';
    return;
  }
  entries.forEach(a => {
    const li = document.createElement('li');
    const activeClass = selectedLogIP === a.ip ? 'ip-chip selected' : 'ip-chip';
    li.innerHTML = `
      <span class="${activeClass}">${a.ip}${a.label ? ` <em>${a.label}</em>` : ''}</span>
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
  const ip = ipInput.value.trim();
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
  if (!res.ok) { showToast('Ошибка добавления IP/пула', true); return; }
  ipMapData.push({ floor, edge, ip, label });
  renderIPList(floor, edge);
}

async function deleteIP(floor, edge, ip) {
  const res = await fetch('/api/ip-map/assign', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ floor, edge, ip }),
  });
  if (!res.ok) { showToast('Ошибка удаления IP', true); return; }
  ipMapData = ipMapData.filter(a => !(a.floor === floor && a.edge === edge && a.ip === ip));
  renderIPList(floor, edge);
}

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
  if (res.ok) showToast('Настройки сохранены.');
  else showToast('Ошибка сохранения', true);
});

async function loadServicesState() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();

    poolsData = JSON.parse(cfg.ip_pools || '[]');
    servicesData = JSON.parse(cfg.services || '[]');
    renderPools();
    renderServices();
  } catch {
    poolsData = [];
    servicesData = [];
    renderPools();
    renderServices();
  }
}

function renderPools() {
  poolList.innerHTML = '';
  if (!poolsData.length) {
    poolList.innerHTML = '<li class="empty">Пулы не добавлены</li>';
    return;
  }

  poolsData.forEach((pool, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><b>${pool.name}</b><em>${pool.cidr}</em></span>
      <button class="del-btn" data-idx="${idx}" data-type="pool">✕</button>
    `;
    li.querySelector('.del-btn').addEventListener('click', async (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      poolsData.splice(i, 1);
      await persistServicesState();
      renderPools();
    });
    poolList.appendChild(li);
  });
}

function renderServices() {
  serviceList.innerHTML = '';
  if (!servicesData.length) {
    serviceList.innerHTML = '<li class="empty">Сервисы не добавлены</li>';
    return;
  }

  servicesData.forEach((svc, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><b>${svc.name}</b><em>${svc.listen} → ${svc.upstream}</em></span>
      <button class="del-btn" data-idx="${idx}" data-type="svc">✕</button>
    `;
    li.querySelector('.del-btn').addEventListener('click', async (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      servicesData.splice(i, 1);
      await persistServicesState();
      renderServices();
    });
    serviceList.appendChild(li);
  });
}

addPoolBtn?.addEventListener('click', async () => {
  const name = poolNameInput.value.trim();
  const cidr = poolCIDRInput.value.trim();
  if (!name || !cidr) return;
  poolsData.push({ name, cidr });
  poolNameInput.value = '';
  poolCIDRInput.value = '';
  await persistServicesState();
  renderPools();
});

addServiceBtn?.addEventListener('click', async () => {
  const name = svcNameInput.value.trim();
  const upstream = svcUpstreamInput.value.trim();
  const listen = svcListenInput.value.trim();
  if (!name || !upstream || !listen) return;
  servicesData.push({ name, upstream, listen });
  svcNameInput.value = '';
  svcUpstreamInput.value = '';
  svcListenInput.value = '';
  await persistServicesState();
  renderServices();
});

async function persistServicesState() {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip_pools: JSON.stringify(poolsData), services: JSON.stringify(servicesData) }),
  });
  if (!res.ok) {
    showToast('Не удалось сохранить сервисы/пулы', true);
  }
}

toggleDayNightBtn?.addEventListener('click', () => {
  isNight = !isNight;
  building?.setNightMode?.(isNight);
  toggleDayNightBtn.textContent = isNight ? '🌙 Ночь' : '☀️ День';
});

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' toast-err' : '');
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

if (isAuthorized()) {
  showApp();
  initBuilding();
  loadHistory();
  loadServicesState();
} else {
  showLogin();
}
