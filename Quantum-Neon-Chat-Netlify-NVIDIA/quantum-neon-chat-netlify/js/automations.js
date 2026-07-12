/* ═══════════════════════════════════════════════════════════════
   QUANTUM — Automations-Engine
   Trigger: Intervall, tägliche Uhrzeit, Stichwort, Start.
   Aktionen: Nachricht posten oder Skill ausführen.
   Persistenz: localStorage. Scheduler: 5-Sekunden-Tick.
   ═══════════════════════════════════════════════════════════════ */

window.Quantum = window.Quantum || {};

(function () {
  'use strict';

  const STORE_KEY = 'quantum.automations';
  let autos = [];
  let logEntries = [];

  function load() {
    try { autos = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { autos = []; }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(autos));
  }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function log(text) {
    const stamp = new Date().toLocaleTimeString('de-DE');
    logEntries.unshift('[' + stamp + '] ' + text);
    if (logEntries.length > 40) logEntries.pop();
    window.Quantum.bus.emit('autolog', logEntries);
  }

  /* Nächste Ausführungszeit für einen Trigger berechnen */
  function nextRun(auto, from) {
    const base = from || Date.now();
    if (auto.trigger === 'interval') {
      const mins = Math.max(parseFloat(auto.param) || 5, 0.1);
      return base + mins * 60000;
    }
    if (auto.trigger === 'daily') {
      const m = String(auto.param).match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const d = new Date();
      d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
      if (d.getTime() <= base) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    return null; /* keyword & startup laufen eventbasiert */
  }

  function runAction(auto, context) {
    let output;
    if (auto.action === 'message') {
      output = auto.payload || 'Ping von deiner Automation „' + auto.name + '“! ⟳';
    } else {
      const input = (auto.payload || '') + (context ? (auto.payload ? ' ' : '') + context : '');
      output = window.Quantum.skills.run(auto.action, input.trim());
    }
    window.Quantum.bus.emit('automessage', { auto, output });
    log('„' + auto.name + '“ ausgeführt');
  }

  function tick() {
    const now = Date.now();
    let dirty = false;
    autos.forEach(auto => {
      if (auto.paused || !auto.next) return;
      if (now >= auto.next) {
        runAction(auto);
        auto.next = nextRun(auto, now);
        dirty = true;
      }
    });
    if (dirty) save();
    window.Quantum.bus.emit('autotick', autos);
  }

  const TRIGGER_LABELS = {
    interval: (a) => 'alle ' + (parseFloat(a.param) || 5) + ' Min',
    daily: (a) => 'täglich ' + a.param + ' Uhr',
    keyword: (a) => 'bei Stichwort „' + a.param + '“',
    startup: () => 'bei jedem Start',
  };

  window.Quantum.automations = {
    all() { return autos; },

    describe(auto) {
      const trig = (TRIGGER_LABELS[auto.trigger] || (() => auto.trigger))(auto);
      const act = auto.action === 'message'
        ? 'Nachricht senden'
        : 'Skill „' + ((window.Quantum.skills.get(auto.action) || {}).name || auto.action) + '“';
      return trig + ' → ' + act;
    },

    create(data) {
      if (data.trigger === 'daily' && !/^\d{1,2}:\d{2}$/.test(data.param)) {
        return { error: 'Uhrzeit bitte als HH:MM, z. B. 09:00' };
      }
      if (data.trigger === 'interval' && !(parseFloat(data.param) > 0)) {
        return { error: 'Intervall bitte als Zahl in Minuten, z. B. 5' };
      }
      if (data.trigger === 'keyword' && !data.param.trim()) {
        return { error: 'Bitte ein Stichwort angeben' };
      }
      const auto = {
        id: uid(),
        name: data.name.trim() || 'Automation',
        trigger: data.trigger,
        param: data.param.trim(),
        action: data.action,
        payload: data.payload.trim(),
        paused: false,
        created: Date.now(),
      };
      auto.next = nextRun(auto);
      autos.push(auto);
      save();
      log('„' + auto.name + '“ erstellt (' + this.describe(auto) + ')');
      window.Quantum.bus.emit('autochange', autos);
      return { auto };
    },

    toggle(id) {
      const auto = autos.find(a => a.id === id);
      if (!auto) return;
      auto.paused = !auto.paused;
      if (!auto.paused) auto.next = nextRun(auto);
      save();
      log('„' + auto.name + '“ ' + (auto.paused ? 'pausiert' : 'wieder aktiv'));
      window.Quantum.bus.emit('autochange', autos);
    },

    remove(id) {
      const auto = autos.find(a => a.id === id);
      autos = autos.filter(a => a.id !== id);
      save();
      if (auto) log('„' + auto.name + '“ gelöscht');
      window.Quantum.bus.emit('autochange', autos);
    },

    /* Von app.js aufgerufen, wenn der User eine Nachricht schreibt */
    handleMessage(text) {
      autos.forEach(auto => {
        if (auto.paused || auto.trigger !== 'keyword') return;
        if (text.toLowerCase().includes(auto.param.toLowerCase())) {
          runAction(auto, text);
        }
      });
    },

    getLog() { return logEntries; },

    start() {
      load();
      /* Verpasste Zeitpläne neu berechnen statt sofort nachzufeuern */
      autos.forEach(auto => {
        if (!auto.paused && auto.trigger !== 'keyword' && auto.trigger !== 'startup') {
          if (!auto.next || auto.next < Date.now()) auto.next = nextRun(auto);
        }
      });
      save();
      setInterval(tick, 5000);
      log('Automations-Engine gestartet (' + autos.length + ' Automationen geladen)');
      autos.forEach(auto => {
        if (!auto.paused && auto.trigger === 'startup') runAction(auto);
      });
      window.Quantum.bus.emit('autochange', autos);
    },
  };
})();
