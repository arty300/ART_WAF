/**
 * WebSocket client.
 * Receives log events and:
 *   1. Flashes the corresponding building panel
 *   2. Prepends a row to the log table
 *   3. Updates the activity counter badge
 */

export class WSClient {
  constructor(building, onEvent) {
    this.building  = building;
    this.onEvent   = onEvent;  // called with parsed event for log table
    this._connect();
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url   = `${proto}://${location.host}/ws/logs`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }

      // Flash building panel if mapped
      if (ev.floor > 0 && ev.edge >= 0) {
        this.building?.flash?.(ev.floor, ev.edge, ev.status);
      }

      this.onEvent(ev);
    };

    this.ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(() => this._connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws.close();
    };
  }

  close() {
    this.ws.close();
  }
}
