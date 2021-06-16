# Dlv DAP - Delve's native DAP implementation

[`Delve`'s native DAP implementation](https://github.com/go-delve/delve/tree/master/service/dap) is now available to be used to debug Go programs.

_________________
**🔥 This new adapter is still in active development, so to take advantage of the most recent features and bug fixes, you need to use Delve built from the dev branch. When the extension asks to install/update `dlv-dap`, please follow the instruction and rebuild the tool.**
_________________

The Go extension currently maintains this development version of Delve separately from the stable version of `dlv`. This version is installed with the name `dlv-dap`. Please follow the instruction in [Getting Started](#getting-started) to configure the extension and install `dlv-dap`.

This new debug adapter runs in a separate `go` process, which is spawned by VS Code when you debug Go code.
Please see the [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) to learn about how the Debug Adapter acts as an intermediary between VS Code and the debugger ([Delve](https://github.com/go-delve/delve)).


## Getting Started

You can select the default debug adapter to use in all launch configurations and codelenses through the `"debugAdapter"` field in the [`"go.delveConfig"`](settings.md#go.delveConfig) setting. You can choose which debug adapter to use for individual launch configurations with the `"debugAdapter"` field in [your `launch.json` configuration](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#snippets). Most settings will continue to work with in this new `"dlv-dap"` mode except [a few caveats](#features-and-caveats).
If you do not already have a `launch.json`, select `create a launch.json file` from the debug pane and choose an initial Go debug configuration.

<div style="text-align: center;"><img src="images/createlaunchjson.png" width=200 alt="The debug pane with the option to create launch.json"> </div>

In your launch configuration, set the `"debugAdapter"` field to be `"dlv-dap"`. For example, a launch configuration for a file would look like:

```json5
{
    "name": "Launch file",
    "type": "go",
    "request": "launch",
    "mode": "auto",
    "program": "${fileDirname}",
    "debugAdapter": "dlv-dap"
}
```

To switch back to the legacy adapter, set `"debugAdapter"` to `"legacy"`.

When you start debugging using the configuration for the first time, the extension will ask you to install `dlv-dap`.

<div style="text-align: center;"><img src="images/dlv-dap-install-prompt.gif" width=350 alt="missing tool notification"> </div>

Once `dlv-dap` is installed, the extension will prompt you for update whenever installing a newer version is necessary (usually after the Go extension update).

### Updating dlv dap
The easiest way is to use the `"Go: Install/Update Tools"` command from the command palette (⇧+⌘+P or Ctrl+Shift+P). The command will show `dlv-dap` in the tool list. Select it, and the extension will build the tool at master.

If you want to install it manually, `go get` with the following command and rename it to `dlv-dap`.

```
$ GO111MODULE=on GOBIN=/tmp/ go get github.com/go-delve/delve/cmd/dlv@master
$ mv /tmp/dlv $GOPATH/bin/dlv-dap
```

## Features and Caveats
<!-- TODO: update the debugging section of features.md using dlv-dap mode -->

🎉  The new debug adapter offers many improvements and fixes bugs that existed in the old adapter. [Here](https://github.com/golang/vscode-go/issues?q=is%3Aissue+label%3Afixedindlvdaponly) is a partial list of enhancement/fixes available only in the new adapter.

* User-friendly inlined presentation of variables of all complex types (map, struct, pointer, array, slice, ...)
* Auto-loading of nested variables without extra configuration. (See [delve PR/2455](https://github.com/go-delve/delve/pull/2455#issuecomment-827884652))
* Fixed handling of maps with compound keys
* Improved CALL STACK presentation
* Fixed automated "Add to Watch" / "Copy as Expression" expressions.
* Support to switch goroutines while stepping.
* Robust `call` evaluation.
* Good test coverage.

Most of all, the new adapter is written in Go and integrated in `dlv`. That will make it easier for the Go community to contribute. </br>
Because it is native, we hope for improvement in speed and reliability.

💡 Notes:

* `dlvLoadConfig` to configure max string/bytes length in [`"go.delveConfig"`](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#configuration) does not work. For large strings, use `DEBUG CONSOLE`, "Copy Value", or hover in editor. The new debug adapter supports [paging of large arrays, bytes, and maps](https://github.com/go-delve/delve/pull/2512#issuecomment-849021775) instead.
* Traditional [remote debugging](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#remote-debugging) is not supported yet (Work-In-Progress).

## Reporting issues

The VS Code Go maintainers are reachable via the issue tracker and the `#vscode-dev` channel in the Gophers Slack. </br>
Please reach out on Slack with questions, suggestions, or ideas. If you have trouble getting started on an issue, we'd be happy to give pointers and advice.

When you are having issues in `dlv-dap` mode, first check if the problems are reproducible after updating `dlv-dap`. It's possible that the issues are already fixed. Follow the instruction for [updating dlv-dap](#updating-dlv-dap)) and [updating extension](https://code.visualstudio.com/docs/editor/extension-gallery#_extension-autoupdate).

Please report issues in [our issue tracker](https://github.com/golang/vscode-go/issues) with the following information.

* `go version`
* `go version -m <path/to/dlv-dap>`
* VS Code and VS Code Go version.
* Instruction to reproduce the issue (code snippets, your `launch.json`, screenshot)

## Configuration
<!-- DO NOT EDIT: Auto-generated by go run tools/generate -->
<!-- SETTINGS BEGIN -->
| Property | Launch | Attach |
| --- | --- | --- |
| `args` | Command line arguments passed to the debugged program.<br/> | <center>_n/a_</center> |
| `backend` | Backend used by delve. Maps to `dlv`'s `--backend` flag.<br/><p>Allowed Values: `"default"`, `"native"`, `"lldb"`<br/> | <center>_same as Launch_</center>|
| `buildFlags` | Build flags, to be passed to the Go compiler. Maps to dlv's `--build-flags` flag.<br/>(Default: `""`)<br/> | <center>_n/a_</center> |
| `cwd` | Workspace relative or absolute path to the working directory of the program being debugged if a non-empty value is specified. The `program` folder is used as the working directory if `cwd` is omitted or empty.<br/>(Default: `""`)<br/> | Workspace relative or absolute path to the working directory of the program being debugged. Default is the current workspace.<br/>(Default: `"${workspaceFolder}"`)<br/> |
| `debugAdapter` | Select which debug adapter to use with this launch configuration.<br/><p>Allowed Values: `"legacy"`, `"dlv-dap"`<br/>(Default: `legacy`)<br/> | <center>_same as Launch_</center>|
| `dlvFlags` | Extra flags for `dlv`. See `dlv help` for the full list of supported. Flags such as `--log-output`, `--log`, `--log-dest`, `--api-version`, `--output`, `--backend` already have corresponding properties in the debug configuration, and flags such as `--listen` and `--headless` are used internally. If they are specified in `dlvFlags`, they may be ignored or cause an error.<br/> | <center>_same as Launch_</center>|
| `env` | Environment variables passed to the program.<br/> | <center>_n/a_</center> |
| `envFile` | Absolute path to a file containing environment variable definitions. Multiple files can be specified by provided an array of absolute paths<br/>(Default: `${workspaceFolder}/.env`)<br/> | <center>_n/a_</center> |
| `host` | The host name of the machine the delve debugger will be listening on. In `dlv-dap` mode, the extension will look for a delve DAP server running on the specified host:port so users are responsible for starting the server.<br/>(Default: `"127.0.0.1"`)<br/> | <center>_same as Launch_</center>|
| `logDest` | dlv's `--log-dest` flag. See `dlv log` for details. Number argument is not allowed. Supported only in `dlv-dap` mode, and on Linux and Mac OS.<br/> | dlv's `--log-dest` flag. See `dlv log` for details. Number argument is not allowed. Supported only in `dlv-dap` mode and on Linux and Mac OS.<br/> |
| `logOutput` | Comma separated list of components that should produce debug output. Maps to dlv's `--log-output` flag. Check `dlv log` for details.<br/><p>Allowed Values: `"debugger"`, `"gdbwire"`, `"lldbout"`, `"debuglineerr"`, `"rpc"`, `"dap"`<br/>(Default: `"debugger"`)<br/> | <center>_same as Launch_</center>|
| `mode` | One of `auto`, `debug`, `test`, `exec`. In `auto` mode, the extension will choose either `debug` or `test` depending on active editor window.<br/><p>Allowed Values: `"auto"`, `"debug"`, `"test"`, `"exec"`<br/>(Default: `auto`)<br/> | Indicates local or remote debugging. Local maps to the `dlv attach` command, remote maps to `connect`. `remote` is not supported in `dlv-dap` mode currently. Use `host` and `port` instead.<br/><p>Allowed Values: `"local"`, `"remote"`<br/>(Default: `local`)<br/> |
| `output` | Output path for the binary of the debugee.<br/>(Default: `"debug"`)<br/> | <center>_n/a_</center> |
| `port` | The port that the delve debugger will be listening on. In `dlv-dap` mode, the extension will look for a delve DAP server running on the specified host:port so users are responsible for starting the server.<br/>(Default: `2345`)<br/> | <center>_same as Launch_</center>|
| `processId` | <center>_n/a_</center> | <br/><p><b>Option 1:</b> Use process picker to select a process to attach, or Process ID as integer.<br/><p>Allowed Values: `"${command:pickProcess}"`, `"${command:pickGoProcess}"`<br/><br/><p><b>Option 2:</b> Attach to a process by name. If more than one process matches the name, use the process picker to select a process.<br/><br/><p><b>Option 3:</b> The numeric ID of the process to be debugged. If 0, use the process picker to select a process.<br/><br/>(Default: `0`)<br/> |
| `program` | Path to the program folder (or any go file within that folder) when in `debug` or `test` mode, and to the pre-built binary file to debug in `exec` mode. If it is not an absolute path, the extension interpretes it as a workspace relative path.<br/>(Default: `"${workspaceFolder}"`)<br/> | <center>_n/a_</center> |
| `remotePath` | <center>_n/a_</center> | (Deprecated) *Use `substitutePath` instead.*<br/>The path to the source code on the remote machine, when the remote path is different from the local machine. If specified, becomes the first entry in substitutePath.<br/>(Default: `""`)<br/> |
| `showGlobalVariables` | Boolean value to indicate whether global package variables should be shown in the variables pane or not.<br/>(Default: `false`)<br/> | <center>_same as Launch_</center>|
| `showLog` | Show log output from the delve debugger. Maps to dlv's `--log` flag.<br/>(Default: `false`)<br/> | <center>_same as Launch_</center>|
| `stackTraceDepth` | Maximum depth of stack trace collected from Delve.<br/>(Default: `50`)<br/> | <center>_same as Launch_</center>|
| `stopOnEntry` | Automatically stop program after launch.<br/>(Default: `false`)<br/> | Automatically stop program after attach.<br/>(Default: `false`)<br/> |
| `substitutePath` | An array of mappings from a local path (editor) to the remote path (debugee). This setting is useful when working in a file system with symbolic links, running remote debugging, or debugging an executable compiled externally. The debug adapter will replace the local path with the remote path in all of the calls.<br/><p><br/><ul><li>`"from"`: The absolute local path to be replaced when passing paths to the debugger.<br/>(Default: `""`)<br/></li><li>`"to"`: The absolute remote path to be replaced when passing paths back to the client.<br/>(Default: `""`)<br/></li></ul><br/> | An array of mappings from a local path (editor) to the remote path (debugee). This setting is useful when working in a file system with symbolic links, running remote debugging, or debugging an executable compiled externally. The debug adapter will replace the local path with the remote path in all of the calls.  Overriden by `remotePath`.<br/><p><br/><ul><li>`"from"`: The absolute local path to be replaced when passing paths to the debugger.<br/>(Default: `""`)<br/></li><li>`"to"`: The absolute remote path to be replaced when passing paths back to the client.<br/>(Default: `""`)<br/></li></ul><br/> |
| `trace` | Various levels of logging shown in the debug console & 'Go Debug' output channel. When using the `legacy` debug adapter, the logs will also be written to a file if it is set to a value other than `error`.<br/><p>Allowed Values: `"verbose"`, `"trace"`, `"log"`, `"info"`, `"warn"`, `"error"`<br/>(Default: `"error"`)<br/> | <center>_same as Launch_</center>|
<!-- SETTINGS END -->
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

Set `logOutput` and `showLog` attributes in `launch.json` to enable `dlv'-side logging and DAP message tracing.
```json5
{
    "name": "Launch file",
    "type": "go",
    "debugAdapter": "dlv-dap",
    "showLog": true,
    "logOutput": "dap",
    ...
}
```

Set `trace` attribute to control the verbosity of debug extension's logging.
The logging will appear in the `Go Debug` output channel (Command Palette -> "View: Toggle Output" -> Select "Go Debug" from the dropdown menu).

```json5
{
    "name": "Launch file",
    "type": "go",
    "debugAdapter": "dlv-dap",
    "trace": "verbose",
    ...
}
```

If you are having issues with seeing logs and or suspect problems in extension's integration, you can start Delve DAP server from a separate terminal and configure the extension to directly connect to it.

```
$ dlv-dap dap --listen=:12345 --log --log-output=dap
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
