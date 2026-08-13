# NDR-0001: Adopt immutable Nether Decision Records

- Status: Accepted
- Date: 2026-08-13
- Supersedes: (none)
- Superseded by: (none)

## Context

Nether’s monetary and operational rules live in [`docs/protocol_spec.md`](../protocol_spec.md). That spec is deliberately silent on many implementation and process choices (code layout, tooling, strategy selection within spec constraints, review conventions).

Without a dedicated decision log, those choices either disappear into chat, get rewritten in mutable docs, or get re-decided by the next contributor. Agents in particular will invent a new rationale each session unless prior decisions are findable and frozen.

This NDR decides how Nether records those decisions.

## Decision drivers

- Agents and humans must be able to follow existing documentation instead of re-deriving design.
- New decisions must capture alternatives, not only the winner, so later readers can see what was rejected and why.
- History must not be silently rewritten when a decision changes.
- The format should be small enough that writing a record is cheaper than leaving the choice implicit.
- Naming should be specific to this project so records are not confused with generic ADRs from other systems.

## Options

### Option A: No formal decision log

Keep using the protocol spec plus ad-hoc PR descriptions, comments, and chat. Implementation choices remain implicit in code.

### Option B: Mutable design docs

Maintain living documents (wiki pages, a single architecture.md, or continually edited design notes) that are updated in place when thinking changes.

### Option C: Classical Architecture Decision Records (ADRs)

Use a standard ADR / MADR template under `docs/adr/`, with the usual status lifecycle.

### Option D: Immutable Nether Decision Records (NDRs)

Project-specific decision records under `docs/ndr/`. Same job as ADRs: context, drivers, all options, chosen option, and why. Accepted bodies are immutable; a change in direction requires a new NDR that supersedes the old one.

## Decision

Chosen option: **Option D**, because it matches the drivers with the least ceremony and the strongest guarantee against silent history edits.

- Option A fails findability and repeatability: the next agent cannot reliably discover why a choice was made.
- Option B preserves a current snapshot but erases the trail of rejected options and prior rationale, which is exactly what we need when revisiting a constraint.
- Option C would work mechanically, but a generic `docs/adr/` tree does not signal that these records are Nether-specific, sit beside the protocol spec, and are part of the agent contract in `AGENTS.md`.
- Option D keeps the useful ADR structure (options, drivers, rationale) while making immutability and project naming explicit. The name “Nether Decision Record” is intentional: these are protocol/project decisions, not generic architecture notes.

An NDR is required when a choice is not already settled by the protocol spec or an existing NDR and will constrain later work. Routine mechanical changes do not need an NDR.

## Consequences

- New material decisions are added as `docs/ndr/NNNN-short-title.md` from [`template.md`](template.md), then listed in [`README.md`](README.md).
- Accepted NDR bodies are not edited. Status may change to `Superseded` or `Rejected`, with a pointer to the replacement.
- [`AGENTS.md`](../../AGENTS.md) obliges agents to search NDRs, write them when they would otherwise invent a choice, and ask the user when the decision is not theirs to make.
- The protocol spec remains the source of truth for monetary rules. NDRs must not contradict it; if a conflict appears, ask rather than amending either document unilaterally.
