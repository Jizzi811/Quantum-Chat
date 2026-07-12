/* ═══════════════════════════════════════════════════════════════
   QUANTUM — UI-Verdrahtung
   Rendert Chat, Skills-Panel und Automations-Panel; verbindet
   alles über den Quantum.bus.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const els = {
    messages: $('#chat-messages'),
    typing: $('#chat-typing'),
    form: $('#chat-form'),
    input: $('#chat-input-field'),
    clear: $('#btn-clear'),
    menuBtn: $('#btn-skillmenu'),
    menu: $('#skill-menu'),
    skillList: $('#skill-list'),
    skillsCount: $('#skills-count'),
    autoForm: $('#auto-form'),
    autoAction: $('#auto-action'),
    autoList: $('#auto-list'),
    autosCount: $('#autos-count'),
    autoLog: $('#auto-log'),
    clock: $('#q-clock'),
  };

  /* ── Chat ──────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Erlaubt **fett** und `code` in Bot-Nachrichten */
  function renderRich(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function addMessage(role, text, label) {
    const div = document.createElement('div');
    div.className = 'msg msg--' + role;
    div.setAttribute('data-testid', 'msg-' + role);
    const meta = label || (role === 'user' ? 'DU' : role === 'bot' ? 'QUANTUM ⚛' : 'SYSTEM');
    div.innerHTML = '<span class="msg__meta">' + escapeHtml(meta) + ' · ' +
      new Date().toLocaleTimeString('de-DE') + '</span>' + renderRich(text);
    els.messages.appendChild(div);
    els.messages.scrollTop = els.messages.scrollHeight;
    if (role === 'bot') window.Quantum.bus.emit('botmessage', text);
  }

  /* Nimmt String ODER Promise<String> entgegen (async-Skills wie SoulTrace) */
  function botReply(result, label) {
    els.typing.hidden = false;
    Promise.resolve(result).then((text) => {
      const delay = Math.min(400 + String(text).length * 6, 1600);
      setTimeout(() => {
        els.typing.hidden = true;
        addMessage('bot', String(text), label);
      }, delay);
    });
  }

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = '';
    addMessage('user', text);
    window.Quantum.automations.handleMessage(text);
    const answer = window.Quantum.engine.respond(text);
    if (answer === '__CLEAR__') {
      els.messages.innerHTML = '';
      addMessage('system', 'Chat geleert. Neural-Link bereit.');
      return;
    }
    botReply(answer);
  });

  els.clear.addEventListener('click', () => {
    els.messages.innerHTML = '';
    addMessage('system', 'Chat geleert. Neural-Link bereit.');
  });

  /* ── Skill-Menü (Dropdown im Chatfenster) ──────────────────── */

  function runSkillFromUi(skill) {
    addMessage('system', 'Skill „' + skill.name + '“ gestartet — ' + skill.usage);
    botReply(window.Quantum.skills.run(skill.id, ''));
  }

  function renderSkillMenu() {
    const skills = window.Quantum.skills;
    els.menu.innerHTML = '';
    skills.all.forEach((skill) => {
      const enabled = skills.isEnabled(skill.id);
      const btn = document.createElement('button');
      btn.className = 'skill-menu__item' + (enabled ? '' : ' skill-menu__item--off');
      btn.setAttribute('data-testid', 'skill-menu-' + skill.id);
      btn.innerHTML = '<span>' + skill.icon + '</span><span>' + skill.name +
        '<small>' + skill.desc + '</small></span>';
      btn.addEventListener('click', () => {
        els.menu.hidden = true;
        if (!enabled) { addMessage('system', 'Skill „' + skill.name + '“ ist deaktiviert — im Skills-Panel aktivieren.'); return; }
        runSkillFromUi(skill);
      });
      els.menu.appendChild(btn);
    });
  }

  els.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.menu.hidden) renderSkillMenu();
    els.menu.hidden = !els.menu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target)) els.menu.hidden = true;
  });

  /* ── Skills-Panel ──────────────────────────────────────────── */

  function renderSkills() {
    const skills = window.Quantum.skills;
    els.skillList.innerHTML = '';
    let onCount = 0;
    skills.all.forEach((skill) => {
      const enabled = skills.isEnabled(skill.id);
      if (enabled) onCount++;
      const li = document.createElement('li');
      li.className = 'skill-card' + (enabled ? '' : ' skill-card--off');
      li.setAttribute('data-testid', 'skill-' + skill.id);
      li.innerHTML =
        '<span class="skill-card__icon">' + skill.icon + '</span>' +
        '<div class="skill-card__body">' +
        '<div class="skill-card__name">' + skill.name + '</div>' +
        '<div class="skill-card__desc">' + skill.desc + '</div>' +
        '</div>' +
        '<button class="skill-card__toggle" data-testid="skill-toggle-' + skill.id + '" title="Skill an/aus" aria-label="Skill ' + skill.name + ' umschalten"></button>';
      li.querySelector('.skill-card__toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        skills.toggle(skill.id);
        renderSkills();
      });
      li.addEventListener('click', () => {
        if (!skills.isEnabled(skill.id)) return;
        runSkillFromUi(skill);
      });
      els.skillList.appendChild(li);
    });
    els.skillsCount.textContent = onCount + '/' + skills.all.length;
  }

  /* ── Automations-Panel ─────────────────────────────────────── */

  function fillActionSelect() {
    const opts = ['<option value="message">💬 Nachricht senden</option>'];
    window.Quantum.skills.all.forEach((s) => {
      opts.push('<option value="' + s.id + '">' + s.icon + ' Skill: ' + s.name + '</option>');
    });
    els.autoAction.innerHTML = opts.join('');
  }

  function renderAutos() {
    const autos = window.Quantum.automations.all();
    els.autoList.innerHTML = '';
    autos.forEach((auto) => {
      const li = document.createElement('li');
      li.className = 'auto-card' + (auto.paused ? ' auto-card--paused' : '');
      li.setAttribute('data-testid', 'automation-' + auto.id);
      li.innerHTML =
        '<div class="auto-card__top">' +
        '<span class="auto-card__name">' + escapeHtml(auto.name) + '</span>' +
        '<span class="auto-card__actions">' +
        '<button class="auto-card__btn" data-act="toggle" data-testid="automation-toggle-' + auto.id + '">' + (auto.paused ? '▶' : '⏸') + '</button>' +
        '<button class="auto-card__btn" data-act="remove" data-testid="automation-delete-' + auto.id + '">✕</button>' +
        '</span></div>' +
        '<div class="auto-card__meta">' + escapeHtml(window.Quantum.automations.describe(auto)) + '</div>';
      li.querySelector('[data-act="toggle"]').addEventListener('click', () => window.Quantum.automations.toggle(auto.id));
      li.querySelector('[data-act="remove"]').addEventListener('click', () => window.Quantum.automations.remove(auto.id));
      els.autoList.appendChild(li);
    });
    els.autosCount.textContent = String(autos.length);
  }

  function renderLog(entries) {
    els.autoLog.innerHTML = entries.map((e) => '<li>' + escapeHtml(e) + '</li>').join('');
  }

  els.autoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = window.Quantum.automations.create({
      name: $('#auto-name').value,
      trigger: $('#auto-trigger').value,
      param: $('#auto-param').value,
      action: els.autoAction.value,
      payload: $('#auto-payload').value,
    });
    if (result.error) {
      addMessage('system', '⚠️ ' + result.error);
      return;
    }
    els.autoForm.reset();
    addMessage('system', 'Automation „' + result.auto.name + '“ aktiv: ' + window.Quantum.automations.describe(result.auto));
  });

  /* ── Bus-Verdrahtung ───────────────────────────────────────── */

  /* Minimales UI-Interface für Skill-Module (z. B. Code-Reviewer) */
  window.Quantum.ui = {
    system: (text) => addMessage('system', text),
    reply: botReply,
  };

  window.Quantum.bus.on('autochange', renderAutos);
  window.Quantum.bus.on('autolog', renderLog);
  window.Quantum.bus.on('automessage', ({ auto, output }) => {
    botReply(output, '⟳ AUTOMATION · ' + auto.name.toUpperCase());
  });

  /* ── Mobile: Panels als Akkordeon ──────────────────────────── */

  const mobileQuery = window.matchMedia('(max-width: 1100px)');

  function setupPanelAccordion() {
    document.querySelectorAll('.q-panel').forEach((panel) => {
      const head = panel.querySelector('.q-panel__head');
      if (!head || head.dataset.accordion) return;
      head.dataset.accordion = '1';
      head.addEventListener('click', () => {
        if (mobileQuery.matches) panel.classList.toggle('q-panel--collapsed');
      });
    });
    /* Auf dem Handy starten beide Panels eingeklappt — der Chat steht im Fokus */
    if (mobileQuery.matches) {
      document.querySelectorAll('.q-panel').forEach((p) => p.classList.add('q-panel--collapsed'));
    }
  }

  mobileQuery.addEventListener('change', (e) => {
    if (!e.matches) document.querySelectorAll('.q-panel').forEach((p) => p.classList.remove('q-panel--collapsed'));
  });

  /* ── Uhr & Start ───────────────────────────────────────────── */

  setInterval(() => {
    els.clock.textContent = new Date().toLocaleTimeString('de-DE');
  }, 1000);

  setupPanelAccordion();
  fillActionSelect();
  renderSkills();
  window.Quantum.automations.start();
  renderLog(window.Quantum.automations.getLog());

  addMessage('bot', window.Quantum.engine.greeting());
  addMessage('system', 'Tipp: `/help` zeigt alle Befehle · Skills links · Automationen rechts');
})();
