from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup


CLAN_ID = 58
CLAN_URL = f"https://www.dfprofiler.com/clan/view/{CLAN_ID}"
FIREBASE_DATABASE_URL = "https://karmiclan-default-rtdb.firebaseio.com/"
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")
WEEK_END_WEEKDAY = 0  # Monday
WEEK_END_HOUR = 7
WEEK_END_MINUTE = 55
SAVE_GRACE_MINUTES = 10


class ScraperError(RuntimeError):
    pass


@dataclass(frozen=True)
class WeekWindow:
    key: str
    starts_at: datetime
    ends_at: datetime


def parse_number(value: str) -> int:
    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return 0
    return int(cleaned)


def get_text(element: Any) -> str:
    return element.get_text(" ", strip=True) if element else ""


def active_week_window(now: datetime | None = None) -> WeekWindow:
    """Return the weekly window shown by the live DFProfiler counters."""
    now = now or datetime.now(SAO_PAULO_TZ)
    now = now.astimezone(SAO_PAULO_TZ)

    days_since_monday = (now.weekday() - WEEK_END_WEEKDAY) % 7
    week_anchor = (now - timedelta(days=days_since_monday)).replace(
        hour=WEEK_END_HOUR,
        minute=WEEK_END_MINUTE,
        second=0,
        microsecond=0,
    )

    ends_at = week_anchor if now <= week_anchor else week_anchor + timedelta(days=7)
    starts_at = ends_at - timedelta(days=7)
    key = ends_at.strftime("%Y-%m-%d_0755_brt")
    return WeekWindow(key=key, starts_at=starts_at, ends_at=ends_at)


def completed_week_window(now: datetime | None = None) -> WeekWindow:
    """Return the most recent weekly window that has reached Monday 07:55."""
    now = now or datetime.now(SAO_PAULO_TZ)
    now = now.astimezone(SAO_PAULO_TZ)

    days_since_monday = (now.weekday() - WEEK_END_WEEKDAY) % 7
    latest_anchor = (now - timedelta(days=days_since_monday)).replace(
        hour=WEEK_END_HOUR,
        minute=WEEK_END_MINUTE,
        second=0,
        microsecond=0,
    )

    ends_at = latest_anchor if now >= latest_anchor else latest_anchor - timedelta(days=7)
    starts_at = ends_at - timedelta(days=7)
    key = ends_at.strftime("%Y-%m-%d_0755_brt")
    return WeekWindow(key=key, starts_at=starts_at, ends_at=ends_at)


def save_window_for_completed_week(now: datetime | None = None) -> WeekWindow:
    """Return the completed week only during the configured Monday save window."""
    now = now or datetime.now(SAO_PAULO_TZ)
    now = now.astimezone(SAO_PAULO_TZ)
    week = completed_week_window(now)
    save_until = week.ends_at + timedelta(minutes=SAVE_GRACE_MINUTES)

    if week.ends_at <= now <= save_until:
        return week

    raise ScraperError(
        "Fora da janela de gravacao da semana concluida. "
        f"A gravacao automatica acontece toda segunda as {WEEK_END_HOUR:02d}:{WEEK_END_MINUTE:02d} "
        f"no horario de Sao Paulo, com {SAVE_GRACE_MINUTES} minutos de tolerancia."
    )


def fetch_clan_html(url: str = CLAN_URL) -> str:
    response = requests.get(
        url,
        timeout=30,
        headers={
            "User-Agent": "KarmicClanWeeklyScraper/1.0 (+https://www.dfprofiler.com/)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    response.raise_for_status()
    return response.text


def fetch_profile_html(profile_url: str, session: requests.Session) -> str:
    response = session.get(
        profile_url,
        timeout=30,
        headers={
            "User-Agent": "KarmicClanWeeklyScraper/1.0 (+https://www.dfprofiler.com/)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    response.raise_for_status()
    return response.text


def parse_profile_weekly_stats(html: str) -> dict[str, int]:
    soup = BeautifulSoup(html, "html.parser")
    stats: dict[str, int] = {}

    for heading in soup.find_all("h4"):
        label = get_text(heading).lower().replace(" ", "_")
        if label not in {
            "weekly_ts",
            "clan_weekly_ts",
            "weekly_loots",
            "clan_weekly_loots",
        }:
            continue

        container = heading.find_parent()
        value = get_text(container.select_one(".display") if container else None)
        if value:
            stats[label] = parse_number(value)

    return {
        "weekly_ts": stats.get("weekly_ts", 0),
        "weekly_clan_ts": stats.get("clan_weekly_ts", 0),
        "weekly_loot": stats.get("weekly_loots", 0),
        "weekly_clan_loot": stats.get("clan_weekly_loots", 0),
    }


def parse_clan_snapshot(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    title = get_text(soup.title)
    clan_name = title.split("::", 1)[0].strip() if "::" in title else title

    clan_stats: dict[str, int] = {}
    for record in soup.select(".record"):
        label = get_text(record.find("h4")).lower().replace(" ", "_")
        if not label:
            continue

        value_text = get_text(record).replace(get_text(record.find("h4")), "", 1).strip()
        if value_text:
            clan_stats[label] = parse_number(value_text)

    table = soup.find("table")
    if table is None:
        raise ScraperError("Tabela de membros nao encontrada na pagina do clan.")

    headers = [get_text(th) for th in table.find_all("th")]
    required_headers = ["Username", "Rank", "Weekly TS", "Weekly Loots"]
    missing = [header for header in required_headers if header not in headers]
    if missing:
        raise ScraperError(f"Colunas obrigatorias ausentes: {', '.join(missing)}")

    header_index = {header: index for index, header in enumerate(headers)}
    session = requests.Session()
    members: list[dict[str, Any]] = []

    for row in table.find_all("tr")[1:]:
        cells = [get_text(td) for td in row.find_all("td")]
        if len(cells) < len(headers):
            continue

        username = cells[header_index["Username"]]
        if not username:
            continue

        member = {
            "username": username,
            "clan_rank": cells[header_index["Rank"]],
            "weekly_loot": parse_number(cells[header_index["Weekly Loots"]]),
            "weekly_clan_loot": parse_number(cells[header_index["Weekly Loots"]]),
            "weekly_ts": parse_number(cells[header_index["Weekly TS"]]),
            "weekly_clan_ts": parse_number(cells[header_index["Weekly TS"]]),
        }

        profile_link = row.find("a", href=True)
        if profile_link:
            profile_url = urljoin(CLAN_URL, profile_link["href"])
            try:
                profile_stats = parse_profile_weekly_stats(fetch_profile_html(profile_url, session))
                member.update(profile_stats)
            except Exception as exc:
                print(f"Falha ao coletar perfil de {username}: {exc}", file=sys.stderr)

        members.append(member)

    if not members:
        raise ScraperError("Nenhum membro foi extraido da tabela do clan.")

    weekly_ts_clan = clan_stats.get("weekly_ts", sum(member["weekly_clan_ts"] for member in members))
    weekly_loot_clan = sum(member["weekly_clan_loot"] for member in members)

    return {
        "clan": {
            "id": CLAN_ID,
            "name": clan_name,
            "url": CLAN_URL,
            "weekly_ts": weekly_ts_clan,
            "weekly_loot": weekly_loot_clan,
        },
        "members": members,
        "member_count": len(members),
    }


def firebase_rest_url(database_url: str, path: str, auth_token: str | None = None) -> str:
    base_url = database_url.rstrip("/")
    clean_path = path.strip("/")
    url = f"{base_url}/{clean_path}.json"
    if auth_token:
        url = f"{url}?{urlencode({'auth': auth_token})}"
    return url


def save_to_firebase(
    snapshot: dict[str, Any],
    database_url: str = FIREBASE_DATABASE_URL,
    auth_token: str | None = None,
    save_weekly_history: bool = False,
) -> None:
    week_key = snapshot["week"]["key"]
    base_path = f"clans/{CLAN_ID}"

    writes = {
        f"{base_path}/current_week": snapshot,
    }

    if save_weekly_history:
        writes[f"{base_path}/weekly_history/{week_key}"] = snapshot
        writes[f"{base_path}/latest_week"] = snapshot
        writes[f"{base_path}/latest"] = snapshot

    for path, payload in writes.items():
        response = requests.put(
            firebase_rest_url(database_url, path, auth_token),
            json=payload,
            timeout=30,
        )
        response.raise_for_status()


def build_snapshot(week: WeekWindow) -> dict[str, Any]:
    html = fetch_clan_html()
    parsed = parse_clan_snapshot(html)
    collected_at = datetime.now(SAO_PAULO_TZ)

    return {
        **parsed,
        "week": {
            "key": week.key,
            "starts_at": week.starts_at.isoformat(),
            "ends_at": week.ends_at.isoformat(),
            "timezone": "America/Sao_Paulo",
        },
        "collected_at": collected_at.isoformat(),
        "collected_at_utc": collected_at.astimezone(timezone.utc).isoformat(),
        "source": "dfprofiler",
    }


def seconds_until_next_week_end(now: datetime | None = None) -> float:
    now = now or datetime.now(SAO_PAULO_TZ)
    week = active_week_window(now)
    target = week.ends_at
    if target < now:
        target += timedelta(days=7)
    return max(0.0, (target - now).total_seconds())


def seconds_until_next_daily_update(now: datetime | None = None) -> float:
    now = now or datetime.now(SAO_PAULO_TZ)
    target = now.replace(
        hour=WEEK_END_HOUR,
        minute=WEEK_END_MINUTE,
        second=0,
        microsecond=0,
    )
    if target < now:
        target += timedelta(days=1)
    return max(0.0, (target - now).total_seconds())


def run_once(args: argparse.Namespace) -> dict[str, Any]:
    save_weekly_history = False
    completed_week: WeekWindow | None = None

    if not args.dry_run:
        try:
            completed_week = save_window_for_completed_week()
            save_weekly_history = True
        except ScraperError:
            completed_week = None

    week = completed_week or active_week_window()
    snapshot = build_snapshot(week)

    if args.dry_run:
        print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    else:
        save_to_firebase(snapshot, args.database_url, args.auth_token, save_weekly_history)
        weekly_message = " e historico semanal" if save_weekly_history else ""
        print(f"Snapshot salvo em clans/{CLAN_ID}/current_week{weekly_message} ({snapshot['member_count']} membros)")

    return snapshot


def run_daemon(args: argparse.Namespace) -> None:
    print("Aguardando atualizacao diaria as 07:55 no horario de Sao Paulo.")
    while True:
        sleep_for = seconds_until_next_daily_update()
        wake_at = datetime.now(SAO_PAULO_TZ) + timedelta(seconds=sleep_for)
        print(f"Proximo snapshot em {wake_at.isoformat()}")
        time.sleep(sleep_for)
        try:
            run_once(args)
        except Exception as exc:
            print(f"Falha ao salvar snapshot: {exc}", file=sys.stderr)
            time.sleep(60)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coleta o snapshot do clan Karmic Justice no DFProfiler.")
    parser.add_argument(
        "--database-url",
        default=FIREBASE_DATABASE_URL,
        help="URL do Firebase Realtime Database.",
    )
    parser.add_argument(
        "--auth-token",
        default=None,
        help="Token de auth do Firebase, se as regras do database exigirem autenticacao.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o JSON atual do DFProfiler sem gravar no Firebase.",
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Mantem o script rodando e atualiza diariamente as 07:55.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.daemon:
            run_daemon(args)
        else:
            run_once(args)
    except Exception as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
