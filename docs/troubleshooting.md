# Troubleshooting

If you suspect that the Go extension is not working correctly, please follow the troubleshooting steps below.

**NOTE: [Debugging](debugging.md#troubleshooting) has its own troubleshooting documentation.**

## Make sure your project compiles

Verify that your project is in good shape by working with it at the command line. Running a command like `go build ./...` in the workspace directory will compile everything. For modules, `go mod tidy` is another good check, though it may modify your `go.mod`.

## Look for serious errors and diagnostics

Check that there aren't any diagnostics that indicate a problem with your workspace. First, check the bottom-center of the VS Code window for any errors. After that, check the package declaration of the any Go files you're working in, and your `go.mod` file. Problems in the workspace configuration can cause many different symptoms. See the [`gopls` workspace setup instructions](https://github.com/golang/tools/blob/master/gopls/doc/workspace.md) for help.

## Check your extension setup

Check the bottom of the VS Code window for any warnings and notifications. For example, address warnings such as "⚠️ Analysis Tools Missing".

Run the [`Go: Locate Configured Go Tools`](commands.md#go-locate-configured-go-tools) command. The output is split into sections.

In the first indented section, check that at least `go-outline`, `dlv`, and `gopls` are installed -- they're necessary for the extension's basic functionality. The other tools [provide optional features](tools.md) and are less important unless you need those features. You can install tools by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command.

Then, look at the `Workspace Folder` section(s) for the environment in use. Verify that `GOROOT` is set to a valid Go installation; if not, follow the [getting started guide](../README.md#install-go). If `GOPATH` is unset, or surprising, read more about [setting up your `GOPATH`](gopath.md#setting-gopath). Also, `GOMOD` should usually point to your project's `go.mod` file if you're in module mode. (More complicated workspace setups may have a blank `GOMOD`. See the `gopls` [workspace documentation](https://github.com/golang/tools/blob/master/gopls/doc/workspace.md) for more on valid workspace setups.) To change the workspace environment, use settings such as [`go.gopath`](settings.md#go.gopath) and [`go.toolsEnvVars`](settings.md#go.toolsEnvVars).

Finally, take a look at your settings in the JSON form (`Preferences: Open Settings (JSON)`). This is an easier way to quickly see what non-default configurations you have. Consider [reading about](settings.md) any settings you don't understand, or just commenting them out.

## Update tools

It's possible that you are using an outdated version of a tool, so the bug you are encountering may have already been fixed. You can update all tools at once by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command.

## Restart `gopls`

Many of the extension's features are provided by [`gopls`](https://golang.org/s/gopls), the official language server for Go. `gopls` has no persistent state, so restarting it will fix transient problems. This is good and bad: good, because you can keep working, and bad, because you won't be able to debug the issue until it recurs. You can restart `gopls` using the `Go: Restart Language Server` command.

## Ask for help

After you've done the basic steps above, it's a good time to ask for help. Gophers Slack has a channel for [#vscode](https://gophers.slack.com/archives/C2B4L99RS) that can help debug further. If you're confident the problem is with `gopls`, you can go to [#gopls](https://gophers.slack.com/archives/CJZH85XCZ). Invites are [available to everyone](https://invite.slack.golangbridge.org). Come prepared with a short description of the issue, and try to be available to answer questions for a while afterward.

## Collect extension logs

Start off by opening the `View` -> `Output` pane. On the right side, open the drop-down titled "Tasks". Any item that starts with "Go" is related to this extension. Browse through these output channels and make note of any error messages.

You can also look directly in the logs of the Extension Host by selecting `Log (Extension Host)`. These may contain a lot of unrelated information, but they may prove useful. If you are trying to get the logs for a specific operation, like go to definition, clear the logs (Clear Output button on the right side), and perform the operation.

Errors may also be logged to the Developer Tools console. These errors may be more difficult to parse, but you can take a look at them by running the `Developer: Toggle Developer Tools` command from the Command Palette (Ctrl+Shift+P).

## Collect `gopls` information

Enable `gopls` tracing by adding the following to your settings:

```json5
"go.languageServerFlags": [
  "-rpc.trace"
]
```

The gopls log can be found by navigating to `View` -> `Output`. There will be a drop-down menu titled `Tasks` in the top-right corner. Select the `gopls (server)` item, which will contain the `gopls` logs.

In special cases, you may want to increase the verbosity further:

```json5
"gopls": {
  "verboseOutput": true
}
```
## File an issue

We can't diagnose a problem from just a description. When filing an issue, please include as much as possible of the following information:

1. Your Go version: `go version`
1. Your `gopls` version: `gopls -v version`
1. Your vscode version: `code -v` (The minimum required VS Code version is in the ["engines"](https://github.com/golang/vscode-go/blob/master/package.json#L89) attribute in the package.json file.)
1. Your Go extension version: `Extensions: Show Installed Extensions`
1. Your Go environment: `go env` in the workspace folder
1. Relevant VS Code settings: run `Preferences: Open Settings (JSON)` and include anything in a `[go]` block, and anything that starts with `go.` or `gopls.`
1. Extension and `gopls` logs as seems appropriate for the bug. (Include from the beginning of the logs if possible.)

Once you've collected that information, [file your issue](https://github.com/golang/vscode-go/issues/new/choose).