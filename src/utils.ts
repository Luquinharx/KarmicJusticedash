import type { ClanSnapshot, Filters, HistoryFilters, Member, RawMember } from "./types";

export const numberFormatter = new Intl.NumberFormat("en-US");
const deadFrontierProfileBase =
  "https://fairview.deadfrontier.com/onlinezombiemmo/index.php?action=profile;u=";

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : undefined;
}

export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

export function formatCompactNumber(value: unknown): string {
  const number = toNumber(value);
  const absolute = Math.abs(number);
  const units = [
    { value: 1_000_000_000_000, suffix: "T" },
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];

  const unit = units.find((candidate) => absolute >= candidate.value);
  if (!unit) return formatNumber(number);

  const compact = number / unit.value;
  const digits = Math.abs(compact) >= 100 ? 0 : Math.abs(compact) >= 10 ? 1 : 2;
  return `${compact.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}${unit.suffix}`;
}

export function formatDate(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : dateFormatter.format(date);
}

export function normalizeMembers(snapshot?: ClanSnapshot | null): Member[] {
  const rawMembers = snapshot?.members;
  const members: RawMember[] = Array.isArray(rawMembers)
    ? rawMembers
    : Object.values(rawMembers || {});

  const clanTs = toNumber(
    snapshot?.clan?.weekly_ts ??
      members[0]?.weekly_clan_ts ??
      members[0]?.weekly_ts_clan ??
      0,
  );
  const clanLoot = toNumber(
    snapshot?.clan?.weekly_loot ??
      members[0]?.weekly_clan_loot ??
      members[0]?.weekly_loot_clan ??
      0,
  );

  return members.map((member) => {
    const profileId = toOptionalNumber(
      member.profile_id ?? member.player_id ?? member.df_profile_id ?? member.user_id,
    );

    return {
      username: String(member.username || "--"),
      clan_rank: String(member.clan_rank || member.rank || "--"),
      profile_id: profileId,
      dfprofiler_url: member.dfprofiler_url,
      dead_frontier_profile_url:
        member.dead_frontier_profile_url ||
        (profileId ? `${deadFrontierProfileBase}${profileId}` : undefined),
      daily_ts: toNumber(member.daily_ts),
      daily_loot: toNumber(member.daily_loot),
      weekly_loot: toNumber(member.weekly_loot),
      weekly_clan_loot: toNumber(member.weekly_clan_loot ?? member.weekly_loot_clan ?? clanLoot),
      weekly_ts: toNumber(member.weekly_ts),
      weekly_clan_ts: toNumber(member.weekly_clan_ts ?? member.weekly_ts_clan ?? clanTs),
    };
  });
}

export function snapshotTotals(snapshot: ClanSnapshot | null | undefined, members: Member[]) {
  const weeklyClanTs = toNumber(
    snapshot?.clan?.weekly_ts ??
      members.reduce((total, member) => total + member.weekly_clan_ts, 0),
  );
  const weeklyClanLoot = toNumber(
    snapshot?.clan?.weekly_loot ??
      members.reduce((total, member) => total + member.weekly_clan_loot, 0),
  );
  const dailyClanLoot = toNumber(
    snapshot?.clan?.daily_loot ??
      members.reduce((total, member) => total + member.daily_loot, 0),
  );
  const dailyClanTs = toNumber(
    snapshot?.clan?.daily_ts ??
      members.reduce((total, member) => total + member.daily_ts, 0),
  );

  return {
    dailyClanTs,
    dailyClanLoot,
    weeklyClanTs,
    weeklyClanLoot,
    memberCount: members.length,
  };
}

export function formatWeekRange(snapshot?: ClanSnapshot | null): string {
  if (!snapshot?.collected_at) return "Waiting for the first collection";
  
  const start = new Date(snapshot.collected_at);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  
  return `${formatDate(start.toISOString())} to ${formatDate(end.toISOString())}`;
}

export function applyFilters<T extends Filters | HistoryFilters>(
  members: Member[],
  filters: T,
): Member[] {
  const search = filters.search.trim().toLowerCase();
  const [sortField, sortDirection] = filters.sort.split(":") as [keyof Member, "asc" | "desc"];

  return members
    .filter((member) => {
      const matchesSearch =
        !search ||
        member.username.toLowerCase().includes(search) ||
        member.clan_rank.toLowerCase().includes(search);
      const matchesRank = filters.rank === "all" || member.clan_rank === filters.rank;
      const matchesTs = "minTs" in filters ? member.weekly_ts >= toNumber(filters.minTs) : true;
      const matchesLoot = "minLoot" in filters ? member.weekly_loot >= toNumber(filters.minLoot) : true;
      return matchesSearch && matchesRank && matchesTs && matchesLoot;
    })
    .sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (typeof aValue === "string" || typeof bValue === "string") {
        return String(aValue).localeCompare(String(bValue), "en-US") * modifier;
      }

      return (toNumber(aValue) - toNumber(bValue)) * modifier;
    });
}

export function rankCounts(members: Member[]): Array<[string, number]> {
  const counts = members.reduce<Record<string, number>>((acc, member) => {
    acc[member.clan_rank] = (acc[member.clan_rank] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
