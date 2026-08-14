# NDR-0005: Strategy replacement security

- Status: Proposed
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is a **draft**. It is not accepted. The intended choice is Option B. W4 may use that as the working posture (owner + 14-day delay; do not build a safer meta-strategy in this workstream). Acceptance locks that posture for v1. Designing the later proxy, and how Grave-level replacement is locked, requires a new NDR when that work starts.

## Context

Buried ETH is irrecoverable by users (spec §2, §6.1). The only intentionally replaceable economic component is the Grave investment strategy (spec §1, §6.4, §21). Replacing it is how capital can be moved: migration withdraws recoverable ETH from the current adapter into Grave and deposits it into the new adapter (spec §6.5).

Admin cannot call a `withdraw` of protected principal to the multisig, burier, or an arbitrary EOA (spec §10.2). Harvest may send only surplus to the Reaper. Spec §16.3 still states that **strategy approval is the principal governance trust boundary**: a scheduled adapter that forwards `depositETH` elsewhere can take the Grave’s ETH after the required delay.

What the spec already requires, and this NDR does not reopen:

- 14-day public timelock; adapter address fixed at scheduling time (spec §6.5, §21)
- production admin is a multisig-capable account, not a standing deployer EOA (spec §10.2, §18.3)
- emergency pause of strategy-sensitive operations, not of ERC-20 transfers, and not a principal-withdraw switch (spec §6.5)
- NETH, Grave, and Reaper are immutable at deploy; only the adapter is replaceable (spec §10.1, §11)
- one active adapter at a time (spec §20)
- W5’s initial production venue (AAVE candidate) is a **separate** NDR, still queued in [`NIP-0000`](../nip/0000-the-roadmap.md)

What the spec does **not** settle: whether v1 should treat “owner plus timelock plus later Safe” as the permanent security model, whether a safer meta-strategy should be built before mainnet, or how (and when) Grave-level replacement should be turned off once a safer adapter exists.

[`NIP-0000`](../nip/0000-the-roadmap.md) W4 implements the spec surface (interface, harvest, 14-day delay, pause, test adapter). It does not choose a long-term answer to owner theft once `protectedPrincipal` is large. Spec §16.1 requires tests for governance key compromise and migration to an asset-stealing adapter; those tests document the boundary, they do not remove it.

Owner alignment is strongest when the Grave is small: the operator wants the project to exist. The same owner (or a captured multisig) has a growing incentive to schedule a thief adapter as NAV grows, wait 14 days, and execute. Users cannot unbury during that window.

## Decision drivers

- Do not change era math, burial finality, yield allocation, Reaper economics, or the 14-day delay (spec §22).
- Launch cost and complexity stay inside spec §18 (USD 10–15 deploy budget, no extra helper contracts unless required).
- M0/M2 should not wait on a novel meta-strategy that itself needs audit, loss heuristics, and a Base-specific justification (spec §22).
- Early on, a visible operator who wants the project to succeed is a practical security assumption, not a moral one.
- That assumption weakens as protected principal grows; v1 must not close the only spec-legal hardening path (replace the adapter, then stop replacing).
- A future safer mechanism must still look like **one** `IStrategyAdapter` to Grave (spec §20 forbids multiple simultaneous Grave adapters, not internal allocation inside one adapter).
- Emergency pause remains required while Grave still has an owner (spec §10.2). Locking replacement by setting owner to `address(0)` is therefore not a free move; it needs a later design for pause.

## Options

### Option A: Status quo as the permanent v1 model

Ship spec §6.5 / §10.2 as written and stop there: deployer, then a multisig-capable committee; 14-day delay; pause; no `withdraw` to admin. Rely on owner/committee interest in project success, public notice during the delay, and honest signers refusing to execute a thief.

No planned successor. When the Grave is large, the same structure is the whole defense.

### Option B: Status quo now; plan a later safer adapter, then lock Grave-level replacement (intended)

Ship v1 exactly as Option A / NIP-0000 W4. Do **not** implement batching, loss checks, auto-stop, or internal diversification in W4 or in the first production adapter (W5).

After the project has enough usage that the work is justified, migrate Grave (through the existing 14-day path) to a **single** safer `IStrategyAdapter` — for example a proxy that invests in small batches, checks for loss, stops a nested venue that is failing, and may diversify internally. Those behaviors are examples for a later NDR, not v1 rules. Nested venues still owe spec §6.4 (no leverage, no directional non-ETH return as the intended source).

Once that adapter is live and trusted, **disable further Grave-level strategy replacement** so ETH cannot be migrated off the proxy to a thief. The user’s sketch is to set Grave owner to `address(0)`. That lock’s exact mechanism is **not** chosen here (see Consequences): `address(0)` removes pause unless pause lives on the proxy or a pause-only role remains.

W5 remains the initial yield venue (AAVE candidate NDR). This option is not a substitute for that adapter.

### Option C: Implement the safer mechanism now

Before M2, build loss checks, automatic stop, batched deployment, and (if required) internal diversification — either in Grave or as the first production adapter — and lock or tightly constrain owner replacement as part of the same delivery.

v1 would then not rely on owner alignment once any material ETH is buried.

### Option D: Split guardian from strategy admin now

Keep the 14-day delay. Give **pause / cancel** to a different key than `scheduleStrategy` / `executeStrategyMigration` (independent guardian). The guardian cannot pick the next adapter; the strategy admin cannot silently execute during pause.

This hardens key compromise and a rogue signer set during the delay. It does not stop a malicious strategy-admin who still controls execute after 14 days if the guardian is absent, captured, or willing to unpause. Extra roles, extra W6 wiring, still an owner-trust model for the execute step.

### Option E: Freeze replacement after the first adapter

After the initial production adapter is set, disable `scheduleStrategy` forever (one-way flag or owner lock). No later thief migration, and no later escape from a deprecated or paused yield venue.

Spec §6.5 allows replacement for safety, deprecation, or improved conservative deployment. Freezing at the first AAVE (or other) adapter makes that clause unusable.

### Option F: Rate-limit deposits into any new adapter at Grave, now

Change Grave so a new adapter never receives the full idle NAV in one `depositETH`. Drip capital; halt if NAV drops. Closer to Option C, implemented in Grave rather than in a later proxy.

Would alter W4’s “sweep idle into the active strategy” behavior, add heuristics to the immutable Grave, and still leave `scheduleStrategy` in owner hands unless combined with a lock.

## Decision

Chosen option: **Option B**, because it keeps Option A’s launch simplicity and early owner alignment, and it leaves Option C possible later without changing NETH, Grave, or Reaper bytecode.

- Option A matches the spec’s v1 mechanics but leaves no recorded path for when steal-incentive exceeds operator-alignment. The hardening path (replace adapter, then stop replacing) would have to be invented under pressure.
- Option C pays meta-strategy design, tests, and audit against M0/M2 and the §18 budget, before usage exists to justify it. Spec §22 already requires a Base-specific justification for the *initial* strategy; a novel auto-stop proxy on day one is a larger unknown than a conventional venue.
- Option D is a reasonable extra control and may be considered when the later proxy NDR is written, or as a W6 ops choice (Safe modules / a separate pauser). It is not chosen as v1’s answer: it adds launch surface and still trusts someone to execute after 14 days.
- Option E is too early. The first venue must remain replaceable for the reasons spec §6.5 names. Option B freezes replacement only *after* a safer meta-adapter exists.
- Option F is a slice of Option C inside immutable Grave. Batching and loss checks belong in a replaceable adapter so they can be improved; putting them in Grave now fights spec §11 (small, responsibility-separated contracts) and §18.2 (minimize helpers / keep monetary core compact).

v1 therefore: deployer, then multisig-capable admin; 14-day public delay; pause; no admin `withdraw`; W4/W5 do not build the safer proxy. Later: a dedicated NDR/NIP for that adapter, then a lock of Grave-level replacement.

## Consequences

- W4 implements spec §6.4–§6.5 / §7 / §10 as already sequenced in [`NIP-0000`](../nip/0000-the-roadmap.md). Do not add batching, loss-auto-stop, or internal diversification to Grave or to the test adapter as a production design.
- W5’s production adapter NDR stays independent. The first mainnet venue is still that adapter, not the future proxy.
- Do not set Grave owner to `address(0)` at W6. Spec §10.2 still needs pause/unpause while replacement exists. [`NIP-0000`](../nip/0000-the-roadmap.md) already requires transferring admin off the deployer EOA to a multisig-capable account — that transfer is the v1 handoff, not a renounce.
- A later safer adapter MUST be one `IStrategyAdapter`. Internal venues are an implementation detail of that adapter. Grave must not gain a second simultaneous strategy slot (spec §20).
- Internals of the later proxy (batch size, loss threshold, stop rules, nested venues, whether pause lives on the proxy) are **not** decided here. They need a new NDR before that code, plus the usual §22 strategy risk analysis.
- How replacement is locked after that migration is **not** decided here. Candidates for that later NDR: `owner = address(0)` if pause is no longer required on Grave; `owner = proxy` so only the proxy can pause; a one-way `replacementDisabled` flag that leaves a pause-only owner. `address(0)` is an example, not the accepted lock.
- Monetary contracts stay immutable. Hardening does not include a Grave/NETH/Reaper proxy (spec §10.1).
- Tests for a thief adapter and timelock (spec §16.1) remain required in W4. They prove the delay and routing constraints, not the absence of owner theft after execute.

What would trigger a superseding NDR: deciding to build the safer mechanism before M2 (Option C); freezing replacement at the first adapter (Option E); putting drip/loss logic in Grave (Option F); or accepting split pauser/admin as a v1 requirement (Option D) rather than a later ops/proxy choice.
