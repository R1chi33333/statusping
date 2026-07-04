# Roadmap

Development follows small, releasable increments. Each item below is one loop.

## Milestone: v0.1.0 — Probe engine

- [x] Loop 1: repository scaffold, CI with a docker compose smoke test, blank deployable page
- [x] Loop 2: probe function — HTTP status, latency, timeout and keyword assertion, fully tested
- [x] Loop 3: scheduler — per-monitor intervals, incident open/close state machine, tested
- [x] Loop 4: webhook notifications — Discord and Slack payloads for down and recovery
- [x] Release v0.1.0

## Milestone: v0.2.0 — Dashboard and status page

- [x] Loop 5: admin API (bearer token) and monitor CRUD UI
- [x] Loop 6: latency charts (24h / 7d / 30d) and incident timeline
- [x] Loop 7: public status page — 90-day availability bars, uptime percentages, no login
- [x] Release v0.2.0

## Milestone: v1.0.0 — Ship

- [ ] Loop 8: Railway deployment, monitors for the three portfolio demos, first real incident recorded
- [x] Loop 9: Playwright e2e — admin add-monitor flow and public status page flow
- [ ] Loop 10: README with self-host guide, deploy button, screenshot
- [ ] Release v1.0.0

## Later

- [ ] Response-time percentiles and SLO targets
- [ ] Email notifications
- [ ] Multi-user support
