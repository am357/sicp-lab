/* app.js — renders the reader, wires live REPLs (BiwaScheme) and the stepper. */
(function () {
  'use strict';

  // ---------- Split a source string into top-level s-expressions ------------
  function splitTopForms(src) {
    src = src.replace(/;[^\n]*/g, '');
    const forms = [];
    let depth = 0, start = -1;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (depth === 0 && start === -1 && !/\s/.test(c)) start = i;
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { forms.push(src.slice(start, i + 1)); start = -1; }
      } else if (depth === 0 && /\s/.test(c) && start !== -1) {
        forms.push(src.slice(start, i)); start = -1;
      }
    }
    if (start !== -1) forms.push(src.slice(start));
    return forms.map((s) => s.trim()).filter(Boolean);
  }

  // ---------- BiwaScheme shared interpreter ---------------------------------
  let biwa = null;
  function getBiwa() {
    if (!biwa) biwa = new BiwaScheme.Interpreter(function (e) { /* errors handled per-run */ });
    return biwa;
  }
  function resetBiwa() { biwa = new BiwaScheme.Interpreter(function () {}); }

  function runRepl(source, outEl) {
    outEl.innerHTML = '';
    outEl.classList.add('show');
    const forms = splitTopForms(source);
    const interp = getBiwa();
    let i = 0;
    function emit(cls, text) {
      const span = document.createElement('div');
      span.className = cls;
      span.textContent = text;
      outEl.appendChild(span);
    }
    function next() {
      if (i >= forms.length) return;
      const form = forms[i++];
      // route (display ...) output to this block
      let buffered = '';
      BiwaScheme.Port.current_output = new BiwaScheme.Port.CustomOutput(function (s) { buffered += s; });
      try {
        interp.evaluate(form, function (result) {
          if (buffered) emit('disp', buffered);
          let shown;
          if (result === undefined || result === BiwaScheme.undef) shown = '';
          else shown = BiwaScheme.to_write(result);
          if (shown !== '') emit('val', shown);
          else if (!buffered) emit('echo', 'ok');
          next();
        });
      } catch (err) {
        emit('err', String(err && err.message ? err.message : err));
        next();
      }
    }
    next();
  }

  // ---------- Stepper widget -------------------------------------------------
  function buildStepper(seed) {
    const wrap = el('div', 'stepper');
    wrap.appendChild(el('div', 'head', 'Substitution-model stepper · applicative order'));

    const seedBox = document.createElement('textarea');
    seedBox.className = 'seed';
    seedBox.spellcheck = false;
    seedBox.value = seed;
    wrap.appendChild(seedBox);

    const bar = el('div', 'bar');
    const bStep = btn('Step', 'primary');
    const bAuto = btn('Auto', '');
    const bReset = btn('Reset', '');
    const count = el('span', 'count', '');
    bar.appendChild(bStep); bar.appendChild(bAuto); bar.appendChild(bReset); bar.appendChild(count);
    wrap.appendChild(bar);

    const steps = el('div', 'steps');
    wrap.appendChild(steps);

    let trace = null, shown = 0, timer = null;

    function compute() {
      try {
        trace = SchemeStepper.trace(seedBox.value, 400).steps;
      } catch (e) {
        trace = [{ html: '<span class="err">' + String(e.message) + '</span>', note: 'error' }];
      }
      shown = 1; render();
    }
    function render() {
      steps.innerHTML = '';
      for (let i = 0; i < shown; i++) {
        const r = el('div', 'row' + (i === shown - 1 ? ' on' : ''));
        r.innerHTML = '<span class="idx">' + i + '</span><span class="expr">' + trace[i].html + '</span>' +
          (i > 0 ? '<span class="note">' + escapeAttr(trace[i].note) + '</span>' : '');
        steps.appendChild(r);
      }
      count.textContent = shown + ' / ' + trace.length;
      const done = shown >= trace.length;
      bStep.disabled = done;
      bAuto.disabled = done;
    }
    function stepOnce() { if (shown < trace.length) { shown++; render(); } }
    bStep.onclick = stepOnce;
    bReset.onclick = function () { stopAuto(); compute(); };
    function stopAuto() { if (timer) { clearInterval(timer); timer = null; bAuto.textContent = 'Auto'; } }
    bAuto.onclick = function () {
      if (timer) { stopAuto(); return; }
      bAuto.textContent = 'Pause';
      timer = setInterval(function () { if (shown >= trace.length) { stopAuto(); } else stepOnce(); }, 650);
    };
    seedBox.addEventListener('input', function () { stopAuto(); compute(); });
    compute();
    return wrap;
  }

  // ---------- Render content -------------------------------------------------
  function renderBlock(b) {
    switch (b.t) {
      case 'sec': {
        const h = el('h2'); h.id = anchor(b.n);
        h.innerHTML = '<span class="num">' + b.n + '</span>' + b.title;
        return h;
      }
      case 'sub': {
        const h = el('h3'); h.id = anchor(b.n);
        var numHtml = /^\d[\d.]*$/.test(b.n) ? '<span class="num">' + b.n + '</span>' : '';
        h.innerHTML = numHtml + b.title;
        return h;
      }
      case 'subsub': return el('h4', '', null, b.title);
      case 'p': { const p = el('p'); p.innerHTML = b.html; return p; }
      case 'ul': case 'ol': {
        const list = document.createElement(b.t);
        b.items.forEach((it) => { const li = document.createElement('li'); li.innerHTML = it; list.appendChild(li); });
        return list;
      }
      case 'quote': { const q = document.createElement('blockquote'); q.innerHTML = '<p>' + b.html + '</p>'; return q; }
      case 'stepper': return buildStepper(b.code);
      case 'code':
        return b.live ? liveRepl(b.code) : staticCode(b.code);
      case 'exercise': return buildExercise(b);
      default: return el('div');
    }
  }

  function liveRepl(code) {
    const wrap = el('div', 'repl');
    const ta = document.createElement('textarea');
    ta.className = 'editor'; ta.spellcheck = false; ta.value = code;
    ta.rows = Math.min(14, code.split('\n').length);
    const bar = el('div', 'bar');
    const run = btn('Run', 'run');
    const out = el('div', 'out');
    const hint = el('span', '', null, ''); hint.style.cssText = 'color:var(--muted);font-family:var(--mono);font-size:11.5px';
    hint.textContent = 'Shift+Enter to run';
    bar.appendChild(run); bar.appendChild(el('span', 'spacer')); bar.appendChild(hint);
    wrap.appendChild(ta); wrap.appendChild(bar); wrap.appendChild(out);
    run.onclick = function () { runRepl(ta.value, out); };
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); runRepl(ta.value, out); }
    });
    return wrap;
  }

  function staticCode(code) {
    const pre = document.createElement('pre'); pre.className = 'static'; pre.textContent = code; return pre;
  }

  // ---------- Exercise block ------------------------------------------------
  function buildExercise(b) {
    var wrap = el('div', 'exercise');
    wrap.id = 'ex-' + b.n.replace(/\./g, '-');
    var header = el('div', 'exercise-header');
    var toggle = el('span', 'exercise-toggle', null, '▶');
    var label = el('span', 'exercise-label', null, 'Exercise ' + b.n);
    header.appendChild(toggle);
    header.appendChild(label);
    wrap.appendChild(header);

    var body = el('div', 'exercise-body');
    body.style.display = 'none';
    var desc = el('div', 'exercise-desc');
    desc.innerHTML = b.html;
    body.appendChild(desc);
    body.appendChild(liveRepl(b.code || ''));
    wrap.appendChild(body);

    header.style.cursor = 'pointer';
    header.onclick = function () {
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '▶' : '▼';
    };
    return wrap;
  }

  // ---------- Build the table of contents -----------------------------------
  function buildToc(blocks) {
    const toc = document.getElementById('toc');
    blocks.forEach((b) => {
      if (b.t !== 'sec' && b.t !== 'sub') return;
      const a = document.createElement('a');
      a.href = '#' + anchor(b.n);
      a.className = b.t === 'sec' ? 'lvl-sec' : 'lvl-sub';
      a.textContent = b.n + '  ' + b.title.replace(/<[^>]+>/g, '');
      a.onclick = function (e) {
        e.preventDefault();
        document.getElementById(anchor(b.n)).scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + anchor(b.n));
      };
      toc.appendChild(a);
    });
  }

  // ---------- Notes (localStorage) ------------------------------------------
  function setupNotes() {
    const KEY = 'sicp-notes-ch1';
    const drawer = document.getElementById('notes');
    const ta = document.getElementById('notes-area');
    const saved = document.getElementById('notes-saved');
    document.getElementById('notes-toggle').onclick = function () { drawer.classList.toggle('open'); };
    try { ta.value = localStorage.getItem(KEY) || ''; } catch (e) {}
    let t = null;
    ta.addEventListener('input', function () {
      saved.textContent = 'saving…';
      clearTimeout(t);
      t = setTimeout(function () {
        try { localStorage.setItem(KEY, ta.value); saved.textContent = 'saved ' + new Date().toLocaleTimeString(); } catch (e) { saved.textContent = 'could not save'; }
      }, 300);
    });
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { ta.value = e.newValue || ''; saved.textContent = 'updated from another tab'; }
    });
  }

  // ---------- Scroll-spy for active TOC entry -------------------------------
  function setupScrollSpy() {
    const links = Array.prototype.slice.call(document.querySelectorAll('#toc a'));
    const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    function onScroll() {
      let active = targets[0];
      for (const t of targets) { if (t.getBoundingClientRect().top <= 120) active = t; }
      links.forEach((a) => a.classList.toggle('active', active && a.getAttribute('href') === '#' + active.id));
    }
    document.querySelector('.main').addEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Helpers --------------------------------------------------------
  function el(tag, cls, html, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls) { const b = document.createElement('button'); b.className = cls; b.textContent = label; return b; }
  function anchor(n) { return 'sec-' + String(n).replace(/\./g, '-'); }
  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---------- Boot -----------------------------------------------------------
  function boot() {
    const reader = document.getElementById('reader');
    var exercisesByChapter = {};
    [window.SICP_EX1, window.SICP_EX2, window.SICP_EX3, window.SICP_EX4, window.SICP_EX5].forEach(function (exs) {
      if (!exs || !exs.length) return;
      var ch = exs[0].n.split('.')[0];
      exercisesByChapter[ch] = exs;
    });
    var chapters = [window.SICP_CH1, window.SICP_CH2, window.SICP_CH3, window.SICP_CH4, window.SICP_CH5];
    var blocks = [];
    chapters.forEach(function (ch, i) {
      if (!ch) return;
      blocks = blocks.concat(ch);
      var exs = exercisesByChapter[String(i + 1)];
      if (exs) {
        blocks.push({ t: 'sub', n: (i + 1) + '.exercises', title: 'Exercises' });
        blocks = blocks.concat(exs);
      }
    });
    blocks.forEach((b) => reader.appendChild(renderBlock(b)));
    buildToc(blocks);
    setupNotes();
    setupScrollSpy();
    if (location.hash) {
      const t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(() => t.scrollIntoView(), 60);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
