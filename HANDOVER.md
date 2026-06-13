# learn-sicp — Handover

A handover for continuing this project in Claude Code. It contains (1) a faithful
recap of the conversation that produced the current state, including the design
decisions and their rationale; (2) the architecture and file map; (3) how to run
and verify; (4) known issues; and (5) prioritized next steps.

---

## 1. Conversation recap

The goal: an interactive website to **re-read SICP** (the Scheme original, not the
JS adaptation) with live code and visualizations. Built first as a personal tool.

Key exchanges and decisions, in order:

1. **Framing pushback.** SICP is not a Scheme book; it is about controlling
   complexity (abstraction, then metalinguistic abstraction). A site optimized for
   "solve all the exercises" risks becoming an answer-checker, which teaches people
   to satisfy a grader rather than to think. So the value is in the *reading +
   evaluator-made-visible*, not in autograding.

2. **Prior art.** Source Academy (`sourceacademy.org`) already does interactive
   SICP, but it runs **Source (a JavaScript sublanguage), not Scheme**, and its
   playground is separate from the textbook site. The user found it inadequate and
   wants Scheme. So the differentiator here is: faithful Scheme text + live Scheme
   REPL + an **evaluation-model visualizer**.

3. **Scope, locked.** Audience = the user, personally, first (no accounts, no
   autograder, no exercise corpus). Language = **Scheme**. **Exercises are left
   out** of the reader. First build = **sections 1.1–1.3** as a vertical slice, on
   the argument that section 1.3 (higher-order procedures) is where the book's
   thesis first bites; if the format works there, scaling is mechanical.

4. **Two evaluation models explained.** The *substitution model* (Ch 1: replace
   formal parameters with argument values and simplify) versus the *environment
   model* (Ch 3: needed once `set!` introduces state). The 1.1–1.3 slice lives
   entirely in the substitution model, so that is the visualizer built first. The
   environment / box-and-pointer model is deferred to the Chapter 3 work.

5. **"Socratic method" clarified.** The user meant Socratic *as the working style
   between them and the assistant*, **not a feature in the app**. So there is no LLM
   or tutor inside the website. The app is purely: faithful text + live REPL +
   stepper.

6. **Engineering decisions made along the way.**
   - Two Scheme engines, deliberately: **BiwaScheme** (CDN) as the workhorse for the
     live REPLs, plus a small **custom substitution stepper** (`js/scheme.js`) that
     we control, because BiwaScheme can run code but cannot *show the reduction*.
   - Content source: the **sarabander CC-BY-SA HTML edition** of SICP 2e
     (faithful to the book). Section 1.1 prose was transcribed from it.
   - Git: the user asked for a repo in the project root with clean commit messages
     (no assistant mentions). Done. See "Known issues" for the lock-file quirk.

Status at handover: **the engine and the 1.1 slice are built and verified at the
Node level; 1.2 and 1.3 content is not yet written.** The user is handing off here.

**Session 2 update (2026-06-13):** BiwaScheme CDN URL was broken (`@0.7.0` npm package
never included the browser bundle). Fixed by vendoring `biwascheme-min.js` (v0.8.3)
into `js/` and updating `index.html` to load it locally. Full in-browser smoke test
passed: 22 REPLs evaluate, 3 steppers step correctly. Project renamed from
`interactive-sicp` to `learn-sicp`. A landing page (`index.html`) was added; the
reader moved to `reader.html`.

---

## 2. Architecture and file map

```
learn-sicp/
├── index.html          Landing page (dark hero, SICP wizardry quote, CTA → reader.html).
├── reader.html         App shell: sidebar TOC + reading column + notes drawer.
│                       Loads BiwaScheme (vendored), then scheme.js, ch1.js, app.js.
├── css/style.css       Book-like reading theme; REPL, stepper, redex highlight.
├── js/
│   ├── biwascheme-min.js  BiwaScheme 0.8.3 browser bundle (vendored; no CDN needed).
│   ├── scheme.js       *** The substitution-model stepper. ***
│   │                   UMD module (works in Node + browser). Reader (text→AST),
│   │                   single-step reducer `reduceOnce`, and `trace(src)` which
│   │                   returns every reduction step with the redex marked.
│   │                   Covers the Ch-1 subset: numbers, booleans, + - * / and
│   │                   comparisons, define, if, cond, and, or, not, remainder,
│   │                   and compound procedures (applicative order).
│   └── app.js          Renders content blocks; wires live REPLs to a shared
│                       BiwaScheme interpreter; builds the stepper widget
│                       (Step / Auto / Reset); notes persisted to localStorage;
│                       TOC + scroll-spy.
├── content/
│   └── ch1.js          window.SICP_CH1 = [ blocks ]. Section 1.1 only so far.
│                       Block types documented at the top of the file.
├── test/
│   └── stepper.test.js Node smoke tests for the stepper (14 cases).
└── HANDOVER.md         This file.
```

**Content block schema** (see `content/ch1.js` header for the authoritative list):
`sec`, `sub`, `subsub`, `p` (html), `ul`/`ol` (items), `quote`, `code`
(`{code, live?}` — `live:true` makes it a runnable REPL), and `stepper` (`{code}`
seeds the substitution stepper).

---

## 3. How to run and verify

The app is a fully offline static site (BiwaScheme is vendored).

```bash
# from the repo root:
python3 -m http.server 8000
# landing page: http://localhost:8000/
# reader:       http://localhost:8000/reader.html
```

Opening the HTML files directly via `file://` also works.

Run the stepper unit tests:

```bash
node test/stepper.test.js     # expect: 14 passed, 0 failed
```

Verified so far (Node level): all 14 stepper cases pass, including `(f 5) → 136`
with the exact SICP applicative-order trace, `factorial`, `gcd`, and Exercise-1.4
behavior (operator is a compound expression). All three browser JS files pass
`node --check`. The `(f 5)` trace was confirmed to match the book step for step.

**In-browser smoke test done (session 2):** 22 REPLs evaluate, 3 steppers step,
no console errors, BiwaScheme 0.8.3 loads from vendored file.

---

## 4. Known issues / gotchas

- **Git lock files on this mount.** The working folder is a mount that allows
  *rename* but not *unlink*. Git's normal commit path uses rename, so commits work,
  but git cannot delete its own `*.lock` and `tmp_obj_*` files, so they accumulate
  in `.git/` and a stale `*.lock` will block the *next* command. The workaround used
  here, run before each git command:
  ```bash
  find .git -name '*.lock' | while read f; do mv "$f" "$f.stale.$RANDOM"; done
  ```
  On a normal local checkout (Claude Code on the user's machine) this quirk should
  disappear; consider a fresh `git clone`/`git gc` to clean the orphaned objects.
- **BiwaScheme is vendored** at `js/biwascheme-min.js` (v0.8.3). No CDN needed.
  The `@0.7.0` npm package never included the browser bundle; only `@0.8.3+` does.
- **REPL environment is shared and stateful** down the whole page (so `define`s
  earlier in a section are visible later, matching the reading flow). There is no
  "reset environment" button yet; `app.js` has `resetBiwa()` ready to wire to one.
- The stepper has no recursion/step **cap surfaced in the UI** beyond an internal
  guard of 400 steps; deeply recursive seeds will stop silently at the cap.

---

## 5. Prioritized next steps

1. ~~**Browser smoke test**~~ Done in session 2.
2. **Author sections 1.2 and 1.3 content** into `content/ch1.js` (or split into
   `content/1_2.js`, `content/1_3.js` and load them). Source: the sarabander HTML
   edition, files `1_002e2.xhtml` and `1_002e3.xhtml`. Seed steppers at the natural
   places: 1.2.1 recursion-vs-iteration (`factorial` linear-recursive vs iterative;
   the stepper already handles both and dramatizes the difference in space),
   `gcd`, `expt`, and the tree-recursive `fib`.
3. **Normal-order stepper toggle.** Section 1.1.5 contrasts applicative vs normal
   order; a toggle that reduces the *outermost* redex first would let the reader
   watch `(+ 5 1)`/`(* 5 2)` get duplicated and evaluated twice. High pedagogical
   payoff, modest code: add an outermost-first variant of `reduceOnce`.
4. **"Reset environment" control** on the REPLs (wire `resetBiwa()`).
5. ~~**Vendor BiwaScheme**~~ Done in session 2.
6. Later, for Chapter 3: the **environment / box-and-pointer model** visualizer.
   This is a separate engine from the substitution stepper and is the real reason
   to keep our own evaluator instrumented.

### Working-style note for whoever picks this up
The user explicitly asked for a **Socratic, non-sycophantic** collaborator: push
back on weak premises, surface trade-offs, ask the question that exposes the gap
rather than just complying. They also prefer **concise, direct** writing and
**colons/semicolons over em dashes**.
