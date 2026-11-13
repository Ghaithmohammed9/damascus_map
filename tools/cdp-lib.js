/* عميل بسيط لبروتوكول CDP لاختبار الواجهة في كروم */
'use strict';
const fs = require('fs');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.logs = [];
    this.errors = [];
  }

  static async attach(port = 9222) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    return cdp;
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('websocket error'));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pending.has(m.id)) {
          const { resolve: rs, reject: rj } = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? rj(new Error(m.error.message)) : rs(m.result);
        } else if (m.method) {
          this.events.push(m);
          if (m.method === 'Runtime.consoleAPICalled') {
            this.logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
          }
          if (m.method === 'Runtime.exceptionThrown') {
            this.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
          }
          if (m.method === 'Log.entryAdded') {
            if (m.params.entry.level === 'error') this.errors.push('log: ' + m.params.entry.text);
            else this.logs.push('log(' + m.params.entry.level + '): ' + m.params.entry.text);
          }
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  async wait(ms) { await delay(ms); }

  async waitFor(expr, timeout = 8000, step = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await this.eval(`return !!(${expr})`)) return true; } catch (e) { /* keep waiting */ }
      await delay(step);
    }
    return false;
  }

  close() { try { this.ws.close(); } catch (e) {} }
}

module.exports = { CDP, delay };
