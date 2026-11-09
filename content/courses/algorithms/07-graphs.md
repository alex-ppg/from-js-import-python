---
title: Graphs
part: Structures
summary: Adjacency dicts, grids, BFS with deque, iterative DFS, topological sort, Dijkstra and union-find.
minutes: 55
---

Graph problems arrive in two disguises: a list of edges (flights, friendships, course prerequisites) that you turn into an adjacency dict, or a 2D grid whose neighbours are implicit. Either way the classic algorithms are short in Python, because the standard library ships the three structures they lean on, `defaultdict`, `deque` and `heapq`, and JavaScript has none of them built in. The habit to unlearn is recursive DFS: CPython caps recursion at 1,000 frames by default, so any traversal that might go deep uses an explicit stack.

## Adjacency dicts

:::compare
```js
const graph = new Map();
for (const [a, b] of edges) {
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  graph.get(a).push(b);
  graph.get(b).push(a);
}
```
```python
from collections import defaultdict

graph = defaultdict(list)
for a, b in edges:
    graph[a].append(b)
    graph[b].append(a)
```
:::

`defaultdict(list)` creates the empty list the first time you touch a key, which removes the `has`/`set` dance ([defaultdict](lesson:dicts#defaultdict-no-more-create-it-if-it-s-missing) has the details). An undirected edge goes in both directions, a directed one only from its source. For weighted graphs, store `(neighbour, weight)` tuples. Any hashable value works as a node: strings, ints, `(row, col)` tuples. The structure takes O(V + E) space.

Use `defaultdict(set)` when the input can repeat an edge or you need O(1) "is there an edge?" checks. When nodes are numbered `0` to `n - 1`, a list of lists, `[[] for _ in range(n)]`, is a little faster and has no missing-key surprises.

```python run
from collections import defaultdict

flights = [("SFO", "JFK", 320), ("SFO", "SEA", 90), ("SEA", "JFK", 210), ("JFK", "LHR", 450)]

routes = defaultdict(list)
for origin, dest, price in flights:
    routes[origin].append((dest, price))     # directed and weighted

print(routes["SFO"])
print(routes["LHR"])          # no departures: an empty list...
print("LHR" in routes)        # ...and reading it inserted the key
```

:::gotcha Reading a `defaultdict` writes to it
`routes["LHR"]` inserted an empty list. That's harmless until it happens inside a loop over the same dict: read a node with no outgoing edges while iterating `for node in routes:`, and the dict changes size mid-loop, which raises `RuntimeError`. In traversal code, read with `graph.get(node, ())`, which never inserts.
:::

```python run raises
from collections import defaultdict

follows = defaultdict(list)
follows["ana"].append("bo")          # bo follows nobody, so bo isn't a key yet

for user in follows:
    for other in follows[user]:
        print(user, "->", other, "who follows", follows[other])   # inserts "bo"
```

## Grids are graphs too

:::compare
```js
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

for (const [dr, dc] of DIRS) {
  const nr = r + dr, nc = c + dc;
  if (grid[nr]?.[nc] === "#") {     // out of bounds is undefined
    visit(nr, nc);
  }
}
```
```python
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))

for dr, dc in DIRS:
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "#":
        visit(nr, nc)
```
:::

In a grid, each cell `(r, c)` is a node and its neighbours are computed on the fly, so there's no adjacency dict to build. Keep the four directions in a tuple of tuples and bounds-check with a [chained comparison](lesson:truthiness-and-equality#chained-comparisons). A grid with R rows and C columns has R × C nodes and fewer than 4RC edges, so a full traversal costs O(R × C).

:::gotcha Negative indices wrap around
In JavaScript `grid[-1]` is `undefined`, so `grid[r - 1]?.[c]` doubles as a bounds check. In Python `grid[-1]` is the **last row**: a cell on the top edge quietly "neighbours" a cell on the bottom edge, and your answer comes out wrong with no error. Going past the far edge, `grid[rows]`, raises `IndexError`. Check bounds explicitly, before you index.
:::

```python run
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))

def neighbours(grid, r, c):
    rows, cols = len(grid), len(grid[0])
    for dr, dc in DIRS:
        nr, nc = r + dr, c + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            yield nr, nc

grid = ["#..",
        "##.",
        ".#."]
print(list(neighbours(grid, 0, 0)))                       # a corner has two
print(sum(grid[nr][nc] == "#" for nr, nc in neighbours(grid, 1, 1)))
```

:::quiz output
What does this print?

```python
grid = ["ab",
        "cd"]
r, c = 0, 1
print(grid[r - 1][c])
```

- [ ] `IndexError`
- [x] `d`
- [ ] `b`
- [ ] `None`

`r - 1` is `-1`, and `grid[-1]` is the last row, `"cd"`. There's no error and no `undefined`: the top row silently wraps to the bottom one.
:::

## BFS: shortest paths with `deque`

:::compare
```js
const dist = new Map([[start, 0]]);
const queue = [start];
while (queue.length) {
  const node = queue.shift();           // O(n): shifts everything
  for (const next of graph.get(node) ?? []) {
    if (!dist.has(next)) {
      dist.set(next, dist.get(node) + 1);
      queue.push(next);
    }
  }
}
```
```python
from collections import deque

dist = {start: 0}
queue = deque([start])
while queue:
    node = queue.popleft()               # O(1)
    for nxt in graph.get(node, ()):
        if nxt not in dist:
            dist[nxt] = dist[node] + 1
            queue.append(nxt)
```
:::

BFS visits nodes in rings of increasing distance from the start, so the first time it reaches a node is along a shortest path, as long as every edge counts the same. It's O(V + E) time and O(V) space. Two details matter:

- **`deque.popleft()` is O(1).** `list.pop(0)` shifts every remaining item, like `shift()` on a big JS array, which makes BFS O(V²) on wide graphs.
- **Mark a node when you enqueue it**, not when you dequeue it. Otherwise a node enters the queue once for every neighbour that discovers it. Here `dist` doubles as the visited set.

To recover the path itself, store each node's parent at the moment you enqueue it, then walk the parents back from the goal and reverse.

```python run
from collections import deque

maze = ["S.#.....",
        ".##.###.",
        "....#E..",
        ".##...#."]

def steps_to_exit(maze):
    rows, cols = len(maze), len(maze[0])
    start = next((r, c) for r, row in enumerate(maze) for c, ch in enumerate(row) if ch == "S")
    dist = {start: 0}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        if maze[r][c] == "E":
            return dist[r, c]
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and maze[nr][nc] != "#" and (nr, nc) not in dist:
                dist[nr, nc] = dist[r, c] + 1
                queue.append((nr, nc))
    return None

print(steps_to_exit(maze))
```

:::quiz
A BFS over a graph with V nodes and E edges keeps its queue in a plain list and dequeues with `queue.pop(0)`. What's the worst-case running time?

- [ ] O(V + E)
- [x] O(V² + E)
- [ ] O((V + E) log V)
- [ ] O(V × E)

Each `pop(0)` shifts every item behind it, and the queue can hold O(V) nodes, so the V dequeues cost O(V²) between them. The edge work is still O(E). `deque.popleft()` is O(1), which restores O(V + E).
:::

## DFS without recursion

:::compare
```js
function reachable(node, seen = new Set()) {
  seen.add(node);
  for (const next of graph.get(node) ?? []) {
    if (!seen.has(next)) reachable(next, seen);
  }
  return seen;
}
```
```python
def reachable(graph, start):
    seen = {start}
    stack = [start]
    while stack:
        node = stack.pop()
        for nxt in graph.get(node, ()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen
```
:::

The recursive version is the natural one in JavaScript, and a JS engine's stack holds many thousands of frames. CPython stops at 1,000 ([Recursion](lesson:functions#recursion-a-low-limit-and-no-tail-calls)), so recursive DFS raises `RecursionError` on a path of a thousand or so nodes. In this browser sandbox it's worse: deep recursion can overflow the WebAssembly stack and crash the interpreter before the limit is reached, so keep plain recursion under about 500 frames here, and recursion through C code, such as a helper decorated with `@functools.cache`, under about 300. An explicit stack has no such ceiling, because a list's `append` and `pop` are O(1) at the end. Time and space stay O(V + E) and O(V).

```python run
def reachable(graph, start):
    seen = {start}
    stack = [start]
    while stack:
        node = stack.pop()
        for nxt in graph.get(node, ()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen

chain = {i: [i + 1] for i in range(100_000)}       # 0 -> 1 -> ... -> 100000
print(len(reachable(chain, 0)))                     # recursion would need 100,000 frames
print(sorted(reachable({"a": ["b"], "b": ["a"], "c": []}, "a")))
```

The visiting order isn't the recursive one: the stack pops the most recently pushed neighbour first. For reachability, components and counting, order doesn't matter. If an expected output depends on the exact recursive preorder, push the neighbours in reverse and mark nodes when you pop them instead.

:::quiz output
What does this print?

```python
graph = {"a": ["b", "c"], "b": ["d"], "c": [], "d": []}
seen, stack, order = {"a"}, ["a"], []
while stack:
    node = stack.pop()
    order.append(node)
    for nxt in graph[node]:
        if nxt not in seen:
            seen.add(nxt)
            stack.append(nxt)
print(order)
```

- [ ] `['a', 'b', 'd', 'c']`
- [x] `['a', 'c', 'b', 'd']`
- [ ] `['a', 'b', 'c', 'd']`
- [ ] `['a', 'c', 'd', 'b']`

`a` pushes `b` then `c`, so `c` pops first. Then `b` pops and pushes `d`. Recursive DFS would give `['a', 'b', 'd', 'c']`.
:::

## Connected components and islands

To count components, loop over every node and start a traversal from each one you haven't seen yet: every fresh start is a new component. Each node and edge is still processed once overall, so it's O(V + E), or O(R × C) on a grid. BFS and DFS both work, since only reachability matters.

```python run
def friend_groups(people, friendships):
    graph = {person: [] for person in people}
    for a, b in friendships:
        graph[a].append(b)
        graph[b].append(a)
    seen, groups = set(), []
    for person in people:
        if person in seen:
            continue
        seen.add(person)
        stack, group = [person], []
        while stack:
            current = stack.pop()
            group.append(current)
            for friend in graph[current]:
                if friend not in seen:
                    seen.add(friend)
                    stack.append(friend)
        groups.append(sorted(group))
    return groups

print(friend_groups(["ana", "bo", "cy", "dee", "eve"], [("ana", "cy"), ("dee", "bo")]))
```

:::tip Sinking islands mutates the caller's grid
The classic interview trick for grids is to "sink" each visited land cell by overwriting it, which saves the `seen` set. In Python a grid of strings can't be overwritten in place, and a list of lists belongs to the caller, so changing it is a side effect they didn't ask for. A set of `(r, c)` tuples costs O(R × C) memory and keeps the function pure.
:::

## Topological sort and cycle detection

A topological order lists every node after all the nodes that point to it: build steps after their dependencies, courses after their prerequisites. **Kahn's algorithm** counts each node's in-degree (its incoming edges) and starts from the nodes with none. Each time it emits a node, it decrements that node's successors and queues any that reach zero. It's O(V + E). If it emits fewer nodes than the graph has, the leftovers all sit on a cycle or depend on one, so cycle detection comes for free.

```python run
from collections import Counter, defaultdict, deque

prereqs = [("algebra", "calculus"), ("calculus", "physics"),
           ("algebra", "stats"), ("logic", "stats")]

def course_order(edges):
    unlocks = defaultdict(list)
    indegree = Counter()
    for before, course in edges:
        unlocks[before].append(course)
        indegree[course] += 1
    courses = {c for edge in edges for c in edge}
    queue = deque(sorted(c for c in courses if indegree[c] == 0))
    order = []
    while queue:
        course = queue.popleft()
        order.append(course)
        for nxt in unlocks[course]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    if len(order) < len(courses):
        raise ValueError("the prerequisites contain a cycle")
    return order

print(course_order(prereqs))
```

`Counter` returns 0 for a missing key *without* inserting it, which makes it a tidy in-degree table. The `sorted` call matters more than it looks: sets of strings iterate in an order that can change between runs, because string hashes are randomised per process.

:::tip Ties in a fixed order
Kahn's algorithm allows any ready node to go next. When the answer must break ties in a fixed order, say alphabetically, swap the deque for a heap: `heappop(ready)` always takes the smallest ready node, at O(log V) per pop.
:::

:::pythonic `graphlib` is in the standard library
`graphlib.TopologicalSorter` (3.9+) implements this for you. Mind the input shape: it maps each node to its **predecessors**, what it depends on, which is the reverse of an adjacency dict. Iterating `static_order()` yields a valid order, or raises `graphlib.CycleError`, a `ValueError` subclass whose second argument lists the cycle.
:::

```python run
from graphlib import CycleError, TopologicalSorter

needs = {"app": ["lib", "ui"], "ui": ["lib"]}       # node -> what it depends on
print(list(TopologicalSorter(needs).static_order()))

try:
    list(TopologicalSorter({"a": ["b"], "b": ["a"]}).static_order())
except CycleError as err:
    print("cycle:", err.args[1])
```

:::quiz output
What does this print?

```python
from graphlib import TopologicalSorter

steps = {"deploy": ["test"], "test": ["build"]}
print(list(TopologicalSorter(steps).static_order()))
```

- [x] `['build', 'test', 'deploy']`
- [ ] `['deploy', 'test', 'build']`
- [ ] `['test', 'build', 'deploy']`
- [ ] `CycleError`

The dict maps each node to its predecessors, so `deploy` needs `test` and `test` needs `build`. Predecessors come first.
:::

For an **undirected** graph, in-degrees mean nothing. Use union-find (below): an edge whose endpoints are already connected closes a cycle.

:::deep Post-order DFS without recursion
Some DFS algorithms need to know when a node is *finished*, with every descendant explored. Directed cycle detection is the classic one: an edge back to a node that's still on the current path is a cycle. Recursion tracks that for free. Without it, keep an iterator in each stack entry and advance it with `next(it, None)`. Popping the entry when its iterator runs dry is the moment the recursive call would have returned.

```python run
def has_cycle(graph):
    state = {}                          # 1 = on the current path, 2 = finished
    for root in graph:
        if root in state:
            continue
        state[root] = 1
        stack = [(root, iter(graph.get(root, ())))]
        while stack:
            node, children = stack[-1]
            child = next(children, None)
            if child is None:
                state[node] = 2
                stack.pop()
            elif state.get(child) == 1:
                return True             # back edge into the current path
            elif child not in state:
                state[child] = 1
                stack.append((child, iter(graph.get(child, ()))))
    return False

print(has_cycle({"a": ["b"], "b": ["c"], "c": ["a"]}))
print(has_cycle({"a": ["b", "c"], "b": ["c"], "c": []}))
```
:::

## Dijkstra with `heapq`

:::compare
```js
const dist = new Map([[start, 0]]);
const pq = [[0, start]];
while (pq.length) {
  pq.sort((a, b) => a[0] - b[0]);       // no heap: re-sort every time
  const [d, node] = pq.shift();
  if (d > dist.get(node)) continue;
  for (const [next, w] of graph.get(node) ?? []) {
    const nd = d + w;
    if (nd < (dist.get(next) ?? Infinity)) {
      dist.set(next, nd);
      pq.push([nd, next]);
    }
  }
}
```
```python
dist = {start: 0}
heap = [(0, start)]
while heap:
    d, node = heappop(heap)              # O(log n)
    if d > dist[node]:
        continue                         # a stale entry
    for nxt, w in graph.get(node, ()):
        nd = d + w
        if nd < dist.get(nxt, inf):
            dist[nxt] = nd
            heappush(heap, (nd, nxt))
```
:::

Dijkstra's algorithm is BFS with a priority queue: always expand the unfinished node with the smallest known distance. JavaScript has no priority queue, so you'd install one or re-sort an array. Python's `heapq` is a min-heap kept in a plain list, and tuples compare item by item, so `(distance, node)` entries pop in distance order.

`heapq` has no decrease-key operation. When a shorter route to a node turns up, push a second entry and skip the stale one when it surfaces: that's the `if d > dist[node]: continue` line. Time is O((V + E) log V) and space O(V + E). Weights must be non-negative, because Dijkstra treats a node as final once it's popped, and a negative edge found later could still make it cheaper. Negative weights need Bellman-Ford.

```python run
from heapq import heappop, heappush
from math import inf

roads = {
    "home": [("cafe", 4), ("park", 1)],
    "park": [("cafe", 2), ("office", 7)],
    "cafe": [("office", 3)],
}

def travel_times(graph, start):
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, node = heappop(heap)
        if d > dist[node]:
            continue
        for nxt, minutes in graph.get(node, ()):
            nd = d + minutes
            if nd < dist.get(nxt, inf):
                dist[nxt] = nd
                heappush(heap, (nd, nxt))
    return dist

print(travel_times(roads, "home"))
```

:::gotcha Equal distances compare the nodes
When two heap entries tie on distance, `heapq` compares their second items. Strings and numbers are fine, but dicts and most custom objects raise `TypeError: '<' not supported`. Put a unique counter between the two, `(dist, next(tiebreak), node)` with `tiebreak = itertools.count()`, as in [the toolkit lesson](lesson:algorithm-toolkit).
:::

:::quiz output
What does this print?

```python
import heapq

heap = []
for entry in [(2, "bo"), (1, "eve"), (2, "ana")]:
    heapq.heappush(heap, entry)
print([heapq.heappop(heap)[1] for _ in range(3)])
```

- [ ] `['eve', 'bo', 'ana']`
- [x] `['eve', 'ana', 'bo']`
- [ ] `['bo', 'eve', 'ana']`
- [ ] `TypeError`

Tuples compare item by item: `1` beats both `2`s, and the tie between `(2, "bo")` and `(2, "ana")` is broken by the strings. Insertion order plays no part, so `heapq` isn't stable on its own.
:::

## Union-find

Union-find, or a disjoint-set forest, answers "are these two connected?" while edges keep arriving, something BFS can only do by traversing again. Each group is a tree of parent pointers: `find` walks up to the root, and `union` hangs one root under the other. Two tricks keep the trees nearly flat. **Union by size** attaches the smaller tree under the larger, and **path compression** re-points the nodes `find` walks past closer to the root. Together they make each operation O(α(n)) amortised, where α, the inverse Ackermann function, stays below 5 for any input that fits in a computer. Space is O(n).

```python run
class DisjointSet:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False                 # already connected
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra             # the smaller tree goes under the larger
        self.size[ra] += self.size[rb]
        return True

network = DisjointSet(6)
for a, b in [(0, 1), (1, 2), (3, 4), (2, 0), (4, 5)]:
    if not network.union(a, b):
        print(f"cable {a}-{b} closes a loop")
print(network.find(5) == network.find(3), network.find(0) == network.find(5))
```

The `parent[x] = parent[parent[x]]` line is **path halving**: it points every other node on the path at its grandparent as `find` climbs. It's a one-loop form of path compression with the same guarantees, and unlike the recursive textbook version, it never recurses, so a long chain can't hit the recursion limit even if you skip union by size.

## Bipartite graphs

A graph is bipartite when you can colour each node with one of two colours so that every edge joins different colours: rivals split into two teams, people and the projects they work on. BFS from each uncoloured node, give each neighbour the opposite colour, and fail as soon as an edge joins two nodes of the same colour. That happens exactly when the graph contains an odd cycle. O(V + E), and the outer loop matters: each component needs its own start.

```python run
from collections import deque

def two_colour(graph):
    colour = {}
    for start in graph:
        if start in colour:
            continue
        colour[start] = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nxt in graph[node]:
                if nxt not in colour:
                    colour[nxt] = 1 - colour[node]
                    queue.append(nxt)
                elif colour[nxt] == colour[node]:
                    return None             # an odd cycle
    return colour

square = {"a": ["b", "d"], "b": ["a", "c"], "c": ["b", "d"], "d": ["c", "a"]}
triangle = {"a": ["b", "c"], "b": ["a", "c"], "c": ["a", "b"]}
print(two_colour(square))
print(two_colour(triangle))
```

:::quiz
Which of these graphs is **not** bipartite?

- [ ] A tree with 10 nodes
- [ ] A cycle of 6 nodes
- [x] A cycle of 5 nodes
- [ ] 8 nodes and no edges

Walking around a cycle alternates the colours, so you get back to the start with the opposite colour exactly when the cycle is odd. Trees have no cycles at all, so they're always two-colourable.
:::

## Choosing an algorithm

| You need | Reach for | Time |
| --- | --- | --- |
| Fewest edges from A to B | BFS with `deque` | O(V + E) |
| Cheapest path, non-negative weights | Dijkstra with `heapq` | O((V + E) log V) |
| Everything reachable, components, islands | BFS or iterative DFS | O(V + E) |
| Connectivity while edges keep arriving | union-find | O(α(n)) per operation |
| An order that respects dependencies | Kahn's algorithm or `graphlib` | O(V + E) |
| A cycle check | Kahn (directed), union-find (undirected) | O(V + E), or close to it |
| A two-colouring | BFS colouring | O(V + E) |

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `new Map()` + "create the array if missing" | `graph = defaultdict(list)` | reading a missing key inserts it |
| `graph.get(n) ?? []` | `graph.get(n, ())` | never inserts |
| `grid[r]?.[c]` | `0 <= r < rows and 0 <= c < cols` | negative indices wrap around |
| `queue.shift()` | `queue.popleft()` on a `deque` | O(1) instead of O(n) |
| recursive `dfs(next)` | `while stack: node = stack.pop()` | no 1,000-frame ceiling |
| a priority-queue package | `heappush(heap, (dist, node))`, `heappop(heap)` | a min-heap; tuples compare in order |
| `Infinity` | `math.inf` | "not reached yet" |
| a hand-rolled topological sort | `TopologicalSorter(preds).static_order()` | maps nodes to predecessors; `CycleError` |
| no built-in | a `DisjointSet` with `find` and `union` | path halving plus union by size |

## Challenges

:::challenge id=algo-graph-islands title="Count the islands" difficulty=easy
Write `count_islands(grid)`. The grid is a list of equal-length strings where `"#"` is land and `"."` is water. Return the number of islands: groups of land cells joined horizontally or vertically (diagonals don't count).

```text
count_islands([
    "##..#",
    "#...#",
    "..#..",
    ".....",
])  ->  3
```

The tests include a 300 × 300 grid that is one big island, so use an explicit stack or a queue rather than recursion. Don't modify the grid.

```js
function countIslands(grid) {
  const cells = grid.map((row) => [...row]);
  const sink = (r, c) => {
    if (cells[r]?.[c] !== "#") return;
    cells[r][c] = ".";
    sink(r + 1, c); sink(r - 1, c); sink(r, c + 1); sink(r, c - 1);
  };
  let count = 0;
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell === "#") { count++; sink(r, c); }
  }));
  return count;
}
```

```python starter
def count_islands(grid):
    ...
```

```python solution
def count_islands(grid):
    rows = len(grid)
    cols = len(grid[0]) if grid else 0
    seen = set()
    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != "#" or (r, c) in seen:
                continue
            islands += 1
            seen.add((r, c))
            stack = [(r, c)]
            while stack:
                cr, cc = stack.pop()
                for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                    if (0 <= nr < rows and 0 <= nc < cols
                            and grid[nr][nc] == "#" and (nr, nc) not in seen):
                        seen.add((nr, nc))
                        stack.append((nr, nc))
    return islands
```

```python tests
import sys


def shallow(fn, *args):
    """Run fn with a low recursion limit, so deep recursion fails fast and cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: use an explicit stack")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep: use an explicit stack or a deque") from None
    finally:
        sys.setrecursionlimit(limit)


@test("counts separate islands")
def _():
    eq(count_islands(["##..#", "#...#", "..#..", "....."]), 3)

@test("diagonal neighbours aren't connected")
def _():
    eq(count_islands(["#.", ".#"]), 2)

@test("all water, and empty grids")
def _():
    eq(count_islands(["...", "..."]), 0)
    eq(count_islands([]), 0)
    eq(count_islands([""]), 0)

@test("a single cell")
def _():
    eq(count_islands(["#"]), 1)
    eq(count_islands(["."]), 0)

@test("islands don't wrap around the edges")
def _():
    eq(count_islands(["#..#"]), 2, "the first and last columns aren't neighbours")
    eq(count_islands(["#", ".", "#"]), 2, "the first and last rows aren't neighbours")
    eq(count_islands(["#.#", "...", "###"]), 3, "grid[-1] is the bottom row, not 'off the grid'")
    eq(count_islands(["#.#", "..#", "#.#"]), 3, "row[-1] is the last column, not 'off the grid'")

@test("a winding island is still one island")
def _():
    eq(count_islands(["#####", "....#", "###.#", "#...#", "#####"]), 1)

@test("a lake inside an island, and an island inside the lake")
def _():
    eq(count_islands(["###", "#.#", "###"]), 1)
    eq(count_islands(["#####", "#...#", "#.#.#", "#...#", "#####"]), 2)

@test("doesn't modify the grid")
def _():
    grid = ["##.", "..#"]
    count_islands(grid)
    eq(grid, ["##.", "..#"])

@test("a 300 x 300 island, without deep recursion")
def _():
    eq(shallow(count_islands, ["#" * 300] * 300), 1)
```

```hint
Scan every cell. When you find land you haven't seen, that's a new island: count it, then visit everything reachable from it so you don't count those cells again.
```

```hint
Use a set of `(r, c)` tuples for "seen" and a list as a stack: `stack.pop()`, then push each in-bounds land neighbour you haven't seen yet. Check `0 <= nr < rows` *before* indexing, because `grid[-1]` is the last row.
```
:::

:::challenge id=algo-graph-separation title="Degrees of separation" difficulty=medium
Write `connection_path(friendships, start, goal)`. `friendships` is a list of `(a, b)` pairs, and friendship goes both ways. Return a shortest chain of people from `start` to `goal` as a list that includes both ends, or `None` if they aren't connected. If `start == goal`, the chain is just `[start]`. When several chains are equally short, any of them is fine.

```text
connection_path([("ana", "bo"), ("bo", "cy"), ("ana", "dee"), ("dee", "cy")], "ana", "cy")
  ->  ["ana", "bo", "cy"]    (or ["ana", "dee", "cy"])
```

People can be any hashable value, including the integer `0`. One test is a chain of 200,000 people, so build the path efficiently.

```js
function connectionPath(friendships, start, goal) {
  const graph = new Map();
  for (const [a, b] of friendships) {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push(b);
    graph.get(b).push(a);
  }
  const parent = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    let person = queue.shift();
    if (person === goal) {
      const path = [];
      for (; person !== null; person = parent.get(person)) path.unshift(person);
      return path;
    }
    for (const friend of graph.get(person) ?? []) {
      if (!parent.has(friend)) {
        parent.set(friend, person);
        queue.push(friend);
      }
    }
  }
  return null;
}
```

```python starter
def connection_path(friendships, start, goal):
    ...
```

```python solution
from collections import defaultdict, deque


def connection_path(friendships, start, goal):
    graph = defaultdict(list)
    for a, b in friendships:
        graph[a].append(b)
        graph[b].append(a)
    parent = {start: None}
    queue = deque([start])
    while queue:
        person = queue.popleft()
        if person == goal:
            path = []
            while person is not None:
                path.append(person)
                person = parent[person]
            return path[::-1]
        for friend in graph[person]:
            if friend not in parent:
                parent[friend] = person
                queue.append(friend)
    return None
```

```python tests
import sys


def shallow(fn, *args):
    """Run fn with a low recursion limit, so deep recursion fails fast and cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: use loops")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep: search with a deque and rebuild the path with a loop") from None
    finally:
        sys.setrecursionlimit(limit)


def is_chain(path, friendships, start, goal):
    pairs = {frozenset(pair) for pair in friendships}
    return (path[0] == start and path[-1] == goal
            and all(frozenset(hop) in pairs for hop in zip(path, path[1:])))

DIAMOND = [("ana", "bo"), ("bo", "cy"), ("ana", "dee"), ("dee", "cy")]

@test("direct friends")
def _():
    eq(connection_path([("ana", "bo")], "ana", "bo"), ["ana", "bo"])

@test("friendship goes both ways")
def _():
    eq(connection_path([("ana", "bo"), ("bo", "cy")], "cy", "ana"), ["cy", "bo", "ana"])

@test("any shortest chain is accepted")
def _():
    path = connection_path(DIAMOND, "ana", "cy")
    check(path is not None, "ana and cy are connected")
    eq(len(path), 3, "the shortest chain has 3 people")
    check(is_chain(path, DIAMOND, "ana", "cy"), f"{path} isn't a chain of friends from ana to cy")

@test("prefers the shortest chain over a long one")
def _():
    friends = [("a", "b"), ("b", "c"), ("c", "d"), ("d", "e"), ("e", "goal"), ("a", "x"), ("x", "goal")]
    eq(connection_path(friends, "a", "goal"), ["a", "x", "goal"])

@test("start equals goal")
def _():
    eq(connection_path(DIAMOND, "bo", "bo"), ["bo"])
    eq(connection_path([], "zed", "zed"), ["zed"])

@test("returns None when there's no chain")
def _():
    eq(connection_path([("ana", "bo"), ("cy", "dee")], "ana", "dee"), None)
    eq(connection_path(DIAMOND, "ana", "stranger"), None)
    eq(connection_path([], "ana", "bo"), None)

@test("works with integer ids, including 0")
def _():
    eq(connection_path([(0, 1), (1, 2)], 2, 0), [2, 1, 0])
    eq(connection_path([(0, 1), (1, 2)], 0, 2), [0, 1, 2])

@test("a chain of 200,000 people")
def _():
    n = 200_000
    friends = [(i, i + 1) for i in range(n - 1)]
    path = shallow(connection_path, friends, 0, n - 1)
    check(path == list(range(n)), "expected the whole chain, 0, 1, 2, ... in order")
```

```hint
Build an adjacency dict (both directions), then BFS from `start` with a `deque`. The first time you dequeue `goal`, you've found a shortest chain.
```

```hint
Record `parent[friend] = person` when you enqueue `friend`, with `parent = {start: None}`. To rebuild the chain, follow parents back from `goal` while the node `is not None` (a plain `while person:` stops early at person `0`), then reverse once with `[::-1]`. Copying a path into every queue entry, or calling `insert(0, ...)` in a loop, is quadratic.
```
:::

:::challenge id=algo-graph-build-order title="Build order" difficulty=medium
Write `build_order(deps)`. `deps` maps each task to the list of tasks it depends on, which must be built first. A task that only ever appears as a dependency still needs building. Return every task in build order, building one task at a time and **always picking the alphabetically first task whose dependencies are all built**, so the answer is unique. Raise `ValueError` if the dependencies contain a cycle.

```text
build_order({"app": ["lib", "ui"], "ui": ["lib"]})  ->  ["lib", "ui", "app"]
build_order({"b": [], "c": [], "a": ["b"]})         ->  ["b", "a", "c"]
```

In the second example, `b` and `c` are ready first. `b` goes, which makes `a` ready, and `a` comes before `c`. One test builds 40,000 tasks.

```python starter
def build_order(deps):
    ...
```

```python solution
import heapq
from collections import defaultdict


def build_order(deps):
    indegree = {task: 0 for task in deps}
    unlocks = defaultdict(list)
    for task, needs in deps.items():
        for need in set(needs):
            indegree.setdefault(need, 0)
            indegree[task] += 1
            unlocks[need].append(task)

    ready = [task for task, count in indegree.items() if count == 0]
    heapq.heapify(ready)
    order = []
    while ready:
        task = heapq.heappop(ready)
        order.append(task)
        for nxt in unlocks[task]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                heapq.heappush(ready, nxt)

    if len(order) < len(indegree):
        raise ValueError("the dependencies contain a cycle")
    return order
```

```python tests
import copy
import sys


def shallow(fn, *args):
    """Run fn with a low recursion limit, so deep recursion fails fast and cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: use Kahn's algorithm")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep: use Kahn's algorithm with a heap") from None
    finally:
        sys.setrecursionlimit(limit)


@test("orders a small project")
def _():
    eq(build_order({"app": ["lib", "ui"], "ui": ["lib"]}), ["lib", "ui", "app"])

@test("tasks that only appear as dependencies are built too")
def _():
    eq(build_order({"app": ["lib"]}), ["lib", "app"])

@test("independent tasks come out alphabetically")
def _():
    eq(build_order({"zip": [], "make": [], "apt": []}), ["apt", "make", "zip"])

@test("picks the first ready task at every step, not level by level")
def _():
    eq(build_order({"b": [], "c": [], "a": ["b"]}), ["b", "a", "c"])

@test("an empty project")
def _():
    eq(build_order({}), [])

@test("repeated dependencies are harmless")
def _():
    eq(build_order({"app": ["lib", "lib"]}), ["lib", "app"])

@test("a cycle raises ValueError")
def _():
    raises(ValueError, build_order, {"a": ["b"], "b": ["a"]})
    raises(ValueError, build_order, {"a": ["a"]})
    raises(ValueError, build_order, {"x": [], "a": ["x", "c"], "b": ["a"], "c": ["b"]})

@test("doesn't modify the input")
def _():
    deps = {"app": ["lib", "ui"], "ui": ["lib"]}
    before = copy.deepcopy(deps)
    build_order(deps)
    eq(deps, before)

@test("40,000 tasks: a long chain plus 20,000 that are ready at once")
def _():
    n = 20_000
    deps = {f"wide{i:05}": [] for i in range(n)}
    deps |= {f"deep{i:05}": [f"deep{i + 1:05}"] for i in range(n - 1)}
    deps[f"deep{n - 1:05}"] = []
    order = shallow(build_order, deps)
    eq(order[:n], [f"deep{i:05}" for i in reversed(range(n))], "the chain sorts first and runs backwards")
    eq(order[n:], [f"wide{i:05}" for i in range(n)])
```

```hint
Kahn's algorithm: count each task's in-degree (how many dependencies it has), start with every task at zero, and each time you build a task, decrement the tasks it unlocks.
```

```hint
"Always the alphabetically first ready task" means the ready set must hand you its minimum quickly: keep it in a heap (`heapq.heappush`/`heappop`). Re-sorting a list or calling `min()` every step is O(n) per step, and the 40,000-task test will time out.
```

```hint
If the loop ends with fewer tasks built than exist, the rest are stuck on a cycle: raise `ValueError`.
```
:::

:::challenge id=algo-graph-all-connected title="When is everyone connected?" difficulty=hard
Write `all_connected_at(n, logs)`. There are `n` people (`n >= 2`), numbered `0` to `n - 1`, and `logs` is a list of `(timestamp, a, b)` entries meaning that `a` and `b` became friends at that time. Two people are connected if a chain of friendships links them. Return the earliest timestamp at which everyone is connected, or `None` if that never happens. The logs aren't in time order.

```text
all_connected_at(4, [(9, 2, 3), (2, 0, 1), (5, 1, 2)])  ->  9
```

One test has 50,000 people and 100,000 logs, so re-running a BFS after every log is far too slow. This is a job for union-find.

```python starter
def all_connected_at(n, logs):
    ...
```

```python solution
def all_connected_at(n, logs):
    parent = list(range(n))
    size = [1] * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for time, a, b in sorted(logs):
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        if size[ra] < size[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        size[ra] += size[rb]
        groups -= 1
        if groups == 1:
            return time
    return None
```

```python tests
import sys


def shallow(fn, *args):
    """Run fn with a low recursion limit, so deep recursion fails fast and cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: make find() a loop")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep: make find() a loop, and attach smaller trees under larger ones") from None
    finally:
        sys.setrecursionlimit(limit)


LOGS = [(7, 0, 1), (3, 3, 4), (12, 2, 3), (9, 1, 5), (15, 2, 4), (20, 0, 3), (25, 4, 5)]

@test("returns the time of the link that joins the last two groups")
def _():
    eq(all_connected_at(6, LOGS), 20)

@test("logs can arrive in any order")
def _():
    eq(all_connected_at(6, LOGS[::-1]), 20)
    eq(all_connected_at(4, [(9, 2, 3), (2, 0, 1), (5, 1, 2)]), 9)

@test("a link inside an existing group doesn't count")
def _():
    eq(all_connected_at(3, [(1, 0, 1), (2, 1, 0), (3, 0, 1), (4, 1, 2)]), 4)

@test("two people")
def _():
    eq(all_connected_at(2, [(5, 0, 1)]), 5)
    eq(all_connected_at(2, [(5, 1, 0), (2, 0, 1)]), 2)

@test("several links can share a timestamp")
def _():
    eq(all_connected_at(4, [(8, 2, 3), (5, 0, 1), (5, 1, 2)]), 8)
    eq(all_connected_at(3, [(5, 1, 2), (5, 0, 1)]), 5)

@test("returns None when the groups never all merge")
def _():
    eq(all_connected_at(4, [(1, 0, 1), (2, 2, 3)]), None)
    eq(all_connected_at(3, []), None)

@test("befriending yourself changes nothing")
def _():
    eq(all_connected_at(2, [(1, 0, 0), (2, 1, 1)]), None)

@test("50,000 people and 100,000 logs")
def _():
    n = 50_000
    logs = [(2 * i, i, i + 1) for i in range(n - 2)]           # a chain 0-1-2-...
    logs += [(2 * i + 1, 0, i + 1) for i in range(n - 2)]      # redundant links back to person 0
    logs.append((10**9, n - 1, n - 2))                          # the last person joins at the very end
    eq(shallow(all_connected_at, n, logs[::-1]), 10**9)
```

```hint
Sort the logs by timestamp and replay them, keeping a count of groups that starts at `n`. Each log that merges two different groups decreases it by one. When it reaches 1, you have the answer.
```

```hint
Use union-find to tell "already in the same group" apart from "two groups merging". Make `find` iterative with path halving (`parent[x] = parent[parent[x]]`) and attach the smaller tree under the larger one, or the long chain in the big test makes `find` slow.
```
:::

:::challenge id=algo-graph-cheapest-route title="Cheapest route" difficulty=hard
Write `cheapest_route(flights, start, goal)`. `flights` is a list of one-way `(origin, destination, price)` flights with non-negative prices. Return `(total_price, route)` for the cheapest way to get from `start` to `goal`, where `route` lists the airports in order, including both ends. Return `None` if `goal` can't be reached. If `start == goal`, the answer is `(0, [start])`. When several routes tie for cheapest, any of them is fine.

```text
flights = [("SFO", "JFK", 500), ("SFO", "DEN", 150), ("DEN", "JFK", 200),
           ("DEN", "ORD", 100), ("ORD", "JFK", 50)]
cheapest_route(flights, "SFO", "JFK")  ->  (300, ["SFO", "DEN", "ORD", "JFK"])
```

The cheapest route isn't necessarily the one with the fewest flights, and one test has almost 20,000 airports and 78,000 flights.

```python starter
def cheapest_route(flights, start, goal):
    ...
```

```python solution
from collections import defaultdict
from heapq import heappop, heappush
from math import inf


def cheapest_route(flights, start, goal):
    graph = defaultdict(list)
    for origin, dest, price in flights:
        graph[origin].append((dest, price))
    best = {start: 0}
    came_from = {start: None}
    heap = [(0, start)]
    while heap:
        cost, airport = heappop(heap)
        if cost > best[airport]:
            continue
        if airport == goal:
            route = []
            while airport is not None:
                route.append(airport)
                airport = came_from[airport]
            return cost, route[::-1]
        for nxt, price in graph[airport]:
            new_cost = cost + price
            if new_cost < best.get(nxt, inf):
                best[nxt] = new_cost
                came_from[nxt] = airport
                heappush(heap, (new_cost, nxt))
    return None
```

```python tests
import sys

FLIGHTS = [
    ("SFO", "JFK", 500), ("SFO", "DEN", 150), ("DEN", "JFK", 200),
    ("DEN", "ORD", 100), ("ORD", "JFK", 50), ("JFK", "LHR", 400),
]


def shallow(fn, *args):
    """Run fn with a low recursion limit, so deep recursion fails fast and cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: use loops")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep: use a heap loop, and rebuild the route with a loop") from None
    finally:
        sys.setrecursionlimit(limit)


def route_price(flights, route):
    """Total price of a route, or None if it uses a flight that doesn't exist."""
    cheapest = {}
    for origin, dest, price in flights:
        cheapest[origin, dest] = min(price, cheapest.get((origin, dest), price))
    hops = list(zip(route, route[1:]))
    if not all(hop in cheapest for hop in hops):
        return None
    return sum(cheapest[hop] for hop in hops)


@test("the cheapest route can have more flights")
def _():
    eq(cheapest_route(FLIGHTS, "SFO", "JFK"), (300, ["SFO", "DEN", "ORD", "JFK"]))
    eq(cheapest_route(FLIGHTS, "SFO", "LHR"), (700, ["SFO", "DEN", "ORD", "JFK", "LHR"]))

@test("grabbing the cheapest next flight isn't enough")
def _():
    flights = [("A", "B", 1), ("B", "D", 100), ("A", "C", 5), ("C", "D", 5)]
    eq(cheapest_route(flights, "A", "D"), (10, ["A", "C", "D"]))

@test("flights are one-way")
def _():
    eq(cheapest_route(FLIGHTS, "JFK", "SFO"), None)

@test("start equals goal")
def _():
    eq(cheapest_route(FLIGHTS, "DEN", "DEN"), (0, ["DEN"]))
    eq(cheapest_route([], "XYZ", "XYZ"), (0, ["XYZ"]))

@test("returns None for unreachable or unknown airports")
def _():
    eq(cheapest_route(FLIGHTS, "SFO", "XYZ"), None)
    eq(cheapest_route(FLIGHTS, "XYZ", "SFO"), None)
    eq(cheapest_route([], "SFO", "JFK"), None)

@test("takes the cheaper of two flights between the same airports")
def _():
    eq(cheapest_route([("A", "B", 90), ("A", "B", 40)], "A", "B"), (40, ["A", "B"]))

@test("free flights and loops are fine")
def _():
    eq(cheapest_route([("A", "B", 0), ("B", "C", 0)], "A", "C"), (0, ["A", "B", "C"]))
    eq(cheapest_route([("A", "B", 1), ("B", "A", 1), ("B", "C", 1)], "A", "C"), (2, ["A", "B", "C"]))

@test("any of several cheapest routes is accepted")
def _():
    flights = [("A", "B", 5), ("B", "D", 5), ("A", "C", 5), ("C", "D", 5)]
    result = cheapest_route(flights, "A", "D")
    check(result is not None, "D is reachable from A")
    cost, route = result
    eq(cost, 10)
    check(route[0] == "A" and route[-1] == "D", "the route runs from A to D")
    eq(route_price(flights, route), 10, f"the route {route} doesn't cost 10")

def walled_grid(side):
    """Airports on a side x side grid, flying to their 4 neighbours. Every 20th column
    is a wall of absurd prices with one gap, alternating between the top and the bottom."""
    flights = []
    for r in range(side):
        for c in range(side):
            a = r * side + c
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < side and 0 <= nc < side:
                    b = nr * side + nc
                    wall = nc % 20 == 10 and nr != (0 if nc % 40 == 10 else side - 1)
                    flights.append((a, b, 10**6 if wall else 1 + (a * 7919 + b * 104_729) % 97))
    return flights


@test("19,600 airports and 77,840 flights")
def _():
    flights = walled_grid(140)
    goal = 140 * 140 - 1
    result = shallow(cheapest_route, flights, 0, goal)
    check(result is not None, "the last airport is reachable")
    cost, route = result
    eq(cost, 41_751)
    check(route[0] == 0 and route[-1] == goal, "the route runs from 0 to the last airport")
    eq(route_price(flights, route), cost, "the route's flights don't add up to its price")
```

```hint
This is Dijkstra's algorithm. Keep a heap of `(cost_so_far, airport)` tuples, always pop the cheapest, and skip entries that are stale because a cheaper way to that airport was already found.
```

```hint
Record `came_from[nxt] = airport` whenever you improve `best[nxt]`. The first time `goal` comes off the heap (as a fresh entry), its cost is final: walk `came_from` back to `start` and reverse.
```
:::
