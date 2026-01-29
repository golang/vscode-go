# Copilot instructions for vscode-go

## Big picture
- The VS Code extension lives under extension/ and is bundled into dist/ (entry in extension/package.json: `main: ./dist/goMain.js`).
- Activation/command wiring is in extension/src/goMain.ts; most feature entry points register commands and listeners there.
- Language features flow through gopls via VS Code LSP client. Core wiring lives in extension/src/language/goLanguageServer.ts and extension/src/commands/startLanguageServer.ts.
- Debugging is split between config/launch plumbing (extension/src/goDebugConfiguration.ts), adapter factory + tracker (extension/src/goDebugFactory.ts), and the legacy adapter implementation (extension/src/debugAdapter/goDebug.ts).
- Some modules under extension/src/utils are shared with the legacy debug adapter and **must not import vscode** (see extension/src/utils/README.md).

## Critical workflows (local dev)
- Install deps: `cd extension && npm ci` (Node >=16.14.2; npm v7+).
- Build/bundle: `npm run compile` (esbuild bundle), or `npm run bundle-dev` for sourcemaps.
- Watch TypeScript: `npm run watch` (tsc -watch).
- Lint: `npm run lint` (gts).
- Unit tests (no VS Code APIs): `npm run unit-test`.
- Integration tests (launch VS Code): `npm run test`.
- Test setup requires tools in GOPATH/bin: `go run tools/installtools/main.go` from repo root.
- Generated docs check: `go run tools/generate.go -w=false -gopls=true`.
- Debug extension: Run/Debug “Launch Extension” (preLaunchTask `npm: bundle-dev`, env `VSCODE_GO_IN_TEST` empty) in .vscode/launch.json.
- Debug tests: “Launch Extension Tests” / “Launch Extension Tests with Gopls” set `VSCODE_GO_IN_TEST=1` and `GOTOOLCHAIN=local` with preLaunchTask `npm: watch` in .vscode/launch.json (workspace path should be GOPATH per .vscode/launch.json comments).
- Debug tools generator: “Launch tools/generate” runs extension/tools/generate.go with cwd extension/.
- Debug gopls: run `gopls -listen=:37374 -logfile=auto -debug=:0 serve` and set `go.languageServerFlags` to `"-remote=:37374"` in the Extension Development Host (see docs/contributing.md).

## Project-specific conventions
- Activation uses `VSCODE_GO_IN_TEST=1` to short-circuit in tests (extension/src/goMain.ts).
- Use gopls commands when available (e.g., `gopls.add_import` path in extension/src/goImport.ts) rather than reimplementing language actions.
- Prefer extending existing command factories (extension/src/commands) and register via createRegisterCommand in goMain.

## Integration points
- External tools: gopls (language server) and dlv (debug adapter) are required for core features; tool install/update is wired through extension commands.
- Debug adapter modes: default local uses dlv-dap; legacy adapter is still used for some remote scenarios (see docs/debugging.md).

## Where to look first for changes
- Command/feature registration: extension/src/goMain.ts
- Language server config & client: extension/src/language/goLanguageServer.ts
- Debugging config & adapter: extension/src/goDebugConfiguration.ts, extension/src/goDebugFactory.ts, extension/src/debugAdapter/goDebug.ts
- Tests: extension/test/unit, extension/test/integration, extension/test/gopls
