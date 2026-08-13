# Nether Implementation Plans (NIPs)

NIPs are living engineering plans. They sequence work and record how to build what the protocol spec already requires. They are not protocol rules and they are not NDRs.

- Source of truth for monetary behavior: [`docs/protocol_spec.md`](../protocol_spec.md)
- Frozen design choices: [`docs/ndr/README.md`](../ndr/README.md)
- These documents: how to implement, in what order, in which trees

## Rules

1. A NIP must not change era math, burial finality, Reaper economics, yield allocation, or other §1–§21 requirements. If a plan and the spec disagree, the spec wins.
2. NIPs may be edited as work proceeds. Do not copy a NIP into an NDR merely to freeze the plan.
3. Implementation choices that **constrain later work** and are not already in the spec still need an NDR (toolchain freeze, strategy adapter, frontend stack, and similar).
4. `NNNN` is a four-digit number, never reused. `short-title` is lowercase kebab-case.

## File layout

```
docs/nip/
  README.md              this index
  0000-the-roadmap.md    product/engineering sequence
  NNNN-short-title.md    one plan per workstream or slice
```

## Index

| NIP | Title | Status |
|---|---|---|
| [0000](0000-the-roadmap.md) | The Roadmap | Living |
| [0001](0001-scaffolding.md) | Repository scaffolding | Ready to implement |
