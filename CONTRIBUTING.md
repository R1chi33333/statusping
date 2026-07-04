# Contributing

Thanks for your interest. This project is small and contributions are welcome.

## Setup

```bash
npm ci
cp .env.example .env
npm run dev        # Fastify API with watch
npm run dev:web    # Vite dev server for the UI
```

## Rules

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`). Releases are cut automatically from commit messages.
- `npm run lint`, `npm run typecheck` and `npm test` must pass before a PR.
- The scheduler and probe logic must stay unit-testable: no real network or timers in tests.
- No emoji anywhere: code, comments, docs, commit messages.
