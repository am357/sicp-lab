/*
 * scheme.js — a tiny Scheme front end plus a substitution-model stepper.
 *
 * This is NOT the workhorse interpreter (BiwaScheme plays that role for the
 * live REPLs). Its single job is pedagogical: to reduce a Chapter-1 expression
 * one step at a time, exactly the way SICP section 1.1.5 describes the
 * substitution model, so a reader can watch applicative-order evaluation
 * happen. It is deliberately small and covers only the Chapter-1 subset:
 * numbers, booleans, the arithmetic and comparison primitives, define,
 * if, cond, and, or, not, and compound procedures.
 *
 * Written as a UMD-ish module so the same code can be unit-tested under Node
 * and loaded in the browser via a plain <script> tag.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchemeStepper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Reader: text -> AST -------------------------------------------
  // AST representation:
  //   number  -> JS number
  //   boolean -> JS true / false
  //   symbol  -> { sym: "name" }
  //   list    -> JS array of the above
  function tokenize(src) {
    // strip ; line comments
    src = src.replace(/;[^\n]*/g, ' ');
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '(' || c === ')') { out.push(c); i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      let j = i;
      while (j < src.length && !/[\s()]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
    }
    return out;
  }

  function atom(tok) {
    if (tok === '#t' || tok === 'true') return true;
    if (tok === '#f' || tok === 'false') return false;
    // number? (integer or decimal, optional sign)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok) && tok !== '+' && tok !== '-') {
      return parseFloat(tok);
    }
    return { sym: tok };
  }

  function parseAll(src) {
    const toks = tokenize(src);
    let pos = 0;
    function parseExpr() {
      if (pos >= toks.length) throw new Error('Unexpected end of input');
      const t = toks[pos++];
      if (t === '(') {
        const list = [];
        while (toks[pos] !== ')') {
          if (pos >= toks.length) throw new Error('Missing )');
          list.push(parseExpr());
        }
        pos++; // consume )
        return list;
      }
      if (t === ')') throw new Error('Unexpected )');
      return atom(t);
    }
    const forms = [];
    while (pos < toks.length) forms.push(parseExpr());
    return forms;
  }

  // ---------- Predicates and printing ---------------------------------------
  const isNum = (x) => typeof x === 'number';
  const isBool = (x) => typeof x === 'boolean';
  const isValue = (x) => isNum(x) || isBool(x);
  const isSym = (x) => x && typeof x === 'object' && !Array.isArray(x) && 'sym' in x;
  const isList = (x) => Array.isArray(x);
  const S = (n) => ({ sym: n });

  function toStr(ast) {
    if (isNum(ast)) return String(ast);
    if (isBool(ast)) return ast ? '#t' : '#f';
    if (isSym(ast)) return ast.sym;
    if (isList(ast)) return '(' + ast.map(toStr).join(' ') + ')';
    return String(ast);
  }

  // Render AST to HTML, wrapping the subtree at `path` in a redex span.
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function toHtml(ast, path) {
    function rec(node, here) {
      const atRedex = path && samePath(here, path);
      let inner;
      if (isList(node)) {
        inner = '(' + node.map((c, k) => rec(c, here.concat(k))).join(' ') + ')';
      } else {
        inner = escapeHtml(toStr(node));
      }
      return atRedex ? '<span class="redex">' + inner + '</span>' : inner;
    }
    return rec(ast, []);
  }
  function samePath(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------- Primitives -----------------------------------------------------
  const PRIMS = {
    '+': (a) => a.reduce((x, y) => x + y, 0),
    '*': (a) => a.reduce((x, y) => x * y, 1),
    '-': (a) => (a.length === 1 ? -a[0] : a.slice(1).reduce((x, y) => x - y, a[0])),
    '/': (a) => (a.length === 1 ? 1 / a[0] : a.slice(1).reduce((x, y) => x / y, a[0])),
    '=': (a) => chain(a, (x, y) => x === y),
    '<': (a) => chain(a, (x, y) => x < y),
    '>': (a) => chain(a, (x, y) => x > y),
    '<=': (a) => chain(a, (x, y) => x <= y),
    '>=': (a) => chain(a, (x, y) => x >= y),
    'remainder': (a) => a[0] % a[1],
    'modulo': (a) => ((a[0] % a[1]) + a[1]) % a[1],
    'quotient': (a) => Math.trunc(a[0] / a[1]),
    'min': (a) => Math.min.apply(null, a),
    'max': (a) => Math.max.apply(null, a),
    'abs': (a) => Math.abs(a[0]),
    'square': (a) => a[0] * a[0],
    'not': (a) => a[0] === false,
  };
  function chain(a, cmp) {
    for (let i = 0; i + 1 < a.length; i++) if (!cmp(a[i], a[i + 1])) return false;
    return true;
  }
  const isPrim = (n) => Object.prototype.hasOwnProperty.call(PRIMS, n);

  // ---------- Substitution ---------------------------------------------------
  function deepCopy(ast) {
    if (isList(ast)) return ast.map(deepCopy);
    if (isSym(ast)) return { sym: ast.sym };
    return ast;
  }
  // Replace free occurrences of each param symbol with the matching arg.
  function substitute(body, params, args) {
    function rec(node) {
      if (isSym(node)) {
        const k = params.indexOf(node.sym);
        return k >= 0 ? deepCopy(args[k]) : { sym: node.sym };
      }
      if (isList(node)) return node.map(rec);
      return node;
    }
    return rec(body);
  }

  function replaceAt(ast, i, sub) {
    const copy = ast.slice();
    copy[i] = sub;
    return copy;
  }

  // A child needs reducing if it is a combination/special form, or a symbol
  // bound to a constant value (a name lookup is itself one reduction step).
  function reducibleChild(c, env) {
    if (isList(c)) return c.length > 0;
    if (isSym(c)) return Object.prototype.hasOwnProperty.call(env.consts, c.sym);
    return false;
  }

  // ---------- The single-step reducer ---------------------------------------
  // Returns { ast, note, path } for the next step, or null if `ast` is a value
  // or is stuck (no rule applies).
  function reduceOnce(ast, env) {
    if (isSym(ast)) {
      const n = ast.sym;
      if (Object.prototype.hasOwnProperty.call(env.consts, n)) {
        return { ast: deepCopy(env.consts[n]), note: 'look up ' + n, path: [] };
      }
      return null;
    }
    if (!isList(ast) || ast.length === 0) return null;

    const head = ast[0];
    const hname = isSym(head) ? head.sym : null;

    if (hname === 'if') {
      const pred = ast[1];
      if (!isValue(pred)) {
        const r = reduceOnce(pred, env);
        if (r) return { ast: replaceAt(ast, 1, r.ast), note: r.note, path: [1].concat(r.path) };
        return null;
      }
      const takeThen = pred !== false;
      return {
        ast: takeThen ? ast[2] : ast[3],
        note: 'if predicate is ' + (takeThen ? '#t' : '#f') + ': take the ' + (takeThen ? 'consequent' : 'alternative'),
        path: [],
      };
    }

    if (hname === 'cond') {
      // first clause is ast[1] = [pred, expr...]
      for (let i = 1; i < ast.length; i++) {
        const clause = ast[i];
        const pred = clause[0];
        const isElse = isSym(pred) && pred.sym === 'else';
        if (isElse) {
          return { ast: clause[1], note: 'cond: else clause taken', path: [] };
        }
        if (!isValue(pred)) {
          const r = reduceOnce(pred, env);
          if (r) return { ast: replaceAt(ast, i, replaceAt(clause, 0, r.ast)), note: r.note, path: [i, 0].concat(r.path) };
          return null;
        }
        if (pred !== false) {
          return { ast: clause[1], note: 'cond: clause predicate is #t, take its consequent', path: [] };
        }
        // pred is #f: drop this clause and continue
        return { ast: dropClause(ast, i), note: 'cond: clause predicate is #f, discard clause', path: [] };
      }
      return null;
    }

    if (hname === 'and') {
      if (ast.length === 1) return { ast: true, note: 'and with no clauses is #t', path: [] };
      const first = ast[1];
      if (!isValue(first)) {
        const r = reduceOnce(first, env);
        if (r) return { ast: replaceAt(ast, 1, r.ast), note: r.note, path: [1].concat(r.path) };
        return null;
      }
      if (first === false) return { ast: false, note: 'and: a clause is #f, result is #f', path: [] };
      if (ast.length === 2) return { ast: first, note: 'and: last clause is its value', path: [] };
      return { ast: [S('and')].concat(ast.slice(2)), note: 'and: clause is true, drop it', path: [] };
    }

    if (hname === 'or') {
      if (ast.length === 1) return { ast: false, note: 'or with no clauses is #f', path: [] };
      const first = ast[1];
      if (!isValue(first)) {
        const r = reduceOnce(first, env);
        if (r) return { ast: replaceAt(ast, 1, r.ast), note: r.note, path: [1].concat(r.path) };
        return null;
      }
      if (first !== false) return { ast: first, note: 'or: a clause is true, return it', path: [] };
      if (ast.length === 2) return { ast: false, note: 'or: all clauses #f, result is #f', path: [] };
      return { ast: [S('or')].concat(ast.slice(2)), note: 'or: clause is #f, drop it', path: [] };
    }

    // Ordinary application: reduce operator/operands left to right.
    for (let i = 0; i < ast.length; i++) {
      if (reducibleChild(ast[i], env)) {
        const r = reduceOnce(ast[i], env);
        if (r) return { ast: replaceAt(ast, i, r.ast), note: r.note, path: [i].concat(r.path) };
      }
    }

    // All operands are values/stable: apply.
    if (hname && Object.prototype.hasOwnProperty.call(env.procs, hname)) {
      const proc = env.procs[hname];
      const args = ast.slice(1);
      const newBody = substitute(proc.body, proc.params, args);
      const bindings = proc.params.map((p, k) => p + '→' + toStr(args[k])).join(', ');
      return { ast: newBody, note: 'apply ' + hname + ' [' + bindings + ']', path: [] };
    }
    if (hname && isPrim(hname)) {
      const args = ast.slice(1);
      if (args.every(isValue)) {
        const v = PRIMS[hname](args);
        return { ast: v, note: '(' + hname + ' ' + args.map(toStr).join(' ') + ') → ' + toStr(v), path: [] };
      }
      return null;
    }
    return null;
  }

  function dropClause(condAst, i) {
    const copy = condAst.slice();
    copy.splice(i, 1);
    return copy;
  }

  // ---------- Top level: build env from defines, then step the expression ---
  function buildEnv(forms) {
    const env = { procs: {}, consts: {} };
    let exprForm = null;
    for (const f of forms) {
      if (isList(f) && isSym(f[0]) && f[0].sym === 'define') {
        const target = f[1];
        if (isList(target)) {
          // (define (name . params) body...)
          const name = target[0].sym;
          const params = target.slice(1).map((p) => p.sym);
          const body = f.length > 3 ? [S('begin')].concat(f.slice(2)) : f[2];
          env.procs[name] = { params: params, body: body };
        } else {
          // (define name value)
          env.consts[target.sym] = f[2];
        }
      } else {
        exprForm = f; // last non-define form is the one we trace
      }
    }
    return { env: env, expr: exprForm };
  }

  // Run the full reduction, returning an array of steps.
  // Each step: { html, text, note }. Guards against runaway loops.
  function trace(src, maxSteps) {
    maxSteps = maxSteps || 200;
    const forms = parseAll(src);
    const built = buildEnv(forms);
    if (built.expr == null) throw new Error('No expression to evaluate (only definitions found).');
    let cur = built.expr;
    const steps = [{ html: toHtml(cur, null), text: toStr(cur), note: 'start' }];
    let n = 0;
    while (n < maxSteps) {
      const r = reduceOnce(cur, built.env);
      if (!r) break;
      // record the redex highlight on the PRE-reduction expression
      steps[steps.length - 1].html = toHtml(cur, r.path);
      cur = r.ast;
      steps.push({ html: toHtml(cur, null), text: toStr(cur), note: r.note });
      n++;
    }
    return { steps: steps, env: built.env, done: n < maxSteps };
  }

  return {
    parseAll: parseAll,
    toStr: toStr,
    toHtml: toHtml,
    reduceOnce: reduceOnce,
    buildEnv: buildEnv,
    trace: trace,
    isValue: isValue,
  };
});
