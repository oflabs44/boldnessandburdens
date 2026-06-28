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
    city: string | null;
    room: string | null;
    group: string | null;
    attendance: Record<string, string>;
    stayingOnCamp: boolean;
    arrived: boolean;
  }

  let { participants, days }: { participants: Participant[]; days: Day[] } =
    $props();

  // Live arrival flags (participants.checked_in), keyed by code, for optimistic
  // updates from the per-row Check in button.
  let arrived = $state<Record<string, boolean>>(
    untrack(() => Object.fromEntries(participants.map((p) => [p.code, p.arrived]))),
  );
  let busyCode = $state<string | null>(null);
  let errMsg = $state("");

  async function toggleArrived(code: string, next: boolean) {
    busyCode = code;
    errMsg = "";
    const prev = arrived[code];
    arrived[code] = next;

    const { error } = await actions.setArrived({ code, arrived: next });

    busyCode = null;
    if (error) {
      arrived[code] = prev;
      if (error.code === "FORBIDDEN") {
        errMsg = "Session expired — taking you to sign in…";
        window.location.href = `/bb26/admin?next=${encodeURIComponent(location.pathname)}`;
      } else {
        errMsg = "Could not update check-in — try again";
      }
    }
  }

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const groups = $derived(
    [
      ...new Set(participants.map((p) => p.group).filter(Boolean) as string[]),
    ].sort((a, b) => collator.compare(a, b)),
  );
  const rooms = $derived(
    [
      ...new Set(participants.map((p) => p.room).filter(Boolean) as string[]),
    ].sort((a, b) => collator.compare(a, b)),
  );

  const stats = $derived([
    { key: "all", n: participants.length, label: "People" },
    { key: "camp", n: participants.filter((p) => p.stayingOnCamp).length, label: "On camp" },
    { key: "in", n: Object.values(arrived).filter(Boolean).length, label: "Checked in" },
  ] as const);

  let cat = $state<"all" | "camp" | "in">("all");
  let group = $state("");
  let room = $state("");
  let q = $state("");

  const matchesPick = (val: string, want: string) =>
    !want || (want === "__none" ? val === "" : val === want);

  const shown = $derived(
    participants.filter((p) => {
      const inCat =
        cat === "all" ? true : cat === "camp" ? p.stayingOnCamp : arrived[p.code];
      const text = q.trim().toLowerCase();
      const inText = !text || `${p.name} ${p.code}`.toLowerCase().includes(text);
      return (
        inCat &&
        inText &&
        matchesPick(p.group ?? "", group) &&
        matchesPick(p.room ?? "", room)
      );
    }),
  );
</script>

<section class="roster">
  <div class="stats" role="group" aria-label="Filter by category">
    {#each stats as s (s.key)}
      <button
        type="button"
        class="stat"
        class:is-active={cat === s.key}
        aria-pressed={cat === s.key}
        onclick={() => (cat = s.key as typeof cat)}
      >
        <span class="stat__n">{s.n}</span>
        <span class="stat__lbl">{s.label}</span>
      </button>
    {/each}
  </div>

  <div class="panel">
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          placeholder="Search name or ID…"
          aria-label="Search participants"
          bind:value={q}
        />
      </div>

      <label class="pick">
        <span>Group</span>
        <select bind:value={group} aria-label="Filter by group">
          <option value="">All</option>
          {#each groups as g (g)}<option value={g}>{g}</option>{/each}
          <option value="__none">No group</option>
        </select>
      </label>

      <label class="pick">
        <span>Room</span>
        <select bind:value={room} aria-label="Filter by room">
          <option value="">All</option>
          {#each rooms as r (r)}<option value={r}>{r}</option>{/each}
          <option value="__none">No room</option>
        </select>
      </label>

      <span class="count">{shown.length} of {participants.length}</span>
    </div>

    {#if errMsg}<p class="err" role="alert">{errMsg}</p>{/if}

    <div class="scroll">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Room</th>
            <th>Group</th>
            <th class="ctr">Days</th>
            <th class="ctr">Check in</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as p (p.code)}
            <tr
              class="row"
              onclick={(e) => {
                if ((e.target as HTMLElement).closest("a, label, button, input")) return;
                window.location.href = `/bb26/admin/${p.code}`;
              }}
            >
              <td>
                <a class="code" href={`/bb26/admin/${p.code}`} onclick={(e) => e.stopPropagation()}>{p.code}</a>
              </td>
              <td>
                <span class="name">
                  {p.name}
                  {#if !p.stayingOnCamp}<span class="day-tag">Day</span>{/if}
                </span>
                {#if p.city}<span class="city">{p.city}</span>{/if}
              </td>
              <td class="muted">{p.room ?? "—"}</td>
              <td class="muted">{p.group ?? "—"}</td>
              <td class="ctr">
                <span class="pips">
                  {#each days as d (d.date)}
                    <i
                      class="pip"
                      class:pip--on={!!p.attendance[d.date]}
                      title={`${d.long}: ${p.attendance[d.date] ? "present" : "absent"}`}
                    ></i>
                  {/each}
                </span>
              </td>
              <td class="ctr">
                <label class="toggle">
                  <input
                    type="checkbox"
                    checked={arrived[p.code]}
                    disabled={busyCode === p.code}
                    aria-label={`Checked in — ${p.name}`}
                    onchange={(e) => toggleArrived(p.code, e.currentTarget.checked)}
                  />
                  <span class="toggle__track"></span>
                </label>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if shown.length === 0}
        <p class="empty">No one matches those filters.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .roster {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ad-4);
  }

  /* ---- stat toggles ---- */
  .stats {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--ad-3);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--ad-1);
    padding: var(--ad-4) var(--ad-5);
    text-align: left;
    background: var(--ad-panel);
    border: 1px solid var(--ad-border);
    border-radius: var(--ad-r-lg);
    cursor: pointer;
    font: inherit;
    transition: border-color 0.15s var(--ad-ease), background 0.15s var(--ad-ease);
  }
  .stat:hover { border-color: var(--ad-border-strong); }
  .stat__n {
    font-size: 1.7rem;
    font-weight: 680;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--ad-text);
  }
  .stat__lbl {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ad-text-3);
  }
  .stat.is-active {
    background: var(--ad-accent-weak);
    border-color: var(--ad-accent);
  }
  .stat.is-active .stat__n { color: var(--ad-accent); }
  .stat.is-active .stat__lbl { color: var(--ad-accent-hover); }
  .stat:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }

  /* panel fills the remaining height; only its table body scrolls */
  .panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ---- toolbar ---- */
  .toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--ad-3);
    padding: var(--ad-3) var(--ad-4);
    border-bottom: 1px solid var(--ad-border);
  }
  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ad-2);
    padding: 8px 11px;
    background: var(--ad-panel-2);
    border: 1px solid var(--ad-border);
    border-radius: var(--ad-r-sm);
  }
  .search:focus-within { border-color: var(--ad-accent); box-shadow: 0 0 0 3px var(--ad-accent-weak); }
  .search svg { width: 16px; height: 16px; color: var(--ad-text-3); flex: 0 0 auto; }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.88rem;
    color: var(--ad-text);
    outline: none;
  }
  .search input::placeholder { color: var(--ad-text-3); }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--ad-2);
    padding: 0 10px;
    height: 36px;
    background: var(--ad-panel);
    border: 1px solid var(--ad-border-strong);
    border-radius: var(--ad-r-sm);
    flex: 0 0 auto;
  }
  .pick > span {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ad-text-3);
  }
  .pick select {
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ad-text);
    outline: none;
    cursor: pointer;
  }
  .count {
    flex: 0 0 auto;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ad-text-2);
    font-variant-numeric: tabular-nums;
  }

  /* ---- table ---- */
  .scroll { flex: 1; min-height: 0; overflow: auto; }
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .table th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    padding: 9px var(--ad-5);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ad-text-3);
    background: var(--ad-panel-2);
    border-bottom: 1px solid var(--ad-border);
    white-space: nowrap;
  }
  .table td {
    padding: 11px var(--ad-5);
    border-bottom: 1px solid var(--ad-border);
    vertical-align: middle;
  }
  .row:last-child td { border-bottom: none; }
  .row { cursor: pointer; transition: background 0.12s var(--ad-ease); }
  .row:hover { background: var(--ad-panel-2); }
  .ctr { text-align: center; }

  .code {
    font-family: var(--ad-mono);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ad-accent);
    text-decoration: none;
    white-space: nowrap;
  }
  .code:hover { text-decoration: underline; }

  .name {
    display: inline-flex;
    align-items: center;
    gap: var(--ad-2);
    font-weight: 550;
    color: var(--ad-text);
  }
  .city { display: block; font-size: 0.78rem; color: var(--ad-text-3); margin-top: 1px; }
  .muted { color: var(--ad-text-2); white-space: nowrap; }

  .day-tag {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ad-warn);
    background: var(--ad-warn-weak);
    border: 1px solid var(--ad-warn-border);
    padding: 1px 6px;
    border-radius: var(--ad-r-pill);
  }

  .pips { display: inline-flex; gap: 4px; }
  .pip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    border: 1.5px solid var(--ad-border-strong);
  }
  .pip--on { background: var(--ad-positive); border-color: var(--ad-positive); }

  .err {
    margin: 0;
    padding: 9px var(--ad-5);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ad-danger);
    background: var(--ad-danger-weak);
    border-bottom: 1px solid var(--ad-border);
  }

  .empty {
    margin: 0;
    padding: var(--ad-8) var(--ad-5);
    text-align: center;
    color: var(--ad-text-3);
    font-size: 0.9rem;
  }

  @media (max-width: 640px) {
    .stats { grid-template-columns: repeat(3, 1fr); }
    .stat { padding: var(--ad-3); }
    .toolbar { flex-wrap: wrap; }
    .search { flex: 1 1 100%; }
    .pick { flex: 1; justify-content: space-between; }
    .count { flex: 1 1 100%; text-align: right; }
  }
</style>
