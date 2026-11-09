---
title: Linked Lists & Trees
part: Structures
summary: Slotted dataclass nodes, reversal, Floyd's cycle detection, merges, traversals, BFS levels, BSTs and LCAs.
minutes: 50
---

Linked lists and trees are built the same way in both languages, out of objects that point at other objects, and the algorithms carry over unchanged. What changes is the plumbing. A slotted dataclass makes a node class in four lines, tuple assignment rewires pointers without temporaries, generators with `yield from` turn traversals into iterators, and `deque` gives breadth-first search its queue. Python's shallow recursion limit (about 1,000 frames) also means you should know the iterative version of every recursive traversal.

## Nodes as slotted dataclasses

:::compare
```js
class ListNode {
  constructor(val, next = null) {
    this.val = val;
    this.next = next;
  }
}
```
```python
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None
```
:::

`@dataclass` writes `__init__` and `__repr__` from the annotations (see [Dataclasses](lesson:dataclasses-and-enums#kw-only-order-and-slots)). Two flags matter for nodes:

- **`slots=True`** (3.10+) gives every node a fixed set of attributes instead of a per-instance `__dict__`. Each node takes less memory, and a typo such as `node.nxt = other` raises `AttributeError` instead of quietly creating a new property, as it would in JS.
- **`eq=False`** keeps identity semantics. A default dataclass compares by value, which for a node means walking both chains recursively. Worse, a class that defines `__eq__` gets `__hash__ = None` (see [Equality and hashing](lesson:dunder-methods#equality-and-hashing)), so value-comparing nodes are **unhashable** and `seen.add(node)` raises `TypeError`. Pointer algorithms want `is` and hashable nodes, which is what `eq=False` leaves in place.

The annotation is quoted because `ListNode` doesn't exist yet while its own class body runs. Python 3.14 evaluates annotations lazily, so the quotes are optional there, but they keep the class working on 3.10 to 3.13.

Two helpers convert between Python lists and linked lists, both in O(n). Building back to front means no tail pointer is needed, and `while head:` works because a node is always truthy (it defines neither `__bool__` nor `__len__`) while `None` is falsy.

```python run raises
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None

def build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head

def to_list(head):
    values = []
    while head:
        values.append(head.val)
        head = head.next
    return values

head = build([1, 2, 3])
print(to_list(head), to_list(None))
seen = {head, head.next}                # nodes hash by identity
print(head in seen, ListNode(1) in seen)
head.nxt = head.next                    # a typo: AttributeError, not a new property
```

:::quiz output
What happens?

```python
from dataclasses import dataclass

@dataclass(slots=True)
class Node:
    val: int

print(len({Node(1), Node(2)}))
```

- [ ] `2`
- [ ] `1`
- [x] `TypeError`

With the default `eq=True`, the dataclass gets a value-based `__eq__`, and Python sets `__hash__` to `None` for a class that defines `__eq__` without `__hash__`. The nodes can't go into a set or be dict keys. `eq=False` keeps identity for both `==` and `hash()`.
:::

:::tip Experimenting with long chains
In this browser sandbox, keep linked lists and lopsided trees to a couple of thousand nodes. Freeing a long chain makes the interpreter release each node from inside the release of the one before it, and a few thousand levels of that is enough to crash the sandbox, even though nothing in your own code recurses. Ordinary CPython frees chains of millions of nodes without trouble.
:::

## Reversing a linked list

:::compare
```js
function reverse(head) {
  let prev = null;
  while (head) {
    const next = head.next;
    head.next = prev;
    prev = head;
    head = next;
  }
  return prev;
}
```
```python
def reverse(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next
    return prev





```
:::

Walk the list once and point every node back at the one before it: O(n) time and O(1) extra space. Tuple assignment does the three-way rotation without a temporary, but the order of the **targets** matters. Python evaluates the whole right-hand side first, then assigns the targets from left to right, and an attribute target like `head.next` looks up `head` at the moment it's assigned. Above, `head.next` is assigned while `head` is still the current node. Put `head` before `head.next` among the targets and the assignment lands on the *next* node instead. The recursive version is shorter, but it uses O(n) stack, so a list of more than about 1,000 nodes raises `RecursionError`.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None

def build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head

def to_list(head):
    values = []
    while head:
        values.append(head.val)
        head = head.next
    return values

def reverse(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next
    return prev

print(to_list(reverse(build([1, 2, 3, 4]))), to_list(reverse(build([7]))), reverse(None))
```

:::quiz output
`SimpleNamespace` stands in for a node class here. What does this print?

```python
from types import SimpleNamespace as Node

b = Node(val="b", next=None)
a = Node(val="a", next=b)
node = a
node, node.next = node.next, "X"
print(a.next is b, b.next)
```

- [ ] `False None`
- [x] `True X`
- [ ] `False X`

The right-hand side is evaluated first, giving `(b, "X")`. Then `node = b`, and only after that is `node.next` assigned, so the `"X"` lands on `b` and `a` is untouched.
:::

## Fast and slow pointers

:::compare
```js
// O(n) extra space: remember every node
function hasCycle(head) {
  const seen = new Set();
  for (let node = head; node; node = node.next) {
    if (seen.has(node)) return true;
    seen.add(node);
  }
  return false;
}
```
```python
# O(1) extra space: Floyd's tortoise and hare
def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

```
:::

Two pointers walk the list at different speeds. When `fast` (two steps at a time) reaches the end, `slow` (one step at a time) is in the middle. If the list loops back on itself, `fast` never reaches an end: it laps `slow` inside the loop, and the two meet before `slow` has gone around once. That's Floyd's algorithm, with O(n) time and O(1) extra space, against O(n) space for a set of seen nodes. (The set version works in Python too, because `eq=False` nodes hash by identity.) Compare nodes with `is`, since identity is the question. The two-speed idea works on any sequence built by repeating `x = f(x)`, too, as [Two Pointers, Sliding Windows & Prefix Sums](lesson:two-pointers-and-windows) shows.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None

def build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head

def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow                              # the second middle for even lengths

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

head = build([1, 2, 3, 4, 5])
print(middle(head).val, middle(build([1, 2, 3, 4])).val, has_cycle(head))
head.next.next.next.next.next = head.next.next     # 5 -> 3: now it loops
print(has_cycle(head))
```

Finding *where* the loop starts takes a second phase, which is the [third challenge](#algo-ll-cycle-start).

## Dummy heads

:::compare
```js
// Special-case the head, then handle the rest
while (head && head.val === target) head = head.next;
let node = head;
while (node && node.next) {
  if (node.next.val === target) node.next = node.next.next;
  else node = node.next;
}
```
```python
# A dummy node in front of the head: no special case
dummy = node = ListNode(0, head)
while node.next:
    if node.next.val == target:
        node.next = node.next.next     # unlink, and stay put
    else:
        node = node.next
head = dummy.next
```
:::

Whenever the head itself might change (deleting from the front, merging, partitioning), start from a dummy node that points at the head, and return `dummy.next` at the end. Every real node then has a predecessor, so the first one needs no special case, at the price of one extra node: O(1) space.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None

def build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head

def to_list(head):
    values = []
    while head:
        values.append(head.val)
        head = head.next
    return values

def remove_all(head, target):
    dummy = node = ListNode(0, head)
    while node.next:
        if node.next.val == target:
            node.next = node.next.next     # unlink, and stay put
        else:
            node = node.next
    return dummy.next

print(to_list(remove_all(build([7, 7, 1, 7, 2]), 7)))
print(to_list(remove_all(build([7, 7]), 7)), to_list(remove_all(None, 7)))
```

Merging two sorted lists uses the same trick, and it's the [first challenge](#algo-ll-merge-sorted).

## Binary trees

:::compare
```js
class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}
```
```python
@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


```
:::

It's the same dataclass pattern with two children. Interview problems, and this lesson's tests, describe trees as a **level-order list** with `None` for a missing child: `[3, 9, 20, None, None, 15, 7]` is a root `3` with children `9` and `20`, and `20` has children `15` and `7`. The builder below walks the nodes in level order and gives each real node the next two entries as its children, in O(n).

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def build_tree(values):
    """Level order, with None for a missing child: [1, 2, 3, None, 4]."""
    nodes = [None if v is None else TreeNode(v) for v in values]
    children = iter(nodes[1:])
    for node in nodes:
        if node:
            node.left = next(children, None)
            node.right = next(children, None)
    return nodes[0] if nodes else None

def show(node, depth=0):
    """Print the tree on its side: the root at the left, the right subtree on top."""
    if node:
        show(node.right, depth + 1)
        print("    " * depth + str(node.val))
        show(node.left, depth + 1)

show(build_tree([3, 9, 20, None, None, 15, 7]))
```

## Traversals: generators and explicit stacks

:::compare
```js
function* inorder(node) {
  if (!node) return;
  yield* inorder(node.left);
  yield node.val;
  yield* inorder(node.right);
}
```
```python
def inorder(node):
    if node:
        yield from inorder(node.left)
        yield node.val
        yield from inorder(node.right)

```
:::

The depth-first traversals differ only in when they visit the node itself. **Preorder** (node, left, right) copies or serialises a tree, **inorder** (left, node, right) visits a BST in sorted order, and **postorder** (left, right, node) computes values from the children up, such as sizes and heights. A generator with `yield from`, Python's `yield*` (see [Iterators & Generators](lesson:iterators-and-generators#yield-from-yield)), reads exactly like the definition, and it's lazy: `next(inorder(root))` finds the smallest value in a BST without visiting the rest. Each traversal is O(n) time and O(h) space, where h is the tree's height.

The recursion depth is the height, too. That's harmless for a balanced tree, where a million nodes make about 20 levels, but a degenerate tree (a BST built from sorted input, say) is a linked list in disguise, and past about 1,000 levels Python raises `RecursionError`. The iterative versions keep their own stack:

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def preorder_iter(root):
    stack = [root] if root else []
    while stack:
        node = stack.pop()
        yield node.val
        if node.right:
            stack.append(node.right)     # pushed first, so it's popped after the left
        if node.left:
            stack.append(node.left)

def inorder_iter(root):
    stack, node = [], root
    while stack or node:
        while node:                      # run down the left spine
            stack.append(node)
            node = node.left
        node = stack.pop()
        yield node.val
        node = node.right

root = TreeNode(4, TreeNode(2, TreeNode(1), TreeNode(3)), TreeNode(6, TreeNode(5), TreeNode(7)))
print(list(preorder_iter(root)))
print(list(inorder_iter(root)), next(inorder_iter(root)))
```

Iterative postorder is fiddlier. The usual trick is a preorder that pushes the left child before the right one, which visits node, right, left, and then reversing the result.

:::quiz output
Each node is a `(value, left, right)` tuple. What does this print?

```python
def walk(node):
    if node:
        value, left, right = node
        yield from walk(left)
        yield from walk(right)
        yield value

tree = (1, (2, (4, None, None), None), (3, None, None))
print(*walk(tree))
```

- [ ] `1 2 4 3`
- [ ] `4 2 1 3`
- [x] `4 2 3 1`
- [ ] `4 3 2 1`

The node comes after both subtrees, so this is postorder: the left subtree (`4 2`), then the right subtree (`3`), then the root (`1`).
:::

## Level order with `deque`

:::compare
```js
const levels = [];
let level = root ? [root] : [];
while (level.length) {
  levels.push(level.map((n) => n.val));
  level = level.flatMap((n) => [n.left, n.right].filter(Boolean));
}
```
```python
levels = []
queue = deque([root] if root else [])
while queue:
    levels.append([node.val for node in queue])
    for _ in range(len(queue)):          # exactly the current level
        node = queue.popleft()
        queue.extend(child for child in (node.left, node.right) if child)
```
:::

Breadth-first search visits the tree level by level, using a queue: O(n) time and O(w) space, where w is the widest level (up to about half the nodes). To group the nodes by level, process exactly `len(queue)` nodes per round. `range(len(queue))` is evaluated once, before the loop starts adding the next level's children. `deque` keeps `popleft` at O(1), where `list.pop(0)` would make wide levels quadratic.

For trees, a list per level works just as well and needs no queue at all: `level = [child for node in level for child in (node.left, node.right) if child]`, which is what the JS version does with `flatMap`. The `deque` version is the one that carries over to [Graphs](lesson:graphs). The number of levels is the tree's depth.

```python run
from collections import deque
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def levels(root):
    result, queue = [], deque([root] if root else [])
    while queue:
        result.append([node.val for node in queue])
        for _ in range(len(queue)):
            node = queue.popleft()
            queue.extend(child for child in (node.left, node.right) if child)
    return result

root = TreeNode(3, TreeNode(9), TreeNode(20, TreeNode(15), TreeNode(7)))
print(levels(root), levels(None))
print("depth:", len(levels(root)))
```

:::quiz output
What does this print?

```python
from collections import deque

queue = deque([1, 2])
for _ in range(len(queue)):
    queue.append(queue.popleft() * 10)
print(list(queue))
```

- [x] `[10, 20]`
- [ ] `[100, 200]`
- [ ] `[2, 10, 20]`

`range(len(queue))` is computed once, when the loop starts, so the loop runs exactly twice even though the queue keeps refilling. That's what lets a BFS process one level per round.
:::

## Depth

:::compare
```js
const maxDepth = (node) =>
  node ? 1 + Math.max(maxDepth(node.left), maxDepth(node.right)) : 0;
```
```python
def max_depth(node):
    return 1 + max(max_depth(node.left), max_depth(node.right)) if node else 0
```
:::

The recursive one-liner is a postorder traversal, since a node's depth comes from its children's: O(n) time and O(h) stack, fine whenever the tree is reasonably balanced. When the height isn't under your control, carry each node's depth with it on an explicit stack.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def max_depth(node):
    return 1 + max(max_depth(node.left), max_depth(node.right)) if node else 0

def max_depth_iter(root):
    best = 0
    stack = [(root, 1)] if root else []
    while stack:
        node, depth = stack.pop()
        best = max(best, depth)
        stack.extend((child, depth + 1) for child in (node.left, node.right) if child)
    return best

root = TreeNode(1, TreeNode(2, TreeNode(4)), TreeNode(3))
chain = None
for value in range(300):                    # a degenerate tree: a list in disguise
    chain = TreeNode(value, chain)
print(max_depth(root), max_depth_iter(root), max_depth(chain), max_depth_iter(chain))
```

## Binary search trees

:::compare
```js
function contains(node, val) {
  while (node && node.val !== val) {
    node = val < node.val ? node.left : node.right;
  }
  return node != null;
}
```
```python
def contains(node, val):
    while node and node.val != val:
        node = node.left if val < node.val else node.right
    return node is not None

```
:::

In a binary search tree, everything in a node's left subtree is smaller than the node and everything in its right subtree is larger. Search and insert walk a single path from the root, so they cost O(h): O(log n) while the tree stays balanced, O(n) once it degenerates. Neither language has a balanced BST built in (there's no `TreeMap`). In Python, a sorted list with `bisect` (see [Sorting & Binary Search](lesson:sorting-and-searching)) or the third-party `sortedcontainers` covers most of what you'd use one for.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def insert(node, val):
    """Returns the subtree's root, so the caller can relink it."""
    if node is None:
        return TreeNode(val)
    if val < node.val:
        node.left = insert(node.left, val)
    elif val > node.val:
        node.right = insert(node.right, val)
    return node                              # an equal value is already there

def contains(node, val):
    while node and node.val != val:
        node = node.left if val < node.val else node.right
    return node is not None

def inorder(node):
    if node:
        yield from inorder(node.left)
        yield node.val
        yield from inorder(node.right)

root = None
for key in [50, 30, 70, 20, 40, 60, 80, 30]:
    root = insert(root, key)
print(list(inorder(root)), contains(root, 60), contains(root, 65))
```

**Validating** a BST is the classic trap. Checking each node against its own children isn't enough: in the tree below, every parent and child are in the right order, but `3` sits in the *right* subtree of `5`. Each node has to lie within bounds inherited from all of its ancestors. Going left lowers the upper bound to the parent's value, and going right raises the lower bound. That's the [fourth challenge](#algo-bst-validate).

```text
    5
   / \
  4   6
     / \
    3   7      3 < 6 is fine locally, but 3 < 5 breaks the BST
```

:::quiz
You insert 1, 2, 3, ..., n, in that order, into an empty BST that doesn't rebalance itself. What's its height?

- [ ] about log₂ n
- [ ] about n / 2
- [x] n
- [ ] about √n

Every new key is larger than everything before it, so it goes right every time and the tree becomes a chain: search is O(n), and recursion over it is n frames deep. Balanced trees (AVL, red-black) exist to prevent exactly this.
:::

## Lowest common ancestor

:::compare
```js
// In a BST, the values tell you which way to go
function lcaBST(node, p, q) {
  while (node) {
    if (p < node.val && q < node.val) node = node.left;
    else if (p > node.val && q > node.val) node = node.right;
    else return node;
  }
  return null;
}
```
```python
def lca_bst(node, p, q):
    while node:
        if p < node.val and q < node.val:
            node = node.left
        elif p > node.val and q > node.val:
            node = node.right
        else:
            return node        # p and q split here, or this is one of them
    return None
```
:::

The lowest common ancestor (LCA) of two nodes is the deepest node that has both of them in its subtree, where a node counts as its own ancestor. In a BST the values steer you: while both targets are smaller go left, while both are larger go right, and the first node where they split up is the answer. That's O(h) time and O(1) space.

A plain binary tree gives no such hints, so you search both subtrees. The classic recursive solution returns whatever it found below it: a node that is one of the targets returns itself, and a node that gets an answer from both sides is the LCA. That's O(n) time and O(h) stack.

```python run
from dataclasses import dataclass

@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None

def lca(node, p, q):
    """Assumes that both p and q are in the tree."""
    if node is None or node.val in (p, q):
        return node
    left, right = lca(node.left, p, q), lca(node.right, p, q)
    return node if left and right else left or right

#        3
#      /   \
#     5     1
#    / \   / \
#   6   2 0   8
root = TreeNode(3, TreeNode(5, TreeNode(6), TreeNode(2)), TreeNode(1, TreeNode(0), TreeNode(8)))
print(lca(root, 6, 2).val, lca(root, 6, 8).val, lca(root, 5, 2).val)
print(lca(root, 6, 42).val)     # 42 isn't in the tree, yet there's an "answer"
```

:::gotcha The shortcut assumes both nodes exist
If one target is missing, the recursive version returns the other one as though it were the answer. Handling missing nodes means searching the whole tree and checking what you found, which is the [last challenge](#algo-tree-lca). Also return nodes, not values: `left or right` on values would treat a node holding `0` as "not found".
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `class Node { constructor(val, next = null) { ... } }` | `@dataclass(slots=True, eq=False)` | identity `==`, hashable |
| `node.nxt = x` silently adds a property | raises `AttributeError` | thanks to `slots=True` |
| `node === other` | `node is other` | identity |
| `while (node)` | `while node:` | nodes are always truthy |
| swaps through a temp variable | `head.next, prev, head = prev, head, head.next` | targets are assigned left to right |
| a `Set` of visited nodes | Floyd's fast and slow pointers | O(1) space instead of O(n) |
| `function*` with `yield*` | `def` with `yield from` | lazy traversals |
| `queue.shift()` | `queue.popleft()` | BFS with `collections.deque` |
| deep recursion | an explicit list as a stack | the limit is about 1,000 frames |
| `-Infinity`, `Infinity` | `-math.inf`, `math.inf` | BST bounds that fit any int |

## Challenges

:::challenge id=algo-ll-merge-sorted title="Merge two sorted lists" difficulty=easy
Write `merge_lists(a, b)` that merges two sorted linked lists into one sorted list and returns its head. Relink the existing nodes rather than creating new ones (a dummy head is fine), and when values are equal, take the node from `a` first. Two empty lists merge to `None`.

```text
merge_lists(1 -> 2 -> 4, 1 -> 3 -> 4)  ->  1 -> 1 -> 2 -> 3 -> 4 -> 4
```

Work iteratively: the tests include lists long enough to overflow Python's recursion limit.

```js
function mergeLists(a, b) {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (a && b) {
    if (b.val < a.val) { tail.next = b; b = b.next; }
    else { tail.next = a; a = a.next; }
    tail = tail.next;
  }
  tail.next = a ?? b;
  return dummy.next;
}
```

```python starter
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None


def merge_lists(a, b):
    ...
```

```python solution
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None


def merge_lists(a, b):
    dummy = tail = ListNode(0)
    while a and b:
        if b.val < a.val:
            tail.next, b = b, b.next
        else:                         # ties take the node from a
            tail.next, a = a, a.next
        tail = tail.next
    tail.next = a or b                # one list ran out: attach the other
    return dummy.next
```

```python tests
def _build(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head

def _nodes(head):
    nodes = []
    while head is not None:
        nodes.append(head)
        check(len(nodes) <= 5_000, "the merged list never ends: is there a cycle?")
        head = head.next
    return nodes

def _values(head):
    return [node.val for node in _nodes(head)]

@test("merges two sorted lists")
def _():
    eq(_values(merge_lists(_build([1, 2, 4]), _build([1, 3, 4]))), [1, 1, 2, 3, 4, 4])

@test("one list is empty")
def _():
    eq(_values(merge_lists(None, _build([0]))), [0])
    eq(_values(merge_lists(_build([5, 6]), None)), [5, 6])

@test("both lists are empty")
def _():
    check(merge_lists(None, None) is None, "merging two empty lists should give None")

@test("one list entirely before the other")
def _():
    eq(_values(merge_lists(_build([1, 2]), _build([3, 4]))), [1, 2, 3, 4])
    eq(_values(merge_lists(_build([3, 4]), _build([1, 2]))), [1, 2, 3, 4])

@test("duplicates and negative values")
def _():
    eq(_values(merge_lists(_build([-3, -3, 0]), _build([-5, -3, 2]))), [-5, -3, -3, -3, 0, 2])

@test("on ties, the node from `a` comes first")
def _():
    a, b = _build([1, 2]), _build([1, 2])
    expected = [a, b, a.next, b.next]
    merged = _nodes(merge_lists(a, b))
    check(
        len(merged) == 4 and all(got is want for got, want in zip(merged, expected)),
        "for equal values, take the node from `a` before the one from `b`",
    )

@test("relinks the original nodes instead of creating new ones")
def _():
    a, b = _build([1, 3, 5]), _build([2, 4, 6])
    originals = {id(node) for node in _nodes(a) + _nodes(b)}
    merged = _nodes(merge_lists(a, b))
    eq(len(merged), 6)
    check({id(node) for node in merged} == originals, "reuse the input nodes; don't build new ones")

@test("long lists, without recursion")
def _():
    a = _build(list(range(0, 1_200, 2)))     # 600 even numbers
    b = _build(list(range(1, 1_200, 2)))     # 600 odd numbers
    eq(_values(merge_lists(a, b)), list(range(1_200)))
```

```hint
Start from a dummy node, `dummy = tail = ListNode(0)`, so the first real node needs no special case, and return `dummy.next` at the end.
```

```hint
While both lists have nodes, attach the smaller head to `tail`, advance that list, then advance `tail`. Compare with `b.val < a.val`, so that ties take the node from `a`.
```

```hint
When one list runs out, the rest of the other is already sorted: `tail.next = a or b` attaches all of it in one step.
```
:::

:::challenge id=algo-tree-zigzag title="Zigzag levels" difficulty=easy
Write `zigzag(root)` that returns a binary tree's values level by level, alternating direction: the first level left to right, the second right to left, and so on. An empty tree has no levels.

```text
        3
       / \
      9   20         zigzag(root)  ->  [[3], [20, 9], [15, 7]]
         /  \
        15   7
```

```js
function zigzag(root) {
  const levels = [];
  let level = root ? [root] : [];
  while (level.length) {
    const values = level.map((node) => node.val);
    levels.push(levels.length % 2 ? values.reverse() : values);
    level = level.flatMap((node) => [node.left, node.right].filter(Boolean));
  }
  return levels;
}
```

```python starter
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def zigzag(root):
    ...
```

```python solution
from collections import deque
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def zigzag(root):
    levels = []
    queue = deque([root] if root else [])
    while queue:
        values = [node.val for node in queue]
        levels.append(values if len(levels) % 2 == 0 else values[::-1])
        for _ in range(len(queue)):
            node = queue.popleft()
            queue.extend(child for child in (node.left, node.right) if child)
    return levels
```

```python tests
def _tree(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    children = iter(nodes[1:])
    for node in nodes:
        if node is not None:
            node.left = next(children, None)
            node.right = next(children, None)
    return nodes[0] if nodes else None

@test("alternates direction level by level")
def _():
    eq(zigzag(_tree([3, 9, 20, None, None, 15, 7])), [[3], [20, 9], [15, 7]])

@test("an empty tree has no levels")
def _():
    eq(zigzag(None), [])

@test("a single node")
def _():
    eq(zigzag(_tree([1])), [[1]])

@test("a full tree of four levels")
def _():
    eq(
        zigzag(_tree(list(range(1, 16)))),
        [[1], [3, 2], [4, 5, 6, 7], [15, 14, 13, 12, 11, 10, 9, 8]],
    )

@test("lopsided trees")
def _():
    eq(zigzag(_tree([1, 2, None, 3, None, 4])), [[1], [2], [3], [4]])
    eq(zigzag(_tree([1, None, 2, None, 3])), [[1], [2], [3]])
    eq(zigzag(_tree([1, 2, 3, None, 4, None, 5])), [[1], [3, 2], [4, 5]])

@test("zero, negative and duplicate values")
def _():
    eq(zigzag(_tree([0, -1, -1, 2, None, None, 2])), [[0], [-1, -1], [2, 2]])

@test("doesn't modify the tree")
def _():
    root = _tree([1, 2, 3, 4, 5, 6, 7])
    zigzag(root)
    eq(zigzag(root), [[1], [3, 2], [4, 5, 6, 7]], "a second call gave a different answer")

@test("a wide tree of 4,095 nodes")
def _():
    levels = zigzag(_tree(list(range(4_095))))      # 12 complete levels
    eq(len(levels), 12)
    eq(levels[10][:2], [1_023, 1_024])
    eq(levels[11][:2], [4_094, 4_093])
```

```hint
Go breadth-first with a `deque`. Each round, read the values of everything in the queue (that's one level), then pop exactly `len(queue)` nodes and push their children.
```

```hint
Visit every level left to right as usual, and reverse only the output of every other level: `values[::-1]` when `len(levels)` is odd.
```
:::

:::challenge id=algo-ll-cycle-start title="Where the cycle starts" difficulty=medium
Write `cycle_start(head)` that returns the node where a linked list's cycle begins, or `None` if the list ends. Don't modify the list, and use O(1) extra space: Floyd's algorithm, not a set of seen nodes.

```text
1 -> 2 -> 3 -> 4 -> 5
          ^         |
          +---------+        cycle_start(head)  ->  the node holding 3
```

Phase one is the tortoise and hare from the lesson: they meet somewhere inside the cycle. Phase two finds the entrance.

```js
// The O(n)-space version this challenge rules out
function cycleStart(head) {
  const seen = new Set();
  for (let node = head; node; node = node.next) {
    if (seen.has(node)) return node;
    seen.add(node);
  }
  return null;
}
```

```python starter
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None


def cycle_start(head):
    ...
```

```python solution
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class ListNode:
    val: int
    next: "ListNode | None" = None


def cycle_start(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:                 # they met inside the cycle
            slow = head                  # restart one pointer from the head
            while slow is not fast:
                slow, fast = slow.next, fast.next
            return slow
    return None
```

```python tests
def _build(values, cycle_at=None):
    """A linked list, plus its nodes. With cycle_at, the tail links back to that index."""
    nodes = [ListNode(value) for value in values]
    for node, following in zip(nodes, nodes[1:]):
        node.next = following
    if cycle_at is not None:
        nodes[-1].next = nodes[cycle_at]
    return (nodes[0] if nodes else None), nodes

def _describe(node, nodes):
    if node is None:
        return "None"
    index = next((i for i, n in enumerate(nodes) if n is node), None)
    return "a node that isn't in the list" if index is None else f"the node at index {index}"

def _expect(values, cycle_at):
    head, nodes = _build(values, cycle_at)
    found = cycle_start(head)
    want = None if cycle_at is None else nodes[cycle_at]
    check(found is want, f"expected {_describe(want, nodes)}, got {_describe(found, nodes)}")

@test("a list without a cycle gives None")
def _():
    _expect([1, 2, 3], None)
    _expect([1], None)
    check(cycle_start(None) is None, "an empty list has no cycle")

@test("a node pointing to itself")
def _():
    _expect([1], 0)

@test("the tail links back to the head")
def _():
    _expect([1, 2], 0)
    _expect([1, 2, 3, 4], 0)

@test("the cycle starts in the middle")
def _():
    _expect([1, 2, 3, 4, 5], 2)
    _expect([1, 2, 3, 4, 5, 6], 1)

@test("the tail links to itself")
def _():
    _expect([1, 2, 3], 2)

@test("duplicate values: compare nodes, not values")
def _():
    _expect([7, 7, 7, 7, 7], 3)

@test("a long tail and a long cycle")
def _():
    _expect(list(range(800)), 500)
    _expect(list(range(800)), 1)

@test("doesn't modify the list")
def _():
    head, nodes = _build([1, 2, 3, 4, 5], 2)
    before = [node.next for node in nodes]
    cycle_start(head)
    check(all(node.next is nxt for node, nxt in zip(nodes, before)), "a next pointer changed")

@test("O(1) extra space: no set or dict of seen nodes")
def _():
    forbids_call("set", "a set of seen nodes is O(n) space; use two pointers")
    forbids_call("dict", "a dict of seen nodes is O(n) space; use two pointers")
    forbids_syntax((ast.Set, ast.SetComp, ast.Dict, ast.DictComp), "no sets or dicts: two pointers are enough")
```

```hint
Phase one: move `slow` one step and `fast` two steps at a time until they meet (there's a cycle) or `fast` runs off the end (there isn't).
```

```hint
Phase two: put one pointer back at the head and leave the other at the meeting point. Move both one step at a time. They meet exactly where the cycle starts.
```

```hint
Why it works: say the path to the cycle has `a` nodes and they met `b` steps into it. Then `fast` has walked `a + b` steps more than `slow`, which is a whole number of laps. So walking `a` more steps from the meeting point lands on the cycle's start, which is just where the pointer from the head arrives.
```
:::

:::challenge id=algo-bst-validate title="Validate a BST" difficulty=medium
Write `is_bst(root)` that returns `True` if a binary tree is a valid binary search tree: every node's value is greater than **every** value in its left subtree and smaller than **every** value in its right subtree. Duplicates aren't allowed, and an empty tree is valid. Values can be any numbers, including negative and very large ones.

```text
    5                         5
   / \                       / \
  4   6     ->  True        4   6     ->  False: 3 is in the right subtree of 5
       \                       / \
        7                     3   7
```

```js
// The classic bug: each node is only checked against its own children
function isBSTWrong(node) {
  if (!node) return true;
  if (node.left && node.left.val >= node.val) return false;
  if (node.right && node.right.val <= node.val) return false;
  return isBSTWrong(node.left) && isBSTWrong(node.right);
}
```

```python starter
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def is_bst(root):
    ...
```

```python solution
import math
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def is_bst(root):
    stack = [(root, -math.inf, math.inf)]   # each node with the bounds it must fit
    while stack:
        node, low, high = stack.pop()
        if node is None:
            continue
        if not low < node.val < high:
            return False
        stack.append((node.left, low, node.val))
        stack.append((node.right, node.val, high))
    return True
```

```python tests
def _tree(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    children = iter(nodes[1:])
    for node in nodes:
        if node is not None:
            node.left = next(children, None)
            node.right = next(children, None)
    return nodes[0] if nodes else None

def _shape(root):
    """Level-order values, to check the tree wasn't changed."""
    out, level = [], [root]
    while any(level):
        out.append([None if node is None else node.val for node in level])
        level = [child for node in level if node for child in (node.left, node.right)]
    return out

@test("valid trees")
def _():
    eq(is_bst(_tree([2, 1, 3])), True)
    eq(is_bst(_tree([8, 4, 12, 2, 6, 10, 14])), True)
    eq(is_bst(_tree([5, 4, 6, None, None, None, 7])), True)

@test("an empty tree and a single node are valid")
def _():
    eq(is_bst(None), True)
    eq(is_bst(_tree([1])), True)

@test("a child on the wrong side")
def _():
    eq(is_bst(_tree([2, 3, 1])), False)
    eq(is_bst(_tree([2, None, 1])), False)

@test("a deeper node breaks an ancestor's bound")
def _():
    eq(is_bst(_tree([5, 4, 6, None, None, 3, 7])), False)
    eq(is_bst(_tree([10, 5, 15, 2, 12])), False)

@test("duplicates are invalid")
def _():
    eq(is_bst(_tree([2, 2])), False)
    eq(is_bst(_tree([2, None, 2])), False)
    eq(is_bst(_tree([5, 3, 8, None, 5])), False)

@test("negative, huge and fractional values")
def _():
    eq(is_bst(_tree([0, -10**20, 10**20])), True)
    eq(is_bst(_tree([0.5, -1.5, 2.25])), True)
    eq(is_bst(_tree([-1, -2, 0])), True)

@test("no fake sentinels: values at the 32-bit limits are fine")
def _():
    eq(is_bst(_tree([-2**31, None, 2**31 - 1])), True)
    eq(is_bst(_tree([2**31 - 1, -2**31])), True)

@test("a 300-node chain")
def _():
    root = None
    for value in range(299, -1, -1):          # 0 -> 1 -> ... -> 299, all right children
        root = TreeNode(value, None, root)
    eq(is_bst(root), True)
    deepest = root
    while deepest.right:
        deepest = deepest.right
    deepest.left = TreeNode(-1)               # must be above 298, so it's out of bounds
    eq(is_bst(root), False)

@test("doesn't modify the tree")
def _():
    root = _tree([5, 4, 6, None, None, 3, 7])
    before = _shape(root)
    is_bst(root)
    eq(_shape(root), before, "the tree changed")
```

```hint
Checking each node against its own children isn't enough. In `[5, 4, 6, None, None, 3, 7]`, the `3` is fine next to its parent `6` but sits in the right subtree of `5`.
```

```hint
Carry bounds down the tree. The root may hold anything (`-math.inf` to `math.inf`). A left child must be below its parent's value and a right child above it, on top of every bound inherited from further up.
```

```hint
A stack of `(node, low, high)` triples avoids recursion: pop one, fail if `not low < node.val < high` (a chained comparison), then push `(node.left, low, node.val)` and `(node.right, node.val, high)`.
```
:::

:::challenge id=algo-tree-lca title="Lowest common ancestor, safely" difficulty=hard
Write `lowest_common_ancestor(root, p, q)` for a binary tree that is **not** necessarily a BST. Node values are unique, and `p` and `q` are values. Return the lowest node that has both of them in its subtree, where a node counts as its own ancestor. If either value isn't in the tree, return `None`: that's where the recursive shortcut from the lesson goes wrong.

```text
         3
       /   \
      5     1           lowest_common_ancestor(root, 5, 1)   ->  the node 3
     / \   / \          lowest_common_ancestor(root, 5, 4)   ->  the node 5
    6   2 0   8         lowest_common_ancestor(root, 7, 7)   ->  the node 7
       / \              lowest_common_ancestor(root, 5, 10)  ->  None
      7   4
```

```js
// The shortcut: right when both values are present, wrong when one is missing
function lca(node, p, q) {
  if (!node || node.val === p || node.val === q) return node;
  const left = lca(node.left, p, q), right = lca(node.right, p, q);
  return left && right ? node : left ?? right;
}
```

```python starter
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def lowest_common_ancestor(root, p, q):
    ...
```

```python solution
from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class TreeNode:
    val: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def lowest_common_ancestor(root, p, q):
    parent = {}                     # node -> parent; eq=False nodes hash by identity
    by_value = {}
    stack = [(root, None)] if root else []
    while stack:
        node, up = stack.pop()
        parent[node] = up
        by_value[node.val] = node
        stack.extend((child, node) for child in (node.left, node.right) if child)
    if p not in by_value or q not in by_value:
        return None

    ancestors = set()
    node = by_value[p]
    while node:                     # p and everything above it
        ancestors.add(node)
        node = parent[node]
    node = by_value[q]
    while node not in ancestors:    # climb from q until the paths join
        node = parent[node]
    return node
```

```python tests
EXAMPLE = [3, 5, 1, 6, 2, 0, 8, None, None, 7, 4]

def _tree(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    children = iter(nodes[1:])
    for node in nodes:
        if node is not None:
            node.left = next(children, None)
            node.right = next(children, None)
    return nodes[0] if nodes else None

def _find(root, value):
    stack = [root] if root else []
    while stack:
        node = stack.pop()
        if node.val == value:
            return node
        stack.extend(child for child in (node.left, node.right) if child)
    return None

def _describe(node):
    if node is None:
        return "None"
    return f"the node {node.val}" if hasattr(node, "val") else repr(node)[:60]

def _expect(root, p, q, value):
    got = lowest_common_ancestor(root, p, q)
    want = None if value is None else _find(root, value)
    check(got is want, f"for ({p}, {q}) expected {_describe(want)}, got {_describe(got)}")

@test("nodes in different subtrees")
def _():
    root = _tree(EXAMPLE)
    _expect(root, 5, 1, 3)
    _expect(root, 6, 4, 5)
    _expect(root, 7, 8, 3)
    _expect(root, 7, 4, 2)

@test("a node is its own ancestor")
def _():
    root = _tree(EXAMPLE)
    _expect(root, 5, 4, 5)
    _expect(root, 4, 5, 5)
    _expect(root, 3, 7, 3)

@test("the same value twice")
def _():
    _expect(_tree(EXAMPLE), 7, 7, 7)

@test("a missing value gives None")
def _():
    root = _tree(EXAMPLE)
    _expect(root, 5, 10, None)
    _expect(root, 10, 5, None)
    _expect(root, 10, 11, None)
    _expect(root, 10, 10, None)

@test("an empty tree")
def _():
    check(lowest_common_ancestor(None, 1, 2) is None, "an empty tree has no ancestors")

@test("a node holding 0 counts")
def _():
    _expect(_tree([0, 1, 2]), 1, 2, 0)
    _expect(_tree([1, 0, 2]), 0, 2, 1)
    _expect(_tree([1, 0, 2]), 0, 0, 0)

@test("the tree isn't a BST")
def _():
    root = _tree([1, 2, 3, 4, 5])
    _expect(root, 4, 5, 2)
    _expect(root, 4, 3, 1)

@test("a deep, lopsided tree")
def _():
    root = None
    for value in range(299, -1, -1):          # 0 -> 1 -> ... -> 299, all left children
        root = TreeNode(value, root)
    _find(root, 150).right = TreeNode(1_000)
    _expect(root, 299, 1_000, 150)
    _expect(root, 299, 0, 0)

@test("a complete tree of 4,095 nodes")
def _():
    root = _tree(list(range(4_095)))          # node i has children 2i + 1 and 2i + 2
    _expect(root, 2_047, 4_094, 0)
    _expect(root, 2_047, 2_048, 1_023)
    _expect(root, 3_000, 3_001, 749)

@test("doesn't modify the tree")
def _():
    root = _tree(EXAMPLE)
    lowest_common_ancestor(root, 7, 8)
    _expect(root, 7, 4, 2)
```

```hint
Values are unique, so one traversal can record each node's parent (a dict works, since `eq=False` nodes hash by identity) and find the nodes holding `p` and `q`. If either value is missing, return `None` straight away.
```

```hint
Walk up from `p` to the root, collecting its ancestors in a set (including `p` itself). Then climb from `q` until you reach a node that's in the set.
```

```hint
The recursive alternative keeps the shortcut's structure but searches both subtrees of every node, and counts how many targets it actually saw, instead of returning as soon as it finds one.
```
:::
