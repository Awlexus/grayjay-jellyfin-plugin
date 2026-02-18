# Repository Guidelines

## Project Structure & Module Organization
`lib/` holds Phoenix contexts, LiveView handlers, and the Jellyfin bridge logic, while `lib/grayjay_jellyfin_plugin_web` mirrors the router/controller/component layout. Tailwind and esbuild inputs live in `assets/`, and the Grayjay client served to phones is `priv/static/js/client.js`. Configuration is split across `config/*.exs`, with `config/runtime.exs` reading host/port and secret env vars; Fly-specific settings sit in `fly.toml` and `deploy.sh`. Tests live in `test/` with reusable helpers under `test/support/`.

## Build, Test, and Development Commands
- `mix setup` installs Hex deps and builds tailwind/esbuild assets in one step.
- `mix phx.server` (or `iex -S mix phx.server`) boots the dev server on `localhost:4000` so you can pair a Grayjay device.
- `mix test` runs the ExUnit suite; append `--cover` when validating coverage prior to release.
- `mix assets.deploy` minifies CSS/JS and runs `phx.digest`; use it before `MIX_ENV=prod mix release` or deploying via Fly.

## Coding Style & Naming Conventions
Stick to Phoenix defaults: modules in `CamelCase`, functions and variables in `snake_case`, with early pattern matching instead of nested conditionals. Use two-space indentation and run `mix format` before every commit; avoid hand-editing generated boundary modules in `lib/grayjay_jellyfin_plugin_web/components`. Client JS stays in camelCase, keeps helpers small, and avoids introducing global symbols.

## Testing Guidelines
Pair each module with a matching ExUnit file (`lib/foo/bar.ex` ↔︎ `test/foo/bar_test.exs`) and group expectations with `describe` blocks. Stub Jellyfin HTTP calls via helpers in `test/support` so QR login and playback tests stay deterministic. Cover every HTTP boundary (auth, search, playback) plus LiveViews that render plugin metadata. `mix test.watch` is optional but encouraged during longer sessions.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries (`Add album folders`, `Fix codec selection`); follow that tone and keep bodies for rationale or TODOs. Each PR should outline purpose, testing proof (`mix test`, manual streaming steps), linked issues, and screenshots for UI work (QR page, errors). Call out configuration or secret changes so other operators can reproduce them.

## Security & Configuration Tips
Never commit secrets: set `SECRET_KEY_BASE`, `PHX_HOST`, and Jellyfin tokens through env vars or Fly secrets. When exposing dev builds on a LAN, ensure `config/runtime.exs` resolves the correct IPv4 address or override it with `PHX_HOST=your.domain`. For production, enable HTTPS per the `runtime.exs` comments and keep `deploy.sh` aligned with the active Fly app name.
