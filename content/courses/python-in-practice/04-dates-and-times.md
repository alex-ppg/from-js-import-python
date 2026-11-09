---
title: Dates, Times & Durations
part: Files & Data
summary: datetime vs Date: 1-based months, immutable values, ISO 8601, format codes, time zones and timedelta maths.
minutes: 40
---

JavaScript's `Date` is one mutable object doing every job: a millisecond timestamp underneath, local time on the surface, and months that start at zero. Python's `datetime` module splits the work into small **immutable** types, `date`, `time`, `datetime` and `timedelta`, plus `timezone` for UTC offsets. Months run from 1 to 12, impossible dates raise instead of rolling over, and timestamps count seconds, not milliseconds. The shift that matters most: a `datetime` either knows its offset from UTC (**aware**) or doesn't (**naive**), and Python refuses to guess which one you meant.

[Batteries Included](lesson:standard-library#datetime-dates-without-the-footguns) gave the five-minute tour. This lesson is the field manual: timestamps, ISO 8601, format codes, time zones and daylight saving, calendar arithmetic, clocks, and keeping all of it testable.

## Four types instead of one `Date`

:::compare
```js
// one class for every job
const d = new Date(2024, 0, 31, 9, 30);  // January: months are 0-11
d.getFullYear();                         // 2024
d.getMonth() + 1;                        // 1
d.setDate(d.getDate() + 1);              // mutates d in place

const day = new Date(d);                 // "just the date" is still a Date
day.setHours(0, 0, 0, 0);
```
```python
from datetime import date, datetime, timedelta
d = datetime(2024, 1, 31, 9, 30)         # January: months are 1-12
d.year                                   # 2024
d.month                                  # 1
d = d + timedelta(days=1)                # a new object: rebind the name

day = d.date()                           # a real calendar-day type
```
:::

| Type | Holds | Closest JS |
| --- | --- | --- |
| `date` | year, month, day | none (`Temporal.PlainDate`) |
| `time` | hour down to microsecond, optional `tzinfo` | none (`Temporal.PlainTime`) |
| `datetime` | a `date` and a `time` together | `Date`, or `Temporal.PlainDateTime` when naive |
| `timedelta` | a fixed-length duration | the millisecond number from `b - a` |
| `timezone` | a fixed UTC offset such as `+02:00` | the offset at the end of an ISO string |

Attributes replace getters (`d.month`, `d.hour`, no `get` and no `+ 1`), and nothing has a setter. `replace()` returns a copy with some fields swapped, the way `{ ...obj, day: 1 }` would. Immutability buys you something JS can't offer: dates are hashable values, so they work as dict keys and set members. A `Map` keyed by `Date` objects compares references, so `map.get(new Date(0))` never finds an entry stored under a different `new Date(0)`.

```python run
from datetime import date, datetime

launch = datetime(2024, 1, 31, 9, 30)
print(launch.year, launch.month, launch.day, launch.hour)
print(launch.replace(day=1, hour=0, minute=0))   # a new datetime
print(launch)                                    # unchanged
print(launch.date(), launch.time())

closures = {date(2024, 12, 25): "Christmas", date(2025, 1, 1): "New Year"}
print(closures[date(2024, 12, 25)])              # equal dates are equal keys
print(date(2024, 12, 25) in closures)
```

:::quiz output
What does this print?

```python
from datetime import date
due = date(2024, 6, 15)
due.replace(day=1)
print(due)
```

- [ ] `2024-06-01`
- [x] `2024-06-15`
- [ ] `None`
- [ ] `AttributeError`

`replace()` builds a new `date` and leaves `due` alone, and the new one was thrown away. Write `due = due.replace(day=1)`. Every would-be setter in this module works that way, because none of these objects can change after they're created.
:::

:::gotcha A `datetime` is a `date`, but they don't compare
`datetime` subclasses `date`, so `isinstance(moment, date)` is `True` for a datetime too. Mixing the two still fails: `datetime(2024, 1, 1) == date(2024, 1, 1)` is `False`, and `<` between them raises `TypeError`. When you mean "the day this moment falls on", compare `moment.date()` with your date. When you dispatch on type with `isinstance`, test for `datetime` first.
:::

## Timestamps are seconds, not milliseconds

:::compare
```js
Date.now();                     // 1717245000000: integer milliseconds
new Date(1717245000000);        // from milliseconds
d.getTime();                    // back to milliseconds
Math.floor(Date.now() / 1000);  // Unix seconds for an API or a JWT
```
```python
time.time()                     # 1717245000.0: float seconds
datetime.fromtimestamp(1717245000, tz=UTC)  # from seconds
d.timestamp()                   # back to seconds, as a float
int(time.time())                # Unix seconds for an API or a JWT
```
:::

Python's Unix time is a float of **seconds**. Everything that takes or returns a timestamp (`time.time()`, `fromtimestamp`, `.timestamp()`) speaks seconds, so values from JavaScript need dividing by 1000 on the way in and multiplying on the way out. Get it wrong and you'll find out at once. JavaScript milliseconds fed to `fromtimestamp` land in the year 56387 and raise (a `ValueError` here and on Linux, an `OSError` on Windows), where `new Date(seconds)` quietly hands you a date in January 1970.

Always pass `tz=UTC` to `fromtimestamp`. Without it you get a naive datetime in the *machine's* local time zone, and `naive.timestamp()` makes the same local-time assumption in reverse, so the same code gives different answers on your laptop, in CI and in production. `UTC` here is `datetime.UTC`, an alias for `timezone.utc` (3.11+).

```python run
from datetime import UTC, datetime, timedelta

js_millis = 1717245000123                  # Date.now() from the frontend
sent = datetime.fromtimestamp(js_millis / 1000, tz=UTC)
print(sent)
print(sent.timestamp())                    # float seconds
print(round(sent.timestamp() * 1000))      # back to milliseconds

EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
print(EPOCH + timedelta(milliseconds=js_millis))      # exact integer maths
print((sent - EPOCH) // timedelta(milliseconds=1))    # an int, no float involved
```

:::tip Floats can drop a millisecond
`int(dt.timestamp() * 1000)` is the obvious port of `getTime()`, and it's wrong for some values. For `1987-05-10 10:40:21.915` UTC, `timestamp() * 1000` is `547641621914.99994`, which `int()` truncates to `...914`. Use `round()`, or stay in integers with `timedelta` arithmetic from the epoch, as above. `time.time_ns()` gives the current time as an integer number of nanoseconds.
:::

## ISO 8601 in and out

:::compare
```js
new Date("2024-06-01T12:30:00Z");  // an instant
new Date("2024-06-01");            // UTC midnight
new Date("2024-06-01T12:30");      // local time (!)
d.toISOString();                   // "2024-06-01T12:30:00.000Z", always UTC
```
```python
datetime.fromisoformat("2024-06-01T12:30:00Z")  # aware, UTC (Z needs 3.11+)
date.fromisoformat("2024-06-01")                 # a date, with no time at all
datetime.fromisoformat("2024-06-01T12:30")       # naive: no offset, no guess
d.isoformat()                                    # "2024-06-01T12:30:00+00:00"
```
:::

JavaScript parses a date-only string as UTC midnight but a date-time without an offset as local time, a rule that has shipped a lot of off-by-one-day bugs. Python's rule is simpler. An offset in the string (`Z` or `+02:00`) gives an aware datetime, no offset gives a naive one, and a plain date belongs in `date.fromisoformat`. Since 3.11, `fromisoformat` accepts most of ISO 8601, including `Z`, the compact form `20240601T123000` and week dates like `2024-W22-6`. Older versions only read back what `isoformat()` writes.

Going out, `isoformat()` writes the offset as `+00:00` and includes microseconds only when they aren't zero. `timespec=` fixes the precision. There's no option for `Z`, so to match `toISOString()` you convert to UTC and swap the suffix yourself.

```python run
from datetime import UTC, datetime

for text in ["2024-06-01T12:30:00Z", "2024-06-01T14:30:00+02:00", "20240601T123000", "2024-W22-6"]:
    parsed = datetime.fromisoformat(text)
    print(f"{text:<26} {parsed}  tz={parsed.tzinfo}")

shipped = datetime(2024, 6, 1, 12, 30, 5, 123456, tzinfo=UTC)
print(shipped.isoformat())
print(shipped.isoformat(timespec="seconds"))
print(shipped.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
```

:::gotcha `isoformat()` never converts
`toISOString()` always converts to UTC first. `isoformat()` writes the datetime's own offset, or none at all for a naive one, so `.replace("+00:00", "Z")` only works after `.astimezone(UTC)`. On a `+02:00` value it silently does nothing, and on a naive value you'd be sending a time with no zone.
:::

:::quiz output
Both strings are valid ISO 8601. What does this print?

```python
from datetime import datetime
stamps = ["2024-06-01T08:00:00Z", "2024-06-01T09:00:00+02:00"]
print(sorted(stamps, key=datetime.fromisoformat)[0])
```

- [ ] `2024-06-01T08:00:00Z`
- [x] `2024-06-01T09:00:00+02:00`
- [ ] `TypeError`

09:00 at `+02:00` is 07:00 UTC, an hour before the other one. Aware datetimes compare as instants whatever their offsets, so mixed offsets are fine once parsed. Sorting the raw strings would put the `Z` one first: ISO strings only sort chronologically when they share the same offset and precision. Parse before you compare.
:::

## Format codes: `strftime` and `strptime`

:::compare
```js
import { format, parse } from "date-fns";

format(d, "yyyy-MM-dd HH:mm");          // "2024-06-01 14:05"
format(d, "EEE d MMM yyyy");            // "Sat 1 Jun 2024"
parse("01/06/2024", "dd/MM/yyyy", new Date());
d.toLocaleDateString("en-US", { weekday: "long" });  // "Saturday"
```
```python
from datetime import datetime

d.strftime("%Y-%m-%d %H:%M")            # "2024-06-01 14:05"
f"{d:%a} {d.day} {d:%b %Y}"             # "Sat 1 Jun 2024"
datetime.strptime("01/06/2024", "%d/%m/%Y")
d.strftime("%A")                        # "Saturday"
```
:::

`strftime` formats and `strptime` parses, both with C-style `%` codes, and the same codes work after the colon in an f-string. `strptime` is strict: the whole string must match the format or you get `ValueError`. Python 3.14 added `date.strptime` and `time.strptime`; on older versions, parse with `datetime.strptime(...)` and call `.date()` or `.time()`.

| Code | Meaning | Example | date-fns |
| --- | --- | --- | --- |
| `%Y` / `%y` | year | `2024` / `24` | `yyyy` / `yy` |
| `%m` | month, zero-padded | `06` | `MM` |
| `%B` / `%b` | month name / abbreviation | `June` / `Jun` | `MMMM` / `MMM` |
| `%d` | day of the month, zero-padded | `01` | `dd` |
| `%A` / `%a` | weekday name / abbreviation | `Saturday` / `Sat` | `EEEE` / `EEE` |
| `%H` / `%I` | hour on the 24-hour / 12-hour clock | `14` / `02` | `HH` / `hh` |
| `%p` | AM or PM | `PM` | `a` |
| `%M` | minute | `05` | `mm` |
| `%S` | second | `09` | `ss` |
| `%f` | microseconds, six digits | `000000` | |
| `%z` / `%:z` | UTC offset (`%:z` is 3.12+ and formatting only) | `+0200` / `+02:00` | `xx` / `xxx` |
| `%Z` | time zone name | `UTC` | |
| `%j` | day of the year | `153` | |
| `%G-W%V-%u` | ISO year, week and weekday | `2024-W22-6` | |
| `%%` | a literal `%` | `%` | |

```python run
from datetime import date, datetime

order = datetime(2024, 6, 1, 14, 5, 9)
print(order.strftime("%Y-%m-%d %H:%M:%S"))
print(order.strftime("%a %d %b %Y, %I:%M %p"))
print(f"Week {order:%V}, day {order:%j} of the year")
print(datetime.strptime("01/06/2024 14:05", "%d/%m/%Y %H:%M"))
print(datetime.strptime("2024-06-01T14:05:00+02:00", "%Y-%m-%dT%H:%M:%S%z"))
print(date.strptime("Jun 1 2024", "%b %d %Y"))    # 3.14+
```

:::quiz output
What does this print?

```python
from datetime import datetime
print(datetime(2024, 6, 1, 14, 5).strftime("%Y-%M-%d"))
```

- [ ] `2024-06-01`
- [x] `2024-05-01`
- [ ] `2024-14-01`
- [ ] `ValueError`

`%M` is the minute, so the 5 from 14:05 lands where the month should be. date-fns has the same trap with the cases swapped (`MM` is the month, `mm` the minute). A wrong code never raises; it just formats the wrong field, so test your format strings against a date where every field differs.
:::

`strptime` wants the *entire* input consumed, which catches truncated formats early:

```python run raises
from datetime import datetime

print(datetime.strptime("1/6/2024", "%d/%m/%Y"))     # padding is optional when parsing
datetime.strptime("2024-06-01 14:05", "%Y-%m-%d")    # ValueError: unconverted data remains
```

:::gotcha Parse with the year, or 1900 sneaks in
`datetime.strptime("Feb 29", "%b %d")` raises `ValueError`, because a missing year defaults to 1900, which wasn't a leap year. Since 3.13, any parse with a day but no year also emits a `DeprecationWarning`. Put the year in both the input and the format.
:::

:::note Names follow the C locale, and some codes are platform-specific
`%a`, `%A`, `%b`, `%B` and `%p` come from the process locale, which is English unless something calls `locale.setlocale()`. That setting is process-global, so for user-facing dates in other languages reach for the third-party Babel package (`babel.dates.format_date`), the closest thing to `Intl.DateTimeFormat`. Unpadded codes like `%-d` work on Linux and macOS but raise `ValueError` on Windows. `f"{d.day}"` is portable.
:::

## Aware and naive: label or convert

:::compare
```js
// A Date is always an instant; zones only matter when you display it
const d = new Date("2024-06-01T12:00:00Z");
d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });  // "01/06/2024, 17:30:00"
d.getTimezoneOffset();      // the machine's offset in minutes, sign flipped
```
```python
d = datetime(2024, 6, 1, 12, 0, tzinfo=UTC)
ist = timezone(timedelta(hours=5, minutes=30))
d.astimezone(ist)           # 2024-06-01 17:30:00+05:30: same instant
d.utcoffset()               # timedelta(0): this datetime's own offset
```
:::

[Batteries Included](lesson:standard-library#aware-and-naive-datetimes) covers the basics: a naive datetime has no `tzinfo`, an aware one does, and mixing them in ordering or arithmetic raises `TypeError`. Day to day, what matters is the difference between attaching a zone and converting to one:

- `replace(tzinfo=tz)` **labels** a value: same wall-clock reading, now pinned to a zone. Use it when you know which zone a naive value was recorded in, such as a database column that stores UTC without an offset.
- `astimezone(tz)` **converts**: same instant, different wall-clock reading. Use it for display and for normalising to UTC.

Calling `astimezone()` on a *naive* datetime treats it as the machine's local time, which is rarely what you meant and differs from machine to machine.

```python run
from datetime import UTC, datetime, timedelta, timezone

ist = timezone(timedelta(hours=5, minutes=30))
from_db = datetime(2024, 6, 1, 12, 0)          # naive, but we know it's UTC

stored = from_db.replace(tzinfo=UTC)           # label: same wall clock
print(stored)
print(stored.astimezone(ist))                  # convert: same instant
print(from_db.replace(tzinfo=ist))             # a label, so a different instant
print(stored == stored.astimezone(ist))        # equal instants are equal
```

:::quiz output
What does this print?

```python
from datetime import UTC, datetime, timedelta, timezone
noon = datetime(2024, 6, 1, 12, 0, tzinfo=UTC)
plus2 = timezone(timedelta(hours=2))
print(noon.astimezone(plus2).hour, noon.replace(tzinfo=plus2).hour)
```

- [x] `14 12`
- [ ] `14 14`
- [ ] `12 14`
- [ ] `12 12`

`astimezone` keeps the instant and moves the clock, so noon UTC reads 14:00 at `+02:00`. `replace` keeps the clock and changes the instant: the result is noon at `+02:00`, which is 10:00 UTC.
:::

:::gotcha `getTimezoneOffset()` has the opposite sign
JavaScript reports how far local time is *behind* UTC, in minutes: `-120` in Paris in summer. Python's `utcoffset()` returns how far the datetime is *ahead* of UTC, as a `timedelta` (`2:00:00`), matching the `+02:00` in an ISO string. Porting offset arithmetic without flipping the sign is a classic bug.
:::

A fixed offset is not a time zone. `timezone(timedelta(hours=1))` is `+01:00` forever, while Paris is `+01:00` in winter and `+02:00` in summer. Offsets are right for recording what a timestamp said. For "9:00 every Monday in Paris" you need a named zone.

## Time zones and DST with `zoneinfo`

:::compare
```js
// Date can only display other zones; Temporal can compute in them
const noon = Temporal.ZonedDateTime.from("2024-03-30T12:00[Europe/Paris]");
noon.add({ days: 1 }).toString();   // "2024-03-31T12:00:00+02:00[Europe/Paris]"
noon.add({ hours: 24 }).toString(); // "2024-03-31T13:00:00+02:00[Europe/Paris]"
```
```python
paris = ZoneInfo("Europe/Paris")
noon = datetime(2024, 3, 30, 12, 0, tzinfo=paris)
noon + timedelta(days=1)            # 2024-03-31 12:00:00+02:00
(noon.astimezone(UTC) + timedelta(hours=24)).astimezone(paris)  # 13:00+02:00
```
:::

`zoneinfo` (3.9+) provides the IANA time zones, such as `Europe/Paris`, from the same database that `Intl` and Temporal use. It reads the operating system's copy on Linux and macOS; on Windows, `pip install tzdata`. This sandbox has no time zone data, so the code in this section is static, with the output in comments.

The clocks in Paris went forward at 02:00 on 31 March 2024. Watch what arithmetic does across that night:

```python
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

paris = ZoneInfo("Europe/Paris")
before = datetime(2024, 3, 30, 12, 0, tzinfo=paris)    # Saturday noon, +01:00
after = before + timedelta(days=1)                      # Sunday noon, +02:00
print(after - before)                                   # 1 day, 0:00:00
print(after.astimezone(UTC) - before.astimezone(UTC))   # 23:00:00

skipped = datetime(2024, 3, 31, 2, 30, tzinfo=paris)    # never happened
print(skipped.astimezone(UTC).astimezone(paris))        # 2024-03-31 03:30:00+02:00
repeated = datetime(2024, 10, 27, 2, 30, tzinfo=paris)  # happened twice
print(repeated.utcoffset(), repeated.replace(fold=1).utcoffset())  # 2:00:00 1:00:00
```

Arithmetic between datetimes that share a `tzinfo` is **wall-clock** arithmetic: Python works on the local readings and ignores the offsets. Adding a day keeps the time of day, which is what a calendar wants. Subtracting gives the wall-clock difference, a full day, even though only 23 real hours passed that night. Datetimes with *different* `tzinfo` objects subtract as instants. So for elapsed time (billing, timeouts, durations in logs) convert to UTC first.

:::gotcha Impossible and repeated local times don't raise
02:30 never happened in Paris on the night the clocks went forward, and it happened twice on the night they went back. Python accepts both without complaint. The `fold` attribute (PEP 495) picks which of a repeated time you mean, `0` for the first and `1` for the second, and a skipped time turns into a real one once it passes through UTC. Temporal, by contrast, lets you choose to reject such times (`disambiguation: "reject"`). If user input can land in those hours, check for them: a local time whose `utcoffset()` changes when you flip `fold` is either skipped or repeated.
:::

:::tip The rule that keeps you sane
Store and compute in aware UTC, and convert to a `ZoneInfo` only at the edges: when you display a time, or when you read one a user typed. For future local events such as "9:00 every Monday in Paris", also store the zone *name*, because governments change daylight saving rules and a stored offset can't follow them.
:::

## Durations with `timedelta`

:::compare
```js
const ms = end - start;                    // a plain number of milliseconds
const minutes = Math.floor(ms / 60_000);
const hours = ms / 3_600_000;
const later = new Date(start.getTime() + 90 * 60_000);
```
```python
elapsed = end - start                      # a timedelta
minutes = elapsed // timedelta(minutes=1)  # an int
hours = elapsed / timedelta(hours=1)       # a float
later = start + timedelta(minutes=90)
```
:::

A `timedelta` is a fixed-length duration that stores exactly three numbers: `days`, `seconds` (0 to 86,399) and `microseconds`. Everything else is computed. Dividing by another timedelta converts to any unit, `//` gives whole units and `%` the remainder. You can also multiply and divide by plain numbers, negate, take `abs()` and compare. [Batteries Included](lesson:standard-library#durations-with-timedelta) covers the basics; the traps live in those three stored fields.

```python run
from datetime import datetime, timedelta

start = datetime(2024, 6, 1, 9, 15)
end = datetime(2024, 6, 2, 11, 45, 30)
elapsed = end - start
print(elapsed)
print(elapsed.days, elapsed.seconds)               # components, not totals
print(elapsed.total_seconds())
print(elapsed // timedelta(minutes=1), "whole minutes")
print(elapsed / timedelta(hours=1), "hours")
print(timedelta(minutes=50) * 3, timedelta(hours=1) / 4, timedelta(hours=-1))
```

:::gotcha `.seconds` is not the total
`elapsed.seconds` is what's left over after the whole days, so a 26-hour span reports `7200`. Use `total_seconds()`, or divide by a unit. There are no `.hours` or `.minutes` attributes at all, and negative durations normalise to a negative day plus a positive remainder (`-1 day, 23:00:00` above), so read them through `total_seconds()` too.
:::

:::quiz output
What does this print?

```python
from datetime import timedelta
print(timedelta(days=2, minutes=1).seconds)
```

- [ ] `172860`
- [x] `60`
- [ ] `2`
- [ ] `AttributeError`

The two days live in `.days`, and `.seconds` holds only the remaining minute. `total_seconds()` would give `172860.0`.
:::

:::pythonic Split a duration with `divmod`
`divmod(n, 60)` returns the quotient and the remainder in one call, which turns a number of seconds into hours, minutes and seconds without any `Math.floor` and `%` pairs.
:::

```python run
from datetime import timedelta

def clock(td):
    minutes, seconds = divmod(round(td.total_seconds()), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02}:{seconds:02}"

print(clock(timedelta(hours=26, minutes=3, seconds=7)))   # str() says "1 day, 2:03:07"
print(clock(timedelta(seconds=59.6)))
```

## Calendar arithmetic: months, weeks and `calendar`

:::compare
```js
const d = new Date(2024, 0, 31);
d.setMonth(d.getMonth() + 1);        // March 2: "February 31" rolls over
new Date(2024, 2, 0).getDate();      // 29: day 0 of March ends February
const monday = new Date(d);
monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
```
```python
d = date(2024, 1, 31)
d.replace(month=2)                   # ValueError: no rolling over
calendar.monthrange(2024, 2)[1]      # 29: days in February 2024
monday = d - timedelta(days=d.weekday())
```
:::

`timedelta` stops at weeks because months and years don't have a fixed length. "One month after January 31" needs a policy: date-fns' `addMonths` and Temporal clamp to the last day of the month, while `setMonth` overflows into March. Python ships no policy, so you write one (the challenges below include it) or install `python-dateutil` for its `relativedelta`. The tool for clamping is `calendar.monthrange(year, month)`, which returns the weekday of the 1st and the number of days in the month.

```python run
import calendar
from datetime import date, timedelta

def end_of_month(d):
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])

def start_of_week(d):                        # ISO weeks start on Monday
    return d - timedelta(days=d.weekday())

print(end_of_month(date(2024, 2, 10)), end_of_month(date(2023, 2, 10)))
print(start_of_week(date(2024, 6, 2)))       # a Sunday -> the Monday before
print(calendar.monthrange(2024, 6))          # (weekday of the 1st, days in June)
print(date(2024, 6, 2).isocalendar())
```

Remember the weekday numbering from [Batteries Included](lesson:standard-library#datetime-dates-without-the-footguns): `weekday()` counts Monday as `0`, `isoweekday()` counts it as `1`, and neither matches `getDay()`, which starts with Sunday. The `calendar` module also knows leap years (`isleap`, `leapdays`) and month and day names, and it can print a month the way the Unix `cal` command does. Since 3.12 its weekday and month constants are enums (`calendar.Day.SATURDAY`, `calendar.Month.JUNE`), and because they're `IntEnum`s they still behave as the plain numbers 5 and 6.

```python run
import calendar

print(calendar.TextCalendar().formatmonth(2024, 6))
print(calendar.month_name[6], calendar.day_abbr[calendar.SATURDAY])
print(calendar.isleap(2100), calendar.leapdays(2000, 2025))
print(calendar.SATURDAY == 5, calendar.Month.JUNE)
```

:::quiz output
June 1, 2024 was a Saturday. What does this print?

```python
from datetime import date
today = date(2024, 6, 1)
friday = 4
print((friday - today.weekday()) % 7)
```

- [ ] `-1`
- [x] `6`
- [ ] `1`
- [ ] `4`

`today.weekday()` is `5`, so the subtraction gives `-1`. Python's `%` takes the sign of the divisor, so `-1 % 7` is `6`: the number of days until next Friday. JavaScript's `%` keeps the sign of the dividend, which is why JS weekday maths is full of `((x % 7) + 7) % 7`. See [Numbers & Math](lesson:numbers-and-math#division-and-divmod).
:::

## Clocks: measuring and waiting

:::compare
```js
const t0 = performance.now();         // ms, monotonic, high resolution
render();
console.log(performance.now() - t0);
const deadline = Date.now() + 5000;   // wall clock: it can jump
```
```python
t0 = time.perf_counter()              # seconds, monotonic, high resolution
render()
print(time.perf_counter() - t0)
deadline = time.monotonic() + 5       # monotonic: it never goes back
```
:::

Python has three clocks for three jobs, all reporting float seconds. `time.time()` is the wall clock, the one to write into a log line or a database row. NTP or a user can move it, so the difference between two readings can come out wrong, even negative. `time.monotonic()` only ever moves forward, which makes it right for deadlines and timeouts. `time.perf_counter()` is monotonic too, with the best resolution available, and it's the one to benchmark with. The last two have no meaningful zero, so only the difference between two readings means anything. Each clock has a `_ns` twin that returns integer nanoseconds, and [Performance](lesson:performance-basics) covers `timeit` for serious measurement.

```python run
import time

t0 = time.perf_counter()
total = sum(i * i for i in range(200_000))
print(f"summed in {(time.perf_counter() - t0) * 1000:.1f} ms")

deadline = time.monotonic() + 0.05
polls = 0
while time.monotonic() < deadline:
    polls += 1
    time.sleep(0.01)
print(polls, "polls before the deadline")
```

## Keep "now" out of your logic

:::compare
```js
// jest: freeze the global clock, then test
jest.useFakeTimers();
jest.setSystemTime(new Date("2024-06-01T09:00:00Z"));
expect(isExpired(token)).toBe(false);   // reads Date.now() inside
```
```python
# Python habit: pass the time in
def is_expired(token, now):
    return now >= token["expires_at"]

is_expired(token, now=datetime(2024, 6, 1, 9, 0, tzinfo=UTC))
```
:::

A function that calls `datetime.now()` or `date.today()` inside gives a different answer every second, flakes around midnight and month ends, and can only be tested by patching the clock. The Python habit is to make time an input. Take `now` (or `today`) as a parameter, or accept a clock function with a sensible default. Libraries such as `freezegun` and `time-machine` patch the clock the way jest's fake timers do, and [Testing](lesson:testing-with-python) covers `unittest.mock`, but code that receives time as an argument rarely needs them.

```python run
from datetime import UTC, datetime, timedelta

class Session:
    TTL = timedelta(minutes=30)

    def __init__(self, clock=lambda: datetime.now(UTC)):
        self.clock = clock
        self.started = clock()

    def expired(self):
        return self.clock() - self.started >= self.TTL

now = datetime(2024, 6, 1, 9, 0, tzinfo=UTC)
session = Session(clock=lambda: now)     # looks `now` up on every call
print(session.expired())
now += timedelta(minutes=31)
print(session.expired())
```

:::gotcha `date.today()` as a default argument
`def report(day=date.today()):` evaluates `date.today()` once, when the `def` runs, so a long-running server keeps reporting the day it started ([defaults are evaluated once](lesson:functions#defaults-are-evaluated-once)). Default to `None` and resolve it inside: `if day is None: day = date.today()`.
:::

## Temporal, compared

TC39's Temporal API, which is replacing `Date` as engines ship it, looks a lot like Python's design: immutable values, 1-based months, separate types for calendar dates, wall-clock readings and exact instants, and explicit time zones. If you've used it, the map is short:

| Temporal | Python | Notes |
| --- | --- | --- |
| `Temporal.Instant` | aware `datetime` in UTC | or a plain timestamp |
| `Temporal.ZonedDateTime` | aware `datetime` with a `ZoneInfo` | |
| `Temporal.PlainDateTime` | naive `datetime` | |
| `Temporal.PlainDate` | `date` | |
| `Temporal.PlainTime` | `time` | |
| `Temporal.PlainYearMonth` | a `(year, month)` tuple | no dedicated type |
| `Temporal.Duration` | `timedelta` | fixed length only: no months or years |
| `Temporal.Now.instant()` | `datetime.now(UTC)` | |
| `Temporal.Now.plainDateISO()` | `date.today()` | |
| `d.with({ day: 1 })` | `d.replace(day=1)` | |
| `d.add({ months: 1 })` | your own helper, or `relativedelta` | Temporal clamps by default |
| `a.until(b)` | `b - a` | |
| `zdt.withTimeZone("Asia/Tokyo")` | `dt.astimezone(ZoneInfo("Asia/Tokyo"))` | |
| `Temporal.PlainDate.compare(a, b)` | `a < b`, `sorted(dates)` | operators just work |

Two differences matter. Temporal's `Duration` carries calendar units, so `{ months: 1 }` is a real duration, while a `timedelta` is always a fixed number of microseconds. And Temporal deliberately throws if you compare its objects with `<` (their `valueOf()` throws), where Python's comparison operators, `sorted()`, `min()` and `max()` work directly on dates and datetimes. Temporal also reads `[Europe/Paris]` annotations in strings (RFC 9557), which `fromisoformat` rejects.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `new Date(2024, 0, 31)` | `date(2024, 1, 31)` | months are 1-12; bad dates raise |
| `d.setDate(1)` | `d = d.replace(day=1)` | immutable: rebind |
| `Date.now()` | `time.time()` | float seconds |
| `new Date(ms)` | `datetime.fromtimestamp(ms / 1000, tz=UTC)` | always pass `tz` |
| `d.getTime()` | `round(d.timestamp() * 1000)` | naive values assume local time |
| `new Date(isoString)` | `datetime.fromisoformat(s)` | `Z` needs 3.11+ |
| `d.toISOString()` | `d.astimezone(UTC).isoformat(timespec="milliseconds")` | writes `+00:00`, not `Z` |
| `format(d, "yyyy-MM-dd")` | `d.strftime("%Y-%m-%d")` | or `f"{d:%Y-%m-%d}"`; `%M` is minutes |
| `parse(s, fmt, ref)` | `datetime.strptime(s, fmt)` | `date.strptime` in 3.14+ |
| `d.getDay()` | `d.weekday()` | Monday is `0`, Sunday is `6` |
| `toLocaleString(..., { timeZone })` | `d.astimezone(ZoneInfo(name))` | needs tz data |
| `b - a` | `b - a` | a `timedelta`, not milliseconds |
| `ms / 3_600_000` | `td / timedelta(hours=1)` | `td.seconds` isn't the total |
| `addMonths(d, 1)` | `calendar.monthrange` + `replace` | no `months=` in `timedelta` |
| `performance.now()` | `time.perf_counter()` | seconds |
| `jest.setSystemTime(...)` | pass `now` or a clock in | freezegun, time-machine |

## Challenges

:::challenge id=dates-js-millis title="JavaScript milliseconds" difficulty=easy
Your API receives timestamps from a JavaScript frontend as `Date.now()`-style integers: milliseconds since the Unix epoch. Write two functions:

- `from_js_millis(ms)` returns an **aware** `datetime` in UTC.
- `to_js_millis(dt)` returns the milliseconds for an aware `datetime`, as an `int`. It must handle any UTC offset, and raise `ValueError` for a naive datetime instead of guessing its zone.

Both must be exact for every millisecond, including times before 1970.

```js
const fromJsMillis = (ms) => new Date(ms);
const toJsMillis = (date) => date.getTime();
```

```python starter
from datetime import UTC, datetime, timedelta

def from_js_millis(ms):
    ...

def to_js_millis(dt):
    ...
```

```python solution
from datetime import UTC, datetime, timedelta

EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
ONE_MS = timedelta(milliseconds=1)

def from_js_millis(ms):
    return EPOCH + timedelta(milliseconds=ms)

def to_js_millis(dt):
    if dt.utcoffset() is None:
        raise ValueError("to_js_millis() needs an aware datetime")
    return (dt - EPOCH) // ONE_MS
```

```python tests
from datetime import UTC, datetime, timedelta, timezone

@test("the epoch is 0")
def _():
    eq(from_js_millis(0), datetime(1970, 1, 1, tzinfo=UTC))
    eq(to_js_millis(datetime(1970, 1, 1, tzinfo=UTC)), 0)

@test("keeps the milliseconds")
def _():
    eq(from_js_millis(1717245000123), datetime(2024, 6, 1, 12, 30, 0, 123000, tzinfo=UTC))
    eq(to_js_millis(datetime(2024, 6, 1, 12, 30, 0, 123000, tzinfo=UTC)), 1717245000123)

@test("returns an aware datetime in UTC")
def _():
    result = from_js_millis(1717245000123)
    check(result.utcoffset() == timedelta(0), "pass tz=UTC or start from an aware epoch: a naive result has no zone at all")

@test("handles times before 1970")
def _():
    eq(from_js_millis(-1), datetime(1969, 12, 31, 23, 59, 59, 999000, tzinfo=UTC))
    eq(to_js_millis(datetime(1969, 7, 20, 20, 17, tzinfo=UTC)), -14182980000)

@test("converts other offsets by instant")
def _():
    plus2 = timezone(timedelta(hours=2))
    eq(to_js_millis(datetime(2024, 6, 1, 14, 30, tzinfo=plus2)), 1717245000000)

@test("never loses a millisecond to float rounding")
def _():
    for ms in (547641621915, 2178489544595, -544483292614):
        eq(to_js_millis(from_js_millis(ms)), ms)

@test("to_js_millis returns an int")
def _():
    check(type(to_js_millis(datetime(2024, 6, 1, tzinfo=UTC))) is int, "return an int, like getTime()")

@test("naive datetimes raise ValueError")
def _():
    raises(ValueError, to_js_millis, datetime(2024, 6, 1, 12, 30))
```

```hint
Start from an aware epoch, `datetime(1970, 1, 1, tzinfo=UTC)`, and add `timedelta(milliseconds=ms)`. Integer arithmetic on timedeltas is exact, and it works for negative values too.
```

```hint
Subtracting the epoch from an aware datetime gives a `timedelta`, whatever the datetime's offset. Floor-divide it by `timedelta(milliseconds=1)` to get an `int`.
```

```hint
`dt.utcoffset()` is `None` for a naive datetime.
```
:::

:::challenge id=dates-format-duration title="Human-friendly durations" difficulty=medium
Write `format_duration(td)` that renders a `timedelta` compactly, the way a CLI progress line or a dashboard would:

```text
timedelta(seconds=45)                            ->  "45s"
timedelta(minutes=90)                            ->  "1h 30m"
timedelta(days=1, hours=2, minutes=3, seconds=4) ->  "1d 2h 3m 4s"
timedelta(hours=1, seconds=5)                    ->  "1h 5s"
timedelta(0)                                     ->  "0s"
```

The units are days, hours, minutes and seconds, largest first, and units that are zero are left out. Drop any fraction of a second. Raise `ValueError` for a negative duration.

```js
function formatDuration(ms) {
  if (ms < 0) throw new RangeError("negative duration");
  let rest = Math.floor(ms / 1000);
  const parts = [];
  for (const [unit, size] of [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]]) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (count) parts.push(`${count}${unit}`);
  }
  return parts.join(" ") || "0s";
}
```

```python starter
from datetime import timedelta

def format_duration(td):
    ...
```

```python solution
from datetime import timedelta

UNITS = [("d", 86_400), ("h", 3_600), ("m", 60), ("s", 1)]

def format_duration(td):
    if td < timedelta(0):
        raise ValueError("duration must not be negative")
    remaining = td // timedelta(seconds=1)
    parts = []
    for name, size in UNITS:
        count, remaining = divmod(remaining, size)
        if count:
            parts.append(f"{count}{name}")
    return " ".join(parts) or "0s"
```

```python tests
from datetime import timedelta

@test("seconds only")
def _():
    eq(format_duration(timedelta(seconds=45)), "45s")

@test("hours and minutes")
def _():
    eq(format_duration(timedelta(minutes=90)), "1h 30m")

@test("all four units, largest first")
def _():
    eq(format_duration(timedelta(days=1, hours=2, minutes=3, seconds=4)), "1d 2h 3m 4s")

@test("zero units are left out")
def _():
    eq(format_duration(timedelta(hours=1, seconds=5)), "1h 5s")
    eq(format_duration(timedelta(days=3)), "3d")

@test("counts the whole duration, not just .seconds")
def _():
    eq(format_duration(timedelta(hours=25)), "1d 1h")
    eq(format_duration(timedelta(days=2, minutes=1)), "2d 1m")

@test("zero and sub-second durations are 0s")
def _():
    eq(format_duration(timedelta(0)), "0s")
    eq(format_duration(timedelta(milliseconds=999)), "0s")

@test("fractions of a second are dropped")
def _():
    eq(format_duration(timedelta(seconds=61, milliseconds=900)), "1m 1s")

@test("negative durations raise ValueError")
def _():
    raises(ValueError, format_duration, timedelta(seconds=-1))
```

```hint
Get the total number of whole seconds first: `td // timedelta(seconds=1)` is an exact `int`. `td.seconds` on its own forgets the days.
```

```hint
`divmod(remaining, 3600)` gives the hours and what's left over. Loop over `(name, size)` pairs from days down to seconds.
```

```hint
Collect the non-zero parts in a list, then return `" ".join(parts) or "0s"`.
```
:::

:::challenge id=dates-add-months title="Add months, clamped" difficulty=medium
`timedelta` has no `months=`, so write `add_months(d, months)`. It moves `d` forward by whole calendar months, or back for a negative `months`. When the day doesn't exist in the target month, clamp it to that month's last day, the way date-fns' `addMonths` and Temporal do:

```text
add_months(date(2024, 1, 31), 1)    ->  date(2024, 2, 29)
add_months(date(2023, 1, 31), 1)    ->  date(2023, 2, 28)
add_months(date(2024, 3, 31), -1)   ->  date(2024, 2, 29)
add_months(date(2024, 12, 15), 1)   ->  date(2025, 1, 15)
```

It must also work for a `datetime`, keeping its time of day and `tzinfo`, and it returns the same type it was given.

```js
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
```

```python starter
import calendar
from datetime import date, datetime

def add_months(d, months):
    ...
```

```python solution
import calendar

def add_months(d, months):
    year, month_index = divmod(d.year * 12 + d.month - 1 + months, 12)
    month = month_index + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)
```

```python tests
from datetime import UTC, date, datetime

@test("moves forward within a year")
def _():
    eq(add_months(date(2024, 3, 15), 2), date(2024, 5, 15))

@test("clamps to the end of a shorter month")
def _():
    eq(add_months(date(2024, 1, 31), 1), date(2024, 2, 29))
    eq(add_months(date(2023, 1, 31), 1), date(2023, 2, 28))
    eq(add_months(date(2024, 5, 31), 1), date(2024, 6, 30))

@test("rolls over into later years")
def _():
    eq(add_months(date(2024, 12, 15), 1), date(2025, 1, 15))
    eq(add_months(date(2024, 11, 30), 14), date(2026, 1, 30))

@test("negative months go back")
def _():
    eq(add_months(date(2024, 3, 31), -1), date(2024, 2, 29))
    eq(add_months(date(2024, 1, 15), -1), date(2023, 12, 15))
    eq(add_months(date(2024, 2, 29), -24), date(2022, 2, 28))

@test("zero months returns the same date")
def _():
    eq(add_months(date(2024, 2, 29), 0), date(2024, 2, 29))

@test("a year after a leap day is February 28")
def _():
    eq(add_months(date(2024, 2, 29), 12), date(2025, 2, 28))

@test("datetimes keep their time and tzinfo")
def _():
    result = add_months(datetime(2024, 1, 31, 9, 30, tzinfo=UTC), 1)
    eq(result, datetime(2024, 2, 29, 9, 30, tzinfo=UTC))
    check(type(result) is datetime, "a datetime in should give a datetime out")

@test("dates stay dates")
def _():
    check(type(add_months(date(2024, 1, 31), 1)) is date, "a date in should give a date out")
```

```hint
Count months from year 0: `d.year * 12 + (d.month - 1)` turns a date's year and month into one number. Add `months`, and `divmod(total, 12)` splits the result back into a year and a 0-based month, negative inputs included.
```

```hint
`calendar.monthrange(year, month)[1]` is the number of days in that month. Clamp with `min(d.day, ...)`.
```

```hint
`d.replace(year=..., month=..., day=...)` keeps every other field, including a datetime's time and tzinfo, and returns the same type as `d`.
```
:::

:::challenge id=dates-next-run title="Next scheduled run" difficulty=hard
A job runs every week on some weekdays at a fixed time of day. Write `next_run(now, weekdays, at)` that returns the first run **strictly after** `now`:

- `now` is an aware `datetime`. Raise `ValueError` if it's naive.
- `weekdays` is a set of weekday numbers with Monday as `0`, as `date.weekday()` returns them. Raise `ValueError` if it's empty or contains anything outside 0 to 6.
- `at` is a naive `time` of day in `now`'s time zone, and the result carries `now`'s `tzinfo`.

```text
now = Monday 2024-06-03 09:00 UTC
next_run(now, {0, 2, 4}, time(10, 0))  ->  Monday 2024-06-03 10:00 UTC
next_run(now, {0, 2, 4}, time(8, 0))   ->  Wednesday 2024-06-05 08:00 UTC
next_run(now, {0}, time(9, 0))         ->  Monday 2024-06-10 09:00 UTC
```

The tests use fixed-offset zones, so there's no daylight saving to handle.

```js
function nextRun(now, weekdays, hours, minutes) {
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    const mondayBased = (candidate.getDay() + 6) % 7;   // getDay() starts on Sunday
    if (weekdays.has(mondayBased) && candidate > now) return candidate;
  }
}
```

```python starter
from datetime import datetime, time, timedelta

def next_run(now, weekdays, at):
    ...
```

```python solution
from datetime import datetime, time, timedelta

def next_run(now, weekdays, at):
    if now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if not weekdays or not set(weekdays) <= set(range(7)):
        raise ValueError("weekdays must be a non-empty set of numbers 0-6")
    for offset in range(8):
        day = now.date() + timedelta(days=offset)
        if day.weekday() in weekdays:
            candidate = datetime.combine(day, at, tzinfo=now.tzinfo)
            if candidate > now:
                return candidate
```

```python tests
from datetime import UTC, datetime, time, timedelta, timezone

MONDAY_9 = datetime(2024, 6, 3, 9, 0, tzinfo=UTC)

@test("later the same day")
def _():
    eq(next_run(MONDAY_9, {0, 2, 4}, time(10, 0)), datetime(2024, 6, 3, 10, 0, tzinfo=UTC))

@test("a time already passed today moves to the next scheduled day")
def _():
    eq(next_run(MONDAY_9, {0, 2, 4}, time(8, 0)), datetime(2024, 6, 5, 8, 0, tzinfo=UTC))

@test("a run exactly at now doesn't count")
def _():
    eq(next_run(MONDAY_9, {0}, time(9, 0)), datetime(2024, 6, 10, 9, 0, tzinfo=UTC))

@test("wraps around the end of the week")
def _():
    saturday = datetime(2024, 6, 8, 12, 0, tzinfo=UTC)
    eq(next_run(saturday, {1}, time(7, 30)), datetime(2024, 6, 11, 7, 30, tzinfo=UTC))

@test("crosses month and year boundaries")
def _():
    new_years_eve = datetime(2024, 12, 31, 23, 0, tzinfo=UTC)   # a Tuesday
    eq(next_run(new_years_eve, {3}, time(6, 0)), datetime(2025, 1, 2, 6, 0, tzinfo=UTC))

@test("reads the time of day in now's zone")
def _():
    ist = timezone(timedelta(hours=5, minutes=30))
    result = next_run(datetime(2024, 6, 3, 9, 0, tzinfo=ist), {0}, time(10, 0))
    eq(result, datetime(2024, 6, 3, 10, 0, tzinfo=ist))
    eq(result.utcoffset(), timedelta(hours=5, minutes=30))

@test("always strictly after now, on a scheduled day, within a week")
def _():
    for day in range(3, 10):
        for hour in range(0, 24, 5):
            now = datetime(2024, 6, day, hour, 15, tzinfo=UTC)
            result = next_run(now, {2, 6}, time(12, 0))
            check(now < result <= now + timedelta(weeks=1), f"{result} isn't the next run after {now}")
            check(result.weekday() in {2, 6} and result.time() == time(12, 0), f"{result} isn't a scheduled slot")

@test("bad input raises ValueError")
def _():
    raises(ValueError, next_run, datetime(2024, 6, 3, 9, 0), {0}, time(10, 0))
    raises(ValueError, next_run, MONDAY_9, set(), time(10, 0))
    raises(ValueError, next_run, MONDAY_9, {7}, time(10, 0))
```

```hint
Walk forward one day at a time: `now.date() + timedelta(days=offset)` for `offset` in `range(8)`. Eight days are always enough, because today's slot may already have passed.
```

```hint
`datetime.combine(day, at, tzinfo=now.tzinfo)` builds a candidate in `now`'s zone. Return the first one whose weekday is in `weekdays` and which is greater than `now`.
```

```hint
`now.utcoffset() is None` means naive. Check the weekdays with a subset test: `set(weekdays) <= set(range(7))`.
```
:::
