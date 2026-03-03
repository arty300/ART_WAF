const FLOORS = 6;
const EDGES = 6;
const EDGE_NAMES = ['С-В', 'В', 'Ю-В', 'Ю-З', 'З', 'С-З'];

const COLOR_BG = '#0d0f1a';
const COLOR_PANEL = '#2a2d3e';
const COLOR_HOVER = '#3d4060';
const COLOR_OK = '#22c55e';
const COLOR_REDIRECT = '#eab308';
const COLOR_ERROR = '#ef4444';
const COLOR_TEXT = '#dbe3f4';

export class Building {
  constructor(canvas, onPanelClick) {
    this.canvas = canvas;
    this.onPanelClick = onPanelClick;
    this.hoveredKey = null;
    this.panels = new Map();
    this.flashes = new Map();

    this._bindEvents();
    this._resize();
    this._loop();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const panel = this._panelFromPoint(e.clientX, e.clientY);
      this.hoveredKey = panel ? panel.key : null;
      this.canvas.style.cursor = panel ? 'pointer' : 'default';
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredKey = null;
      this.canvas.style.cursor = 'default';
    });

    this.canvas.addEventListener('click', (e) => {
      const panel = this._panelFromPoint(e.clientX, e.clientY);
      if (!panel) return;
      this.onPanelClick(panel.floor, panel.edge);
    });

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._rebuildPanels(rect.width, rect.height);
  }

  _rebuildPanels(width, height) {
    this.panels.clear();

    const padX = 36;
    const padY = 28;
    const gapY = 8;
    const usableW = Math.max(160, width - padX * 2);
    const usableH = Math.max(220, height - padY * 2 - (FLOORS - 1) * gapY);

    const floorH = usableH / FLOORS;
    const edgeW = usableW / EDGES;

    for (let floor = 1; floor <= FLOORS; floor++) {
      const y = padY + (FLOORS - floor) * (floorH + gapY);
      for (let edge = 0; edge < EDGES; edge++) {
        const x = padX + edge * edgeW;
        const key = `${floor}_${edge}`;
        this.panels.set(key, {
          key,
          floor,
          edge,
          x: x + 2,
          y,
          w: Math.max(24, edgeW - 4),
          h: Math.max(20, floorH - 2),
        });
      }
    }
  }

  _panelFromPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const panel of this.panels.values()) {
      if (x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h) {
        return panel;
      }
    }
    return null;
  }

  _loop() {
    const render = () => {
      this._draw();
      requestAnimationFrame(render);
    };
    render();
  }

  _draw() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = COLOR_BG;
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.fillStyle = '#8da2c9';
    this.ctx.font = '12px Inter, sans-serif';
    this.ctx.fillText('Упрощённый режим карты (без 3D)', 16, 18);

    const now = performance.now();

    for (const panel of this.panels.values()) {
      const key = panel.key;
      let color = COLOR_PANEL;

      const flash = this.flashes.get(key);
      if (flash) {
        const t = (now - flash.start) / flash.duration;
        if (t >= 1) {
          this.flashes.delete(key);
        } else {
          color = flash.color;
        }
      }

      if (this.hoveredKey === key) color = COLOR_HOVER;

      this.ctx.fillStyle = color;
      this.ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      this.ctx.strokeStyle = '#1f2335';
      this.ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

      if (panel.edge === 0) {
        this.ctx.fillStyle = COLOR_TEXT;
        this.ctx.font = '11px Inter, sans-serif';
        this.ctx.fillText(`Этаж ${panel.floor}`, panel.x + 6, panel.y + 14);
      }

      if (panel.floor === 1) {
        this.ctx.fillStyle = '#a8b5d6';
        this.ctx.font = '10px Inter, sans-serif';
        const name = EDGE_NAMES[panel.edge] ?? `${panel.edge}`;
        this.ctx.fillText(name, panel.x + 6, panel.y + panel.h - 6);
      }
    }
  }

  flash(floor, edge, status) {
    const key = `${floor}_${edge}`;
    if (!this.panels.has(key)) return;

    let color = COLOR_ERROR;
    if (status >= 200 && status < 300) color = COLOR_OK;
    else if (status >= 300 && status < 400) color = COLOR_REDIRECT;

    this.flashes.set(key, { color, start: performance.now(), duration: 1500 });
  }

  getPanel(floor, edge) {
    return this.panels.get(`${floor}_${edge}`) ?? null;
  }
}
