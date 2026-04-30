import { onValue, ref } from "firebase/database";
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronsUpDown,
  Filter,
  History,
  Home,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import heroVideo from "../assets/hero.mp4";
import { database } from "./firebase";
import type {
  ClanDatabase,
  ClanSnapshot,
  Filters,
  HistoryFilters,
  Member,
  RouteId,
  SortKey,
  SortValue,
} from "./types";
import {
  applyFilters,
  formatCompactNumber,
  formatDate,
  formatNumber,
  formatWeekRange,
  normalizeMembers,
  snapshotTotals,
} from "./utils";

const defaultWeekFilters: Filters = {
  search: "",
  rank: "all",
  sort: "weekly_ts:desc",
  minTs: 0,
  minLoot: 0,
};

const defaultHistoryFilters: HistoryFilters = {
  search: "",
  rank: "all",
  sort: "weekly_ts:desc",
};

const sortOptions: Array<{ label: string; value: SortValue }> = [
  { label: "Highest Weekly TS", value: "weekly_ts:desc" },
  { label: "Highest Clan Weekly TS", value: "weekly_clan_ts:desc" },
  { label: "Highest Weekly Loot", value: "weekly_loot:desc" },
  { label: "Highest Clan Weekly Loot", value: "weekly_clan_loot:desc" },
  { label: "Username A-Z", value: "username:asc" },
  { label: "Rank A-Z", value: "clan_rank:asc" },
];

function routeFromHash(): RouteId {
  const hash = window.location.hash.replace("#", "");
  return hash === "week" || hash === "history" ? hash : "home";
}

function App() {
  const [route, setRoute] = useState<RouteId>(routeFromHash);
  const [clanData, setClanData] = useState<ClanDatabase>({});
  const [isConnected, setIsConnected] = useState(false);
  const [dbError, setDbError] = useState("");
  const [weekFilters, setWeekFilters] = useState<Filters>(defaultWeekFilters);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState("");

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(
      ref(database, "clans/58"),
      (snapshot) => {
        setClanData((snapshot.val() || {}) as ClanDatabase);
        setIsConnected(true);
        setDbError("");
      },
      (error) => {
        setClanData({});
        setIsConnected(false);
        setDbError(error.message);
      },
    );

    return unsubscribe;
  }, []);

  const currentSnapshot = useMemo(
    () => clanData.current_week || clanData.latest_week || clanData.latest || null,
    [clanData],
  );

  const historyEntries = useMemo(
    () =>
      Object.entries(clanData.weekly_history || {})
        .map(([key, snapshot]) => ({ key, snapshot }))
        .sort((a, b) =>
          String(b.snapshot.week?.ends_at || b.key).localeCompare(
            String(a.snapshot.week?.ends_at || a.key),
          ),
        ),
    [clanData.weekly_history],
  );

  useEffect(() => {
    if (!historyEntries.length) {
      setSelectedHistoryKey("");
      return;
    }

    if (!selectedHistoryKey || !historyEntries.some((entry) => entry.key === selectedHistoryKey)) {
      setSelectedHistoryKey(historyEntries[0].key);
    }
  }, [historyEntries, selectedHistoryKey]);

  const historySnapshot = useMemo(() => {
    if (!historyEntries.length) return null;
    return (
      historyEntries.find((entry) => entry.key === selectedHistoryKey)?.snapshot ||
      historyEntries[0].snapshot
    );
  }, [historyEntries, selectedHistoryKey]);

  return (
    <div className="app-shell">
      <Topbar route={route} isConnected={isConnected} />
      {dbError ? <div className="status-error">Firebase: {dbError}</div> : null}

      <main>
        {route === "home" ? <HomeView /> : null}
        {route === "week" ? (
          <WeekView
            snapshot={currentSnapshot}
            filters={weekFilters}
            onFiltersChange={setWeekFilters}
          />
        ) : null}
        {route === "history" ? (
          <HistoryView
            entries={historyEntries}
            snapshot={historySnapshot}
            selectedKey={selectedHistoryKey}
            onSelectedKeyChange={setSelectedHistoryKey}
            filters={historyFilters}
            onFiltersChange={setHistoryFilters}
          />
        ) : null}
      </main>
    </div>
  );
}

function Topbar({ route, isConnected }: { route: RouteId; isConnected: boolean }) {
  return (
    <header className="topbar">
      <a className="brand" href="#home" aria-label="Karmic Justice Home">
        <span className="brand-mark">KJ</span>
        <span>
          <strong>Karmic Justice</strong>
          <small>Clan intelligence</small>
        </span>
      </a>

      <nav className="main-nav" aria-label="Views">
        <NavLink route={route} id="home" label="Home" icon={<Home size={17} />} />
        <NavLink route={route} id="week" label="Current Week" icon={<Activity size={17} />} />
        <NavLink route={route} id="history" label="History" icon={<History size={17} />} />
      </nav>

      <div className={`connection-pill ${isConnected ? "online" : ""}`}>
        <span />
        {isConnected ? "Realtime online" : "Connecting"}
      </div>
    </header>
  );
}

function NavLink({
  route,
  id,
  label,
  icon,
}: {
  route: RouteId;
  id: RouteId;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a className={route === id ? "active" : ""} href={`#${id}`}>
      {icon}
      <span>{label}</span>
    </a>
  );
}

function HomeView() {
  return (
    <section className="view home-view">
      <section className="hero">
        <video src={heroVideo} autoPlay muted loop playsInline aria-label="Karmic Justice hero video" />
        <div className="hero-overlay">
          <div className="hero-copy">
            <div className="hero-actions">
              <a href="#week">Open Current Week</a>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function WeekView({
  snapshot,
  filters,
  onFiltersChange,
}: {
  snapshot: ClanSnapshot | null;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}) {
  const members = useMemo(() => normalizeMembers(snapshot), [snapshot]);
  const filtered = useMemo(() => applyFilters(members, filters), [members, filters]);
  const totals = snapshotTotals(snapshot, members);
  const ranks = useMemo(() => uniqueRanks(members), [members]);
  const topThreeTs = [...members].sort((a, b) => b.weekly_ts - a.weekly_ts).slice(0, 3);
  const topThreeLoot = [...members].sort((a, b) => b.weekly_loot - a.weekly_loot).slice(0, 3);
  const activeMembers = members.filter(
    (member) =>
      member.weekly_ts > 0 ||
      member.weekly_clan_ts > 0 ||
      member.weekly_loot > 0 ||
      member.weekly_clan_loot > 0,
  ).length;

  return (
    <DataViewShell
      eyebrow={`Last update: ${formatDate(snapshot?.collected_at)}`}
      title="Dash Current Week"
      range={formatWeekRange(snapshot)}
      systemLabel={`Systems operational (${members.length}/${members.length})`}
      preControls={
        <>
          <section className="summary-grid" aria-label="Clan summary">
            <Metric icon={<BarChart3 />} label="Weekly Clan TS" value={formatCompactNumber(totals.weeklyClanTs)} title={formatNumber(totals.weeklyClanTs)} />
            <Metric icon={<Trophy />} label="Weekly Clan Loot" value={formatCompactNumber(totals.weeklyClanLoot)} title={formatNumber(totals.weeklyClanLoot)} />
            <Metric icon={<Users />} label="Members" value={formatNumber(totals.memberCount)} />
            <Metric icon={<Activity />} label="Active Members" value={formatNumber(activeMembers)} />
          </section>

          <section className="podium-grid" aria-label="Top weekly TS members">
            {topThreeTs.map((member, index) => (
              <PodiumCard
                key={`${member.username}-${index}`}
                position={index + 1}
                member={member}
                metricLabel="Weekly TS"
                metricValue={member.weekly_ts}
              />
            ))}
            {!topThreeTs.length ? <EmptyState label="Waiting for Realtime DB data." /> : null}
          </section>

          <section className="podium-grid" aria-label="Top weekly loot members">
            {topThreeLoot.map((member, index) => (
              <PodiumCard
                key={`${member.username}-loot-${index}`}
                position={index + 1}
                member={member}
                metricLabel="Weekly Loot"
                metricValue={member.weekly_loot}
              />
            ))}
            {!topThreeLoot.length ? <EmptyState label="Waiting for loot data." /> : null}
          </section>
        </>
      }
      controls={
        <WeekControls
          filters={filters}
          ranks={ranks}
          onFiltersChange={onFiltersChange}
        />
      }
      table={
        <MembersTable
          members={filtered}
          sort={filters.sort}
          onSort={(sort) => onFiltersChange({ ...filters, sort })}
          countLabel={`${formatNumber(filtered.length)} members`}
          totalLabel={`${formatCompactNumber(totals.weeklyClanTs)} TS / ${formatCompactNumber(totals.weeklyClanLoot)} loot`}
        />
      }
    />
  );
}

function HistoryView({
  entries,
  snapshot,
  selectedKey,
  onSelectedKeyChange,
  filters,
  onFiltersChange,
}: {
  entries: Array<{ key: string; snapshot: ClanSnapshot }>;
  snapshot: ClanSnapshot | null;
  selectedKey: string;
  onSelectedKeyChange: (key: string) => void;
  filters: HistoryFilters;
  onFiltersChange: (filters: HistoryFilters) => void;
}) {
  const members = useMemo(() => normalizeMembers(snapshot), [snapshot]);
  const filtered = useMemo(() => applyFilters(members, filters), [members, filters]);
  const totals = snapshotTotals(snapshot, members);
  const ranks = useMemo(() => uniqueRanks(members), [members]);
  const topThreeTs = [...members].sort((a, b) => b.weekly_ts - a.weekly_ts).slice(0, 3);
  const topThreeLoot = [...members].sort((a, b) => b.weekly_loot - a.weekly_loot).slice(0, 3);

  return (
    <DataViewShell
      eyebrow={`Saved weeks: ${formatNumber(entries.length)}`}
      title="Dash History"
      range={formatWeekRange(snapshot)}
      systemLabel={`Archive online (${entries.length})`}
      preControls={
        <section className="summary-grid" aria-label="History summary">
          <Metric icon={<BarChart3 />} label="Archived Clan TS" value={formatCompactNumber(totals.weeklyClanTs)} title={formatNumber(totals.weeklyClanTs)} />
          <Metric icon={<Trophy />} label="Archived Clan Loot" value={formatCompactNumber(totals.weeklyClanLoot)} title={formatNumber(totals.weeklyClanLoot)} />
          <Metric icon={<Users />} label="Archived Members" value={formatNumber(totals.memberCount)} />
          <Metric icon={<CalendarClock />} label="Closed At" value={formatDate(snapshot?.week?.ends_at)} />
        </section>
      }
      controls={
        <HistoryControls
          entries={entries}
          selectedKey={selectedKey}
          filters={filters}
          ranks={ranks}
          onSelectedKeyChange={onSelectedKeyChange}
          onFiltersChange={onFiltersChange}
        />
      }
      extra={
        <>
          <section className="podium-grid" aria-label="Archived weekly leaders">
            {topThreeTs.map((member, index) => (
              <PodiumCard
                key={`${member.username}-${index}`}
                position={index + 1}
                member={member}
                metricLabel="Weekly TS"
                metricValue={member.weekly_ts}
              />
            ))}
            {!topThreeTs.length ? <EmptyState label="No archived leaders yet." /> : null}
          </section>
          <section className="podium-grid" aria-label="Archived weekly loot leaders">
            {topThreeLoot.map((member, index) => (
              <PodiumCard
                key={`${member.username}-history-loot-${index}`}
                position={index + 1}
                member={member}
                metricLabel="Weekly Loot"
                metricValue={member.weekly_loot}
              />
            ))}
            {!topThreeLoot.length ? <EmptyState label="No archived loot leaders yet." /> : null}
          </section>
          <HistoryStrip entries={entries} />
        </>
      }
      table={
        <MembersTable
          members={filtered}
          sort={filters.sort}
          onSort={(sort) => onFiltersChange({ ...filters, sort })}
          countLabel={`${formatNumber(filtered.length)} members`}
          totalLabel={`${formatCompactNumber(totals.weeklyClanTs)} TS / ${formatCompactNumber(totals.weeklyClanLoot)} loot`}
        />
      }
    />
  );
}

function DataViewShell({
  eyebrow,
  title,
  range,
  systemLabel,
  preControls,
  controls,
  extra,
  table,
}: {
  eyebrow: string;
  title: string;
  range: string;
  systemLabel?: string;
  preControls?: React.ReactNode;
  controls: React.ReactNode;
  extra?: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <section className="view">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="heading-meta">
          <div className="system-pill">
            <CheckCircle2 size={15} />
            {systemLabel || "Systems operational"}
          </div>
          <div className="timestamp">{range}</div>
        </div>
      </section>
      {preControls}
      {controls}
      {extra}
      {table}
    </section>
  );
}

function WeekControls({
  filters,
  ranks,
  onFiltersChange,
}: {
  filters: Filters;
  ranks: string[];
  onFiltersChange: (filters: Filters) => void;
}) {
  return (
    <section className="controls" aria-label="Current week filters">
      <SearchField
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <RankSelect
        value={filters.rank}
        ranks={ranks}
        onChange={(rank) => onFiltersChange({ ...filters, rank })}
      />
      <SortSelect
        value={filters.sort}
        onChange={(sort) => onFiltersChange({ ...filters, sort })}
      />
      <NumberFilter
        label="Min. TS"
        value={filters.minTs}
        onChange={(minTs) => onFiltersChange({ ...filters, minTs })}
      />
      <NumberFilter
        label="Min. Loot"
        value={filters.minLoot}
        onChange={(minLoot) => onFiltersChange({ ...filters, minLoot })}
      />
    </section>
  );
}

function HistoryControls({
  entries,
  selectedKey,
  filters,
  ranks,
  onSelectedKeyChange,
  onFiltersChange,
}: {
  entries: Array<{ key: string; snapshot: ClanSnapshot }>;
  selectedKey: string;
  filters: HistoryFilters;
  ranks: string[];
  onSelectedKeyChange: (key: string) => void;
  onFiltersChange: (filters: HistoryFilters) => void;
}) {
  return (
    <section className="controls history-controls" aria-label="History filters">
      <label>
        <span>Week</span>
        <select value={selectedKey} onChange={(event) => onSelectedKeyChange(event.target.value)}>
          {entries.length ? (
            entries.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.snapshot.week?.ends_at ? `Closed on ${formatDate(entry.snapshot.week.ends_at)}` : entry.key}
              </option>
            ))
          ) : (
            <option value="">No history</option>
          )}
        </select>
      </label>
      <SearchField
        value={filters.search}
        onChange={(search) => onFiltersChange({ ...filters, search })}
      />
      <RankSelect
        value={filters.rank}
        ranks={ranks}
        onChange={(rank) => onFiltersChange({ ...filters, rank })}
      />
      <SortSelect
        value={filters.sort}
        onChange={(sort) => onFiltersChange({ ...filters, sort })}
      />
    </section>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span>Search</span>
      <div className="input-with-icon">
        <Search size={16} />
        <input
          value={value}
          type="search"
          placeholder="Username or rank"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function RankSelect({
  value,
  ranks,
  onChange,
}: {
  value: string;
  ranks: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>Rank</span>
      <select value={ranks.includes(value) ? value : "all"} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {ranks.map((rank) => (
          <option key={rank} value={rank}>
            {rank}
          </option>
        ))}
      </select>
    </label>
  );
}

function SortSelect({ value, onChange }: { value: SortValue; onChange: (value: SortValue) => void }) {
  return (
    <label>
      <span>Sort</span>
      <select value={value} onChange={(event) => onChange(event.target.value as SortValue)}>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="input-with-icon">
        <Filter size={16} />
        <input
          value={value || ""}
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="0"
          onChange={(event) => onChange(Number(event.target.value || 0))}
        />
      </div>
    </label>
  );
}

function MembersTable({
  members,
  sort,
  onSort,
  countLabel,
  totalLabel,
}: {
  members: Member[];
  sort: SortValue;
  onSort: (sort: SortValue) => void;
  countLabel: string;
  totalLabel: string;
}) {
  const sortHeader = (field: SortKey) => {
    const [currentField, currentDirection] = sort.split(":");
    const nextDirection = currentField === field && currentDirection === "desc" ? "asc" : "desc";
    onSort(`${field}:${nextDirection}` as SortValue);
  };

  return (
    <section className="table-shell" aria-label="Members table">
      <div className="table-meta">
        <strong>{countLabel}</strong>
        <span>{totalLabel}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <SortableTh label="Username" field="username" sort={sort} onSort={sortHeader} />
              <SortableTh label="Clan Rank" field="clan_rank" sort={sort} onSort={sortHeader} />
              <SortableTh label="Weekly TS" field="weekly_ts" sort={sort} onSort={sortHeader} />
              <SortableTh label="Clan Weekly TS" field="weekly_clan_ts" sort={sort} onSort={sortHeader} />
              <SortableTh label="Weekly Loot" field="weekly_loot" sort={sort} onSort={sortHeader} />
              <SortableTh label="Clan Weekly Loot" field="weekly_clan_loot" sort={sort} onSort={sortHeader} />
            </tr>
          </thead>
          <tbody>
            {members.length ? (
              members.map((member, index) => (
                <tr key={`${member.username}-${index}`}>
                  <td className="position">{index + 1}</td>
                  <td>{member.username}</td>
                  <td>
                    <span className={`rank-badge ${rankTone(member.clan_rank)}`}>{member.clan_rank}</span>
                  </td>
                  <td className="numeric" title={formatNumber(member.weekly_ts)}>{formatCompactNumber(member.weekly_ts)}</td>
                  <td title={formatNumber(member.weekly_clan_ts)}>{formatCompactNumber(member.weekly_clan_ts)}</td>
                  <td className="numeric" title={formatNumber(member.weekly_loot)}>{formatCompactNumber(member.weekly_loot)}</td>
                  <td title={formatNumber(member.weekly_clan_loot)}>{formatCompactNumber(member.weekly_clan_loot)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty-table" colSpan={7}>
                  No data found for the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortKey;
  sort: SortValue;
  onSort: (field: SortKey) => void;
}) {
  const [currentField, direction] = sort.split(":");
  const active = currentField === field;

  return (
    <th>
      <button className={`sort-button ${active ? "active" : ""}`} type="button" onClick={() => onSort(field)}>
        {label}
        <ChevronsUpDown size={13} />
        {active ? <span>{direction}</span> : null}
      </button>
    </th>
  );
}

function HistoryStrip({ entries }: { entries: Array<{ key: string; snapshot: ClanSnapshot }> }) {
  if (!entries.length) {
    return (
      <section className="history-strip">
        <EmptyState label="No closed week has been saved yet." />
      </section>
    );
  }

  return (
    <section className="history-strip" aria-label="Saved weeks">
      {entries.slice(0, 8).map(({ key, snapshot }) => {
        const members = normalizeMembers(snapshot);
        const totals = snapshotTotals(snapshot, members);
        const label = snapshot.week?.ends_at ? formatDate(snapshot.week.ends_at) : key;

        return (
          <article className="week-chip" key={key}>
            <strong>{label}</strong>
            <span title={formatNumber(totals.weeklyClanTs)}>{formatCompactNumber(totals.weeklyClanTs)} TS</span>
            <small title={formatNumber(totals.weeklyClanLoot)}>{formatCompactNumber(totals.weeklyClanLoot)} loot</small>
          </article>
        );
      })}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <article className="metric">
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong title={title}>{value}</strong>
    </article>
  );
}

function Spotlight({
  title,
  name,
  value,
  titleValue,
}: {
  title: string;
  name: string;
  value: string;
  titleValue?: string;
}) {
  return (
    <section className="panel">
      <PanelHeader icon={<Trophy />} label={title} value={name} />
      <div className="spotlight-number" title={titleValue}>{value}</div>
    </section>
  );
}

function PodiumCard({
  position,
  member,
  metricLabel,
  metricValue,
}: {
  position: number;
  member: Member;
  metricLabel: string;
  metricValue: number;
}) {
  return (
    <article className={`podium-card position-${position}`}>
      <div className="medal-badge">{position}</div>
      <div>
        <span>Position {position}</span>
        <strong>{member.username}</strong>
      </div>
      <p title={formatNumber(metricValue)}>{formatCompactNumber(metricValue)}</p>
      <small>{metricLabel}</small>
    </article>
  );
}

function PanelHeader({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="section-heading">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function rankTone(rank: string) {
  let hash = 0;
  for (const char of rank) {
    hash = (hash * 31 + char.charCodeAt(0)) % 7;
  }
  return `rank-tone-${hash}`;
}

function uniqueRanks(members: Member[]) {
  return [...new Set(members.map((member) => member.clan_rank))].sort((a, b) =>
    a.localeCompare(b, "en-US"),
  );
}

export default App;
