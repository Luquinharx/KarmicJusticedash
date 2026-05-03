export type RouteId = "home" | "week" | "history";

export type SortKey =
  | "daily_ts"
  | "daily_loot"
  | "weekly_ts"
  | "weekly_clan_ts"
  | "weekly_loot"
  | "weekly_clan_loot"
  | "username"
  | "clan_rank";
export type SortDirection = "asc" | "desc";
export type SortValue = `${SortKey}:${SortDirection}`;

export interface ClanInfo {
  id?: number;
  name?: string;
  url?: string;
  daily_ts?: number;
  daily_loot?: number;
  weekly_ts?: number;
  weekly_loot?: number;
}

export interface WeekInfo {
  key?: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
}

export interface RawMember {
  username?: string;
  rank?: string;
  clan_rank?: string;
  profile_id?: number | string;
  player_id?: number | string;
  df_profile_id?: number | string;
  user_id?: number | string;
  dfprofiler_url?: string;
  dead_frontier_profile_url?: string;
  daily_ts?: number | string;
  daily_loot?: number | string;
  weekly_loot?: number | string;
  weekly_clan_loot?: number | string;
  weekly_loot_clan?: number | string;
  weekly_ts?: number | string;
  weekly_clan_ts?: number | string;
  weekly_ts_clan?: number | string;
}

export interface ClanSnapshot {
  clan?: ClanInfo;
  week?: WeekInfo;
  members?: RawMember[] | Record<string, RawMember>;
  member_count?: number;
  collected_at?: string;
  collected_at_utc?: string;
  source?: string;
}

export interface ClanDatabase {
  current_week?: ClanSnapshot;
  latest_week?: ClanSnapshot;
  latest?: ClanSnapshot;
  weekly_history?: Record<string, ClanSnapshot>;
}

export interface Member {
  username: string;
  clan_rank: string;
  profile_id?: number;
  dfprofiler_url?: string;
  dead_frontier_profile_url?: string;
  daily_ts: number;
  daily_loot: number;
  weekly_loot: number;
  weekly_clan_loot: number;
  weekly_ts: number;
  weekly_clan_ts: number;
}

export interface Filters {
  search: string;
  rank: string;
  sort: SortValue;
  minTs: number;
  minLoot: number;
}

export interface HistoryFilters {
  search: string;
  rank: string;
  sort: SortValue;
}
