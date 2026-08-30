# ESPN play-by-play reachability from GitHub Actions

Client: Node v22.23.2 fetch, the same client the build scripts use.

| # | Endpoint | User-Agent | HTTP | Plays returned | Verdict |
|---|---|---|---|---|---|
| 1 | site.api summary | browser | 403 | 0 | **BLOCKED-403** body is not JSON |
| 2 | site.api summary | node default | 200 | 536 | **REACHED**  |
| 3 | site.api summary | curl-string | 200 | 536 | **REACHED**  |
| 4 | site.web.api summary | browser | 200 | 536 | **REACHED**  |
| 5 | site.web.api summary | node default | 200 | 536 | **REACHED**  |
| 6 | cdn.espn playbyplay | browser | 202 | 0 | **UNEXPECTED-202** body is not JSON |
| 7 | cdn.espn playbyplay | node default | 200 | 536 | **REACHED**  |
| 8 | site.api scoreboard | node default | 200 | 0 | **REACHED**  |
| 9 | site.web.api scoreboard | browser | 200 | 0 | **REACHED**  |

## Verdict

Probes: **9**. Reached: **7**. Blocked 403: **1**.

Play-by-play IS retrievable from a GitHub Actions runner. Working combinations:

- `site.api summary` with User-Agent **node default**, 536 plays
- `site.api summary` with User-Agent **curl-string**, 536 plays
- `site.web.api summary` with User-Agent **browser**, 536 plays
- `site.web.api summary` with User-Agent **node default**, 536 plays
- `cdn.espn playbyplay` with User-Agent **node default**, 536 plays

A scheduled Actions job can therefore refresh committed game data in season.
