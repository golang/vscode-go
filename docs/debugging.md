# Debugging

The Go debugger is [Delve]. The [Delve] repository has detailed instructions, so we recommend taking a look at the [Delve documentation](https://github.com/go-delve/delve/tree/master/Documentation).

## Overview

* [Features](#features)
* [Set up](#set-up)
  * [Installation](#installation)
  * [Configuration](#configuration)
* [Launch Configurations](#launch-configurations)
  * [Specifying build tags](#specifying-build-tags)
  * [Using VS Code Variables](#using-vs-code-variables)
  * [Snippets](#snippets)
* [Debugging on Windows Subsystem for Linux (WSL)](#debugging-on-windows-subsystem-for-linux-wsl)
* [Remote Debugging](#remote-debugging)
* [Troubleshooting](#troubleshooting)
  * [Common issues](#common-issues)

## Set up

[Delve] should be installed by default when you install this extension.

### Installation

You can also install it manually in one of two ways:

1. Open the Command Palette (Ctrl+Shift+P), select `Go: Install/Update Tools`, and select `dlv`.
2. Follow the [Delve installation instructions](https://github.com/go-delve/delve/tree/master/Documentation/installation).

### Configuration

You may not need to configure any settings to start debugging your programs, but you should be aware that the debugger looks at the following settings.

* Related to [`GOPATH`](gopath.md):
  * [`go.gopath`](settings.md#gopath)
  * [`go.inferGopath`](settings.md#inferGopath)
* `go.delveConfig`
  * `apiVersion`: Controls the version of the Delve API used when launching the Delve headless server (default: `2`).
  * `dlvLoadConfig`: The configuration passed to Delve, which controls how variables are shown in the Debug pane. Not applicable when `apiVersion` is 1.
    * `maxStringLen`: Maximum number of bytes read from a string (default: `64`).
    * `maxArrayValues`: Maximum number of elements read from an array, slice, or map (default: `64`).
    * `maxStructFields`: Maximum number of fields read from a struct. A setting of `-1` indicates that all fields should be read (default: `-1`).
    * `maxVariableRecurse`: How far to recurse when evaluating nested types (default: `1`).
    * `followPointers`: Automatically dereference pointers (default: `true`).
  * `showGlobalVariables`: Show global variables in the Debug view (default: `true`).

There are some common cases when you might want to tweak the Delve configurations.

* To change the default cap of 64 on string and array length when inspecting variables in the Debug view, set `maxStringLen`. (See a related known issue: [golang/vscode-go#126](https://github.com/golang/vscode-go/issues/126)).
* To evaluate nested variables in the Debug viewlet, set `maxVariableRecurse`.

## Launch Configurations

To get started debugging, run the command `Debug: Open launch.json`. If you did not already have a `launch.json` file for your project, this will create one for you. It will contain this default configuration, which can be used to debug the current package.

```json5
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch",
            "type": "go",
            "request": "launch",
            "mode": "auto",
            "program": "${fileDirname}",
            "env": {},
            "args": []
        }
    ]
}
```

There are some more properties that you can adjust in the debug configuration. See the table below:

Property   | Description
--------   | -----------
name       | The name for your configuration as it appears in the drop-down in the Debug view.
type       | Always leave this set to `"go"`. VS Code uses this setting to determine which extension should be used for debugging your code.
request    | One of `launch` or `attach`. Use `attach` when you want to attach to an already running process.
mode       | For `launch` requests, one of `auto`, `debug`, `remote`, `test`, or `exec`. For `attach` requests, use `local` or `remote`.
program    | In `test` or `debug` mode, this refers to the absolute path to the package or file to debug. In `exec` mode, this is the already built binary file to debug. Not applicable to `attach` requests.
env        | Environment variables to use when debugging. Use the format: `{ "ENVNAME": "ENVVALUE" }`.
envFile    | Absolute path to a file containing environment variable definitions. The environment variables passed in via the `env` property override the ones in this file.
args       | Array of command-line arguments that will be passed in to the program being debugged.
showLog    | If `true`, Delve logs will be printed in the Debug Console panel.
logOutput  | Comma-separated list of Delve components (`debugger`, `gdbwire`, `lldbout`, `debuglineerr`, `rpc`) that should produce debug output when `showLog` is `true`.
buildFlags | Build flags to be passed to the Go compiler.
remotePath | If remote debugging (`mode`: `remote`), this should be the absolute path to the file being debugged on the remote machine. See the section on [Remote Debugging](#remote-debugging) for further details. [golang/vscode-go#45](https://github.com/golang/vscode-go/issues/45) is also relevant.
processId  | This is the process ID of the executable you want to debug.Applicable only when using the `attach` request in `local` mode.

### Specifying [build tags](https://golang.org/pkg/go/build/#hdr-Build_Constraints)

If your program contains [build tags](https://golang.org/pkg/go/build/#hdr-Build_Constraints), you can use the `buildFlags` property. For example, if you build your code with:

```bash
go build -tags=whatever
```

Then, set:

```json5
"buildFlags": "-tags=whatever"
```

in your launch configuration. This property supports multiple tags, which you can set by using single quotes. For example:

```json5
"buildFlags": "-tags='first,second,third'"
```

<!--TODO(rstambler): Confirm that the extension works with a comma (not space) separated list.-->

### Using [VS Code variables]

Any property in the launch configuration that requires a file path can be specified in terms of [VS Code variables]. Here are some useful ones to know:

* `${workspaceFolder}` refers to the root of the workspace opened in VS Code.
* `${file}` refers to the currently opened file.
* `${fileDirname}` refers to the directory containing the currently opened file. This is typically also the name of the Go package containing this file, and as such, can be used to debug the currently opened package.

### Snippets

In addition to [VS Code variables], you can make use of [snippets] when editing the launch configuration in `launch.json`.

When you type `go` in the `launch.json` file, you will see snippet suggestions for debugging a given test function or the current file or package.

Below are the available sample configurations:

#### Debug the current file (`Go: Launch file`)

Recall that `${file}` refers to the currently opened file (see [Using VS Code Variables](#using-vs-code-variables)).

```json5
{
    "name": "Launch file",
    "type": "go",
    "request": "launch",
    "mode": "auto",
    "program": "${file}"
}
```

#### Debug a single test function (`Go: Launch test function`)

Recall that `${workspaceFolder}` refers to the current workspace (see [Using VS Code Variables](#using-vs-code-variables)). You will need to manually specify the function name instead of `"MyTestFunction"`.

```json5
{
    "name": "Launch test function",
    "type": "go",
    "request": "launch",
    "mode": "test",
    "program": "${workspaceFolder}",
    "args": [
        "-test.run",
        "MyTestFunction"
    ]
}
```

#### Debug all tests in the given package (`Go: Launch test package`)

Recall that `${workspaceFolder}` refers to the current workspace (see [Using VS Code Variables](#using-vs-code-variables)).

```json5
{
    "name": "Launch test package",
    "type": "go",
    "request": "launch",
    "mode": "test",
    "program": "${workspaceFolder}"
}
```

#### Attach to a running local process via its process ID (`Go: Attach to local process`)

Substitute the `0` below for the process ID (pid) of the process.

```json5
{
    "name": "Attach to local process",
    "type": "go",
    "request": "attach",
    "mode": "local",
    "processId": 0
}
```

#### Attach to a running server (`Go: Connect to Server`)

```json5
{
    "name": "Connect to server",
    "type": "go",
    "request": "attach",
    "mode": "remote",
    "remotePath": "${workspaceFolder}",
    "port": 2345,
    "host": "127.0.0.1"
}
```

#### Debug an existing binary

There is no snippet suggestion for this configuration.

```json
{
    "name": "Launch executable",
    "type": "go",
    "request": "launch",
    "mode": "exec",
    "program": "/absolute/path/to/executable"
}
```

## Debugging on [Windows Subsystem for Linux (WSL)](https://docs.microsoft.com/en-us/windows/wsl/)

If you are using using WSL, you will need the WSL 2 Linux kernel.  See [WSL 2 Installation](https://docs.microsoft.com/en-us/windows/wsl/wsl2-install) and note the Window 10 build version requirements.

## Remote Debugging

<!--TODO(quoctruong): We use "remote" and "target", as well as "local" here. We should define these terms more clearly and be consistent about which we use.-->

To debug on a remote machine, you must first run a headless Delve server on the target machine. The examples below assume that you are in the same folder as the package you want to debug. If not, please refer to the [`dlv debug` documentation](https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_debug.md).

To start the headless Delve server:

```bash
dlv debug --headless --listen=:2345 --log --api-version=2
```

Any arguments that you want to pass to the program you are debugging must also be passed to this Delve server. For example:

```bash
dlv debug --headless --listen=:2345 --log -- -myArg=123
```

Then, create a remote debug configuration in your `launch.json`.

```json5
{
    "name": "Launch remote",
    "type": "go",
    "request": "launch",
    "mode": "remote",
    "remotePath": "/absolute/path/file/on/remote/machine",
    "port": 2345,
    "host": "127.0.0.1",
    "program": "/absolute/path/file/on/local/machine",
    "env": {}
}
```

In the example, the VS Code debugger will run on the same machine as the headless `dlv` server. Make sure to update the `port` and `host` settings to point to your remote machine.

`remotePath` should point to the absolute path of the file being debugged in the remote machine. See [golang/vscode-go#126](https://github.com/golang/vscode-go/issues/126) for updates regarding `remotePath`.

`program` should point to the absolute path of the file on your local machine. This should be the counterpart of the file in `remotePath`.

When you run the `Launch remote` target, VS Code will send debugging commands to the `dlv` server you started, instead of launching it's own `dlv` instance against your app.

For further examples, see [this launch configuration for a process running in a Docker host](https://github.com/lukehoban/webapp-go/tree/debugging).

## Troubleshooting

Debugging is one of the most complex features offered by this extension. The features are not complete, and a new implementation is currently being developed (see [golang/vscode-go#23](https://github.com/golang/vscode-go/issues/23)).

The suggestions below are intended to help you troubleshoot any problems you encounter. If you are unable to resolve the issue, please take a look at the [current known debugging issues](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3Adebug) or [file a new issue](https://github.com/golang/vscode-go/issues/new/choose).

### Update Delve

A good first step is to make sure that you are working with the latest version of Delve. You can do this by running the `Go: Install/Update Tools` command and selecting `dlv`.

### Read the Delve documentation

Take a quick glance at the [Delve FAQ](https://github.com/go-delve/delve/blob/master/Documentation/faq.md) in case the problem is mentioned there.

### Enable logging

Next, check the logs produced by Delve. These will need to be manually enabled. Follow these steps:

* Set `"showLog": true` in your launch configuration. This will show Delve logs in the Debug Console pane (Ctrl+Shift+Y).
* Set `"trace": "log"` in your launch configuration. Again, you will see logs in the Debug Console pane (Ctrl+Shift+Y). These logs will also be saved to a file and the path to this file will be printed at the top of the Debug Console.
* Set `"logOutput": "rpc"` in your launch configuration. You will see logs of the RPC messages going between VS Code and Delve. Note that for this to work, you must also have set `"showLog": true`.
  * The `logOutput` attribute corresponds to the `--log-output` flag used by Delve. It is a comma-separated list of components that should produce debug output.

See [common issues](#common-issues) below to decipher error messages you may find in your logs.

With `"trace": "log"`, you will see the actual call being made to `dlv`. To aid in your investigation, you can copy that and run it in your terminal.

### **Optional**: Debug the debugger

This is not a required step, but if you want to continue digging deeper, you can, in fact, debug the debugger. The code for the debugger can be found in the [debug adapter module](../src/debugAdapter). See our [Contribution Guide](contributing.md) to learn how to [run](contributing.md#run) and [sideload](contributing.md#sideload) the Go extension.

### Ask for help

At this point, it's time to look at the [common issues](#common-issues) below or the [existing debugging issues](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3Adebug) on the [issue tracker](https://github.com/golang/vscode-go/issues). If that still doesn't solve your problem, [file a new issue](https://github.com/golang/vscode-go/issues/new/choose) or ask a question on the `#vscode` channel of the [Gophers Slack](https://gophers.slack.com).

### Common issues

#### Unverified breakpoint or variables

Ensure that the binary being debugged was built **without optimizations**. Build the binary with the flags `-gcflags="all=-N -l"`.

#### Cannot find package ".." in any of ...

The debugger is not using the right [`GOPATH`](gopath.md). [File an issue report](https://github.com/golang/vscode-go/issues/new/choose).

**As a work-around**, add the correct `GOPATH` as an environment variable in the `env` property in the `launch.json` file.

#### Failed to continue: "Error: spawn EACCES"

You have `dlv` running just fine from command line, but VS Code gives this access-related error.

This can happen if you have multiple versions of `dlv` installed; the extension may have found an old or incorrect version. The extension first searches for binaries in your `$GOPATH/bin` and then looks on your `$PATH`.

**_Solution_**: Run `which dlv` in the command-line. If this does not resolve to the version of `dlv` in your `$GOPATH/bin`, simply delete the version of `dlv` in your `$GOPATH/bin`. (You can also copy this version of `dlv` to your `$GOPATH/bin`.)

#### could not launch process: stat ***/debug.test: no such file or directory

You may see this in the debug console while trying to run in the `test` mode. This happens when the `program` attribute points to a folder with no test files.

**_Solution_**: Ensure that the `program` attribute points to the folder that contains the test files you want to run.

#### delve/launch hangs with no messages on WSL

Try running ```delve debug ./main``` in the WSL command line and see if you get a prompt.

**_Solution_**: Ensure you are running the WSL 2 Kernel, which (as of 4/15/2020) requires an early release of the Windows 10 OS. This is available to anyone via the Windows Insider program. See [WSL 2 Installation](https://docs.microsoft.com/en-us/windows/wsl/wsl2-install)

#### could not launch process: could not fork/exec

The solution this issue differs based on your OS.

##### OSX

This usually happens on OSX due to signing issues. See the discussions in [Microsoft/vscode-go#717](https://github.com/Microsoft/vscode-go/issues/717), [Microsoft/vscode-go#269](https://github.com/Microsoft/vscode-go/issues/269) and [derekparker/delve#357](https://github.com/derekparker/delve/issues/357).

**_Solution_**: You may have to uninstall dlv and install it manually as described in the [Delve instructions](https://github.com/derekparker/delve/blob/master/Documentation/installation/osx/install.md#manual-install).

##### Linux/Docker

Docker has security settings preventing `ptrace(2)` operations by default within the container.

**_Solution_**: To run your container insecurely, pass `--security-opt=seccomp:unconfined` to `docker run`. See [derekparker/delve#515](https://github.com/derekparker/delve/issues/515) for references.

#### could not launch process: exec: "lldb-server": executable file not found in $PATH

This error can show up for Mac users using Delve versions 0.12.2 and above. `xcode-select --install` has solved the problem for a number of users.

#### Unverified breakpoints when remote debugging

Check the version of the Delve API used in the remote Delve process by checking the value of the `–api-version` flag. This needs to match the version used by the Go extension (`2`, by default). You can change the API version by editing the configuration in the `launch.json file.

[Delve]: https://github.com/go-delve/delve
[VS Code variables]: https://code.visualstudio.com/docs/editor/variables-reference
[snippets]: https://code.visualstudio.com/docs/editor/userdefinedsnippets