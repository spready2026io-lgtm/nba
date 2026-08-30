# ESPN reachability from GitHub Actions

Run: `33307973431` on `6af3faa891a5a921bf73ecb120f361cf9a08d7d4`

Runner public IP: `132.196.7.21`

| # | Endpoint | User-Agent | HTTP | Body is real JSON | Verdict |
|---|---|---|---|---|---|
| 1 | site.api scoreboard | browser | 403 | no | **BLOCKED-403** |
| 2 | site.api summary (play-by-play) | browser | 403 | no | **BLOCKED-403** |
| 3 | site.api scoreboard | curl default | 200 | yes | **REACHED** |
| 4 | cdn.espn core scoreboard | browser | 200 | yes | **REACHED** |
| 5 | site.web.api scoreboard | browser | 200 | yes | **REACHED** |
| 6 | sports.core.api events | browser | 200 | yes | **REACHED** |

## Verdict

Probes run: **6**. Reached: **4**. Blocked with 403: **2**. Other: **0**.

GitHub Actions **CAN** reach ESPN on at least one endpoint. A scheduled job on
Actions can refresh committed game data during the season.
