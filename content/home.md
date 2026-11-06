---
title: Home demo
---

:::compare
```js
const orders = [
  { id: 1, total: 42.5, status: "paid" },
  { id: 2, total: 17.0, status: "refunded" },
  { id: 3, total: 99.9, status: "paid" },
];

const paid = orders
  .filter((o) => o.status === "paid")
  .map((o) => o.total);

const revenue = paid.reduce((a, b) => a + b, 0);
console.log(`Revenue: $${revenue.toFixed(2)}`);
```
```python run
orders = [
    {"id": 1, "total": 42.5, "status": "paid"},
    {"id": 2, "total": 17.0, "status": "refunded"},
    {"id": 3, "total": 99.9, "status": "paid"},
]

paid = [o["total"] for o in orders
        if o["status"] == "paid"]


revenue = sum(paid)
print(f"Revenue: ${revenue:.2f}")
```
:::
