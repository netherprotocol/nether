# NDR-0005: Strategy replacement security

- Status: Proposed
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is a **draft**. It is not accepted. The intended choice is Option B, including the pause and lock shape in §Decision. W4 may use that as the working posture. Acceptance locks it for v1. Internals of a later safer adapter still need a new NDR when that work starts.

## Context

Buried ETH is irrecoverable by users (spec §2, §6.1). The only intentionally replaceable economic component is the Grave investment strategy (spec §1, §6.4, §21). Replacing it is how capital can be moved: migration withdraws recoverable ETH from the current adapter into Grave and deposits it into the new adapter (spec §6.5).

Admin cannot call a `withdraw` of protected principal to the multisig, burier, or an arbitrary EOA (spec §10.2). Harvest may send only surplus to the Reaper. Spec §16.3 still states that **strategy approval is the principal governance trust boundary**: a scheduled adapter that forwards `depositETH` elsewhere can take the Grave’s ETH after the required delay.

What the spec already requires, and this NDR does not reopen:

- 14-day public timelock; adapter address fixed at scheduling time (spec §6.5, §21)
- production admin is a multisig-capable account, not a standing deployer EOA (spec §10.2, §18.3)
- NETH, Grave, and Reaper are immutable at deploy; only the adapter is replaceable (spec §10.1, §11)
- one active adapter at a time (spec §20)
- W5’s initial production venue (AAVE candidate) is a **separate** NDR, still queued in [`NIP-0000`](../nip/0000-the-roadmap.md)

Spec §6.5 says an emergency pause **MAY** stop new strategy deposits, harvests, migrations, and Reaper auction creation. It does not require that pause to live on Grave, or that Reaper auctions be pausable. Spec §10.2 lists pause among things an admin *can* do; it does not require Grave to expose it. Spec §13’s `EmergencyPause` / `EmergencyUnpause` apply if that feature exists. This NDR chooses not to put pause on Grave or Reaper.

Reaper pause does not repair a failed strategy. If Reaper already holds ETH, it should be allowed to auction it. Missing future yield is an adapter/NAV problem; stopping `startAuction` does not restore income.

Grave therefore needs **strategy replacement authority only**. Investing pause, if any, belongs on the `IStrategyAdapter` implementation (nested venues, deposits into those venues). That is less owner trust, not more: Grave cannot freeze Reaper or harvest, and a later lock can zero Grave’s replacement key without leaving an orphan pause role on Grave.

[`NIP-0000`](../nip/0000-the-roadmap.md) W4 still ships the spec surface (interface, harvest, 14-day delay, test adapter). It does not choose a long-term answer to owner theft once `protectedPrincipal` is large. Spec §16.1 requires tests for governance key compromise and migration to an asset-stealing adapter; those tests document the boundary, they do not remove it.

Owner alignment is strongest when the Grave is small: the operator wants the project to exist. The same owner (or a captured multisig) has a growing incentive to schedule a thief adapter as NAV grows, wait 14 days, and execute. Users cannot unbury during that window.

## Decision drivers

- Do not change era math, burial finality, yield allocation, Reaper economics, or the 14-day delay (spec §22).
- Launch cost and complexity stay inside spec §18 (USD 10–15 deploy budget, no extra helper contracts unless required).
- M0/M2 should not wait on a novel meta-strategy that itself needs audit, loss heuristics, and a Base-specific justification (spec §22).
- Early on, a visible operator who wants the project to succeed is a practical security assumption, not a moral one.
- That assumption weakens as protected principal grows; v1 must not close the only spec-legal hardening path (replace the adapter, then stop replacing).
- A future safer mechanism must still look like **one** `IStrategyAdapter` to Grave (spec §20 forbids multiple simultaneous Grave adapters, not internal allocation inside one adapter).
- Grave admin surface should be the smallest set that replacement requires, so that admin can later be set to `address(0)` without bricking Reaper or harvest.
- Investing pause, if it exists, should sit on the replaceable adapter, not on immutable Grave/Reaper.

## Options

### Option A: Status quo as the permanent v1 model

Ship spec §6.5 / §10.2 as a standing owner committee: deployer, then a multisig-capable account; 14-day delay; no `withdraw` to admin. Rely on owner/committee interest in project success, public notice during the delay, and honest signers refusing to execute a thief.

No planned successor. When the Grave is large, the same structure is the whole defense. This option does not decide pause placement.

### Option B: Status quo now; later safer adapter; then lock Grave replacement (intended)

Ship v1 with **Grave admin = strategy replacement only** (schedule / cancel / execute, plus one-time `setReaper` and ownership handoff). Do **not** put `Pausable` on Grave or Reaper. Do **not** implement batching, loss checks, auto-stop, or internal diversification in W4 or in the first production adapter (W5).

`IStrategyAdapter` stays the spec §6.4 surface (no pause methods on the interface). An adapter **MAY** add its own pause or stop for nested investing. That is adapter code, not a Grave role.

After the project has enough usage that the work is justified, migrate Grave (through the existing 14-day path) to a **single** safer `IStrategyAdapter` — for example a proxy that invests in small batches, checks for loss, stops a nested venue that is failing, and may diversify internally. Those behaviors are examples for a later NDR, not v1 rules. Nested venues still owe spec §6.4 (no leverage, no directional non-ETH return as the intended source). Strategy management after that migration is the proxy’s job.

Once that adapter is live and trusted, **disable further Grave-level strategy replacement** by setting Grave owner to `address(0)` (Ownable `renounceOwnership`, or equivalent). Because Grave has no pause role, that lock does not remove a needed emergency switch on Reaper or harvest. Reaper keeps spending any ETH it already has.

A further, low-probability freeze: also deploy/migrate to an adapter **with no authoritative roles**. Then neither Grave nor the adapter has an admin. That is allowed by this posture; it is not a v1 deliverable.

W5 remains the initial yield venue (AAVE candidate NDR). This option is not a substitute for that adapter. W6 still transfers Grave owner off the deployer EOA to a multisig; it does **not** renounce at launch (replacement must remain available for W5 and for the later proxy).

Without Grave pause, a reverting `depositETH` must not brick `bury()` for 14 days. Successful burial leaves ETH idle on Grave when the adapter refuses or is unset (already W2-valid). That is a W4 requirement of this option.

### Option C: Implement the safer mechanism now

Before M2, build loss checks, automatic stop, batched deployment, and (if required) internal diversification — either in Grave or as the first production adapter — and lock or tightly constrain owner replacement as part of the same delivery.

v1 would then not rely on owner alignment once any material ETH is buried.

### Option D: Split guardian from strategy admin now

Keep the 14-day delay. Give cancel (and, if pause existed on Grave, pause) to a different key than `scheduleStrategy` / `executeStrategyMigration`.

Under Option B there is no Grave pause to split. A guardian that can only cancel a pending schedule is still extra W6 wiring and does not stop execute after the delay if the guardian is absent. Adapter-level pause admin, if any, is a W5/later-proxy choice, not a Grave role split.

### Option E: Freeze replacement after the first adapter

After the initial production adapter is set, disable `scheduleStrategy` forever (renounce at W6, or a one-way flag). No later thief migration, and no later escape from a deprecated yield venue.

Spec §6.5 allows replacement for safety, deprecation, or improved conservative deployment. Freezing at the first AAVE (or other) adapter makes that clause unusable. Option B freezes only *after* a safer meta-adapter exists.

### Option F: Rate-limit deposits into any new adapter at Grave, now

Change Grave so a new adapter never receives the full idle NAV in one `depositETH`. Drip capital; halt if NAV drops. Closer to Option C, implemented in Grave rather than in a later proxy.

Would alter W4’s idle-ETH workflow, add heuristics to immutable Grave, and still leave `scheduleStrategy` in owner hands unless combined with a lock.

## Decision

Chosen option: **Option B**, because it keeps Option A’s launch simplicity and early owner alignment, leaves Option C possible later without changing NETH, Grave, or Reaper bytecode, and makes `owner → address(0)` a valid later lock by keeping Grave’s admin surface to strategy replacement only.

- Option A matches early v1 mechanics but leaves no recorded path for when steal-incentive exceeds operator-alignment, and it does not place pause on the replaceable adapter.
- Option C pays meta-strategy design, tests, and audit against M0/M2 and the §18 budget, before usage exists to justify it. Spec §22 already requires a Base-specific justification for the *initial* strategy; a novel auto-stop proxy on day one is a larger unknown than a conventional venue.
- Option D is not chosen as v1’s answer. There is no Grave pause to split. A cancel-only guardian is optional later ops, not a W4 requirement.
- Option E is too early. The first venue must remain replaceable for the reasons spec §6.5 names.
- Option F is a slice of Option C inside immutable Grave. Batching and loss checks belong in a replaceable adapter so they can be improved.

v1 therefore: deployer, then multisig-capable admin whose only standing Grave power is timelocked strategy replacement (and the one-time Reaper lock); no Grave/Reaper pause; no admin `withdraw`; W4/W5 do not build the safer proxy. Later: a dedicated NDR/NIP for that adapter, then Grave `owner → address(0)`. Optionally later: an adapter with no roles.

## Consequences

- W4 implements harvest, `IStrategyAdapter` use, 14-day schedule/cancel/execute, and the test adapter. **Do not** add OpenZeppelin `Pausable` to Grave or Reaper. **Do not** make `Reaper.startAuction` depend on a Grave pause flag. Spec §6.5 MAY is unused on those contracts.
- `bury()` must succeed when no adapter is set **and** when `depositETH` reverts: ETH stays idle on Grave. Otherwise a dead adapter DoS-es burial until a 14-day migration completes, with no pause escape.
- Do not add pause methods to `IStrategyAdapter`. Adapter-specific stop/pause is W5 or later, on that adapter’s own ABI.
- W4 must **not** disable `renounceOwnership`. The later lock is Ownable renounce (owner `address(0)`). W6 must still transfer to a multisig and must not renounce at launch.
- W5’s production adapter NDR stays independent. The first mainnet venue is still that adapter, not the future proxy. That NDR may give the W5 adapter its own pause for the venue; it must not require Grave pause.
- A later safer adapter MUST be one `IStrategyAdapter`. Internal venues are an implementation detail of that adapter. After it is in place, Grave owner may be set to `address(0)`. Nested investing pause stays on that adapter until (if ever) it is replaced by a role-less adapter.
- Internals of the later proxy (batch size, loss threshold, stop rules, nested venues, its own admin) are **not** decided here. They need a new NDR before that code, plus the usual §22 strategy risk analysis.
- Spec §13 `EmergencyPause` / `EmergencyUnpause` are not Grave events in v1. Spec §17 / §19 pause coverage applies to an adapter that implements pause, not to Grave/Reaper.
- Monetary contracts stay immutable. Hardening does not include a Grave/NETH/Reaper proxy (spec §10.1).
- Tests for a thief adapter and timelock (spec §16.1) remain required in W4. They prove the delay and routing constraints, not the absence of owner theft after execute. Do not test Grave pause; test that it is absent.

What would trigger a superseding NDR: deciding to build the safer mechanism before M2 (Option C); freezing replacement at the first adapter (Option E); putting drip/loss logic in Grave (Option F); putting pause on Grave or Reaper after all; or requiring a split cancel-guardian as v1 (Option D).
