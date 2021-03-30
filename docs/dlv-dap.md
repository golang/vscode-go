# Dlv DAP - Delve's native DAP implementation

[`Delve`'s native DAP implementation](https://github.com/go-delve/delve/tree/master/service/dap) is now available to be used to debug Go programs.

This debug adapter runs in a separate `go` process, which is spawned by VS Code when you debug Go code. Since `dlv dap` is under active development, we need the Delve built at master to get all recent updates. The Go extension currently maintains this unstable version of Delve separately from the stable version (`dlv`), and installs it as `dlv-dap`.

Please see the [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) to understand how the Debug Adapter acts as an intermediary between VS Code and the debugger ([Delve](https://github.com/go-delve/delve)).

Follow along with [golang/vscode-go#23](https://github.com/golang/vscode-go/issues/23) and the [project dashboard](https://github.com/golang/vscode-go/projects/3) for updates on the implementation.

## Overview

* [How to use dlv dap](#how-to-use-dlv-dap)
* [Features & Caveats](#features-and-caveats)
* [Reporting issues](#reporting-issues)
* [How to contribute](#developing)

## How to use dlv dap

You can choose which debug adapter to use with the `"debugAdapter"` field in [your `launch.json` configuration](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#snippets). Most settings will continue to work with in `"dlv-dap" debugAdapter` mode except [a few caveats](#features-and-caveats).
If you do not already have a `launch.json`, select `create a launch.json file` from the debug pane and choose an initial Go debug configuration.

<div style="text-align: center;"><img src="images/createlaunchjson.png" alt="The debug pane with the option to create launch.json"> </div>

In your launch configuration, set the `"debugAdapter"` field to be `"dlv-dap"`. For example, a launch configuration for a file would look like:

```json5
{
    "name": "Launch file",
    "type": "go",
    "request": "launch",
    "mode": "auto",
    "program": "${file}",
    "debugAdapter": "dlv-dap"
}
```

To switch back to the legacy adapter, set `"debugAdapter"` to `"legacy"`.

### Updating dlv dap
The easiest way is to use the `"Go: Install/Update Tools"` command from the command palette (⇧+⌘+P or Ctrl+Shift+P). The command will show `dlv-dap` in the tool list. Select it, and the extension will build the tool at master.

If you want to install it manually, `go get` with the following command and rename it to `dlv-dap`.

```
$ GO111MODULE=on GOBIN=/tmp/ go get github.com/go-delve/delve/cmd/dlv@master
$ mv /tmp/dlv $GOPATH/bin/dlv-dap
```

## Features and Caveats

Dlv DAP implementation offers the following advantages:
* Better map key presentation. ([Issue 1267](https://github.com/golang/vscode-go/issues/1267#issuecomment-800607474))
<!-- TODO(polinasok,suzmue): add more unique features -->

The following features are still under development.

* Stop/pause/restart while the debugged program is running does not work.
* Cannot be used with `debug test` codelens.
* Support for `"dlvFlags"` attributes in launch configuration is not available.
* `dlvLoadConfig` to configure max string/bytes length in [`"go.delveConfig"`](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#configuration) does not work.
* [Remote debugging](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#remote-debugging) is not supported.

## Reporting issues

The VS Code Go maintainers are reachable via the issue tracker and the #vscode-dev channel in the Gophers Slack. Please reach out on Slack with questions, suggestions, or ideas. If you have trouble getting started on an issue, we'd be happy to give pointers and advice.

Please report issues in [our issue tracker](https://github.com/golang/vscode-go/issues) with the following information.

* `go version`
* `go version -m dlv-dap`
* Instruction to reproduce the issue (code snippets, `launch.json`, screenshot)

## Developing

### Code location
The core part of Delve DAP implementation is in the [`service/dap`](https://github.com/go-delve/delve/tree/master/service/dap) package. Follow Delve project's [contribution guideline](https://github.com/go-delve/delve/blob/master/CONTRIBUTING.md#contributing-code) to send PRs.
Code for integration with the Go extension is mostly in [`src/goDebugFactory.ts`](https://github.com/golang/vscode-go/blob/master/src/goDebugFactory.ts) and tests are in [`test/integration/goDebug.test.ts`](https://github.com/golang/vscode-go/blob/master/test/integration/goDebug.test.ts). Please take a look at VS Code Go project's [contribution guideline](https://github.com/golang/vscode-go/blob/master/docs/contributing.md) to learn about how to prepare a change and send it for review.

### Testing
For simple launch cases, build the delve binary, and configure `"go.alternateTools"` setting.

```json5
"go.alternateTools": {
    "dlv-dap": <path_to_your_delve>
}
```

Set `logOutput` and `showLog` attributes in `launch.json` to enable logging and DAP message tracing.
```json5
{
    "name": "Launch file",
    "type": "go",
    "request": "launch",
    "debugAdapter": "dlv-dap",
    "showLog": true,
    ...
    "logOutput": "dap"
}
```

If you are having issues with seeing logs and or suspect problems in extension's integration, you can start Delve DAP server from a separate terminal and configure the extension to directly connect to it.

```
$ dlv-dap dap --listen=:12345 --log-output=dap
```

```json5
{
    "name": "Launch file",
    "type": "go",
    "request": "launch",
    "debugAdapter": "dlv-dap",
    ...
    "port": 12345
}
```