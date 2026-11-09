---
title: Build a Text Adventure Engine
part: Apps & Data
summary: Load a world of rooms from data, parse commands with match, track game state, and save it all as JSON.
minutes: 70
---

Text adventures were the original data-driven apps: a map of rooms, a parser for two-word commands, and a loop that prints what happens. They're also a tidy way to practise Python's two best tools for structured input, dataclasses to model it and `match` to take it apart. In JavaScript the parser is a `switch` on `words[0]` buried in `words.length === 2` checks. Python's sequence patterns do the length check, the keyword comparison and the destructuring in one line per command.

## What you'll build

A small engine that loads a world from plain data (a graph of rooms joined by exits, with items lying around), parses commands such as `go north`, `take lamp` and `inventory`, keeps the game state in a dataclass, ends the game when a winning or losing rule fires, and saves and loads progress as JSON. All of it is driven through `play(commands, data)`, which returns the transcript, so a whole game is one deterministic function call. That's exactly what tests want.

```python
print(play([
    "go north", "take lamp", "save", "drop lamp", "load", "inventory",
    "south", "east", "down", "take crown", "up", "dance", "west",
], WORLD))
print()
print(play(["east", "down", "up"], WORLD))   # no lamp this time, so "up" never runs
```

```output
A dusty entrance hall. Daylight leaks under the front door.
Exits: north, east.
> go north
Shelves of mouldy books. A reading lamp sits on the desk.
You see: lamp, book.
Exits: south.
> take lamp
Taken: lamp.
> save
Saved.
> drop lamp
Dropped: lamp.
> load
Loaded.
> inventory
You're carrying: lamp.
> south
A dusty entrance hall. Daylight leaks under the front door.
Exits: north, east.
> east
Copper pots hang over a cold stove. Stairs lead down.
Exits: west, down.
> down
A damp cellar. Something glints behind the wine rack.
You see: crown.
Exits: up.
> take crown
Taken: crown.
> up
Copper pots hang over a cold stove. Stairs lead down.
Exits: west, down.
> dance
I don't know how to dance.
> west
A dusty entrance hall. Daylight leaks under the front door.
Exits: north, east.
You slip out into the sunlight with the crown. You win!

A dusty entrance hall. Daylight leaks under the front door.
Exits: north, east.
> east
Copper pots hang over a cold stove. Stairs lead down.
Exits: west, down.
> down
A damp cellar. Something glints behind the wine rack.
You see: crown.
Exits: up.
It's pitch dark down here. You trip over a barrel and twist your ankle. Game over.
```

:::deep Spoiler: play the finished engine
Every step below builds one piece of this file. Open it if you'd like to play first: edit the command lists at the bottom and run it again.

```python run
import json
from dataclasses import dataclass, field, fields
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None

    def save(self) -> str:
        """The game's progress as JSON. The world itself isn't saved."""
        return json.dumps({f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"})

    @classmethod
    def load(cls, world: World, text: str) -> Self:
        """Rebuild a saved game on top of `world`."""
        state = json.loads(text)
        if state["location"] not in world.rooms:
            raise ValueError(f"saved location {state['location']!r} isn't in this world")
        state["status"] = Status(state["status"])
        return cls(world, **state)


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."


WORLD = {
    "start": "hall",
    "rooms": {
        "hall": {
            "description": "A dusty entrance hall. Daylight leaks under the front door.",
            "exits": {"north": "library", "east": "kitchen"},
        },
        "library": {
            "description": "Shelves of mouldy books. A reading lamp sits on the desk.",
            "exits": {"south": "hall"},
            "items": ["lamp", "book"],
        },
        "kitchen": {
            "description": "Copper pots hang over a cold stove. Stairs lead down.",
            "exits": {"west": "hall", "down": "cellar"},
        },
        "cellar": {
            "description": "A damp cellar. Something glints behind the wine rack.",
            "exits": {"up": "kitchen"},
            "items": ["crown"],
        },
    },
    "endings": [
        {"room": "hall", "has": "crown", "status": "won",
         "text": "You slip out into the sunlight with the crown. You win!"},
        {"room": "cellar", "lacks": "lamp", "status": "lost",
         "text": "It's pitch dark down here. You trip over a barrel and twist your ankle. Game over."},
        {"moves": 12, "status": "lost",
         "text": "The floorboards finally give way beneath you. Game over."},
    ],
}


def play(commands, data: dict) -> str:
    """Play a scripted game on the world in `data` and return the transcript."""
    world = load_world(data)
    game = Game.new(world)
    saved = None
    transcript = [game.look()]
    for command in commands:
        transcript.append(f"> {command}")
        match command.lower().split():
            case ["quit"]:
                transcript.append("Bye!")
                break
            case ["save"]:
                saved = game.save()
                transcript.append("Saved.")
            case ["load"] if saved is None:
                transcript.append("Nothing saved yet.")
            case ["load"]:
                game = Game.load(world, saved)
                transcript.append("Loaded.")
            case _:
                transcript.append(execute(game, command))
                if ending := game.check_ending():
                    transcript.append(ending)
                    break
    return "\n".join(transcript)


print(play([
    "go north", "take lamp", "save", "drop lamp", "load", "inventory",
    "south", "east", "down", "take crown", "up", "dance", "west",
], WORLD))
print()
print(play(["east", "down", "up"], WORLD))   # no lamp this time, so "up" never runs
```
:::

## How the pieces fit

```text
  WORLD (plain dicts) ──► load_world() ──► World and Rooms    frozen: the map never changes    (step 1)
                                                │
                                                ▼
  "take lamp" ──► execute() ──► Game.take() ──► Game          mutable: where you are,           (steps 2, 3)
                  (match on the words)          │                      what you carry
                                                ├──► check_ending()    win and lose rules       (step 4)
                                                └──► save() / load()   progress as JSON         (step 5)

  play(commands, data) runs the loop and collects the transcript                                (step 6)
```

| Step | You build | Python you'll use |
| --- | --- | --- |
| 1 | `Room`, `World`, `load_world()` | frozen dataclasses, dict comprehensions, copying instead of aliasing |
| 2 | `Game`, `look()`, `go()` | `field(default_factory=...)`, `@classmethod`, `@property`, `StrEnum` |
| 3 | `take()`, `drop()`, `execute()` | sequence patterns, `*rest`, or-patterns, guards |
| 4 | `check_ending()` | mapping patterns, enum lookup by value |
| 5 | `save()`, `Game.load()` | `json`, `dataclasses.fields()`, enums through JSON |
| 6 | `play()` | a game loop, the walrus operator |

Each step's starter contains the finished code from every earlier step, so you can start anywhere. The tests focus on the new piece, and the last step plays a full game.

## Step 1: A world from data

The world starts life as plain data, the shape you'd keep in a JSON file. The rooms form a graph: each exit is an edge to another room, labelled with a direction.

```python
WORLD = {
    "start": "hall",
    "rooms": {
        "hall": {
            "description": "A dusty entrance hall. Daylight leaks under the front door.",
            "exits": {"north": "library", "east": "kitchen"},
        },
        "library": {
            "description": "Shelves of mouldy books. A reading lamp sits on the desk.",
            "exits": {"south": "hall"},
            "items": ["lamp", "book"],
        },
        # ...the kitchen and the cellar
    },
    "endings": [],   # the rules for winning and losing, in step 4
}
```

Turn it into typed objects in exactly one place, `load_world()`, and let the rest of the program trust them. Both classes are frozen, because the map never changes during play. Everything that does change, such as where you are and what's lying where, lives in the game state from step 2.

:::compare
```js
const rooms = Object.fromEntries(
  Object.entries(data.rooms).map(([name, spec]) => [
    name,
    Object.freeze({
      name,
      description: spec.description,
      exits: { ...(spec.exits ?? {}) },
      items: [...(spec.items ?? [])],
    }),
  ]),
);
```
```python
rooms = {
    name: Room(
        name,
        spec["description"],
        dict(spec.get("exits", {})),
        tuple(spec.get("items", ())),
    )
    for name, spec in data["rooms"].items()
}




```
:::

The `Object.fromEntries(Object.entries(...).map(...))` dance is a dict comprehension in Python ([Building dicts](lesson:dicts#building-dicts-fromentries-zip-and-comprehensions)), and `spec.get("exits", {})` covers the `?? {}`. Note the copies: `dict(...)` and `tuple(...)` make sure the world shares no mutable dict or list with the data it came from. `frozen=True` is shallow, like `Object.freeze`, so a dict inside a frozen dataclass can still be changed by anyone holding a reference to it ([Mutability and aliasing](lesson:variables-and-scope#mutability-and-aliasing)).

Then check the graph while you're at it: every exit must lead to a room that exists, and so must `start`. A typo in the data now fails at startup with a message naming the room, instead of a `KeyError` three moves into a game.

:::quiz output
A world file says `"items": "lamp"` where it meant `["lamp"]`. What does the loader turn that into?

```python
spec = {"items": "lamp"}
print(tuple(spec.get("items", ())))
```

- [ ] `('lamp',)`
- [x] `('l', 'a', 'm', 'p')`
- [ ] `TypeError`

A string is an iterable of one-character strings, so `tuple()` splits it, just as `[..."lamp"]` does in JS. A stricter loader would check `isinstance(items, list)` and raise.
:::

:::challenge id=adventure-step-1 title="Step 1: Load the world" difficulty=easy
Write two frozen dataclasses and the loader:

- `Room` has the fields `name`, `description`, `exits` (a dict from direction to room name) and `items` (a tuple of item names, defaulting to `()`), in that order.
- `World` has `start`, `rooms` (a dict from name to `Room`) and `endings` (a tuple of rule dicts, defaulting to `()`). Step 4 gives the rules a meaning.
- `load_world(data)` builds a `World` from data shaped like `WORLD` above. A room's `exits` and `items` are optional, and so is the top-level `endings` list. Copy whatever you take from `data`, so that changing `data` later can't reach the world.

Raise `ValueError` if `start` isn't a room, or if an exit leads to a room that doesn't exist. Name both the room and the missing target in that message.

```js
for (const room of Object.values(rooms)) {
  for (const [direction, target] of Object.entries(room.exits)) {
    if (!(target in rooms)) {
      throw new Error(`${room.name}: exit ${direction} leads to unknown room ${target}`);
    }
  }
}
```

```python starter
from dataclasses import dataclass


@dataclass(frozen=True)
class Room:
    ...  # TODO: name, description, exits (direction -> room name), items (a tuple, default ())


@dataclass(frozen=True)
class World:
    ...  # TODO: start, rooms (name -> Room), endings (a tuple of dicts, default ())


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    ...
```

```python solution
from dataclasses import dataclass


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)
```

```python tests
import copy
from dataclasses import FrozenInstanceError

TINY = {
    "start": "cave",
    "rooms": {
        "cave": {"description": "A damp cave.", "exits": {"out": "forest"}, "items": ["torch"]},
        "forest": {"description": "Tall pines.", "exits": {"in": "cave"}},
    },
}


@test("rooms are built from the data, keyed by name")
def _():
    world = load_world(TINY)
    eq(world.start, "cave")
    eq(list(world.rooms), ["cave", "forest"])
    cave = world.rooms["cave"]
    eq(cave, Room("cave", "A damp cave.", {"out": "forest"}, ("torch",)))

@test("items become a tuple, and default to ()")
def _():
    world = load_world(TINY)
    eq(world.rooms["cave"].items, ("torch",))
    eq(world.rooms["forest"].items, ())

@test("exits are optional too")
def _():
    world = load_world({"start": "void", "rooms": {"void": {"description": "Nothing at all."}}})
    eq(world.rooms["void"].exits, {})

@test("endings are loaded as a tuple, defaulting to none")
def _():
    eq(load_world(TINY).endings, ())
    rule = {"room": "forest", "has": "torch", "status": "won", "text": "You're out!"}
    eq(load_world({**TINY, "endings": [rule]}).endings, (rule,))

@test("an exit to a missing room is a ValueError that names both rooms")
def _():
    broken = {"start": "cave", "rooms": {"cave": {"description": "A damp cave.", "exits": {"down": "pit"}}}}
    err = raises(ValueError, load_world, broken)
    check("cave" in str(err) and "pit" in str(err), f"name the room and the missing target, got {str(err)!r}")

@test("a missing start room is a ValueError")
def _():
    raises(ValueError, load_world, {**TINY, "start": "attic"})

@test("rooms and the world are frozen")
def _():
    world = load_world(TINY)
    raises(FrozenInstanceError, setattr, world.rooms["cave"], "description", "Lava!")
    raises(FrozenInstanceError, setattr, world, "start", "forest")

@test("the world doesn't share lists or dicts with the data")
def _():
    data = copy.deepcopy(TINY)
    world = load_world(data)
    data["rooms"]["cave"]["exits"]["up"] = "sky"
    data["rooms"]["cave"]["items"].append("gold")
    eq(world.rooms["cave"].exits, {"out": "forest"}, "copy the exits dict")
    eq(world.rooms["cave"].items, ("torch",))
```

```hint
Annotated fields with defaults come last: `items: tuple[str, ...] = ()` after the three required ones.
```

```hint
`tuple(spec.get("items", ()))` copies the items into a tuple, and `dict(spec.get("exits", {}))` copies the exits.
```

```hint
Validate after building `rooms`: loop over `rooms.values()`, then over each `room.exits.items()`, and check `target not in rooms`.
```
:::

## Step 2: The game state

The world is the map. The game state is everything that changes as you play: where you are, what you carry, what lies in each room, how many moves you've made, and whether the game is still on. That's one mutable dataclass. (The [ledger project](lesson:project-ledger) keeps an immutable history and derives its state from it. Here, with one player and one game, mutating a single state object in place is the simplest design that works, and step 5's save files give you snapshots anyway.)

:::compare
```js
class Game {
  constructor(world, location) {
    this.world = world;
    this.location = location;
    this.inventory = [];
    this.roomItems = {};
    this.moves = 0;
    this.status = "playing";
  }
}
```
```python
@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING




```
:::

`field(default_factory=list)` gives every game its own empty list. `field(repr=False)` keeps the whole world out of the repr, so printing a game shows the interesting part. And `Status` is a `StrEnum` whose `auto()` values are the lowercase member names: `Status.WON == "won"`, which will matter when it goes into JSON ([`auto()`, `StrEnum` and `IntEnum`](lesson:dataclasses-and-enums#auto-strenum-and-intenum)).

:::gotcha `inventory: list[str] = []` doesn't even get to be a bug
In a function, a `[]` default is evaluated once and shared between calls. Dataclasses refuse to repeat that trap: a mutable default raises as soon as the class is defined ([Defaults and `field()`](lesson:dataclasses-and-enums#defaults-and-field)).
:::

```python run raises
from dataclasses import dataclass

@dataclass
class Game:
    location: str
    inventory: list[str] = []
```

Starting a game is an alternative constructor, so make it a `@classmethod` that returns `Self` (3.11+): `Game.new(world)` reads better than a constructor call with a dict comprehension inside it ([Class methods and static methods](lesson:classes#class-methods-and-static-methods)). The current room is derived from `location`, so it's a `@property` rather than a field that could drift out of sync ([Properties](lesson:classes#properties-instead-of-get-and-set)).

`look()` and `go()` return the text to show rather than printing it. Every command in this engine does the same, which is what lets step 6 collect a transcript, and the tests compare strings instead of capturing stdout.

:::challenge id=adventure-step-2 title="Step 2: The game state" difficulty=medium
Fill in `Game`. `Status` is done.

- The fields, in this order: `world` (left out of the repr with `field(repr=False)`), `location`, `inventory` (a list, empty by default), `room_items` (a dict from room name to a list of item names, empty by default), `moves` (`0`) and `status` (`Status.PLAYING`).
- `Game.new(world)` starts in `world.start` with an empty inventory, and gives `room_items` a fresh list for every room, copied from that room's `items`.
- `room` is a property returning the current `Room`.
- `look()` returns the room's description, then `You see: lamp, book.` if anything lies here, then `Exits: north, east.`, or `Exits: none.` for a dead end. Join the lines with `"\n"`, and keep items and exits in their stored order.
- `go(direction)` follows an exit, adds 1 to `moves`, and returns `look()` for the new room. With no exit that way it returns `You can't go that way.` and changes nothing.

```python starter
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    # TODO: the fields: world (left out of the repr), location, inventory,
    # room_items (room name -> list of item names), moves and status
    ...

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        ...

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        ...

    def look(self) -> str:
        ...

    def go(self, direction: str) -> str:
        ...
```

```python solution
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()
```

```python tests
TINY = {
    "start": "cave",
    "rooms": {
        "cave": {"description": "A damp cave.", "exits": {"out": "forest"}, "items": ["torch"]},
        "forest": {"description": "Tall pines.", "exits": {"in": "cave"}},
    },
}


@test("Game.new() starts at the start room, empty-handed, with no moves")
def _():
    game = Game.new(load_world(TINY))
    eq((game.location, game.inventory, game.moves, game.status), ("cave", [], 0, Status.PLAYING))

@test("Game.new() copies every room's items into room_items")
def _():
    world = load_world(TINY)
    game = Game.new(world)
    eq(game.room_items, {"cave": ["torch"], "forest": []})
    game.room_items["cave"].remove("torch")
    eq(world.rooms["cave"].items, ("torch",), "the world itself must not change")
    eq(Game.new(world).room_items["cave"], ["torch"], "a new game should start fresh")

@test("two games don't share an inventory")
def _():
    world = load_world(TINY)
    first, second = Game.new(world), Game.new(world)
    first.inventory.append("torch")
    eq(second.inventory, [])

@test("the defaults work without Game.new()")
def _():
    game = Game(load_world(TINY), "forest")
    eq((game.inventory, game.room_items, game.moves, game.status), ([], {}, 0, Status.PLAYING))

@test("the repr leaves the world out")
def _():
    text = repr(Game.new(load_world(TINY)))
    check("location='cave'" in text, f"the repr should show the fields, got {text!r}")
    check("rooms=" not in text, "mark world with field(repr=False)")

@test("room is the Room the player is in")
def _():
    game = Game.new(load_world(TINY))
    eq(game.room.name, "cave")

@test("look() describes the room, then its items, then its exits")
def _():
    eq(Game.new(load_world(TINY)).look(), "A damp cave.\nYou see: torch.\nExits: out.")

@test("look() skips an empty room's items and admits when there's no way out")
def _():
    world = load_world({"start": "cell", "rooms": {"cell": {"description": "A locked cell."}}})
    eq(Game.new(world).look(), "A locked cell.\nExits: none.")

@test("go() moves, counts the move, and describes the new room")
def _():
    game = Game.new(load_world(TINY))
    eq(game.go("out"), "Tall pines.\nExits: in.")
    eq((game.location, game.moves), ("forest", 1))

@test("go() towards a wall stays put and doesn't count")
def _():
    game = Game.new(load_world(TINY))
    eq(game.go("north"), "You can't go that way.")
    eq((game.location, game.moves), ("cave", 0))
```

```hint
In `new()`, build the items with `{name: list(room.items) for name, room in world.rooms.items()}` and pass it by keyword: `cls(world, world.start, room_items=...)`.
```

```hint
The walrus fits `look()` nicely: `if items := self.room_items[self.location]:` binds the list and checks that it isn't empty.
```

```hint
`", ".join(self.room.exits)` joins the exit directions, because iterating over a dict gives its keys. An empty join is `""`, so `... or "none"` handles the dead end.
```
:::

## Step 3: Parse commands with `match`

Adventure parsers split the input into words and look at the *shape*: one word, a verb and an object, a verb and several words. That's exactly what sequence patterns match ([Sequence patterns](lesson:pattern-matching#sequence-patterns)).

:::compare
```js
const words = command.toLowerCase().split(/\s+/).filter(Boolean);
if (words.length === 0) return "Say something.";
if (words.length === 1 && ["look", "l"].includes(words[0])) {
  return game.look();
}
if (words.length === 2 && words[0] === "go") return game.go(words[1]);
if (["take", "get"].includes(words[0]) && words.length > 1) {
  return game.take(words.slice(1).join(" "));
}
return `I don't know how to ${words[0]}.`;
```
```python
match command.lower().split():
    case []:
        return "Say something."
    case ["look" | "l"]:

        return game.look()

    case ["go", direction]:
        return game.go(direction)
    case ["take" | "get", *words] if words:

        return game.take(" ".join(words))

    case [verb, *_]:
        return f"I don't know how to {verb}."
```
:::

Each pattern checks the length and the literal words, and binds the rest. `split()` with no arguments splits on runs of whitespace and drops the empty strings, so `"  TAKE   lamp "` becomes `["take", "lamp"]` before matching starts ([Splitting and partitioning](lesson:strings#splitting-and-partitioning)). `["go", direction]` matches exactly two words. `*words` collects whatever is left, like a rest element, so `take rusty key` hands `["rusty", "key"]` to the case. `"look" | "l"` is an or-pattern of literals, and a guard (`if words`) adds a condition the pattern can't express. Cases are tried top to bottom, so the catch-all `[verb, *_]` goes last.

:::gotcha A bare name in a pattern captures, it doesn't compare
`case [NORTH]:` doesn't mean "the word equals the constant `NORTH`". It means "any one word, now called `NORTH`". To match against a set of values, bind a name and add a guard, `case [direction] if direction in DIRECTIONS:`, or use a dotted name such as `Direction.NORTH` ([Bare names capture](lesson:pattern-matching#bare-names-capture)).
:::

:::quiz output
What does this print?

```python
NORTH = "north"

def parse(words):
    match words:
        case [NORTH]:
            return "going north"
        case _:
            return "unknown"

print(parse(["dance"]))
```

- [x] `going north`
- [ ] `unknown`
- [ ] `SyntaxError`

`[NORTH]` matches any one-word list and rebinds `NORTH` to `"dance"`. Python only refuses to compile a bare capture that would make the following cases unreachable, such as a top-level `case NORTH:`. Wrapped in a list pattern, it still requires exactly one element, so it compiles.
:::

The verbs themselves are methods on `Game` that move an item between two lists. `list.remove()` deletes the first equal element and raises `ValueError` if there isn't one, so check with `in` first, or catch the error.

:::challenge id=adventure-step-3 title="Step 3: Parse commands" difficulty=medium
Add three methods to `Game`, then write the parser.

- `take(item)` moves `item` from the current room to the end of the inventory and returns `Taken: lamp.`, or `There's no lamp here.` if it isn't in the room.
- `drop(item)` does the reverse and returns `Dropped: lamp.`, or `You don't have the lamp.`.
- `list_inventory()` returns `You're carrying: lamp, book.` in pickup order, or `You're empty-handed.`.
- `execute(game, command)` matches on `command.lower().split()` and returns the reply:

| Input | Reply |
| --- | --- |
| nothing at all | `Say something.` |
| `look` or `l` | `game.look()` |
| `inventory` or `i` | `game.list_inventory()` |
| `go <direction>`, or a lone direction from `DIRECTIONS` | `game.go(direction)` |
| `take <item>` or `get <item>` | `game.take(item)` |
| `drop <item>` | `game.drop(item)` |
| `go` on its own | `Go where?` |
| `take`, `get` or `drop` on its own | `Take what?`, `Get what?` or `Drop what?` |
| anything else | `I don't know how to <first word>.` |

Item names can contain spaces: `take rusty key` takes `"rusty key"`.

```python starter
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        ...

    def drop(self, item: str) -> str:
        ...

    def list_inventory(self) -> str:
        ...


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    ...
```

```python solution
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."
```

```python tests
TINY = {
    "start": "cave",
    "rooms": {
        "cave": {"description": "A damp cave.", "exits": {"out": "forest"}, "items": ["torch", "rusty key"]},
        "forest": {"description": "Tall pines.", "exits": {"in": "cave"}},
    },
}


def new_game():
    return Game.new(load_world(TINY))


@test("take() moves an item from the room to the inventory")
def _():
    game = new_game()
    eq(game.take("torch"), "Taken: torch.")
    eq(game.inventory, ["torch"])
    eq(game.room_items["cave"], ["rusty key"])

@test("take() of something that isn't here")
def _():
    game = new_game()
    eq(game.take("sword"), "There's no sword here.")
    eq(game.inventory, [])

@test("drop() leaves an item in the current room")
def _():
    game = new_game()
    game.take("torch")
    game.go("out")
    eq(game.drop("torch"), "Dropped: torch.")
    eq((game.inventory, game.room_items["forest"]), ([], ["torch"]))

@test("drop() of something you don't have")
def _():
    eq(new_game().drop("torch"), "You don't have the torch.")

@test("list_inventory() lists what you carry, in pickup order")
def _():
    game = new_game()
    eq(game.list_inventory(), "You're empty-handed.")
    game.take("rusty key")
    game.take("torch")
    eq(game.list_inventory(), "You're carrying: rusty key, torch.")

@test("execute() understands look and inventory, and their one-letter forms")
def _():
    game = new_game()
    eq(execute(game, "look"), game.look())
    eq(execute(game, "l"), game.look())
    eq(execute(game, "inventory"), "You're empty-handed.")
    eq(execute(game, "i"), "You're empty-handed.")

@test("execute() moves with 'go <direction>' or a bare compass direction")
def _():
    game = new_game()
    eq(execute(game, "go out"), "Tall pines.\nExits: in.")
    eq(execute(game, "north"), "You can't go that way.")
    eq(execute(game, "go sideways"), "You can't go that way.")
    eq(game.location, "forest")

@test("execute() takes and drops, including items with spaces in their names")
def _():
    game = new_game()
    eq(execute(game, "take rusty key"), "Taken: rusty key.")
    eq(execute(game, "get torch"), "Taken: torch.")
    eq(execute(game, "drop rusty key"), "Dropped: rusty key.")
    eq(game.inventory, ["torch"])

@test("execute() ignores case and extra spaces")
def _():
    game = new_game()
    eq(execute(game, "  TAKE   Torch "), "Taken: torch.")

@test("execute() asks for what's missing")
def _():
    game = new_game()
    eq(execute(game, "go"), "Go where?")
    eq(execute(game, "take"), "Take what?")
    eq(execute(game, "get"), "Get what?")
    eq(execute(game, "drop"), "Drop what?")
    eq(execute(game, ""), "Say something.")

@test("execute() admits what it doesn't understand")
def _():
    game = new_game()
    eq(execute(game, "dance"), "I don't know how to dance.")
    eq(execute(game, "Xyzzy now"), "I don't know how to xyzzy.")

@test("execute() parses with match on the words")
def _():
    requires_syntax(ast.MatchSequence, "match on command.lower().split() with sequence patterns like ['go', direction]")
```

```hint
`case ["take" | "get", *words] if words:` handles both verbs and any number of words. Without the guard, a lone `take` would match too, with `words == []`.
```

```hint
For the lone verbs, `case [("take" | "get" | "drop") as verb]:` captures which one it was, and `verb.capitalize()` turns `"take"` into `"Take"`.
```
:::

## Step 4: Win and lose

Endings are data too. Each rule in the world's `endings` has a condition, plus the `status` and `text` to use when it fires:

```python
{"room": "hall", "has": "crown", "status": "won", "text": "..."}       # here, carrying this
{"room": "cellar", "lacks": "lamp", "status": "lost", "text": "..."}   # here, without this
{"moves": 12, "status": "lost", "text": "..."}                         # out of time
```

A rule's *shape* says what kind of rule it is, and testing shapes is what mapping patterns do ([Mapping patterns](lesson:pattern-matching#mapping-patterns)).

:::compare
```js
for (const rule of world.endings) {
  let reached;
  if ("room" in rule && "has" in rule) {
    reached = game.location === rule.room && game.inventory.includes(rule.has);
  } else if ("moves" in rule) {
    reached = game.moves >= rule.moves;
  } else {
    throw new Error(`unknown ending rule: ${JSON.stringify(rule)}`);
  }
  // ...
}
```
```python
for rule in self.world.endings:
    match rule:
        case {"room": room, "has": item}:
            reached = self.location == room and item in self.inventory

        case {"moves": limit}:
            reached = self.moves >= limit
        case _:
            raise ValueError(f"unknown ending rule: {rule!r}")

    # ...
```
:::

`case {"room": room, "has": item}:` matches any dict that has **at least** those two keys, and binds their values. The extra `status` and `text` keys are ignored, so one pattern fits however much decoration a rule carries. Rules are checked in order and the first one that applies wins, so a world that lists its winning rule first lets a last-second win beat the move limit.

When a rule fires, its status arrives as a string. Calling the enum with a value looks the member up, and an unknown value raises `ValueError`, which catches typos in the world data:

```python run
from enum import StrEnum, auto

class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()

print(Status("won") is Status.WON, Status.WON == "won", repr(Status.LOST))
try:
    Status("paused")
except ValueError as err:
    print("ValueError:", err)
```

:::challenge id=adventure-step-4 title="Step 4: Win and lose" difficulty=medium
Write `Game.check_ending()`. Go through `self.world.endings` in order and find the first rule that applies:

- `{"room": r, "has": item, ...}` applies when you're in room `r` carrying `item`,
- `{"room": r, "lacks": item, ...}` applies when you're in room `r` **without** `item`,
- `{"moves": n, ...}` applies once `moves` has reached `n`.

For the first rule that applies, set `status` to the matching `Status` (rules store it as a string such as `"won"`) and return the rule's `text`. If no rule applies, return `None` and leave the status alone. A rule of any other shape raises `ValueError`.

```python starter
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        ...


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."
```

```python solution
from dataclasses import dataclass, field
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."
```

```python tests
RULES = [
    {"room": "forest", "has": "torch", "status": "won", "text": "You light the way home. You win!"},
    {"room": "pit", "lacks": "torch", "status": "lost", "text": "You fall in the dark. Game over."},
    {"moves": 4, "status": "lost", "text": "Night falls. Game over."},
]

DATA = {
    "start": "cave",
    "rooms": {
        "cave": {"description": "A damp cave.", "exits": {"out": "forest", "down": "pit"}, "items": ["torch"]},
        "forest": {"description": "Tall pines.", "exits": {"in": "cave"}},
        "pit": {"description": "A deep pit.", "exits": {"up": "cave"}},
    },
    "endings": RULES,
}


def new_game(rules=RULES):
    return Game.new(load_world({**DATA, "endings": rules}))


@test("no ending while no rule applies")
def _():
    game = new_game()
    eq(game.check_ending(), None)
    game.go("out")                      # in the forest, but without the torch
    eq(game.check_ending(), None)
    eq(game.status, Status.PLAYING)

@test("a 'has' rule fires in its room when you carry the item")
def _():
    game = new_game()
    game.take("torch")
    game.go("out")
    eq(game.check_ending(), "You light the way home. You win!")
    eq(game.status, Status.WON)

@test("a 'lacks' rule fires in its room when you don't carry the item")
def _():
    game = new_game()
    game.go("down")
    eq(game.check_ending(), "You fall in the dark. Game over.")
    eq(game.status, Status.LOST)

@test("a 'lacks' rule leaves you alone when you have the item")
def _():
    game = new_game()
    game.take("torch")
    game.go("down")
    eq(game.check_ending(), None)

@test("a 'moves' rule fires once the move count reaches the limit")
def _():
    game = new_game()
    game.take("torch")
    for direction in ("down", "up", "down"):
        game.go(direction)
        eq(game.check_ending(), None)
    game.go("up")
    eq(game.check_ending(), "Night falls. Game over.")
    eq(game.status, Status.LOST)

@test("the first rule that applies wins")
def _():
    game = new_game([RULES[2], RULES[0]])
    game.take("torch")
    for direction in ("down", "up", "down", "up"):
        game.go(direction)
    game.go("out")                      # 5 moves, and in the forest with the torch
    eq(game.check_ending(), "Night falls. Game over.")

@test("an unknown rule is a ValueError")
def _():
    game = new_game([{"weather": "rain", "status": "lost", "text": "Soaked."}])
    raises(ValueError, game.check_ending)

@test("check_ending() reads the rules with mapping patterns")
def _():
    requires_syntax(ast.MatchMapping, 'match each rule with mapping patterns like {"room": room, "has": item}')
```

```hint
Inside the loop, give each `case` one job: set `reached = ...` to a boolean. After the `match`, `if reached:` sets the status and returns the text.
```

```hint
`self.status = Status(rule["status"])` converts the string into the member.
```
:::

## Step 5: Save and load

A save file is the game state without the world. The map is part of the program, not the player's progress, and saving it would also freeze an old version of it into every save. `dataclasses.fields(self)` lists the fields in order, so a comprehension over it can skip `world` and will pick up any field you add later.

:::compare
```js
const save = (game) =>
  JSON.stringify({ ...game, world: undefined });   // undefined keys are dropped

const load = (world, text) =>
  Object.assign(new Game(world), JSON.parse(text));
```
```python
def save(self):
    state = {f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"}
    return json.dumps(state)

@classmethod
def load(cls, world, text):
    return cls(world, **json.loads(text))   # nearly: see below
```
:::

`cls(world, **state)` passes the saved keys as keyword arguments, and an unexpected key raises `TypeError`, a reasonable reaction to a corrupt save. Two things need care on the way back in:

- **Types don't survive JSON.** `json.dumps` writes a `StrEnum` member as its string value, since it *is* a `str`, but `json.loads` hands back a plain `str`. Convert it with `Status(...)`. (Tuples come back as lists too, and integer dict keys as strings, but this state has neither.)
- **Check before you trust.** A save made with another version of the map might name a room that no longer exists. Refuse it with a `ValueError` rather than crashing on the first `look()`.

:::quiz output
What does this print?

```python
import json
from enum import StrEnum, auto

class Status(StrEnum):
    WON = auto()

restored = json.loads(json.dumps({"status": Status.WON}))["status"]
print(type(restored).__name__, restored == Status.WON)
```

- [ ] `Status True`
- [x] `str True`
- [ ] `str False`
- [ ] `TypeError`

The member goes out as `"won"` and comes back as a plain string. It still compares equal, which is exactly why the slip is easy to miss: `==` keeps working, while `is` checks, `repr()` and enum methods see a `str`.
:::

:::challenge id=adventure-step-5 title="Step 5: Save and load" difficulty=medium
Add `save()` and `Game.load(world, text)`:

- `save()` returns a JSON object holding every field except `world`: `location`, `inventory`, `room_items`, `moves` and `status`.
- `Game.load(world, text)` rebuilds the game on top of `world`. Turn `status` back into a `Status` member, and raise `ValueError` if the saved location isn't a room in `world`.

`Game.load(game.world, game.save())` must equal `game` without sharing any lists with it.

```python starter
import json
from dataclasses import dataclass, field, fields
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None

    def save(self) -> str:
        """The game's progress as JSON. The world itself isn't saved."""
        ...

    @classmethod
    def load(cls, world: World, text: str) -> Self:
        """Rebuild a saved game on top of `world`."""
        ...


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."
```

```python solution
import json
from dataclasses import dataclass, field, fields
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None

    def save(self) -> str:
        """The game's progress as JSON. The world itself isn't saved."""
        return json.dumps({f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"})

    @classmethod
    def load(cls, world: World, text: str) -> Self:
        """Rebuild a saved game on top of `world`."""
        state = json.loads(text)
        if state["location"] not in world.rooms:
            raise ValueError(f"saved location {state['location']!r} isn't in this world")
        state["status"] = Status(state["status"])
        return cls(world, **state)


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."
```

```python tests
import json

DATA = {
    "start": "cave",
    "rooms": {
        "cave": {"description": "A damp cave.", "exits": {"out": "forest"}, "items": ["torch", "map"]},
        "forest": {"description": "Tall pines.", "exits": {"in": "cave"}},
    },
}


def played_game():
    game = Game.new(load_world(DATA))
    game.take("torch")
    game.go("out")
    game.drop("torch")
    return game


@test("save() writes the progress as JSON, without the world")
def _():
    state = json.loads(played_game().save())
    eq(state, {
        "location": "forest",
        "inventory": [],
        "room_items": {"cave": ["map"], "forest": ["torch"]},
        "moves": 1,
        "status": "playing",
    })

@test("load() rebuilds an equal game")
def _():
    game = played_game()
    eq(Game.load(game.world, game.save()), game)

@test("load() turns the status back into a Status member")
def _():
    game = played_game()
    game.status = Status.WON
    loaded = Game.load(game.world, game.save())
    check(type(loaded.status) is Status, f"expected a Status, got {type(loaded.status).__name__}")
    eq(loaded.status, Status.WON)

@test("the loaded game doesn't share lists with the saved one")
def _():
    game = played_game()
    loaded = Game.load(game.world, game.save())
    loaded.take("torch")
    eq(game.room_items["forest"], ["torch"])
    eq(game.inventory, [])

@test("a save from another world is a ValueError")
def _():
    other = load_world({"start": "moon", "rooms": {"moon": {"description": "Grey dust."}}})
    raises(ValueError, Game.load, other, played_game().save())

@test("a finished game round-trips too")
def _():
    game = played_game()
    game.status = Status.LOST
    eq(json.loads(game.save())["status"], "lost")
    eq(Game.load(game.world, game.save()).status, Status.LOST)
```

```hint
`{f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"}` is the whole state. `json.dumps()` it.
```

```hint
In `load()`, parse with `json.loads`, check `state["location"] in world.rooms`, replace `state["status"]` with `Status(state["status"])`, then `return cls(world, **state)`.
```
:::

## Step 6: Play a whole game

`play(commands, data)` is the game loop without the keyboard. It builds the world and a new game, feeds in one command at a time, and collects everything the player would see.

:::compare
```js
const rl = readline.createInterface({ input: process.stdin });
console.log(game.look());
for await (const line of rl) {
  console.log(execute(game, line));
  const ending = checkEnding(game);
  if (ending) {
    console.log(ending);
    break;
  }
}
```
```python
transcript = [game.look()]
for command in commands:
    transcript.append(f"> {command}")

    transcript.append(execute(game, command))
    if ending := game.check_ending():

        transcript.append(ending)
        break


```
:::

`save`, `load` and `quit` belong to the loop, not to `execute()`. Loading replaces the whole `Game` object, which a function that's handed the game can't do without copying every field across, so the loop matches these session commands first and passes everything else on. It's the same split as a REPL's own commands versus the code you type into it. The walrus binds and tests the ending in one line ([The walrus operator](lesson:control-flow#the-walrus-operator)).

:::note The interactive version
`input()` isn't available in the browser sandbox, but on your machine the whole terminal game is a few lines around the same pieces:

```python
def main():
    game = Game.new(load_world(WORLD))
    print(game.look())
    while game.status is Status.PLAYING:
        print(execute(game, input("> ")))
        if ending := game.check_ending():
            print(ending)
```
:::

:::challenge id=adventure-step-6 title="Step 6: Play a whole game" difficulty=hard
Write `play(commands, data)`. It loads the world from `data`, starts a new game, and returns the transcript: lines joined with `"\n"`.

1. The transcript opens with `look()` for the starting room.
2. For each command, add `> ` followed by the command exactly as given, then the reply.
3. `save` stores `game.save()` and replies `Saved.`. `load` restores the last save with `Game.load()` and replies `Loaded.`, or `Nothing saved yet.` if there isn't one. `quit` replies `Bye!` and stops. Like every other command, these ignore case.
4. Anything else goes to `execute()`. After it, call `check_ending()`: if it returns a text, add that and stop, ignoring the remaining commands.

`WORLD` is the manor from the top of the page, and the last test plays it from start to finish.

```python starter
import json
from dataclasses import dataclass, field, fields
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None

    def save(self) -> str:
        """The game's progress as JSON. The world itself isn't saved."""
        return json.dumps({f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"})

    @classmethod
    def load(cls, world: World, text: str) -> Self:
        """Rebuild a saved game on top of `world`."""
        state = json.loads(text)
        if state["location"] not in world.rooms:
            raise ValueError(f"saved location {state['location']!r} isn't in this world")
        state["status"] = Status(state["status"])
        return cls(world, **state)


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."


WORLD = {
    "start": "hall",
    "rooms": {
        "hall": {
            "description": "A dusty entrance hall. Daylight leaks under the front door.",
            "exits": {"north": "library", "east": "kitchen"},
        },
        "library": {
            "description": "Shelves of mouldy books. A reading lamp sits on the desk.",
            "exits": {"south": "hall"},
            "items": ["lamp", "book"],
        },
        "kitchen": {
            "description": "Copper pots hang over a cold stove. Stairs lead down.",
            "exits": {"west": "hall", "down": "cellar"},
        },
        "cellar": {
            "description": "A damp cellar. Something glints behind the wine rack.",
            "exits": {"up": "kitchen"},
            "items": ["crown"],
        },
    },
    "endings": [
        {"room": "hall", "has": "crown", "status": "won",
         "text": "You slip out into the sunlight with the crown. You win!"},
        {"room": "cellar", "lacks": "lamp", "status": "lost",
         "text": "It's pitch dark down here. You trip over a barrel and twist your ankle. Game over."},
        {"moves": 12, "status": "lost",
         "text": "The floorboards finally give way beneath you. Game over."},
    ],
}


def play(commands, data: dict) -> str:
    """Play a scripted game on the world in `data` and return the transcript."""
    ...
```

```python solution
import json
from dataclasses import dataclass, field, fields
from enum import StrEnum, auto
from typing import Self


@dataclass(frozen=True)
class Room:
    name: str
    description: str
    exits: dict[str, str]          # direction -> room name
    items: tuple[str, ...] = ()    # what lies here when the game starts


@dataclass(frozen=True)
class World:
    start: str
    rooms: dict[str, Room]
    endings: tuple[dict, ...] = ()  # win and lose rules, used in step 4


def load_world(data: dict) -> World:
    """Build a World from plain data, checking that every exit leads somewhere."""
    rooms = {
        name: Room(
            name,
            spec["description"],
            dict(spec.get("exits", {})),
            tuple(spec.get("items", ())),
        )
        for name, spec in data["rooms"].items()
    }
    if data["start"] not in rooms:
        raise ValueError(f"start room {data['start']!r} doesn't exist")
    for room in rooms.values():
        for direction, target in room.exits.items():
            if target not in rooms:
                raise ValueError(f"{room.name}: exit {direction!r} leads to unknown room {target!r}")
    endings = tuple(dict(rule) for rule in data.get("endings", ()))
    return World(data["start"], rooms, endings)


class Status(StrEnum):
    PLAYING = auto()
    WON = auto()
    LOST = auto()


@dataclass
class Game:
    world: World = field(repr=False)
    location: str
    inventory: list[str] = field(default_factory=list)
    room_items: dict[str, list[str]] = field(default_factory=dict)
    moves: int = 0
    status: Status = Status.PLAYING

    @classmethod
    def new(cls, world: World) -> Self:
        """A fresh game: at the start, empty-handed, every item where the map put it."""
        room_items = {name: list(room.items) for name, room in world.rooms.items()}
        return cls(world, world.start, room_items=room_items)

    @property
    def room(self) -> Room:
        """The Room the player is standing in."""
        return self.world.rooms[self.location]

    def look(self) -> str:
        lines = [self.room.description]
        if items := self.room_items[self.location]:
            lines.append(f"You see: {', '.join(items)}.")
        lines.append(f"Exits: {', '.join(self.room.exits) or 'none'}.")
        return "\n".join(lines)

    def go(self, direction: str) -> str:
        if direction not in self.room.exits:
            return "You can't go that way."
        self.location = self.room.exits[direction]
        self.moves += 1
        return self.look()

    def take(self, item: str) -> str:
        here = self.room_items[self.location]
        if item not in here:
            return f"There's no {item} here."
        here.remove(item)
        self.inventory.append(item)
        return f"Taken: {item}."

    def drop(self, item: str) -> str:
        if item not in self.inventory:
            return f"You don't have the {item}."
        self.inventory.remove(item)
        self.room_items[self.location].append(item)
        return f"Dropped: {item}."

    def list_inventory(self) -> str:
        if not self.inventory:
            return "You're empty-handed."
        return f"You're carrying: {', '.join(self.inventory)}."

    def check_ending(self) -> str | None:
        """If an ending rule applies, set the status and return the rule's text."""
        for rule in self.world.endings:
            match rule:
                case {"room": room, "has": item}:
                    reached = self.location == room and item in self.inventory
                case {"room": room, "lacks": item}:
                    reached = self.location == room and item not in self.inventory
                case {"moves": limit}:
                    reached = self.moves >= limit
                case _:
                    raise ValueError(f"unknown ending rule: {rule!r}")
            if reached:
                self.status = Status(rule["status"])
                return rule["text"]
        return None

    def save(self) -> str:
        """The game's progress as JSON. The world itself isn't saved."""
        return json.dumps({f.name: getattr(self, f.name) for f in fields(self) if f.name != "world"})

    @classmethod
    def load(cls, world: World, text: str) -> Self:
        """Rebuild a saved game on top of `world`."""
        state = json.loads(text)
        if state["location"] not in world.rooms:
            raise ValueError(f"saved location {state['location']!r} isn't in this world")
        state["status"] = Status(state["status"])
        return cls(world, **state)


DIRECTIONS = {"north", "south", "east", "west", "up", "down"}


def execute(game: Game, command: str) -> str:
    """Run one typed command against `game` and return the reply."""
    match command.lower().split():
        case []:
            return "Say something."
        case ["look" | "l"]:
            return game.look()
        case ["inventory" | "i"]:
            return game.list_inventory()
        case ["go", direction]:
            return game.go(direction)
        case [direction] if direction in DIRECTIONS:
            return game.go(direction)
        case ["take" | "get", *words] if words:
            return game.take(" ".join(words))
        case ["drop", *words] if words:
            return game.drop(" ".join(words))
        case ["go"]:
            return "Go where?"
        case [("take" | "get" | "drop") as verb]:
            return f"{verb.capitalize()} what?"
        case [verb, *_]:
            return f"I don't know how to {verb}."


WORLD = {
    "start": "hall",
    "rooms": {
        "hall": {
            "description": "A dusty entrance hall. Daylight leaks under the front door.",
            "exits": {"north": "library", "east": "kitchen"},
        },
        "library": {
            "description": "Shelves of mouldy books. A reading lamp sits on the desk.",
            "exits": {"south": "hall"},
            "items": ["lamp", "book"],
        },
        "kitchen": {
            "description": "Copper pots hang over a cold stove. Stairs lead down.",
            "exits": {"west": "hall", "down": "cellar"},
        },
        "cellar": {
            "description": "A damp cellar. Something glints behind the wine rack.",
            "exits": {"up": "kitchen"},
            "items": ["crown"],
        },
    },
    "endings": [
        {"room": "hall", "has": "crown", "status": "won",
         "text": "You slip out into the sunlight with the crown. You win!"},
        {"room": "cellar", "lacks": "lamp", "status": "lost",
         "text": "It's pitch dark down here. You trip over a barrel and twist your ankle. Game over."},
        {"moves": 12, "status": "lost",
         "text": "The floorboards finally give way beneath you. Game over."},
    ],
}


def play(commands, data: dict) -> str:
    """Play a scripted game on the world in `data` and return the transcript."""
    world = load_world(data)
    game = Game.new(world)
    saved = None
    transcript = [game.look()]
    for command in commands:
        transcript.append(f"> {command}")
        match command.lower().split():
            case ["quit"]:
                transcript.append("Bye!")
                break
            case ["save"]:
                saved = game.save()
                transcript.append("Saved.")
            case ["load"] if saved is None:
                transcript.append("Nothing saved yet.")
            case ["load"]:
                game = Game.load(world, saved)
                transcript.append("Loaded.")
            case _:
                transcript.append(execute(game, command))
                if ending := game.check_ending():
                    transcript.append(ending)
                    break
    return "\n".join(transcript)
```

```python tests
HALL = "A dusty entrance hall. Daylight leaks under the front door.\nExits: north, east."
WIN = "You slip out into the sunlight with the crown. You win!"


@test("the transcript opens with the starting room")
def _():
    eq(play([], WORLD), HALL)

@test("each command is echoed after '> ', then answered")
def _():
    eq(play(["look", "dance"], WORLD), "\n".join([HALL, "> look", HALL, "> dance", "I don't know how to dance."]))

@test("a winning walkthrough ends with the winning text")
def _():
    lines = play(["north", "take lamp", "south", "east", "down", "take crown", "up", "west"], WORLD).splitlines()
    eq(lines[-1], WIN)

@test("losing ends the game, and later commands are ignored")
def _():
    lines = play(["east", "down", "up", "look"], WORLD).splitlines()
    eq(lines[-1], "It's pitch dark down here. You trip over a barrel and twist your ankle. Game over.")
    check("> up" not in lines, "stop reading commands once the game is over")

@test("wandering for too long loses too")
def _():
    lines = play(["north", "south"] * 7, WORLD).splitlines()
    eq(lines[-1], "The floorboards finally give way beneath you. Game over.")
    eq(sum(line.startswith("> ") for line in lines), 12, "the 12th move should end the game")

@test("load restores the game as it was when saved")
def _():
    lines = play(["north", "take lamp", "save", "drop lamp", "load", "inventory"], WORLD).splitlines()
    eq(lines[-8:], [
        "> save", "Saved.",
        "> drop lamp", "Dropped: lamp.",
        "> load", "Loaded.",
        "> inventory", "You're carrying: lamp.",
    ])

@test("load before any save")
def _():
    eq(play(["load"], WORLD), "\n".join([HALL, "> load", "Nothing saved yet."]))

@test("quit stops early")
def _():
    eq(play(["quit", "north"], WORLD), "\n".join([HALL, "> quit", "Bye!"]))

@test("every call starts a fresh game")
def _():
    first = play(["north", "take lamp"], WORLD)
    second = play(["north", "take lamp"], WORLD)
    eq(second, first, "the second game should find the lamp again")
    eq(load_world(WORLD).rooms["library"].items, ("lamp", "book"))

@test("everything together: a full game with a save and a load")
def _():
    commands = [
        "north", "take lamp", "save", "drop lamp", "load", "inventory",
        "south", "east", "down", "take crown", "up", "west", "north",
    ]
    eq(play(commands, WORLD), "\n".join([
        HALL,
        "> north",
        "Shelves of mouldy books. A reading lamp sits on the desk.",
        "You see: lamp, book.",
        "Exits: south.",
        "> take lamp",
        "Taken: lamp.",
        "> save",
        "Saved.",
        "> drop lamp",
        "Dropped: lamp.",
        "> load",
        "Loaded.",
        "> inventory",
        "You're carrying: lamp.",
        "> south",
        HALL,
        "> east",
        "Copper pots hang over a cold stove. Stairs lead down.",
        "Exits: west, down.",
        "> down",
        "A damp cellar. Something glints behind the wine rack.",
        "You see: crown.",
        "Exits: up.",
        "> take crown",
        "Taken: crown.",
        "> up",
        "Copper pots hang over a cold stove. Stairs lead down.",
        "Exits: west, down.",
        "> west",
        HALL,
        WIN,
    ]))
```

```hint
Match the session commands on `command.lower().split()`: `case ["save"]:`, `case ["load"] if saved is None:`, `case ["load"]:`, `case ["quit"]:`, and finally `case _:` for everything that goes to `execute()`.
```

```hint
Keep the last save in a local variable that starts as `None`. Loading replaces `game` itself: `game = Game.load(world, saved)`.
```
:::

## Where to take it next

- **Dark rooms.** Give rooms a `"dark": true` flag, and make `look()` hide their items unless you carry a light.
- **Locked exits.** Add `"locked": {"down": "key"}` to a room's data, and refuse to `go()` that way without the key.
- **Reachability.** In `load_world()`, walk the graph from `start` with a `deque` and refuse rooms that nobody can reach ([Graphs](lesson:graphs)).
- **A real terminal game.** Wrap the loop above in a script that picks a world file with `argparse` ([Command-Line Tools](lesson:command-line-tools)).
