---
title: Numbers & Math
part: Foundations
summary: Exact big ints, floor division, life without ++, strict parsing, and every Math method mapped to Python.
minutes: 40
---

JavaScript has one numeric type, a 64-bit float, plus `BigInt` bolted on for when that isn't enough. Python has three: `int` (exact and arbitrarily large), `float` (the very same IEEE 754 double as a JS `number`) and `complex`. The shift that matters: integer arithmetic is exact, operators never coerce strings into numbers, and in most of the places where JS quietly hands you `NaN` or `Infinity`, Python raises an exception instead.

## `int`, `float` and `complex`

:::compare
```js
typeof 42;                     // "number"
typeof 4.2;                    // "number"
Number.MAX_SAFE_INTEGER + 2;   // 9007199254740992 (off by one)
2n ** 64n;                     // 18446744073709551616n
2n ** 64n + 1;                 // TypeError: Cannot mix BigInt...
Number.isInteger(42.0);        // true: 42.0 IS 42
```
```python
type(42)                       # <class 'int'>
type(4.2)                      # <class 'float'>
2**53 + 1                      # 9007199254740993 (exact)
2 ** 64                        # 18446744073709551616
2 ** 64 + 1                    # 18446744073709551617
isinstance(42.0, int)          # False: 42.0 is a float
```
:::

`int` has arbitrary precision. There's no `MAX_SAFE_INTEGER`, no `BigInt`, no `n` suffix and no overflow: an int grows until you run out of memory, and every operation on it stays exact. `float` is IEEE 754 binary64, bit for bit a JS `number`, so everything you know about float rounding carries over. Mixing the two promotes to float (`2 + 0.5` is `2.5`), and `42` and `42.0` are different types even though `42 == 42.0` is `True`. `complex` is built in too (`3 + 4j`, plus the `cmath` module). You'll rarely want it, but you can meet it by accident, as the section on powers shows.

```python run
from math import factorial

print(2 ** 100)                  # exact, no BigInt needed
print(factorial(25))             # 15511210043330985984000000
print((2 ** 100).bit_length())   # 101 bits, no problem
print(2 + 0.5, type(2 + 0.5))    # int + float -> float
print(0.1 * 3)                   # the same doubles as JS
```

Literals mostly match JS: `1_000_000` separators (in any base, as in `0xFF_FF`), and `0b1010`, `0o17` and `0xff` for binary, octal and hex. A legacy-octal leading zero (`017`) is a `SyntaxError` rather than sloppy-mode octal; write `0o17`.

:::gotcha `1e3` is a float
Scientific notation always produces a `float`, even for whole values. `range(1e3)` raises `TypeError: 'float' object cannot be interpreted as an integer`, and `[0] * 1e3` is a `TypeError` too. Write `1000`, `1_000` or `10 ** 3` when you need an int.
:::

:::deep How big can an int get?
CPython stores an int as an array of 30-bit "digits", so the limit is memory, and arithmetic slows down gradually as numbers grow. One guard rail exists: converting an int with more than 4,300 decimal digits to or from a string raises `ValueError` (3.11+, and security releases of older versions), because quadratic-time parsing of huge numeric strings was a denial-of-service vector. `sys.set_int_max_str_digits()` raises the limit, and `hex()` is exempt. Converting a huge int to a float raises `OverflowError` rather than giving you `Infinity`.
:::

## Division: `/`, `//`, `%` and `divmod`

:::compare
```js
7 / 2;                    // 3.5
6 / 2;                    // 3
Math.floor(7 / 2);        // 3
Math.trunc(-7 / 2);       // -3 (toward zero)
-7 % 3;                   // -1 (sign of the dividend)
((-7 % 3) + 3) % 3;       // 2  (the "real modulo" dance)
```
```python
7 / 2                     # 3.5
6 / 2                     # 3.0 (always a float)
7 // 2                    # 3
-7 // 2                   # -4 (floors toward -infinity)
-7 % 3                    # 2  (sign of the divisor)
divmod(-7, 3)             # (-3, 2)
```
:::

Python has two division operators. `/` is **true division** and always returns a float, even for `6 / 2`. `//` is **floor division**: it rounds toward negative infinity, not toward zero, so `-7 // 2` is `-4` where `Math.trunc` gives `-3`. Two ints give an int; if either side is a float you get a whole-valued float (`7.0 // 2` is `3.0`).

`%` is defined to match `//`. The result takes the **sign of the divisor**, and `a == (a // b) * b + a % b` always holds. That makes `%` a true modulo for clock arithmetic and wrap-around indices, and the `((n % m) + m) % m` dance disappears (the [rotate challenge](lesson:lists#rotate-list) relies on it). `divmod(a, b)` returns both halves at once.

```python run
total_seconds = 7384
minutes, seconds = divmod(total_seconds, 60)
hours, minutes = divmod(minutes, 60)
print(f"{hours}h {minutes}m {seconds}s")      # 2h 3m 4s

hour = (2 - 5) % 24          # five hours before 2am
print(hour)                  # 21, where JS says -3

print(-7 // 2, -7 % 2, 7 // -2, 7 % -2)       # signs follow the divisor
```

:::gotcha `//` is not C-style integer division
C, Java and `Math.trunc(a / b)` all truncate toward zero. Python's `//` floors. They agree when both operands have the same sign, and differ by one when exactly one is negative and the division isn't exact. When porting code that depends on truncation, use `math.trunc(a / b)` (it goes through a float, so it's only safe for magnitudes well below `2**53`) and `math.fmod(a, b)`, which returns a float remainder with the dividend's sign, like JS's `%`.
:::

All of `/`, `//`, `%` and `divmod` raise `ZeroDivisionError` for a zero divisor, floats included: `1.0 / 0.0` is an error, not `Infinity` ([Errors & Exceptions](lesson:exceptions) covers handling it).

:::quiz output
What does this print?

```python
print(-9 // 4, -9 % 4)
```

- [ ] `-2 -1`
- [x] `-3 3`
- [ ] `-2 3`
- [ ] `-3 -1`

`-9 / 4` is `-2.25`, and flooring goes *down* to `-3`. The remainder must satisfy `-3 * 4 + r == -9`, so it's `3`. JavaScript's truncating pair would be `-2` and `-1`.
:::

## Powers: `**` and `pow()`

:::compare
```js
2 ** 10;                  // 1024
2 ** -1;                  // 0.5
Math.pow(2, 10);          // 1024
-2 ** 2;                  // SyntaxError: needs parentheses
(-8) ** (1 / 3);          // NaN
Math.cbrt(-8);            // -2
```
```python
2 ** 10                   # 1024, an exact int
2 ** -1                   # 0.5, negative exponents give floats
pow(2, 10)                # 1024; math.pow(2, 10) is 1024.0
-2 ** 2                   # -4: it means -(2 ** 2)
(-8) ** (1 / 3)           # (1.0000000000000002+1.7320508075688772j)
math.cbrt(-8)             # -2.0 (3.11+)
```
:::

`**` works as in JS and is right-associative in both languages (`2 ** 3 ** 2` is `512`). With int operands and a non-negative exponent the result is an exact int, however large. Python accepts `-2 ** 2` and reads it as `-(2 ** 2)`, because `**` binds tighter than unary minus. JS refuses to guess and makes you add parentheses.

The builtin `pow()` takes an optional third argument for **modular exponentiation**: `pow(base, exp, mod)` computes `base ** exp % mod` without ever building the giant intermediate number. With an exponent of `-1` it returns the modular inverse (3.8+). In JS you'd write a square-and-multiply loop over BigInts.

```python run
import math

print(2 ** 3 ** 2)                  # right-associative: 2 ** 9
print(pow(7, 10**18, 1_000_007))    # instant, never computes 7 ** 10**18
print(pow(3, -1, 7))                # modular inverse: 3 * 5 % 7 == 1
print(3 ** 40, math.pow(3, 40))     # exact int vs. a float that lost digits
```

:::gotcha Fractional powers of negatives go complex
`(-8) ** (1 / 3)` neither raises nor returns `NaN`. It returns the principal complex root, and a `j` suddenly appears in your output. Use `math.cbrt` (3.11+) for real cube roots. `math.sqrt` raises `ValueError` on negative input instead of going complex, and `cmath.sqrt(-1)` is `1j` if complex is what you actually want.
:::

## No `++` or `--`

:::compare
```js
let count = 0;
count++;                   // count is 1
++count;                   // count is 2
count--;                   // count is 1
const before = count++;    // before: 1, count: 2
const after = ++count;     // after: 3, count: 3
```
```python
count = 0
count += 1                 # count is 1
count += 1                 # count is 2
count -= 1                 # count is 1
before, count = count, count + 1   # before: 1, count: 2
after = (count := count + 1)       # after: 3, count: 3
```
:::

Python has no increment or decrement operators. You write the augmented assignments `count += 1` and `count -= 1`, from the same family as `*=`, `/=`, `//=`, `%=`, `**=`, `&=`, `|=`, `^=`, `<<=` and `>>=`. (The logical assignments `||=`, `&&=` and `??=` don't exist; see [Truthiness & Equality](lesson:truthiness-and-equality).)

Augmented assignments are **statements**, not expressions. `x = (count += 1)` is a `SyntaxError`, and so is `if (count += 1) > 3:`, which removes the whole pre/post distinction you track in your head in JS. When you genuinely need the new value inside an expression, the walrus operator `:=` gives you `++count` semantics. For `count++`, read the old value first, or rebind both names in one tuple assignment as above.

Why leave them out? Ints are immutable, so `count += 1` can't bump a number in place: it computes `count + 1` and rebinds the name `count` to the result (more on names in [Variables, Types & Scope](lesson:variables-and-scope)). And the classic jobs of `++` mostly disappear, because loops iterate directly or over `range`, and counting is done by `enumerate`, `sum` or `Counter`.

The postfix forms at least fail loudly, at compile time, before any of your code runs:

```python run raises
count = 0
count++
```

:::gotcha `++count` is valid Python, and does nothing
Python parses `++count` as `+(+count)`: two unary plus operators. That's a legal expression whose value is just `count`, so the line runs without complaint and changes nothing. `--count` is `-(-count)`, likewise a no-op. A ported `while n > 0: --n` never terminates. Linters flag it (ruff and flake8-bugbear call the rule B002); the interpreter never will.
:::

It gets sneakier. A postfix `++` *followed by another operand* is valid too, because the extra plus signs become unary operators on whatever comes next:

```python run
count = 5
++count                    # +(+count): evaluates to 5, assigns nothing
--count                    # -(-count): also 5
print(count)               # still 5

total = count++ + 1        # parses as count + (+(+1))
print(count, total)        # 5 6: no increment happened
```

:::quiz output
What does this print?

```python
stock = 3
--stock
stock -= 1
print(stock)
```

- [ ] `1`
- [x] `2`
- [ ] `3`
- [ ] `SyntaxError`

`--stock` is `-(-stock)`: an expression statement that computes `3` and throws it away. Only `stock -= 1` changes anything.
:::

Here's the full translation table. Most rows aren't about `+= 1` at all, because idiomatic Python rarely needs a hand-maintained counter:

| JavaScript | Python | Notes |
| --- | --- | --- |
| `i++;` or `++i;` | `i += 1` | a statement, so it can't sit inside an expression |
| `i--;` or `--i;` | `i -= 1` | |
| `x = ++i;` | `x = (i := i + 1)` | walrus (3.8+); plain names only, not `obj.n` or `xs[0]` |
| `x = i++;` | `x = i` then `i += 1` | or `x, i = i, i + 1` |
| `for (let i = 0; i < n; i++)` | `for i in range(n):` | see [Control Flow & Loops](lesson:control-flow) |
| `for (let i = n - 1; i >= 0; i--)` | `for i in reversed(range(n)):` | or `range(n - 1, -1, -1)` |
| `let i = 0; for (const x of xs) { ...; i++; }` | `for i, x in enumerate(xs):` | `enumerate(xs, start=1)` to count from 1 |
| `if (p > 0) count++;` inside a loop | `count = sum(p > 0 for p in prices)` | `True` counts as 1 |
| `counts[k] = (counts[k] ?? 0) + 1;` | `counts[k] = counts.get(k, 0) + 1` | or `collections.Counter`, see [Dicts](lesson:dicts) |
| `let nextId = 1; ... nextId++` | `ids = itertools.count(1)`, then `next(ids)` | an endless counter |

```python run
import itertools

prices = [12, 0, 7, 30, 0, 5]
print(sum(price > 0 for price in prices))         # 4 in stock

for position, price in enumerate(prices, start=1):
    if price > 20:
        print(f"item #{position} costs {price}")  # no i++ bookkeeping

ticket_numbers = itertools.count(1001)            # replaces nextId++
print(next(ticket_numbers), next(ticket_numbers))
```

## Rounding: `round()`, `floor`, `ceil`, `trunc`

:::compare
```js
Math.round(2.5);          // 3
Math.round(-2.5);         // -2 (ties go toward +Infinity)
Math.floor(-2.5);         // -3
Math.ceil(-2.5);          // -2
Math.trunc(-2.7);         // -2
(2.675).toFixed(2);       // "2.67"
```
```python
round(2.5)                # 2  (ties go to the even neighbour)
round(-2.5)               # -2
math.floor(-2.5)          # -3 (an int, not a float)
math.ceil(-2.5)           # -2
math.trunc(-2.7)          # -2 (int(-2.7) does the same)
round(2.675, 2)           # 2.67 (2.675 is really 2.67499999...)
```
:::

`round()` uses **round half to even**, also called banker's rounding: exact ties go to the even neighbour, so `round(0.5)` is `0`, `round(1.5)` is `2` and `round(2.5)` is `2`. It's the IEEE 754 default because it doesn't drift upward when you add up many rounded values. JS's `Math.round` breaks ties toward +∞ instead.

The return types differ from JS, where everything is a `number`. `round(x)` returns an **int**, while `round(x, ndigits)` keeps the input's type, so a float stays a float (`round(2.7, 0)` is `3.0`). `math.floor`, `math.ceil` and `math.trunc` return ints. A negative `ndigits` rounds to tens, hundreds and so on: `round(1234, -2)` is `1200`.

```python run
import math

print(f"{'x':>5} {'round':>6} {'floor':>6} {'ceil':>5} {'trunc':>6}")
for x in [0.5, 1.5, 2.5, -0.5, -1.5, -2.7]:
    print(f"{x:>5} {round(x):>6} {math.floor(x):>6} {math.ceil(x):>5} {math.trunc(x):>6}")

print(round(1234.5678, 2), round(1234.5678, -2), round(1234, -2))
print(type(round(2.5)), type(round(2.5, 1)))
```

:::gotcha `round()` isn't the rounding you learned at school
`round(2.5)` is `2` and `round(3.5)` is `4`. With `ndigits`, you're also rounding a binary float whose decimal value is rarely what you typed: `2.675` is stored as `2.67499999999999982236431605997495353221893310546875`, so `round(2.675, 2)` is `2.67`. For money or anything with legal rounding rules, use `Decimal` with an explicit rounding mode, covered below. For display, use a format spec (`f"{x:.2f}"`) and leave the value alone. If you need JS-style "ties toward +∞" on plain floats, `math.floor(x + 0.5)` does it for all but a few edge values.
:::

:::quiz output
What does this print?

```python
print(round(0.5) + round(1.5) + round(2.5))
```

- [ ] `6`
- [x] `4`
- [ ] `5`
- [ ] `3`

Ties round to the even neighbour: `0 + 2 + 2`. With `Math.round` it would be `1 + 2 + 3`.
:::

## `Math.*` → `math` and the builtins

:::compare
```js
Math.max(...latencies);          // spread the array into arguments
Math.max();                      // -Infinity
Math.abs(-3);                    // 3
latencies.reduce((a, b) => a + b, 0);
Math.sqrt(16);                   // 4
Math.PI;                         // 3.141592653589793
```
```python
max(latencies)                   # pass the iterable itself
max([], default=0)               # max([]) raises ValueError
abs(-3)                          # builtin, no import
sum(latencies)                   # builtin
math.sqrt(16)                    # 4.0, after `import math`
math.pi                          # 3.141592653589793
```
:::

Python splits JavaScript's `Math` object in two. The everyday operations are **builtins** that need no import: `abs`, `round`, `min`, `max`, `sum`, `pow` and `divmod`. Everything else lives in the `math` module, which works on real numbers and returns floats unless the table says otherwise.

`min`, `max` and `sum` take any **iterable** (a list, a tuple, a set, a generator, a dict's `.values()`), so there's nothing to spread. `min` and `max` also accept separate arguments, `max(a, b)`, plus a `key=` function and a `default=` for empty input (more in [map, filter, reduce → Comprehensions](lesson:map-filter-reduce)). `sum(xs, start)` adds from `start` instead of `0`.

```python run
import math

latencies = [120, 85, 98, 300, 101]
print(max(latencies), min(latencies), sum(latencies))
print(max(latencies, key=lambda ms: abs(ms - 100)))   # furthest from 100
print(math.prod([2, 3, 4]), math.comb(52, 5))         # 24, poker hands
print(math.gcd(84, 36), math.lcm(4, 6))               # 12 12
print(math.isqrt(10**20 + 1))                         # exact integer root
print(math.dist((0, 0), (3, 4)), math.hypot(1, 2, 2)) # 5.0 3.0
```

### The full `Math` map

| JavaScript | Python | Notes |
| --- | --- | --- |
| `Math.abs(x)` | `abs(x)` | builtin; keeps the type, so `abs(-3)` is the int `3` |
| `Math.max(a, b)`, `Math.max(...xs)` | `max(a, b)`, `max(xs)` | builtin; `key=`, and `default=` for empty input |
| `Math.min(a, b)`, `Math.min(...xs)` | `min(a, b)`, `min(xs)` | builtin |
| `Math.round(x)` | `round(x)` | builtin; ties to even, returns an int |
| `Math.floor(x)`, `Math.ceil(x)` | `math.floor(x)`, `math.ceil(x)` | return ints |
| `Math.trunc(x)` | `math.trunc(x)` or `int(x)` | return ints |
| `Math.sign(x)` | `(x > 0) - (x < 0)` | there's no `math.sign`; this gives `-1`, `0` or `1` |
| `Math.sqrt(x)` | `math.sqrt(x)` | `ValueError` for negatives; `math.isqrt(n)` for exact int roots |
| `Math.cbrt(x)` | `math.cbrt(x)` | 3.11+ |
| `Math.pow(b, e)` | `b ** e` or `pow(b, e)` | `math.pow` exists but always returns a float |
| `Math.exp(x)`, `Math.expm1(x)` | `math.exp(x)`, `math.expm1(x)` | also `math.exp2(x)` (3.11+) |
| `Math.log(x)` | `math.log(x)` | natural log; `math.log(x, base)` takes any base |
| `Math.log2(x)`, `Math.log10(x)`, `Math.log1p(x)` | `math.log2(x)`, `math.log10(x)`, `math.log1p(x)` | `ValueError` for 0 and negatives |
| `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2` | the same names in `math` | radians; `math.degrees()` and `math.radians()` convert |
| `Math.sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` | the same names in `math` | |
| `Math.hypot(...)` | `math.hypot(...)` | any number of coordinates; `math.dist(p, q)` between two points |
| `Math.PI`, `Math.E` | `math.pi`, `math.e` | plus `math.tau` (2π) |
| `Math.SQRT2`, `Math.SQRT1_2`, `Math.LN2`, `Math.LN10`, `Math.LOG2E`, `Math.LOG10E` | `math.sqrt(2)`, `math.log(2)`, ... | no predefined constants |
| `Math.random()` | `random.random()` | a separate module, see below |
| `Math.sumPrecise(xs)` | `math.fsum(xs)` | correctly rounded float sum |
| `Math.clz32(x)` | `32 - x.bit_length()` | for `0 <= x < 2**32` |
| `Math.imul(a, b)` | `(a * b) & 0xFFFFFFFF` | unsigned 32-bit result; JS's is signed |
| `Math.fround(x)` | `struct.unpack("f", struct.pack("f", x))[0]` | round to float32; rarely needed |

And the functions JavaScript doesn't have at all, all in `math`: `prod` (product of an iterable, `1` when empty), `fsum`, `isclose`, `factorial`, `comb` and `perm` (exact ints), `gcd` and `lcm` (any number of arguments), `isqrt`, `dist`, `sumprod` (a dot product, 3.12+), `fma` (fused multiply-add, 3.13+), `copysign`, `fmod`, `remainder`, `modf`, `frexp`, `ldexp`, `nextafter` and `ulp`.

:::gotcha Empty input and mixed types raise
`Math.max()` returns `-Infinity`, and `Math.max("10", 9)` coerces its way to `10`. Python's `max([])` raises `ValueError: max() iterable argument is empty` (pass `default=`), and `max("10", 9)` raises `TypeError` because a string and an int can't be compared.
:::

:::gotcha NaN poisons `min` and `max` depending on position
JS's `Math.max(NaN, 1)` is `NaN` in any argument order. Python's `max` just compares with `>`, every comparison with NaN is false, and so the answer depends on where the NaN sits: `max(float("nan"), 1)` is `nan`, but `max(1, float("nan"))` is `1`. Filter NaNs out first with `math.isnan`.
:::

:::note `sum()` of floats is compensated (3.12+)
Since Python 3.12, `sum()` uses Neumaier compensated summation for floats, so `sum([0.1] * 10)` is exactly `1.0`, where a JS `reduce` gives `0.9999999999999999`. `math.fsum` goes further and returns the correctly rounded sum. On 3.11 and earlier, `sum()` adds naively and matches the JS loop.
:::

## `inf`, `nan` and comparing floats

:::compare
```js
Infinity; -Infinity; NaN;
1 / 0;                           // Infinity
Math.sqrt(-1);                   // NaN
Number.isNaN(x);
Number.isFinite(x);
Math.abs(a - b) < Number.EPSILON;
```
```python
math.inf, -math.inf, math.nan    # or float("inf"), float("nan")
1 / 0                            # ZeroDivisionError
math.sqrt(-1)                    # ValueError
math.isnan(x)
math.isfinite(x)
math.isclose(a, b)
```
:::

The special values exist (it's IEEE 754, after all), but Python produces them far less often. Operations JS answers with `Infinity` or `NaN` usually raise: division by zero, `math.sqrt(-1)` and `math.log(0)` (`ValueError`), `math.exp(1000)` and `2.0 ** 10000` (`OverflowError`). You still get the special values from overflowing multiplication (`1e308 * 10` is `inf`), from arithmetic on `inf` itself, and from parsing: `float("inf")`, `float("-Infinity")` and `float("nan")` all work, case-insensitively.

NaN follows the IEEE rules: it isn't equal to anything, itself included, so test with `math.isnan(x)` rather than `x == math.nan`. Unlike in JS, it's also truthy ([Truthiness & Equality](lesson:truthiness-and-equality)). Neither converts to an int: `int(math.inf)` raises `OverflowError` and `int(math.nan)` raises `ValueError`.

```python run
import math

print(1e308 * 10, -1e308 * 10)        # overflow on * still gives inf
print(math.inf - math.inf)            # nan
nan = float("nan")
print(nan == nan, math.isnan(nan))    # False True
print(math.isfinite(1e308), math.isinf(float("-inf")))
print(sorted([3, nan, 1, 2]))         # NaN breaks sorting, silently
```

`math.isclose(a, b)` compares with a **relative** tolerance (`rel_tol=1e-09` by default), which scales with the size of the inputs. That's why it beats the JS habit of comparing against `Number.EPSILON`, a fixed gap that's only meaningful for numbers near 1.

:::gotcha `isclose` against zero needs `abs_tol`
A relative tolerance scaled by zero is zero, so `math.isclose(0.1 + 0.2 - 0.3, 0)` is `False`. Comparing against zero needs an absolute tolerance: `math.isclose(x, 0, abs_tol=1e-9)`.
:::

The rest of `Number`'s constants and predicates:

| JavaScript | Python | Notes |
| --- | --- | --- |
| `Number.isInteger(x)` | `isinstance(x, int)` | for a float holding a whole value: `x.is_integer()` |
| `Number.EPSILON` | `sys.float_info.epsilon` | `2.220446049250313e-16`; prefer `math.isclose` |
| `Number.MAX_VALUE` | `sys.float_info.max` | `1.7976931348623157e+308` |
| `Number.MIN_VALUE` | `math.ulp(0.0)` | `5e-324`. Not `sys.float_info.min`, the smallest *normal* float |
| `Number.MAX_SAFE_INTEGER` | (none) | ints are exact at any size |
| `Number.POSITIVE_INFINITY` | `math.inf` | also `float("inf")` |

## `0.1 + 0.2`: `Decimal` and `Fraction`

:::compare
```js
0.1 + 0.2;                    // 0.30000000000000004
0.1 + 0.2 === 0.3;            // false

// No built-in decimal type: use integer
// cents, or a library such as decimal.js
```
```python
0.1 + 0.2                     # 0.30000000000000004
0.1 + 0.2 == 0.3              # False

Decimal("0.1") + Decimal("0.2")   # Decimal('0.3')
Fraction(1, 3) + Fraction(1, 6)   # Fraction(1, 2)
```
:::

Same doubles, same `0.30000000000000004`. Python's float `repr` follows the same rule as JS (the shortest string that round-trips), so you'll even see identical digits. What Python adds is two exact types in the standard library. `decimal.Decimal` is base-10 arithmetic with configurable precision (28 significant digits by default) and a choice of rounding modes, which makes it the right tool for money: `amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` rounds to cents the way an invoice expects. `fractions.Fraction` is an exact rational, a pair of ints, with no rounding at all.

```python run
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction

price = Decimal("19.99")
print(price * 3 + Decimal("0.10"))                    # 60.07, exactly
cents = Decimal("0.01")
print(Decimal("2.675").quantize(cents, rounding=ROUND_HALF_UP))   # 2.68
print(Decimal(0.1))                                   # the float's true value
print(Fraction(1, 3) + Fraction(1, 6), Fraction("0.75"))
print(Fraction(1, 3) * 3 == 1)
```

:::gotcha Build a `Decimal` from a string, not a float
`Decimal(0.1)` faithfully converts the binary float you handed it, all 55 digits of `0.1000000000000000055511151231257827021181583404541015625`. Pass a string (`Decimal("0.1")`) or an int. The same goes for `Fraction("0.1")` versus `Fraction(0.1)`.
:::

:::note Mixing types
Both mix freely with ints. `Decimal` refuses floats in arithmetic (`Decimal("1.1") + 0.1` raises `TypeError`), because that would smuggle binary rounding error back in, while a `Fraction` plus a float quietly becomes a float. `Decimal("12px")` raises `decimal.InvalidOperation`, which is an `ArithmeticError`, not a `ValueError`, so an `except ValueError` won't catch it.
:::

## Parsing: strict `int()` and `float()`

:::compare
```js
parseInt("42px");          // 42 (stops at the first non-digit)
Number("42px");            // NaN
Number("");                // 0
parseInt("ff", 16);        // 255
parseFloat("3.14abc");     // 3.14
+"7";                      // 7
```
```python
int("42px")                # ValueError
int("42")                  # 42
int("")                    # ValueError
int("ff", 16)              # 255
float("3.14abc")           # ValueError
int("7")                   # 7 (+"7" is a TypeError)
```
:::

`int(s)` and `float(s)` are strict: the whole string must be a number. They forgive surrounding whitespace, a leading sign and underscores between digits (`int(" -1_000 ")` is `-1000`), and nothing else. Bad input raises `ValueError`, so there's no `NaN` to check for and no silent truncation at the first bad character. `int("3.5")` fails too, because `int()` parses integer syntax only; go through `float()` when the input may have a fractional part.

`int(s, base)` accepts bases 2 to 36, and `base=0` reads a prefix the way the parser reads literals: `int("0x1f", 0)` is `31`, `int("0b101", 0)` is `5`. Given a number rather than a string, `int()` truncates toward zero: `int(3.99)` is `3` and `int(-3.99)` is `-3`.

```python run
def parse_quantity(text):
    try:
        return int(text)
    except ValueError:
        return None

for raw in ["42", " 7\n", "-1_000", "42px", "3.5", "", "٤٢"]:
    print(repr(raw), "->", parse_quantity(raw))   # Unicode digits count
```

:::gotcha JS coercion tricks don't convert
`+"7"` raises `TypeError: bad operand type for unary +: 'str'`. And `"5" * 3` doesn't give `15`: it's `'555'`, because `*` on a string means repetition. Convert explicitly with `int()` or `float()`. [Variables, Types & Scope](lesson:variables-and-scope) covers strong typing in general.
:::

`Number.isInteger(3.0)` is `true` in JS because `3.0` *is* `3`. In Python `3.0` is a float, so `isinstance(3.0, int)` is `False`. To ask whether a float holds a whole value, call `(3.0).is_integer()`. Ints have the method too (3.12+), and it always returns `True`.

:::tip Lenient parsing, on purpose
If you really want `parseInt`'s "leading digits, ignore the rest" behaviour, say so with a regex: `re.match(r"\s*[-+]?\d+", text)`. Regular expressions are covered in [Strings & f-strings](lesson:strings).
:::

## Formatting: format specs instead of `toFixed`

:::compare
```js
x.toFixed(2);                 // "1234.57"
x.toPrecision(3);             // "1.23e+3"
x.toExponential(2);           // "1.23e+3"
n.toLocaleString("en-US");    // "1,234,567"
(10).toString(2);             // "1010"
(255).toString(16);           // "ff"
String(1e16);                 // "10000000000000000"
```
```python
f"{x:.2f}"                    # '1234.57'
f"{x:.3g}"                    # '1.23e+03'
f"{x:.2e}"                    # '1.23e+03'
f"{n:,}"                      # '1,234,567'
f"{10:b}"                     # '1010' (bin(10) is '0b1010')
f"{255:x}"                    # 'ff'   (hex(255) is '0xff')
str(1e16)                     # '1e+16'
```
:::

Each of `Number.prototype`'s formatting methods becomes a **format spec** after the colon in an f-string (or the second argument of `format(value, spec)`). The numeric presentation types are `f` (fixed, like `toFixed`), `e` (like `toExponential`), `g` (general, like `toPrecision`), `%` (percent, which multiplies by 100 first), `d` for ints, and `b`, `o`, `x` and `X` for other bases, where `#` adds the `0b`/`0o`/`0x` prefix. Before the precision, `,` or `_` groups thousands, `+` forces a sign, and a leading `0` zero-pads to the width. Fill, alignment and the rest of the grammar work as they do for strings, which [Strings & f-strings](lesson:strings) covers in full.

```python run
revenue = 1234567.891
growth = 0.0731
print(f"{revenue:,.2f}")            # 1,234,567.89
print(f"{revenue:>15,.0f}|")        # right-aligned in 15 columns
print(f"{growth:+.1%}")             # +7.3%
print(f"{7:03} {42:08b} {255:#x}")  # zero-padded, binary, prefixed hex
print(f"{1.5:.3g} {1.5:#.3g}")      # g drops trailing zeros unless you add #
print(str(1e16), str(1e15))         # exponent notation starts at 1e16
```

:::gotcha Floats always print with a decimal point
`print(10 / 2)` shows `5.0`, not `5`. A float's `str()` always has a fractional part or an exponent, and the exponent kicks in at `1e16` (JS waits until `1e21`). For output humans read, format explicitly with `f"{x:g}"` or `f"{x:.2f}"` instead of relying on `str()`.
:::

:::note Where the formats don't line up exactly
- Format specs round exact ties to even, like `round()`: `f"{0.125:.2f}"` is `'0.12'` and `f"{2.5:.0f}"` is `'2'`, where `toFixed` gives `"0.13"` and `"3"`.
- `toPrecision(3)` corresponds to `f"{x:#.3g}"`: plain `g` drops trailing zeros. `g` also switches to exponent notation below `1e-4`, while `toPrecision` keeps fixed notation down to `1e-6`.
- `,` always groups with commas. Locale-aware output like `toLocaleString("de-DE")` needs the `locale` module or the third-party Babel library.
- Only bases 2, 8, 10 and 16 are built in. There's no `toString(36)`, even though `int(s, 36)` parses base 36, and the last challenge fills that gap.
:::

:::quiz output
What does this print?

```python
print(f"{1234.5:,.0f}|{0.5:.0%}|{5:03}")
```

- [ ] `1,235|50%|005`
- [x] `1,234|50%|005`
- [ ] `1,234.5|0.5%|5`
- [ ] `1234|50%|500`

`1234.5` is an exact tie, and `.0f` rounds it to the even neighbour, `1234`. `%` multiplies by 100, and `03` zero-pads to width 3.
:::

## Bitwise operators, and `bool` is an `int`

:::compare
```js
5 & 3;  5 | 3;  5 ^ 3;  ~5;    // 1 7 6 -6
1 << 31;                       // -2147483648 (wrapped to 32 bits)
1 << 32;                       // 1 (shift count taken mod 32)
-1 >>> 0;                      // 4294967295
-1 >>> 28;                     // 15
7.9 | 0;                       // 7 (the truncation idiom)
```
```python
5 & 3, 5 | 3, 5 ^ 3, ~5        # (1, 7, 6, -6)
1 << 31                        # 2147483648
1 << 32                        # 4294967296
-1 & 0xFFFFFFFF                # 4294967295: mask instead of >>> 0
(-1 & 0xFFFFFFFF) >> 28        # 15
int(7.9)                       # 7 (7.9 | 0 raises TypeError)
```
:::

The operators are the same, minus `>>>`, but the model is different. JS converts both operands to 32-bit integers for every bitwise operation, which is why `1 << 31` goes negative and `x | 0` truncates. Python operates on its unbounded ints, which behave as if they had infinitely many sign bits, so nothing ever wraps. With no fixed width, there's nowhere for an unsigned shift to bring in zeros from: `>>>` doesn't exist, and `>>` on a negative number stays negative. To emulate 32-bit unsigned arithmetic, mask explicitly with `& 0xFFFFFFFF`. Floats don't support bitwise operators at all.

Python also fixes C's precedence wart: comparisons bind more loosely than `&`, `|` and `^`, so `flags & MASK == 0` means `(flags & MASK) == 0`, which is what you meant. In JS it means `flags & (MASK == 0)`.

```python run
READ, WRITE, EXEC = 0b100, 0b010, 0b001
mode = READ | WRITE
print(f"{mode:03b}", bool(mode & WRITE), bool(mode & EXEC))
print(mode & EXEC == 0)            # (mode & EXEC) == 0 -> True
print((255).bit_count(), (1024).bit_length())   # popcount (3.10+), width
print(-8 >> 1, ~0)                 # signs are preserved: -4 -1
print(f"{-5 & 0xFF:08b}")          # -5 as an 8-bit two's complement
```

For real sets of flags, `enum.Flag` gives you named, printable members ([Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums)).

`True` and `False` are instances of `bool`, which is a **subclass of `int`**: they're equal to `1` and `0`, and arithmetic on them works by design rather than by coercion. That makes `sum()` over a generator of conditions the idiomatic way to count.

```python run
scores = [72, 95, 88, 41, 67]
passed = sum(score >= 70 for score in scores)   # True counts as 1
print(passed, isinstance(True, int), True == 1)
print(True + True, True * 10, type(True + True))
```

:::gotcha `isinstance(x, int)` accepts booleans
Because `bool` subclasses `int`, `isinstance(True, int)` is `True`. When validating "is this a number?", decide whether `True` should pass, and exclude it with an `isinstance(x, bool)` check first (or test `type(x) is int`). [Truthiness & Equality](lesson:truthiness-and-equality) has the rest of the `bool` story.
:::

:::quiz output
What does this print?

```python
flags = 0b1010
print(flags & 0b10 == 0b10)
```

- [x] `True`
- [ ] `False`
- [ ] `0`
- [ ] `2`

`&` binds tighter than `==` in Python, so this is `(flags & 0b10) == 0b10`, which is `2 == 2`. JavaScript would evaluate `flags & (2 == 2)`, which is `10 & 1`, and print `0`.
:::

## `random` and `statistics`

:::compare
```js
Math.random();                          // [0, 1)
Math.floor(Math.random() * 6) + 1;      // 1 to 6
items[Math.floor(Math.random() * items.length)];
// shuffle: write Fisher-Yates yourself
// seeding: not possible
xs.reduce((a, b) => a + b, 0) / xs.length;
```
```python
random.random()                         # [0.0, 1.0)
random.randint(1, 6)                    # 1 to 6, both ends included
random.choice(items)
random.shuffle(items)                   # in place, returns None
random.seed(42)                         # reproducible sequences
statistics.mean(xs)
```
:::

`random` is a module of conveniences over a seedable Mersenne Twister: `random()`, `uniform(a, b)`, `randint`, `randrange`, `choice`, `choices` (with replacement, optional `weights=`), `sample` (without replacement), `shuffle` and `gauss`. `random.seed(n)` makes a run reproducible, which helps in tests and simulations and has no `Math.random` equivalent. None of it is cryptographically secure: for tokens and passwords use the `secrets` module, the counterpart of `crypto.getRandomValues` ([Batteries Included](lesson:standard-library)).

`statistics` covers what you'd otherwise install from npm: `mean`, `fmean`, `median`, `mode`, `multimode`, `stdev` (sample) and `pstdev` (population), `quantiles`, `correlation` and `linear_regression`. They accept any iterable, and an empty one raises `statistics.StatisticsError` rather than returning `NaN`.

```python run
import random
import statistics

random.seed(2024)                       # the same output on every run
rolls = [random.randint(1, 6) for _ in range(10)]
print(rolls)
print(random.choice(["red", "green", "blue"]), random.sample(range(100), 3))

latencies = [120, 85, 98, 300, 101, 95]
print(statistics.mean(latencies), statistics.median(latencies))
print(round(statistics.stdev(latencies), 1), statistics.quantiles(latencies, n=4))
```

:::gotcha `randint` includes the upper bound
`random.randint(1, 6)` can return `6`, while `random.randrange(1, 6)` can't, matching `range(1, 6)`. So `Math.floor(Math.random() * n)` ports to `random.randrange(n)`, and `random.randint(0, n)` is off by one.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `BigInt`, `Number.MAX_SAFE_INTEGER` | `int` | unbounded and exact |
| `7 / 2` | `7 / 2` | always a float: `6 / 2` is `3.0` |
| `Math.floor(a / b)` | `a // b` | floors toward −∞ |
| `((a % n) + n) % n` | `a % n` | takes the divisor's sign |
| `a % n` (sign of `a`) | `math.fmod(a, n)` | returns a float |
| `[Math.floor(a / b), a % b]` | `divmod(a, b)` | |
| `a ** b`, `Math.pow(a, b)` | `a ** b`, `pow(a, b)` | `pow(b, e, mod)` for modular |
| `i++`, `++i` | `i += 1` | `++i` is valid and does nothing |
| `x = ++i` | `x = (i := i + 1)` | names only |
| `Math.round(x)` | `round(x)` | ties to even, returns an int |
| `Math.floor(x)`, `Math.ceil(x)`, `Math.trunc(x)` | `math.floor(x)`, `math.ceil(x)`, `math.trunc(x)` | return ints |
| `Math.max(...xs)` | `max(xs)` | `default=` for empty input |
| `xs.reduce((a, b) => a + b, 0)` | `sum(xs)` | `math.fsum` for exact floats |
| `a === b` for floats | `math.isclose(a, b)` | `abs_tol=` near zero |
| `parseInt(s, 10)`, `Number(s)` | `int(s)` | strict: raises `ValueError` |
| `parseInt(s, 16)` | `int(s, 16)` | `int(s, 0)` reads prefixes |
| `x.toFixed(2)` | `f"{x:.2f}"` | ties to even |
| `n.toString(2)` | `f"{n:b}"` or `bin(n)` | `bin` adds `0b` |
| `n.toLocaleString()` | `f"{n:,}"` | not locale-aware |
| `a >>> 0` | `a & 0xFFFFFFFF` | no `>>>` |
| random int in `[a, b]` | `random.randint(a, b)` | inclusive at both ends |
| decimal.js | `decimal.Decimal("0.1")` | construct from strings |

## Challenges

:::challenge id=num-count-above title="Count without ++" difficulty=easy
The function below is JavaScript muscle memory. It runs without any error and always returns `0`. Fix `count_above(prices, threshold)` so it returns how many prices are **strictly greater** than `threshold`.

For bonus points, drop the loop and the counter: booleans are ints, so `sum()` can count for you.

```js
function countAbove(prices, threshold) {
  let count = 0;
  for (const price of prices) {
    if (price > threshold) ++count;
  }
  return count;
}
```

```python starter
def count_above(prices, threshold):
    count = 0
    for price in prices:
        if price > threshold:
            ++count
    return count
```

```python solution
def count_above(prices, threshold):
    return sum(price > threshold for price in prices)
```

```python tests
@test("counts prices above the threshold")
def _():
    eq(count_above([5, 12, 8, 30], 10), 2)

@test("strictly greater: equal prices don't count")
def _():
    eq(count_above([10, 10, 11], 10), 1)

@test("an empty list or no matches gives 0")
def _():
    eq(count_above([], 10), 0)
    eq(count_above([1, 2, 3], 10), 0)

@test("works with floats and negative thresholds")
def _():
    eq(count_above([-1.5, 0.0, 2.25], -2), 3)

@test("returns an int")
def _():
    check(type(count_above([20, 30], 10)) is int, "return an int count")

@test("no ++ or -- left in the code")
def _():
    doubled = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.UnaryOp)
        and isinstance(node.op, (ast.UAdd, ast.USub))
        and isinstance(node.operand, ast.UnaryOp)
        and type(node.operand.op) is type(node.op)
    ]
    check(not doubled, "++x is just +(+x): it never changes x")
```

```hint
`++count` parses as `+(+count)`. It computes a value and throws it away. What statement actually rebinds `count`?
```

```hint
`count += 1` fixes the loop. For the one-liner, `price > threshold` is a `bool`, and `True` is `1`: `sum(price > threshold for price in prices)`.
```
:::

:::challenge id=num-split-bill title="Split the bill" difficulty=medium
Write `split_bill(total_cents, people)` that splits an amount of money, in integer cents, into `people` shares. The shares must be ints, add up **exactly** to the total, and differ by at most one cent. Hand the leftover cents out one each, larger shares first. Raise `ValueError` if `people` is less than 1.

```text
split_bill(900, 3)    ->  [300, 300, 300]
split_bill(1000, 3)   ->  [334, 333, 333]
split_bill(2, 5)      ->  [1, 1, 0, 0, 0]
```

Stay in integer arithmetic. A solution that divides with `/` will fail the last test, because floats can't hold big totals exactly.

```js
function splitBill(totalCents, people) {
  if (people < 1) throw new RangeError("need at least one person");
  const share = Math.floor(totalCents / people);
  const extra = totalCents % people;
  return Array.from({ length: people }, (_, i) => share + (i < extra ? 1 : 0));
}
```

```python starter
def split_bill(total_cents, people):
    ...
```

```python solution
def split_bill(total_cents, people):
    if people < 1:
        raise ValueError("need at least one person")
    share, extra = divmod(total_cents, people)
    return [share + 1] * extra + [share] * (people - extra)
```

```python tests
@test("splits evenly when it can")
def _():
    eq(split_bill(900, 3), [300, 300, 300])

@test("leftover cents go one each, larger shares first")
def _():
    eq(split_bill(1000, 3), [334, 333, 333])
    eq(split_bill(1001, 4), [251, 250, 250, 250])

@test("more people than cents")
def _():
    eq(split_bill(2, 5), [1, 1, 0, 0, 0])

@test("shares always add up to the total")
def _():
    for total in (0, 1, 99, 12345):
        for people in (1, 2, 3, 7):
            eq(sum(split_bill(total, people)), total, f"split_bill({total}, {people})")

@test("shares are ints, never floats")
def _():
    check(all(type(s) is int for s in split_bill(1000, 3)), "use // or divmod, not /")

@test("fewer than one person raises ValueError")
def _():
    raises(ValueError, split_bill, 100, 0)

@test("huge totals stay exact")
def _():
    eq(split_bill(10**20 + 3, 2), [5 * 10**19 + 2, 5 * 10**19 + 1])
```

```hint
`divmod(1000, 3)` is `(333, 1)`: everyone gets 333, and 1 cent is left over for the first person.
```

```hint
List repetition builds the result without a loop: `[share + 1] * extra + [share] * (people - extra)`.
```
:::

:::challenge id=num-to-base title="toString(36) for Python" difficulty=hard
JavaScript's `n.toString(radix)` handles any base from 2 to 36. Python only has `bin`, `oct`, `hex` and the matching format types, even though `int(s, 36)` can parse base 36. Write the missing half: `to_base(n, base)` returns `n` as a string in `base`, using the digits `0-9` and then lowercase `a-z`.

- `0` is `"0"` in every base.
- Negative numbers get a leading `-`, like `(-255).toString(16)`.
- A base outside 2 to 36 raises `ValueError`.
- It must be exact for ints of any size, where JS would need a `BigInt`.

```text
to_base(255, 16)    ->  "ff"
to_base(255, 36)    ->  "73"
to_base(-10, 2)     ->  "-1010"
```

```js
(255).toString(16);          // "ff"
(-10).toString(2);           // "-1010"
(2n ** 200n).toString(36);   // BigInt, to stay exact
```

```python starter
def to_base(n, base):
    ...
```

```python solution
import string

DIGITS = string.digits + string.ascii_lowercase


def to_base(n, base):
    if not 2 <= base <= 36:
        raise ValueError("base must be between 2 and 36")
    if n == 0:
        return "0"
    sign = "-" if n < 0 else ""
    n = abs(n)
    digits = []
    while n:
        n, digit = divmod(n, base)
        digits.append(DIGITS[digit])
    return sign + "".join(reversed(digits))
```

```python tests
@test("matches the built-in bases")
def _():
    for n in (1, 7, 255, 1024, 123456789):
        eq(to_base(n, 2), f"{n:b}")
        eq(to_base(n, 8), f"{n:o}")
        eq(to_base(n, 16), f"{n:x}")
        eq(to_base(n, 10), str(n))

@test("uses lowercase letters for digits above 9")
def _():
    eq(to_base(35, 36), "z")
    eq(to_base(255, 36), "73")

@test("zero is '0' in every base")
def _():
    eq(to_base(0, 2), "0")
    eq(to_base(0, 36), "0")

@test("negative numbers get a leading minus")
def _():
    eq(to_base(-255, 16), "-ff")
    eq(to_base(-10, 2), "-1010")

@test("round-trips through int(s, base), even for huge ints")
def _():
    big = 2**200 + 12345
    for base in (2, 3, 7, 16, 36):
        eq(int(to_base(big, base), base), big, f"base {base}")

@test("bases outside 2 to 36 raise ValueError")
def _():
    raises(ValueError, to_base, 10, 1)
    raises(ValueError, to_base, 10, 37)
```

```hint
`divmod(n, base)` splits off the last digit: the remainder is the digit, and the quotient is what's left to convert. Repeat until the quotient is 0.
```

```hint
The digits come out least significant first, so collect them in a list and reverse at the end. `string.digits + string.ascii_lowercase` is the 36-character alphabet, and indexing it turns a digit value into a character.
```

```hint
Handle the sign once, up front: remember whether `n` was negative, then work with `abs(n)`.
```
:::
