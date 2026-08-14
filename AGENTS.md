# AI agent guidelines

This document is the working contract for any AI agent (or human following the same workflow) contributing to Nether. Follow it on every task.

Update this document when the user asks, or when the user enforces or recommends a general rule or pattern that should apply beyond a single change.

## Source of truth

1. Follow existing documentation. Do not invent protocol behavior, economics, or process that contradicts it.
2. The primary specification is [`docs/protocol_spec.md`](docs/protocol_spec.md). Treat sections 1–21 as requirements, not suggestions. Section 22 lists what an implementation agent may and must not change.
3. Sequence implementation from living [Nether Implementation Plans (NIPs)](docs/nip/README.md). NIPs are engineering plans, not protocol rules. The spec wins if they disagree.
4. Document **new** decisions in immutable [Nether Decision Records (NDRs)](docs/ndr/README.md). Do not silently overwrite prior decisions.

If documentation and code disagree, stop and ask the user which one is authoritative before “fixing” either.

## When unsure, ask

If anything is ambiguous, conflicting, missing, or a matter of taste rather than a documented requirement — **ask the user** before choosing.

Do not guess on:

- protocol economics, invariants, or deployment assumptions
- which option to pick when trade-offs are material
- scope expansions, refactors, or “while we’re here” changes
- public naming, branding, or user-facing copy
- whether to change existing docs versus recording a new NDR

Ask a specific question. State what you already know and the options you see. Do not proceed on an assumption you cannot ground in existing docs or an NDR.

## Graphics and icons

- Do not invent, generate, or hand-draw icons, illustrations, marks, or other complex graphics.
- Use an existing icon pack. Prefer one already in the tree; otherwise add a conventional pack (Lucide is the current web choice: `@lucide/astro`).
- For custom images, logos, and illustrations, ask the user for the asset. Do not generate a substitute.

## No agent attribution

Do not include agent attribution anywhere in the project’s git or review artifacts.

That includes, without limitation:

- commit messages and trailers (`Co-authored-by`, `Signed-off-by` for an agent, `Made-with`, generator stamps)
- pull/merge request titles, descriptions, comments, reviews, and labels
- vendor CTAs and badges in PR/MR descriptions, including **Open in Cursor**, **Open in Web**, and any equivalent “open this agent run” buttons or images
- hidden wrappers and footers tooling injects (for example `<!-- CURSOR_AGENT_PR_BODY_* -->`, `cursor.com/agents/…` links, run ids)
- branch names, prefixes, suffixes, and remote names (`cursor/`, `agent/`, `copilot/`, run ids, model names)
- code comments, docstrings, changelog entries, and file headers
- NDR metadata (deciders, authors, or tools)

Write as a contributor to the repository. Do not mention that an agent drafted, reviewed, or generated the work.

Platforms and PR helpers often append this attribution after the description is written. After every PR/MR create or update, read the stored description and delete any injected agent markup, buttons, badges, or links so the published body is only the human description.

## Nether Decision Records

When a decision is not already settled by existing docs:

1. Search [`docs/ndr/`](docs/ndr/), [`docs/nip/`](docs/nip/), and the protocol spec before opening a new NDR.
2. Copy [`docs/ndr/template.md`](docs/ndr/template.md) to `docs/ndr/NNNN-short-title.md` (next free four-digit number).
3. Record **all** considered options, the decision drivers, the chosen option, and **why** it was chosen.
4. Treat accepted NDRs as immutable. Do not edit the decision body later. Supersede with a new NDR if the decision must change.
5. Link the NDR from any implementation that depends on it.

Full process: [`docs/ndr/README.md`](docs/ndr/README.md).

Do not use NDRs for routine mechanical work (typos, obvious bugfixes that restore documented behavior, dependency bumps with no design choice). Do use them for architecture, protocol interpretation, tooling defaults, and any choice an agent would otherwise have to invent.

## Updating these guidelines

Add or revise a rule here when:

- the user explicitly asks to update this document, or
- the user repeats or clearly intends a general constraint (review style, testing bar, naming, PR hygiene, etc.)

Keep rules short, enforceable, and specific. Prefer one bullet that agents can follow over a narrative. If a guideline change is itself a design decision with real alternatives, record an NDR and point to it from this file.
