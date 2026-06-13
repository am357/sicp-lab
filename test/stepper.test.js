/* Node smoke tests for the substitution-model stepper. */
const SS = require('../js/scheme.js');

let pass = 0, fail = 0;
function check(name, src, expected) {
  let got;
  try {
    const r = SS.trace(src, 500);
    got = r.steps[r.steps.length - 1].text;
  } catch (e) {
    got = 'ERROR: ' + e.message;
  }
  if (got === String(expected)) { pass++; console.log('  ok  ', name, '=>', got); }
  else { fail++; console.log('  FAIL', name, '=> got', got, 'want', expected); }
}

// 1.1.4 / 1.1.5 — the canonical (f 5) example, expected final value 136.
check('f 5', `
  (define (square x) (* x x))
  (define (sum-of-squares x y) (+ (square x) (square y)))
  (define (f a) (sum-of-squares (+ a 1) (* a 2)))
  (f 5)`, 136);

check('sum-of-squares 3 4', `
  (define (square x) (* x x))
  (define (sum-of-squares x y) (+ (square x) (square y)))
  (sum-of-squares 3 4)`, 25);

check('nested arithmetic', '(+ (* 3 (+ (* 2 4) (+ 3 5))) (+ (- 10 7) 6))', 57);

// 1.1.6 — conditionals
check('abs cond neg', `
  (define (abs x) (cond ((> x 0) x) ((= x 0) 0) ((< x 0) (- x))))
  (abs -7)`, 7);
check('abs if pos', `(define (abs x) (if (< x 0) (- x) x)) (abs 12)`, 12);
check('and range true', '(and (> 7 5) (< 7 10))', '#t');
check('and range false', '(and (> 3 5) (< 3 10))', '#f');
check('or ge', '(define (ge x y) (or (> x y) (= x y))) (ge 4 4)', '#t');

// Exercise-1.1-style evaluation (we are not grading; just checking the engine)
check('let-ish defines', '(define a 3) (define b (+ a 1)) (+ a b (* a b))', 19);
check('if and', '(define a 3) (define b 4) (if (and (> b a) (< b (* a b))) b a)', 4);
check('cond chain', '(define a 3) (define b 4) (cond ((= a 4) 6) ((= b 4) (+ 6 7 a)) (else 25))', 16);

// Exercise 1.4 — operator is a compound expression.
check('a-plus-abs-b', '(define (a-plus-abs-b a b) ((if (> b 0) + -) a b)) (a-plus-abs-b 5 -3)', 8);

// Recursion: factorial and gcd
check('factorial', `
  (define (factorial n) (if (= n 1) 1 (* n (factorial (- n 1)))))
  (factorial 5)`, 120);
check('gcd', `
  (define (gcd a b) (if (= b 0) a (gcd b (remainder a b))))
  (gcd 206 40)`, 2);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
