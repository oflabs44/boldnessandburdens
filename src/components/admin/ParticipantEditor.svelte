<script lang="ts">
  import { untrack } from "svelte";
  import { actions } from "astro:actions";

  interface Day {
    date: string;
    long: string;
    short?: string;
  }

  interface Participant {
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    room: string | null;
    group: string | null;
    attendance: Record<string, string>;
    stayingOnCamp: boolean;
    arrived: boolean;
    arrivedAt: string | null;
  }

  let {
    participant,
    days,
    badgeQr,
  }: {
    participant: Participant;
    days: Day[];
    badgeQr: string;
  } = $props();

  // Editable working copies seeded from the prop's initial value. untrack()
  // makes the one-time capture explicit (the participant prop never changes
  // for the island's lifetime — navigation reloads the page).
  let attendance = $state<Record<string, string>>(
    untrack(() => ({ ...participant.attendance })),
  );
  let stayingOnCamp = $state(untrack(() => participant.stayingOnCamp));
  let room = $state(untrack(() => participant.room ?? ""));
  let group = $state(untrack(() => participant.group ?? ""));
  let city = $state(untrack(() => participant.city ?? ""));
  let email = $state(untrack(() => participant.email ?? ""));
  let phone = $state(untrack(() => participant.phone ?? ""));

  let saving = $state(false);
  let busyDay = $state<string | null>(null);
  let toastMsg = $state("");
  let toastKind = $state<"ok" | "err">("ok");
  let qrDialog: HTMLDialogElement;

  const attendedCount = $derived(Object.keys(attendance).length);

  function flash(msg: string, kind: "ok" | "err" = "ok") {
    toastMsg = msg;
    toastKind = kind;
  }

  // checked_in_at is stored UTC ("YYYY-MM-DD HH:MM:SS"); show it in Berlin time.
  function fmtCheckin(ts: string): string {
    return new Date(ts.replace(" ", "T") + "Z").toLocaleString("en-GB", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function stateText(day: string): string {
    const ts = attendance[day];
    if (ts === undefined) return "Absent";
    if (ts === "") return "Marked just now";
    return `Present · ${fmtCheckin(ts)}`;
  }

  // Read-only conference check-in: the arrival timestamp if checked in (set on
  // the roster), else N/A. participants.checked_in_at stays in sync with the flag.
  const checkInValue = $derived(
    participant.arrivedAt ? fmtCheckin(participant.arrivedAt) : "N/A",
  );

  async function toggleDay(day: string, present: boolean) {
    busyDay = day;

    // optimistic
    const prev = attendance[day];
    if (present) attendance[day] = "";
    else delete attendance[day];

    const { error } = await actions.setAttendance({
      code: participant.code,
      day,
      present,
    });

    busyDay = null;

    if (error) {
      // revert
      if (prev === undefined) delete attendance[day];
      else attendance[day] = prev;
      flash("Could not save attendance — try again", "err");
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    saving = true;

    const fd = new FormData();
    fd.set("code", participant.code);
    fd.set("room", room);
    fd.set("group", group);
    fd.set("city", city);
    fd.set("email", email);
    fd.set("phone", phone);
    if (stayingOnCamp) fd.set("staying_on_camp", "on");

    const { error } = await actions.saveParticipant(fd);
    saving = false;

    flash(error ? "Could not save — try again" : "Details saved", error ? "err" : "ok");
  }
</script>

<div class="editor">
  <header class="profile">
    <div class="profile__id">
      <h2 class="profile__name">{participant.name}</h2>
      <div class="tags">
        <span class="badge badge--mono">{participant.code}</span>
        <span class="badge" class:badge--positive={stayingOnCamp} class:badge--warn={!stayingOnCamp}>
          {stayingOnCamp ? "On camp" : "Day visitor"}
        </span>
        <span class="badge">
          <span class="pips">
            {#each days as d (d.date)}
              <i class="pip" class:pip--on={attendance[d.date] !== undefined}></i>
            {/each}
          </span>
          {attendedCount}/{days.length} days
        </span>
      </div>
    </div>

    <button
      type="button"
      class="qr"
      onclick={() => qrDialog.showModal()}
      aria-label={`Enlarge ${participant.name}'s badge QR to scan`}
    >
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html badgeQr}
    </button>
  </header>

  <dialog
    bind:this={qrDialog}
    class="qrmodal"
    onclick={(e) => {
      if (e.target === qrDialog) qrDialog.close();
    }}
  >
    <div class="qrmodal__card">
      <div class="qrmodal__bar">
        <button type="button" class="qrmodal__close" onclick={() => qrDialog.close()} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </div>
      <div class="qrmodal__qr">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html badgeQr}
      </div>
      <p class="qrmodal__cap">{participant.name} · {participant.code}</p>
    </div>
  </dialog>

  <div class="arrival" class:is-in={participant.arrived}>
    <span class="arrival__eyebrow">Conference check-in</span>
    <span class="arrival__value">
      {#if participant.arrived}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      {/if}
      {checkInValue}
    </span>
  </div>

  {#if toastMsg}
    <p class="toast" class:is-err={toastKind === "err"} role="status">{toastMsg}</p>
  {/if}

  <section class="panel">
    <div class="panel__head"><h3 class="panel__title">Daily attendance</h3></div>
    <div class="days">
      {#each days as d (d.date)}
        {@const on = attendance[d.date] !== undefined}
        <label class="dayrow" class:is-on={on}>
          <input
            type="checkbox"
            checked={on}
            disabled={busyDay === d.date}
            onchange={(e) => toggleDay(d.date, e.currentTarget.checked)}
          />
          <span class="dayrow__box" aria-hidden="true"></span>
          <span class="dayrow__day">{d.long}</span>
          <span class="dayrow__state">{stateText(d.date)}</span>
        </label>
      {/each}
    </div>
  </section>

  <form class="panel" onsubmit={save}>
    <div class="panel__head"><h3 class="panel__title">Details</h3></div>
    <div class="form">
      <div class="grid">
        <label class="field"><span>Room</span><input class="input" bind:value={room} placeholder="—" /></label>
        <label class="field"><span>Group</span><input class="input" bind:value={group} placeholder="—" /></label>
        <label class="field"><span>City</span><input class="input" bind:value={city} placeholder="—" /></label>
        <label class="field"><span>Email</span><input class="input" type="email" bind:value={email} placeholder="—" /></label>
        <label class="field"><span>Phone</span><input class="input" bind:value={phone} placeholder="—" /></label>
      </div>

      <label class="switch">
        <input type="checkbox" bind:checked={stayingOnCamp} />
        <span class="switch__box" aria-hidden="true"></span>
        <span>Staying on camp (needs a dorm bed)</span>
      </label>

      <button type="submit" class="btn btn--primary" disabled={saving}>
        {saving ? "Saving…" : "Save details"}
      </button>
    </div>
  </form>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: var(--ad-4); }

  /* ---- profile ---- */
  .profile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ad-5);
  }
  .profile__id { min-width: 0; }
  .profile__name {
    margin: 0 0 var(--ad-3);
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ad-text);
  }
  .tags { display: flex; flex-wrap: wrap; gap: var(--ad-2); align-items: center; }
  .pips { display: inline-flex; gap: 4px; }
  .pip { width: 8px; height: 8px; border-radius: 50%; background: transparent; border: 1.5px solid var(--ad-border-strong); }
  .pip--on { background: var(--ad-positive); border-color: var(--ad-positive); }

  .qr {
    flex: 0 0 auto;
    display: block;
    width: 104px;
    padding: 7px;
    background: #fff;
    border: 1px solid var(--ad-border);
    border-radius: var(--ad-r);
    cursor: pointer;
    transition: border-color 0.15s var(--ad-ease);
  }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  .qr:hover { border-color: var(--ad-accent); }
  .qr:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }

  /* ---- QR lightbox (scan from across a desk) ---- */
  .qrmodal {
    margin: auto;
    padding: 0;
    border: none;
    background: transparent;
    max-width: none;
    max-height: none;
  }
  .qrmodal::backdrop {
    background: rgba(17, 24, 39, 0.62);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }
  .qrmodal__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ad-3);
    padding: var(--ad-3) var(--ad-5) var(--ad-5);
    background: #fff;
    border-radius: var(--ad-r-lg);
  }
  .qrmodal__bar { width: 100%; display: flex; justify-content: flex-end; }
  .qrmodal__close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--ad-text-2);
    background: var(--ad-panel-3);
    border: none;
    border-radius: var(--ad-r-pill);
    cursor: pointer;
    transition: background 0.15s var(--ad-ease), color 0.15s var(--ad-ease);
  }
  .qrmodal__close:hover { background: var(--ad-border); color: var(--ad-text); }
  .qrmodal__close:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
  .qrmodal__close svg { width: 17px; height: 17px; }
  .qrmodal__qr { width: min(78vw, 72vh, 460px); }
  .qrmodal__qr :global(svg) { display: block; width: 100%; height: auto; }
  .qrmodal__cap {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ad-text-2);
    text-align: center;
  }

  /* ---- conference check-in (read-only; set on the roster) ---- */
  .arrival {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ad-4);
    padding: var(--ad-3) var(--ad-5);
    background: var(--ad-panel);
    border: 1px solid var(--ad-border);
    border-radius: var(--ad-r-lg);
  }
  .arrival__eyebrow {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ad-text-3);
  }
  .arrival__value {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ad-text-3);
    font-variant-numeric: tabular-nums;
  }
  .arrival__value svg { width: 15px; height: 15px; color: var(--ad-positive); }
  .arrival.is-in .arrival__value { color: var(--ad-positive); }

  /* ---- toast ---- */
  .toast {
    margin: 0;
    padding: 10px 14px;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: var(--ad-r-sm);
    color: var(--ad-positive);
    background: var(--ad-positive-weak);
    border: 1px solid var(--ad-positive-border);
  }
  .toast.is-err { color: var(--ad-danger); background: var(--ad-danger-weak); border-color: #fecaca; }

  /* ---- attendance rows ---- */
  .days { display: flex; flex-direction: column; padding: var(--ad-3); gap: var(--ad-2); }
  .dayrow {
    display: flex;
    align-items: center;
    gap: var(--ad-3);
    padding: 10px 12px;
    background: var(--ad-panel-2);
    border: 1px solid var(--ad-border);
    border-radius: var(--ad-r-sm);
    cursor: pointer;
    transition: background 0.15s var(--ad-ease), border-color 0.15s var(--ad-ease);
  }
  .dayrow input { position: absolute; opacity: 0; width: 0; height: 0; }
  .dayrow__box {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: var(--ad-r-xs);
    border: 1.5px solid var(--ad-border-strong);
    background: #fff;
    display: grid;
    place-items: center;
    transition: background 0.15s var(--ad-ease), border-color 0.15s var(--ad-ease);
  }
  .dayrow__box::after {
    content: "";
    width: 5px;
    height: 10px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg) scale(0);
    transition: transform 0.15s var(--ad-ease);
  }
  .dayrow__day { flex: 1; font-weight: 600; font-size: 0.9rem; color: var(--ad-text); }
  .dayrow__state { font-size: 0.78rem; color: var(--ad-text-3); text-align: right; }
  .dayrow.is-on { background: var(--ad-positive-weak); border-color: var(--ad-positive-border); }
  .dayrow.is-on .dayrow__box { background: var(--ad-positive); border-color: var(--ad-positive); }
  .dayrow.is-on .dayrow__box::after { transform: rotate(45deg) scale(1); }
  .dayrow.is-on .dayrow__state { color: var(--ad-positive); font-weight: 600; }
  .dayrow:has(input:focus-visible) { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
  .dayrow:has(input:disabled) { opacity: 0.6; cursor: default; }

  /* ---- form ---- */
  .form { padding: var(--ad-5); }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ad-3); }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field span {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ad-text-3);
  }

  .switch {
    display: flex;
    align-items: center;
    gap: var(--ad-3);
    margin-top: var(--ad-4);
    font-size: 0.9rem;
    color: var(--ad-text);
    cursor: pointer;
  }
  .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch__box {
    position: relative;
    flex: 0 0 auto;
    width: 40px;
    height: 22px;
    border-radius: var(--ad-r-pill);
    background: var(--ad-border-strong);
    transition: background 0.18s var(--ad-ease);
  }
  .switch__box::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.18s var(--ad-ease);
  }
  .switch:has(input:checked) .switch__box { background: var(--ad-positive); }
  .switch:has(input:checked) .switch__box::after { transform: translateX(18px); }
  .switch:has(input:focus-visible) .switch__box { outline: 2px solid var(--ad-accent); outline-offset: 2px; }

  .btn--primary { margin-top: var(--ad-5); }
  .btn--primary[disabled] { opacity: 0.6; cursor: default; }

  @media (max-width: 540px) {
    .profile { align-items: flex-start; gap: var(--ad-3); }
    .profile__name { font-size: 1.4rem; }
    .qr { width: 84px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
