---
title: Build an Event-Sourced Ledger
part: Apps & Data
summary: Store deposits, withdrawals and transfers as immutable events, then derive balances by replaying them.
minutes: 75
---

Most apps store the current state and overwrite it: `UPDATE accounts SET balance = 70`. An event-sourced app stores **what happened** instead, as an append-only log of facts, and computes the current state by replaying them. If you've written a Redux reducer, you already know the core move, `(state, action) => newState`. If you've used git, you know the payoff: the full history, audits for free, and an undo that never destroys anything.

In this project you'll build a small bank ledger that way. It leans on three things Python has and JavaScript doesn't: frozen dataclasses for immutable values, `match` for dispatching on them, and exception classes that carry structured details.

## What you'll build

A `Ledger` that records events, refuses the ones that break the rules, prints per-account statements, reverts mistakes by appending compensating events, and saves to (and replays from) a JSON-lines log. This is the finished API in use:

```python
ledger = Ledger()
ledger.record(Deposit("alice", 10_000))      # amounts are whole cents
ledger.record(Deposit("bob", 2_500))
ledger.record(Transfer("alice", "bob", 3_000))
ledger.record(Withdrawal("bob", 1_000))

try:
    ledger.record(Withdrawal("bob", 99_999))
except InsufficientFundsError as err:
    print("Refused:", err)

ledger.revert(2)                             # the transfer was a mistake
print(ledger.statement("bob"))

log = to_jsonl(ledger.events)                # the log is the source of truth...
print(Ledger(from_jsonl(log)).balances)      # ...so replaying it rebuilds everything
```

```output
Refused: bob has $45.00, can't take $999.99
Statement for bob
#1   deposit                   $25.00    $25.00
#2   transfer from alice       $30.00    $55.00
#3   withdrawal               -$10.00    $45.00
#4   transfer to alice        -$30.00    $15.00
Balance: $15.00
{'alice': 10000, 'bob': 1500}
```

Notice what's missing: there's no `balance -= amount` anywhere. Balances are a *projection* of the log, and `revert(2)` doesn't delete event 2. It records a fifth event that cancels it out, which is why bob's statement shows the transfer going back.

:::deep Spoiler: run the finished ledger
Every step below builds one piece of this file. Open it if you'd like to poke at the final version before you start.

```python run
import json
from dataclasses import asdict, dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries

    def revert(self, index: int = -1) -> Event:
        """Cancel events[index] by recording its inverse. Returns the new event."""
        try:
            original = self._events[index]
        except IndexError:
            raise LedgerError(f"no event at index {index}") from None
        compensation = inverse(original)
        self.record(compensation)
        return compensation

    def statement(self, account: str) -> str:
        """A printable history of one account."""
        lines = [f"Statement for {account}"]
        for index, event, change, balance in self.history(account):
            label = describe(event, account)
            lines.append(f"#{index:<4}{label:<22}{money(change):>10}{money(balance):>10}")
        lines.append(f"Balance: {money(self.balances.get(account, 0))}")
        return "\n".join(lines)


EVENT_TYPES = {cls.__name__.lower(): cls for cls in (Deposit, Withdrawal, Transfer)}


def to_jsonl(events) -> str:
    """One JSON object per line, tagged with the event's type."""
    return "".join(
        json.dumps({"type": type(event).__name__.lower(), **asdict(event)}) + "\n"
        for event in events
    )


def from_jsonl(text: str) -> list[Event]:
    """Parse a JSON-lines log back into events, skipping blank lines."""
    events = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            match json.loads(line):
                case {"type": str(kind), **data} if kind in EVENT_TYPES:
                    events.append(EVENT_TYPES[kind](**data))
                case _:
                    raise LedgerError(f"line {number}: not an event: {line}")
        except (json.JSONDecodeError, TypeError) as err:
            raise LedgerError(f"line {number}: {err}") from err
    return events


def inverse(event: Event) -> Event:
    """The compensating event that cancels `event` out."""
    match event:
        case Deposit(account, amount):
            return Withdrawal(account, amount)
        case Withdrawal(account, amount):
            return Deposit(account, amount)
        case Transfer(source, target, amount):
            return Transfer(target, source, amount)
        case _:
            raise TypeError(f"not an event: {event!r}")


def describe(event: Event, account: str) -> str:
    """How a statement labels `event`, from `account`'s point of view."""
    match event:
        case Deposit():
            return "deposit"
        case Withdrawal():
            return "withdrawal"
        case Transfer(source, target, _) if source == account:
            return f"transfer to {target}"
        case Transfer(source, _, _):
            return f"transfer from {source}"
        case _:
            raise TypeError(f"not an event: {event!r}")


ledger = Ledger()
ledger.record(Deposit("alice", 10_000))      # amounts are whole cents
ledger.record(Deposit("bob", 2_500))
ledger.record(Transfer("alice", "bob", 3_000))
ledger.record(Withdrawal("bob", 1_000))

try:
    ledger.record(Withdrawal("bob", 99_999))
except InsufficientFundsError as err:
    print("Refused:", err)

ledger.revert(2)                             # the transfer was a mistake
print(ledger.statement("bob"))

log = to_jsonl(ledger.events)                # the log is the source of truth...
print(Ledger(from_jsonl(log)).balances)      # ...so replaying it rebuilds everything
```
:::

## How the pieces fit

```text
  Deposit / Withdrawal / Transfer       immutable facts                 (step 1)
                 │
                 ▼
  validate(balances, event)             refuses bad events              (step 3)
                 │
                 ▼
  Ledger.record(event) ──► the log ──► to_jsonl() / from_jsonl()        (step 5)
                 │            │
                 │            └──► history(), statement(), revert()     (steps 4 and 6)
                 ▼
  apply(balances, event)                a pure reducer                  (step 2)
```

| Step | You build | Python you'll use |
| --- | --- | --- |
| 1 | `Deposit`, `Withdrawal`, `Transfer`, `money()` | frozen dataclasses, `divmod`, format specs |
| 2 | `changes()`, `apply()`, `replay()` | class patterns, dict `\|`, `functools.reduce` |
| 3 | `LedgerError` and subclasses, `validate()` | custom exceptions, guards, or-patterns |
| 4 | `Ledger`, `history()` | `@property`, `NamedTuple`, per-instance state |
| 5 | `to_jsonl()`, `from_jsonl()` | `json`, `asdict()`, mapping patterns, `raise ... from` |
| 6 | `inverse()`, `revert()`, `statement()` | compensating events, f-string alignment |

Each step's starter contains the finished code from every earlier step, so you can start anywhere. The tests focus on the new piece, and the last step's tests run the whole lifecycle.

## Step 1: Events are values

:::compare
```ts
type Event =
  | { type: "deposit"; account: string; amount: number }
  | { type: "withdrawal"; account: string; amount: number }
  | { type: "transfer"; source: string; target: string; amount: number };

const event: Event = Object.freeze({
  type: "deposit", account: "alice", amount: 500,
});
```
```python
@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


# Withdrawal and Transfer look the same

type Event = Deposit | Withdrawal | Transfer   # 3.12+

event = Deposit("alice", 500)
```
:::

In TypeScript you'd tag plain objects with a `type` string and freeze them. In Python each kind of event gets its own class, so the class *is* the tag: there's no string to keep in sync, and the next step's `match` dispatches on it directly. `@dataclass` gives events value equality, and `frozen=True` makes them immutable, which suits facts that have already happened, and hashable ([Frozen dataclasses](lesson:dataclasses-and-enums#frozen-dataclasses)). The `type Event = ...` statement (3.12+) is the counterpart of a TS union alias. It's for readers and type checkers only: nothing enforces it at runtime.

Amounts are **whole cents**, for the reason you already know from JavaScript: `0.1 + 0.2` isn't `0.3` in either language. Python's `int` has no size limit, so there's no `Number.MAX_SAFE_INTEGER` to outgrow and no `BigInt` to switch to ([Numbers & Math](lesson:numbers-and-math#int-float-and-complex)). Floats sneak back in when you format, though. `(cents / 100).toFixed(2)` divides into a float first. Split the cents with `divmod` and format the two ints instead:

```python run
cents = 123456
dollars, rest = divmod(cents, 100)
print(f"${dollars:,}.{rest:02}")          # thousands separator, zero-padded cents

huge = 2**53 + 1
print(f"${huge / 100:,.2f}")              # float division: a cent off
print(f"${huge // 100:,}.{huge % 100:02}")
```

:::quiz output
`money()` has to handle negative amounts too. What does this print?

```python
print(divmod(-250, 100))
```

- [ ] `(-2, -50)`
- [x] `(-3, 50)`
- [ ] `(-2, 50)`

`//` floors toward negative infinity and `%` takes the sign of the divisor, so -250 cents splits into -3 dollars plus 50 cents. That's correct arithmetic and useless for display, which is why `money()` formats `abs(cents)` and puts the sign in front itself. See [Division](lesson:numbers-and-math#division-and-divmod).
:::

:::challenge id=ledger-step-1 title="Step 1: Events and money" difficulty=easy
Fill in the three event classes as frozen dataclasses with these fields, in this order:

| Class | Fields |
| --- | --- |
| `Deposit` | `account: str`, `amount: int` |
| `Withdrawal` | `account: str`, `amount: int` |
| `Transfer` | `source: str`, `target: str`, `amount: int` |

Then write `money(cents)`. It formats whole cents as dollars with a thousands separator, and puts the minus sign of a negative amount in front of the dollar sign:

```text
money(123456)  ->  "$1,234.56"
money(5)       ->  "$0.05"
money(-250)    ->  "-$2.50"
```

Don't divide by 100: that makes a float, and one test uses an amount too large for a float to hold exactly.

```js
const money = (cents) =>
  (cents < 0 ? "-$" : "$") +
  (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
```

```python starter
from dataclasses import dataclass


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    ...  # TODO: account (str), amount (int)


@dataclass(frozen=True)
class Withdrawal:
    ...  # TODO: account (str), amount (int)


@dataclass(frozen=True)
class Transfer:
    ...  # TODO: source (str), target (str), amount (int)


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    ...
```

```python solution
from dataclasses import dataclass


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"
```

```python tests
from dataclasses import FrozenInstanceError, fields


@test("events are built positionally and compared by value")
def _():
    eq(Deposit("alice", 500), Deposit("alice", 500))
    check(Deposit("alice", 500) != Deposit("alice", 501), "different amounts shouldn't be equal")
    move = Transfer("alice", "bob", 300)
    eq((move.source, move.target, move.amount), ("alice", "bob", 300))

@test("fields are declared in the documented order")
def _():
    eq([f.name for f in fields(Deposit)], ["account", "amount"])
    eq([f.name for f in fields(Withdrawal)], ["account", "amount"])
    eq([f.name for f in fields(Transfer)], ["source", "target", "amount"])

@test("a deposit never equals a withdrawal with the same fields")
def _():
    check(Deposit("alice", 500) != Withdrawal("alice", 500), "events of different classes should differ")

@test("events are frozen")
def _():
    deposit = Deposit("alice", 500)
    raises(FrozenInstanceError, setattr, deposit, "amount", 1_000_000)
    eq(deposit.amount, 500)

@test("events are hashable, so equal events dedupe in a set")
def _():
    eq(len({Deposit("alice", 500), Deposit("alice", 500), Withdrawal("alice", 500)}), 2)

@test("money() formats cents as dollars")
def _():
    eq(money(0), "$0.00")
    eq(money(5), "$0.05")
    eq(money(1999), "$19.99")
    eq(money(123456), "$1,234.56")

@test("money() puts the minus sign before the dollar sign")
def _():
    eq(money(-5), "-$0.05")
    eq(money(-250_000), "-$2,500.00")

@test("money() stays exact for huge amounts")
def _():
    eq(money(2**53 + 1), "$90,071,992,547,409.93", "dividing by 100 makes a float and loses the last cent")
```

```hint
An event class needs nothing but `@dataclass(frozen=True)` and its annotated fields: `account: str` on one line, `amount: int` on the next.
```

```hint
`divmod(abs(cents), 100)` gives you the dollars and the leftover cents as two ints. Format them with `f"{dollars:,}"` and `f"{rest:02}"`.
```
:::

## Step 2: Apply events with `match`

:::compare
```js
function changes(event) {
  switch (event.type) {
    case "deposit": {
      const { account, amount } = event;
      return { [account]: amount };
    }
    case "transfer": {
      const { source, target, amount } = event;
      return { [source]: -amount, [target]: amount };
    }
    default:
      throw new TypeError(`not an event: ${event}`);
  }
}
```
```python
def changes(event):
    match event:
        case Deposit(account, amount):

            return {account: amount}

        case Transfer(source, target, amount):

            return {source: -amount, target: amount}

        # ...withdrawals, then a catch-all
        case _:
            raise TypeError(f"not an event: {event!r}")


```
:::

The heart of the ledger is a reducer: old balances in, new balances out. Split it in two. `changes(event)` answers "how much does each account move?", and `apply(balances, event)` merges those changes into the balances. The split pays off in step 4, where `history()` reuses `changes()`.

`case Deposit(account, amount):` does the `switch` and the destructuring at once. It checks `isinstance(event, Deposit)`, then binds the fields positionally, in the order `@dataclass` recorded in `__match_args__` ([Class patterns](lesson:pattern-matching#class-patterns)). End with a `case _:` that raises. A Redux reducer returns unknown actions unchanged because every reducer sees every action, but here an unknown event is a bug, so fail loudly.

`apply()` must not mutate. The dict union operator `|` builds a new dict in which the right-hand side wins on shared keys, and `.get(account, 0)` starts a new account at zero ([Adding, updating and removing](lesson:dicts#adding-updating-and-removing)):

```python run
balances = {"alice": 1000, "carol": 50}
print(balances | {"alice": 700, "bob": 300})   # a new dict: the right side wins
print(balances)                                 # untouched
print(balances.get("bob", 0))                   # unknown accounts start at zero
```

`replay(events)` is a fold over the log, which makes it one of the rare places where `functools.reduce` is the clearest tool: the reducer already has a name ([When `reduce` is the right tool](lesson:map-filter-reduce#when-reduce-is-the-right-tool)). Mind the argument order. JavaScript's `events.reduce(apply, {})` becomes `reduce(apply, events, {})`, with the function first.

:::tip Pure functions make replay trustworthy
Because `apply()` never mutates, the same log always replays to the same balances, and replaying the first *n* events gives you the balances as they were at that moment: time travel for free. The price is a dict copy per event. Real event stores fold into a private mutable accumulator, or save snapshots and replay only the events after the latest one.
:::

:::challenge id=ledger-step-2 title="Step 2: A reducer for events" difficulty=easy
Write the three functions:

- `changes(event)` returns `{account: delta}` for every account the event touches. A deposit adds to its account, a withdrawal subtracts, and a transfer subtracts from `source` and adds to `target`. Use `match` with class patterns, and raise `TypeError` for anything that isn't an event, such as a JS-style `{"type": "deposit", ...}` dict.
- `apply(balances, event)` returns a **new** dict with those changes added. Accounts that don't exist yet start at 0, and `balances` itself must not change.
- `replay(events)` folds any iterable of events into balances, starting from `{}`.

Don't validate anything yet: for now a withdrawal can take an account below zero. Step 3 adds the rules.

```js
const apply = (balances, event) => {
  const next = { ...balances };
  for (const [account, delta] of Object.entries(changes(event))) {
    next[account] = (next[account] ?? 0) + delta;
  }
  return next;
};
const replay = (events) => events.reduce(apply, {});
```

```python starter
from dataclasses import dataclass
from functools import reduce


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    ...


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    ...


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    ...
```

```python solution
from dataclasses import dataclass
from functools import reduce


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})
```

```python tests
@test("changes() for each kind of event")
def _():
    eq(changes(Deposit("alice", 500)), {"alice": 500})
    eq(changes(Withdrawal("alice", 200)), {"alice": -200})
    eq(changes(Transfer("alice", "bob", 300)), {"alice": -300, "bob": 300})

@test("changes() rejects anything that isn't an event")
def _():
    raises(TypeError, changes, {"type": "deposit", "account": "alice", "amount": 500})
    raises(TypeError, changes, None)

@test("apply() returns new balances and leaves the old ones alone")
def _():
    before = {"alice": 1000}
    after = apply(before, Withdrawal("alice", 300))
    eq(after, {"alice": 700})
    eq(before, {"alice": 1000}, "apply() mutated its input")

@test("apply() starts unseen accounts at zero and keeps the others")
def _():
    eq(apply({"carol": 50}, Transfer("alice", "bob", 300)), {"carol": 50, "alice": -300, "bob": 300})

@test("replay() folds events into balances")
def _():
    events = [Deposit("alice", 1000), Deposit("bob", 200), Transfer("alice", "bob", 300), Withdrawal("bob", 100)]
    eq(replay(events), {"alice": 700, "bob": 400})

@test("replay() of no events is no balances")
def _():
    eq(replay([]), {})

@test("replay() accepts any iterable, such as a generator")
def _():
    eq(replay(Deposit("alice", cents) for cents in (1, 2, 3)), {"alice": 6})

@test("changes() dispatches with match")
def _():
    requires_syntax(ast.Match, "use match/case with class patterns such as Deposit(account, amount)")
```

```hint
`case Withdrawal(account, amount):` binds both fields. Return `{account: -amount}`.
```

```hint
A dict comprehension builds the updated entries: `{account: balances.get(account, 0) + change for account, change in changes(event).items()}`. Merge it into a copy with `balances | ...`.
```

```hint
`reduce(apply, events, {})` calls `apply({}, first)`, then `apply(result, second)`, and so on.
```
:::

## Step 3: Refuse bad events

Events are facts, and you don't argue with facts after they're recorded. So validation happens on the way **in**, before an event joins the log, and that's also why `apply()` doesn't check anything. Validation needs the current balances to spot an overdraft, so it can't live in the dataclass's `__post_init__`. It gets its own function.

Give the ledger its own exception family. One base class lets callers catch everything the ledger refuses with a single `except LedgerError:`, and subclasses carry the details as attributes, so a handler never has to parse a message. Pass the message up with `super().__init__(message)` and Python's tracebacks print it, with no `this.name = ...` boilerplate ([Custom exceptions](lesson:exceptions#custom-exceptions)).

:::compare
```js
try {
  ledger.record(withdrawal);
} catch (err) {
  if (err instanceof InsufficientFundsError) {
    notify(err.account, err.amount - err.balance);
  } else if (err instanceof LedgerError) {
    reject(err.message);
  } else {
    throw err;
  }
}
```
```python
try:
    ledger.record(withdrawal)

except InsufficientFundsError as err:

    notify(err.account, err.amount - err.balance)
except LedgerError as err:

    reject(str(err))
# anything else propagates on its own


```
:::

Inside `validate()`, `match` earns its keep twice. A **guard** (`case Transfer(source, target, _) if source == target:`) adds a condition to a pattern. An **or-pattern** handles two event types in one case, as long as both alternatives bind the same names. That's how one overdraft check can cover a withdrawal's `account` and a transfer's `source` ([Guards and `as`](lesson:pattern-matching#guards-and-as)). Here's the same shape on different data:

```python run
from dataclasses import dataclass

@dataclass(frozen=True)
class Email:
    address: str

@dataclass(frozen=True)
class Sms:
    number: str
    country: str

def recipient(message):
    match message:
        case Sms(number, country) if country != "US":
            return f"international {number}"
        case Email(to) | Sms(to, _):      # both alternatives bind `to`
            return to

print(recipient(Email("ada@example.com")))
print(recipient(Sms("555-0100", "US")))
print(recipient(Sms("020 7946 0000", "GB")))
```

:::quiz output
Why refuse a transfer from an account to itself? Here's what `changes()` from step 2 returns for one:

```python
source = target = "alice"
print({source: -300, target: 300})
```

- [ ] `{'alice': 0}`
- [x] `{'alice': 300}`
- [ ] `{'alice': -300}`
- [ ] `ValueError`

When a dict display repeats a key, the **last** value wins, as in a JS object literal. A self-transfer would mint $3.00 out of nothing, so `validate()` stops it before it reaches `apply()`.
:::

:::note `True` is a valid amount
`bool` is a subclass of `int`, so `isinstance(True, int)` is `True` and `Deposit("alice", True)` passes as one cent ([`bool` is an `int`](lesson:numbers-and-math#bitwise-operators-and-bool-is-an-int)). `type(amount) is int` closes that hole, at the cost of also refusing other `int` subclasses such as `IntEnum` members.
:::

:::challenge id=ledger-step-3 title="Step 3: Refuse bad events" difficulty=medium
Write the validation layer. `LedgerError` is already there.

- `InvalidAmountError(amount)` keeps the bad value as `.amount`.
- `InsufficientFundsError(account, balance, amount)` keeps all three as attributes, and its message reads `"bob has $5.00, can't take $10.00"` (use `money()`).
- `validate(balances, event)` returns `None` for a valid event and raises:
  - `InvalidAmountError` unless the amount is a positive `int`, so `0`, `-5`, `10.5` and `"100"` are all refused,
  - `LedgerError` for a transfer from an account to itself,
  - `InsufficientFundsError` when a withdrawal or a transfer takes more than the paying account holds. An account that doesn't exist yet holds 0, and taking exactly the balance is fine.

Both subclasses derive from `LedgerError`. Pass each message to `super().__init__()` so that `str(err)` shows it.

```js
class InsufficientFundsError extends LedgerError {
  constructor(account, balance, amount) {
    super(`${account} has ${money(balance)}, can't take ${money(amount)}`);
    Object.assign(this, { account, balance, amount });
  }
}
```

```python starter
from dataclasses import dataclass
from functools import reduce


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    ...  # TODO: keep the bad value as .amount


class InsufficientFundsError(LedgerError):
    ...  # TODO: keep .account, .balance and .amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    ...
```

```python solution
from dataclasses import dataclass
from functools import reduce


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)
```

```python tests
@test("valid events pass silently")
def _():
    eq(validate({}, Deposit("alice", 500)), None)
    eq(validate({"alice": 500}, Withdrawal("alice", 500)), None)
    eq(validate({"alice": 500}, Transfer("alice", "bob", 200)), None)

@test("zero and negative amounts raise InvalidAmountError")
def _():
    for amount in (0, -100):
        err = raises(InvalidAmountError, validate, {"alice": 1000}, Deposit("alice", amount))
        eq(err.amount, amount)

@test("floats and strings aren't cents either")
def _():
    for amount in (10.5, 100.0, "100"):
        err = raises(InvalidAmountError, validate, {"alice": 1000}, Withdrawal("alice", amount))
        eq(err.amount, amount)

@test("overdrawing raises InsufficientFundsError with the details")
def _():
    err = raises(InsufficientFundsError, validate, {"bob": 500}, Withdrawal("bob", 1000))
    eq((err.account, err.balance, err.amount), ("bob", 500, 1000))
    eq(str(err), "bob has $5.00, can't take $10.00")

@test("transfers can overdraw too, and unknown accounts hold $0.00")
def _():
    err = raises(InsufficientFundsError, validate, {"alice": 100}, Transfer("alice", "bob", 101))
    eq(err.account, "alice")
    err = raises(InsufficientFundsError, validate, {}, Withdrawal("carol", 1))
    eq(err.balance, 0)

@test("a transfer to the same account is refused")
def _():
    raises(LedgerError, validate, {"alice": 1000}, Transfer("alice", "alice", 100))

@test("every refusal is a LedgerError")
def _():
    check(issubclass(LedgerError, Exception), "LedgerError should subclass Exception")
    check(issubclass(InvalidAmountError, LedgerError), "InvalidAmountError should subclass LedgerError")
    check(issubclass(InsufficientFundsError, LedgerError), "InsufficientFundsError should subclass LedgerError")

@test("validate() never changes the balances")
def _():
    balances = {"alice": 100}
    validate(balances, Deposit("alice", 50))
    raises(InsufficientFundsError, validate, balances, Withdrawal("alice", 500))
    eq(balances, {"alice": 100})
```

```hint
Check the amount before the `match`: `if not isinstance(event.amount, int) or event.amount <= 0:`. The `or` short-circuits, so `"100" <= 0` is never evaluated.
```

```hint
Put the self-transfer case first, with a guard. Then `case Withdrawal(account, amount) | Transfer(account, _, amount):` covers both ways of taking money out.
```
:::

## Step 4: The ledger and its projections

:::compare
```js
class Ledger {
  #events = [];
  balances = {};

  get events() {
    return Object.freeze([...this.#events]);
  }

  record(event) {
    validate(this.balances, event);
    this.balances = apply(this.balances, event);
    this.#events.push(event);
  }
}
```
```python
class Ledger:
    def __init__(self, events=()):
        self._events = []
        self.balances = {}
        ...

    @property
    def events(self):
        return tuple(self._events)

    def record(self, event):
        validate(self.balances, event)
        ...


```
:::

Now wrap it all in a class. A `Ledger` owns two things: the list of events, which is the source of truth, and the current balances, a **projection** of that list that `record()` keeps up to date. You could compute balances with `replay(self.events)` on every read; keeping them is an optimization, and one test checks that the two always agree.

`record()` validates first and changes state last, so a refused event leaves no trace. The log lives in `_events`, private by convention ([Privacy by convention](lesson:classes#privacy-by-convention)), and the public `events` property hands out a tuple. A caller who tries `ledger.events.append(...)` gets an `AttributeError` instead of quietly skipping validation. The constructor takes `events=()`, an immutable default, which sidesteps the mutable-default trap ([Defaults are evaluated once](lesson:functions#defaults-are-evaluated-once)).

:::gotcha A JS class field is not a Python class attribute
`#events = []` in a JS class body creates a fresh array for every instance. `_events = []` in a Python class body creates **one** list, stored on the class, and every ledger appends to it. Create per-instance state in `__init__` with `self._events = []`. See [Class attributes vs instance attributes](lesson:classes#class-attributes-vs-instance-attributes).
:::

A projection doesn't have to be a dict of totals. `history(account)` is another one: an account's statement lines, rebuilt from the log on demand. Return each row as a `NamedTuple`, which unpacks and compares like a plain tuple but also has named fields ([`NamedTuple`: a tuple with names](lesson:dataclasses-and-enums#namedtuple-a-tuple-with-names)):

```python run
from typing import NamedTuple

class Line(NamedTuple):
    sku: str
    qty: int

line = Line("tea", 2)
sku, qty = line                        # unpacks like a tuple
print(line.qty, line == ("tea", 2))    # named access, tuple equality
print(line)
```

:::challenge id=ledger-step-4 title="Step 4: The Ledger class" difficulty=medium
Finish the `Ledger` class:

- `Ledger(events=())` starts empty and records each of `events` in order, so building a ledger from a log validates the log.
- `events` is a property that returns the log as a tuple.
- `record(event)` validates the event against the current balances, letting any `LedgerError` propagate, then updates `balances` with `apply()` and appends the event. A refused event must change nothing.
- `history(account)` returns an `Entry(index, event, change, balance)` for every event that touched `account`, in log order: the event's position in the log, the event itself, how much it moved this account, and the account's balance after it. `changes()` from step 2 tells you both whether an event touched the account and by how much.

```js
history(account) {
  let balance = 0;
  return this.#events.flatMap((event, index) => {
    const delta = changes(event)[account];
    if (delta === undefined) return [];
    balance += delta;
    return [{ index, event, change: delta, balance }];
  });
}
```

```python starter
from dataclasses import dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        # TODO: record each of `events`

    @property
    def events(self) -> tuple[Event, ...]:
        ...  # TODO: a read-only copy of the log

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        ...

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        ...
```

```python solution
from dataclasses import dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries
```

```python tests
@test("record() appends the event and updates the balances")
def _():
    ledger = Ledger()
    ledger.record(Deposit("alice", 1000))
    ledger.record(Transfer("alice", "bob", 400))
    eq(ledger.events, (Deposit("alice", 1000), Transfer("alice", "bob", 400)))
    eq(ledger.balances, {"alice": 600, "bob": 400})

@test("a refused event changes nothing")
def _():
    ledger = Ledger([Deposit("alice", 1000)])
    raises(InsufficientFundsError, ledger.record, Withdrawal("alice", 5000))
    raises(InvalidAmountError, ledger.record, Deposit("alice", -1))
    eq(ledger.events, (Deposit("alice", 1000),))
    eq(ledger.balances, {"alice": 1000})

@test("events is a tuple, so nobody can append behind record()'s back")
def _():
    ledger = Ledger([Deposit("alice", 1000)])
    check(isinstance(ledger.events, tuple), f"expected a tuple, got {type(ledger.events).__name__}")

@test("the constructor records, and so validates, every event")
def _():
    eq(Ledger([Deposit("alice", 1000), Withdrawal("alice", 250)]).balances, {"alice": 750})
    raises(InsufficientFundsError, Ledger, [Withdrawal("alice", 1)])

@test("two ledgers don't share state")
def _():
    first, second = Ledger(), Ledger()
    first.record(Deposit("alice", 100))
    eq(second.events, ())
    eq(second.balances, {})

@test("the balances always match a replay of the log")
def _():
    ledger = Ledger([Deposit("alice", 1000), Deposit("bob", 50), Transfer("alice", "bob", 300)])
    eq(ledger.balances, replay(ledger.events))

@test("history() lists the events that touched an account, with a running balance")
def _():
    ledger = Ledger([
        Deposit("alice", 1000),
        Deposit("bob", 50),
        Transfer("alice", "bob", 300),
        Withdrawal("alice", 100),
    ])
    eq(ledger.history("alice"), [
        (0, Deposit("alice", 1000), 1000, 1000),
        (2, Transfer("alice", "bob", 300), -300, 700),
        (3, Withdrawal("alice", 100), -100, 600),
    ])
    eq(ledger.history("bob"), [
        (1, Deposit("bob", 50), 50, 50),
        (2, Transfer("alice", "bob", 300), 300, 350),
    ])

@test("history() entries have named fields")
def _():
    [entry] = Ledger([Deposit("alice", 1000)]).history("alice")
    eq((entry.index, entry.event, entry.change, entry.balance), (0, Deposit("alice", 1000), 1000, 1000))

@test("history() of an unknown account is empty")
def _():
    eq(Ledger([Deposit("alice", 1000)]).history("zed"), [])
```

```hint
In `__init__`, loop over `events` and call `self.record(event)` for each. `record()` is the only code that should ever touch `_events`.
```

```hint
`for index, event in enumerate(self._events):` gives you the positions. Compute `delta = changes(event)`, and skip the event unless `account in delta`.
```
:::

## Step 5: Save and replay the log

An event log is naturally a file of **JSON Lines**: one JSON document per line. Recording an event appends a line, a crash can at worst cut off the last line, and you can stream the file with `for line in f:` instead of parsing it all at once. (Python in Practice covers the file side in [Files & Paths](lesson:files-and-paths).)

:::compare
```js
const toJsonl = (events) =>
  events.map((e) => JSON.stringify(e) + "\n").join("");

const fromJsonl = (text) =>
  text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
```
```python
def to_jsonl(events):
    return "".join(json.dumps(...) + "\n" for event in events)


def from_jsonl(text):
    for number, line in enumerate(text.splitlines(), start=1):
        match json.loads(line):
            case {"type": str(kind), **data} if kind in EVENT_TYPES:
                ...
```
:::

`JSON.parse` hands back plain objects and you're done. `json.loads` hands back dicts, and turning them back into the right dataclass is your job: that's the price of having real types. So each line carries a tag, the class name in lowercase, followed by the fields from `dataclasses.asdict()` ([`asdict()` and JSON](lesson:dataclasses-and-enums#asdict-and-json)). On the way back, one mapping pattern checks the tag and collects the remaining keys, and `cls(**data)` passes them as keyword arguments ([`*args`, `**kwargs` and spreading](lesson:functions#args-kwargs-and-spreading)).

```python run
import json
from pathlib import Path

log = Path("ledger.jsonl")
log.write_text("", encoding="utf-8")                  # start empty
for event in ({"type": "deposit", "amount": 500}, {"type": "withdrawal", "amount": 200}):
    with log.open("a", encoding="utf-8") as f:        # append-only, like the ledger
        f.write(json.dumps(event) + "\n")

with log.open(encoding="utf-8") as f:
    for number, line in enumerate(f, start=1):        # one line at a time
        print(number, json.loads(line))
```

:::quiz output
What does this print?

```python
import json
print(json.dumps({"type": "deposit", "amount": 5}))
```

- [ ] `{"type":"deposit","amount":5}`
- [x] `{"type": "deposit", "amount": 5}`
- [ ] `{'type': 'deposit', 'amount': 5}`

Unlike `JSON.stringify`, `json.dumps` puts a space after every `,` and `:` by default. Pass `separators=(",", ":")` for the compact form. The third option is the `repr()` of a dict, which isn't JSON at all.
:::

:::gotcha End every line with a newline, including the last
`"\n".join(lines)` leaves the final line unterminated, so the next event you append glues itself onto it and both lines become unparseable. JSON Lines wants a `"\n"` after **every** record.
:::

Bad input should fail with the ledger's own error, plus the line number a human needs to find it. Catch `json.JSONDecodeError` and the `TypeError` that `cls(**data)` raises for missing or unexpected fields, and re-raise them as `LedgerError(f"line {number}: ...")` with `from err`, which keeps the original in the traceback ([Re-raising and chaining](lesson:exceptions#re-raising-and-chaining)). Keep the two jobs apart: `from_jsonl()` checks a line's *shape*, and `Ledger(...)` checks its *meaning*.

:::challenge id=ledger-step-5 title="Step 5: Save and replay" difficulty=medium
Write the two functions:

- `to_jsonl(events)` returns one line per event, each ending in `"\n"`. A line is a JSON object whose first key is `"type"` (the lowercase class name, as in `EVENT_TYPES`), followed by the event's fields in order. No events gives `""`.
- `from_jsonl(text)` parses that format back into a list of events, skipping blank lines. Any line it can't turn into an event raises `LedgerError` with `line N` in the message, counting from 1 with blank lines included. That covers broken JSON, values that aren't objects, unknown types, and missing or unexpected fields. Chain the original exception with `raise ... from err` when there is one.

Don't check amounts or balances here: `Ledger(from_jsonl(text))` already does.

```js
function fromJsonl(text) {
  return text.split("\n").flatMap((line, i) => {
    if (!line.trim()) return [];
    const { type, ...fields } = JSON.parse(line);
    const Event = EVENT_TYPES[type];
    if (!Event) throw new LedgerError(`line ${i + 1}: unknown type ${type}`);
    return [new Event(fields)];
  });
}
```

```python starter
import json
from dataclasses import asdict, dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries


EVENT_TYPES = {cls.__name__.lower(): cls for cls in (Deposit, Withdrawal, Transfer)}


def to_jsonl(events) -> str:
    """One JSON object per line, tagged with the event's type."""
    ...


def from_jsonl(text: str) -> list[Event]:
    """Parse a JSON-lines log back into events, skipping blank lines."""
    ...
```

```python solution
import json
from dataclasses import asdict, dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries


EVENT_TYPES = {cls.__name__.lower(): cls for cls in (Deposit, Withdrawal, Transfer)}


def to_jsonl(events) -> str:
    """One JSON object per line, tagged with the event's type."""
    return "".join(
        json.dumps({"type": type(event).__name__.lower(), **asdict(event)}) + "\n"
        for event in events
    )


def from_jsonl(text: str) -> list[Event]:
    """Parse a JSON-lines log back into events, skipping blank lines."""
    events = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            match json.loads(line):
                case {"type": str(kind), **data} if kind in EVENT_TYPES:
                    events.append(EVENT_TYPES[kind](**data))
                case _:
                    raise LedgerError(f"line {number}: not an event: {line}")
        except (json.JSONDecodeError, TypeError) as err:
            raise LedgerError(f"line {number}: {err}") from err
    return events
```

```python tests
import json

EVENTS = [Deposit("alice", 1000), Transfer("alice", "bob", 300), Withdrawal("bob", 50)]


@test("to_jsonl() writes one tagged JSON object per line")
def _():
    eq(
        to_jsonl(EVENTS[:2]),
        '{"type": "deposit", "account": "alice", "amount": 1000}\n'
        '{"type": "transfer", "source": "alice", "target": "bob", "amount": 300}\n',
    )

@test("to_jsonl() of no events is an empty string")
def _():
    eq(to_jsonl([]), "")

@test("from_jsonl() reverses to_jsonl()")
def _():
    eq(from_jsonl(to_jsonl(EVENTS)), EVENTS)

@test("from_jsonl() skips blank lines")
def _():
    text = '\n{"type": "deposit", "account": "alice", "amount": 5}\n   \n\n'
    eq(from_jsonl(text), [Deposit("alice", 5)])

@test("an unknown type is a LedgerError that names the line")
def _():
    text = to_jsonl(EVENTS[:1]) + '{"type": "refund", "account": "alice", "amount": 5}\n'
    err = raises(LedgerError, from_jsonl, text)
    check("line 2" in str(err), f"mention the line number, got {str(err)!r}")

@test("broken JSON is a LedgerError chained to the JSONDecodeError")
def _():
    err = raises(LedgerError, from_jsonl, '{"type": "deposit", "account": "alice"')
    check("line 1" in str(err), f"mention the line number, got {str(err)!r}")
    check(isinstance(err.__cause__, json.JSONDecodeError), "chain the original error with raise ... from err")

@test("wrong or missing fields are a LedgerError, not a TypeError")
def _():
    raises(LedgerError, from_jsonl, '{"type": "deposit", "acount": "alice", "amount": 5}')
    raises(LedgerError, from_jsonl, '{"type": "transfer", "source": "alice", "amount": 5}')

@test("lines that aren't JSON objects are a LedgerError")
def _():
    raises(LedgerError, from_jsonl, "[1, 2, 3]")
    raises(LedgerError, from_jsonl, '"deposit"')

@test("replaying a log through Ledger validates it")
def _():
    eq(Ledger(from_jsonl(to_jsonl(EVENTS))).balances, {"alice": 700, "bob": 250})
    overdrawn = to_jsonl([Deposit("alice", 100), Withdrawal("alice", 500)])
    raises(InsufficientFundsError, Ledger, from_jsonl(overdrawn))
```

```hint
`{"type": type(event).__name__.lower(), **asdict(event)}` puts the tag first and the fields after it, in field order.
```

```hint
`case {"type": str(kind), **data} if kind in EVENT_TYPES:` matches a dict with a string `"type"` that names a known event, and binds every other key to `data`. A final `case _:` catches lists, strings and unknown types.
```

```hint
Wrap the `match` in `try:` and catch `(json.JSONDecodeError, TypeError)`. The `LedgerError` you raise for an unknown type isn't one of those, so it passes straight through.
```
:::

## Step 6: Undo with compensating events

An accountant never erases a line in the books. They post a reversing entry. Event sourcing works the same way: you don't delete an event, you append its **inverse**. A deposit is cancelled by a withdrawal of the same amount, and a transfer by a transfer back. The history stays complete, and the correction is itself on the record. It's `git revert`, not `git reset`, and just as in git, reverting a revert re-applies the original.

:::compare
```js
// rewriting history: the mistake vanishes
events.splice(index, 1);
balances = events.reduce(apply, {});
```
```python
# compensating: the log grows, and the mistake stays on record
ledger.revert(index)
```
:::

Route the compensation through `record()`, so it's validated like any other event. Reverting a deposit after the money has been spent then raises `InsufficientFundsError`, which is the right answer: you can't claw back cash that's already gone. For a missing index, raise `LedgerError(...) from None`, which drops the internal `IndexError` from the traceback because it's an implementation detail.

The statement is a format-spec exercise. `:<22` pads a value on the right to 22 characters, and `:>10` pads on the left, which lines up the money columns ([The format-spec mini-language](lesson:strings#the-format-spec-mini-language)):

```python run
rows = [("deposit", "$25.00"), ("transfer from alice", "$30.00"), ("withdrawal", "-$10.00")]
for label, amount in rows:
    print(f"|{label:<22}|{amount:>10}|")
```

:::challenge id=ledger-step-6 title="Step 6: Revert and report" difficulty=hard
Finish the ledger:

- `inverse(event)` returns the event that cancels `event` out: a `Withdrawal` for a `Deposit`, a `Deposit` for a `Withdrawal`, and a `Transfer` in the opposite direction for a `Transfer`.
- `Ledger.revert(index=-1)` records the inverse of `events[index]` and returns it. Negative indices count from the end, as usual. If there's no such event, raise `LedgerError`. The compensation goes through `record()`, so it can be refused like any other event.
- `describe(event, account)` labels an event on `account`'s statement: `"deposit"`, `"withdrawal"`, `"transfer to bob"` when `account` is the source, or `"transfer from alice"` when it's the target.
- `Ledger.statement(account)` returns one string: a `Statement for <account>` header, one line per `history()` entry, then `Balance: <money>`. Each entry line is formatted as `f"#{index:<4}{label:<22}{money(change):>10}{money(balance):>10}"`.

The last test runs the whole lifecycle: replay a log, record, get refused, revert, save, replay again, and compare statements.

```text
Statement for bob
#1   deposit                   $25.00    $25.00
#2   transfer from alice       $30.00    $55.00
#3   withdrawal               -$10.00    $45.00
Balance: $45.00
```

```python starter
import json
from dataclasses import asdict, dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries

    def revert(self, index: int = -1) -> Event:
        """Cancel events[index] by recording its inverse. Returns the new event."""
        ...

    def statement(self, account: str) -> str:
        """A printable history of one account."""
        ...


EVENT_TYPES = {cls.__name__.lower(): cls for cls in (Deposit, Withdrawal, Transfer)}


def to_jsonl(events) -> str:
    """One JSON object per line, tagged with the event's type."""
    return "".join(
        json.dumps({"type": type(event).__name__.lower(), **asdict(event)}) + "\n"
        for event in events
    )


def from_jsonl(text: str) -> list[Event]:
    """Parse a JSON-lines log back into events, skipping blank lines."""
    events = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            match json.loads(line):
                case {"type": str(kind), **data} if kind in EVENT_TYPES:
                    events.append(EVENT_TYPES[kind](**data))
                case _:
                    raise LedgerError(f"line {number}: not an event: {line}")
        except (json.JSONDecodeError, TypeError) as err:
            raise LedgerError(f"line {number}: {err}") from err
    return events


def inverse(event: Event) -> Event:
    """The compensating event that cancels `event` out."""
    ...


def describe(event: Event, account: str) -> str:
    """How a statement labels `event`, from `account`'s point of view."""
    ...
```

```python solution
import json
from dataclasses import asdict, dataclass
from functools import reduce
from typing import NamedTuple


# Amounts are whole cents: an int, never a float.


@dataclass(frozen=True)
class Deposit:
    account: str
    amount: int


@dataclass(frozen=True)
class Withdrawal:
    account: str
    amount: int


@dataclass(frozen=True)
class Transfer:
    source: str
    target: str
    amount: int


type Event = Deposit | Withdrawal | Transfer


def money(cents: int) -> str:
    """Format whole cents as dollars: 123456 -> "$1,234.56"."""
    dollars, rest = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return f"{sign}${dollars:,}.{rest:02}"


def changes(event: Event) -> dict[str, int]:
    """How much each account's balance moves because of `event`."""
    match event:
        case Deposit(account, amount):
            return {account: amount}
        case Withdrawal(account, amount):
            return {account: -amount}
        case Transfer(source, target, amount):
            return {source: -amount, target: amount}
        case _:
            raise TypeError(f"not an event: {event!r}")


def apply(balances: dict[str, int], event: Event) -> dict[str, int]:
    """Return new balances with `event` applied. `balances` is left alone."""
    return balances | {
        account: balances.get(account, 0) + change
        for account, change in changes(event).items()
    }


def replay(events) -> dict[str, int]:
    """Fold any iterable of events into balances, starting from nothing."""
    return reduce(apply, events, {})


class LedgerError(Exception):
    """Base class for every event the ledger refuses."""


class InvalidAmountError(LedgerError):
    def __init__(self, amount):
        super().__init__(f"amounts are positive whole cents, got {amount!r}")
        self.amount = amount


class InsufficientFundsError(LedgerError):
    def __init__(self, account: str, balance: int, amount: int):
        super().__init__(f"{account} has {money(balance)}, can't take {money(amount)}")
        self.account = account
        self.balance = balance
        self.amount = amount


def validate(balances: dict[str, int], event: Event) -> None:
    """Raise a LedgerError if `event` can't be applied to `balances`."""
    if not isinstance(event.amount, int) or event.amount <= 0:
        raise InvalidAmountError(event.amount)
    match event:
        case Transfer(source, target, _) if source == target:
            raise LedgerError(f"can't transfer from {source} to itself")
        case Withdrawal(account, amount) | Transfer(account, _, amount):
            balance = balances.get(account, 0)
            if amount > balance:
                raise InsufficientFundsError(account, balance, amount)


class Entry(NamedTuple):
    index: int
    event: Event
    change: int
    balance: int


class Ledger:
    """An append-only log of events, plus the balances they add up to."""

    def __init__(self, events=()):
        self._events: list[Event] = []
        self.balances: dict[str, int] = {}
        for event in events:
            self.record(event)

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def record(self, event: Event) -> None:
        """Validate `event`, then append it and update the balances."""
        validate(self.balances, event)
        self.balances = apply(self.balances, event)
        self._events.append(event)

    def history(self, account: str) -> list[Entry]:
        """Every event that touched `account`, with the running balance."""
        entries = []
        balance = 0
        for index, event in enumerate(self._events):
            delta = changes(event)
            if account in delta:
                balance += delta[account]
                entries.append(Entry(index, event, delta[account], balance))
        return entries

    def revert(self, index: int = -1) -> Event:
        """Cancel events[index] by recording its inverse. Returns the new event."""
        try:
            original = self._events[index]
        except IndexError:
            raise LedgerError(f"no event at index {index}") from None
        compensation = inverse(original)
        self.record(compensation)
        return compensation

    def statement(self, account: str) -> str:
        """A printable history of one account."""
        lines = [f"Statement for {account}"]
        for index, event, change, balance in self.history(account):
            label = describe(event, account)
            lines.append(f"#{index:<4}{label:<22}{money(change):>10}{money(balance):>10}")
        lines.append(f"Balance: {money(self.balances.get(account, 0))}")
        return "\n".join(lines)


EVENT_TYPES = {cls.__name__.lower(): cls for cls in (Deposit, Withdrawal, Transfer)}


def to_jsonl(events) -> str:
    """One JSON object per line, tagged with the event's type."""
    return "".join(
        json.dumps({"type": type(event).__name__.lower(), **asdict(event)}) + "\n"
        for event in events
    )


def from_jsonl(text: str) -> list[Event]:
    """Parse a JSON-lines log back into events, skipping blank lines."""
    events = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            match json.loads(line):
                case {"type": str(kind), **data} if kind in EVENT_TYPES:
                    events.append(EVENT_TYPES[kind](**data))
                case _:
                    raise LedgerError(f"line {number}: not an event: {line}")
        except (json.JSONDecodeError, TypeError) as err:
            raise LedgerError(f"line {number}: {err}") from err
    return events


def inverse(event: Event) -> Event:
    """The compensating event that cancels `event` out."""
    match event:
        case Deposit(account, amount):
            return Withdrawal(account, amount)
        case Withdrawal(account, amount):
            return Deposit(account, amount)
        case Transfer(source, target, amount):
            return Transfer(target, source, amount)
        case _:
            raise TypeError(f"not an event: {event!r}")


def describe(event: Event, account: str) -> str:
    """How a statement labels `event`, from `account`'s point of view."""
    match event:
        case Deposit():
            return "deposit"
        case Withdrawal():
            return "withdrawal"
        case Transfer(source, target, _) if source == account:
            return f"transfer to {target}"
        case Transfer(source, _, _):
            return f"transfer from {source}"
        case _:
            raise TypeError(f"not an event: {event!r}")
```

```python tests
@test("inverse() swaps deposits and withdrawals and reverses transfers")
def _():
    eq(inverse(Deposit("alice", 500)), Withdrawal("alice", 500))
    eq(inverse(Withdrawal("alice", 500)), Deposit("alice", 500))
    eq(inverse(Transfer("alice", "bob", 300)), Transfer("bob", "alice", 300))

@test("inverting twice gives back the original event")
def _():
    for event in (Deposit("alice", 1), Withdrawal("alice", 2), Transfer("alice", "bob", 3)):
        eq(inverse(inverse(event)), event)

@test("revert() appends a compensating event instead of deleting one")
def _():
    ledger = Ledger([Deposit("alice", 1000), Transfer("alice", "bob", 300)])
    eq(ledger.revert(), Transfer("bob", "alice", 300))
    eq(len(ledger.events), 3, "the log is append-only: the original event stays")
    eq(ledger.balances, {"alice": 1000, "bob": 0})

@test("revert(index) cancels any earlier event")
def _():
    ledger = Ledger([Deposit("alice", 1000), Deposit("bob", 50), Withdrawal("alice", 200)])
    ledger.revert(1)
    eq(ledger.events[-1], Withdrawal("bob", 50))
    eq(ledger.balances, {"alice": 800, "bob": 0})

@test("a revert that would overdraw is refused and changes nothing")
def _():
    ledger = Ledger([Deposit("bob", 500), Withdrawal("bob", 400)])
    raises(InsufficientFundsError, ledger.revert, 0)   # the deposit has been spent
    eq(len(ledger.events), 2)
    eq(ledger.balances, {"bob": 100})

@test("reverting an event that doesn't exist is a LedgerError")
def _():
    raises(LedgerError, Ledger().revert)
    raises(LedgerError, Ledger([Deposit("alice", 1)]).revert, 5)

@test("describe() labels an event from one account's point of view")
def _():
    move = Transfer("alice", "bob", 300)
    eq(describe(move, "alice"), "transfer to bob")
    eq(describe(move, "bob"), "transfer from alice")
    eq(describe(Deposit("bob", 5), "bob"), "deposit")
    eq(describe(Withdrawal("bob", 5), "bob"), "withdrawal")

@test("statement() lines up the columns")
def _():
    ledger = Ledger([
        Deposit("alice", 10_000),
        Deposit("bob", 2_500),
        Transfer("alice", "bob", 3_000),
        Withdrawal("bob", 1_000),
    ])
    eq(ledger.statement("bob"), "\n".join([
        "Statement for bob",
        "#1   deposit                   $25.00    $25.00",
        "#2   transfer from alice       $30.00    $55.00",
        "#3   withdrawal               -$10.00    $45.00",
        "Balance: $45.00",
    ]))

@test("a statement for an account with no history")
def _():
    eq(Ledger().statement("zed"), "Statement for zed\nBalance: $0.00")

@test("everything together: replay, record, refuse, revert, save, report")
def _():
    ledger = Ledger(from_jsonl(to_jsonl([Deposit("alice", 10_000), Deposit("bob", 2_500)])))
    ledger.record(Transfer("alice", "bob", 3_000))
    raises(InsufficientFundsError, ledger.record, Withdrawal("bob", 99_999))
    ledger.revert()
    restored = Ledger(from_jsonl(to_jsonl(ledger.events)))
    eq(restored.events, ledger.events)
    eq(restored.balances, {"alice": 10_000, "bob": 2_500})
    eq(restored.statement("alice"), "\n".join([
        "Statement for alice",
        "#0   deposit                  $100.00   $100.00",
        "#2   transfer to bob          -$30.00    $70.00",
        "#3   transfer from bob         $30.00   $100.00",
        "Balance: $100.00",
    ]))
```

```hint
`inverse()` is a `match` with three cases. For a transfer, swap `source` and `target` and keep the amount.
```

```hint
In `revert()`, look the event up inside `try:`/`except IndexError:`, then call `self.record(inverse(original))` and return the compensation.
```

```hint
In `describe()`, a guard tells the two transfer labels apart: `case Transfer(source, target, _) if source == account:`.
```
:::

## Where to take it next

- **Timestamps.** Give every event an `at: datetime` field, and pass the clock in (`record(event, now=...)`) so tests stay deterministic. [Dates, Times & Durations](lesson:dates-and-times) covers the pitfalls.
- **Snapshots.** Replaying a million events at startup is slow. Store the balances along with how many events produced them, every thousand events or so, and replay only the tail.
- **Schema changes.** When an event grows a field, add `"v": 2` to new lines and upgrade old shapes in `from_jsonl()` with one more `case`.
- **A real store.** Append events to a SQLite table instead of a file, and let a unique sequence number guard against two writers ([SQL with sqlite3](lesson:sqlite-and-sql)).
