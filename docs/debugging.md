# Debugging

This document explains how to debug your Go programs in VS Code. The Go debugger is [Delve]. You can read more about it in the [Delve documentation](https://github.com/go-delve/delve/tree/master/Documentation).

## Overview

* [Set up](#set-up)
  * [Installation](#installation)
  * [Configuration](#configuration)
* [Launch Configurations](#launch-configurations)
  * [Specifying build tags](#specifying-build-tags)
  * [Specifying other build flags](#specifying-other-build-flags)
  * [Using VS Code Variables](#using-vs-code-variables)
  * [Snippets](#snippets)
* [Debugging on Windows Subsystem for Linux (WSL)](#debugging-on-windows-subsystem-for-linux-wsl)
* [Remote Debugging](#remote-debugging)
* [Troubleshooting](#troubleshooting)
  * [Read documentation and common issues](#read-documentation-and-common-issues)
  * [Update Delve](#update-delve)
  * [Check for multiple versions of Delve](#check-for-multiple-versions-of-delve)
  * [Check your launch configuration](#check-your-launch-configuration)
  * [Check your GOPATH](#check-your-gopath)
  * [Enable logging](#enable-logging)
  * [Optional: Debug the debugger](#optional-debug-the-debugger)
  * [Ask for help](#ask-for-help)
* [Common issues](#common-issues)

## Set up

[Delve] should be installed by default when you install this extension.

You may need to update `dlv` to the latest version to support the latest version
of Go&mdash;see [Installation](#installation) below.

### Installation

You can also install Delve manually in one of two ways:

1. Open the [Command Palette][] (Windows/Linux: Ctrl+Shift+P; OSX: Shift+Command+P), select [`Go: Install/Update Tools`](settings.md#go-installupdate-tools), and select [`dlv`](tools.md#dlv).
2. Follow the [Delve installation instructions](https://github.com/go-delve/delve/tree/master/Documentation/installation).

### Start debugging

1. Open the `package main` source file or the test file you want to debug.
2. Start debugging using one of the following options:
   * Open the [Command Palette][], select
     `Debug: Start Debugging`, then select `Go`.
   * Open the debug window (Windows/Linux: Ctrl+Shift+D; OSX: Shift+Command+D) and click
     `Run and Debug`, then select `Go`.
   * Select **Run > Start Debugging** from the main menu.

   See [the VS Code Debugging documentation](https://code.visualstudio.com/docs/editor/debugging)
   for more information.

### Configuration

You may not need to configure any settings to start debugging your programs, but you should be aware that the debugger looks at the following settings.

* Related to [`GOPATH`](gopath.md):
  * [`go.gopath`](settings.md#go.gopath)
  * [`go.inferGopath`](settings.md#go.inferGopath)
* [`go.delveConfig`](settings.md#go.delveConfig)
  * `apiVersion`: Controls the version of the Delve API used (default: `2`).
  * `dlvLoadConfig`: The configuration passed to Delve, which controls how variables are shown in the Debug pane. Not applicable when `apiVersion` is 1.
    * `maxStringLen`: Maximum number of bytes read from a string (default: `64`).
    * `maxArrayValues`: Maximum number of elements read from an array, slice, or map (default: `64`).
    * `maxStructFields`: Maximum number of fields read from a struct. A setting of `-1` indicates that all fields should be read (default: `-1`).
    * `maxVariableRecurse`: How far to recurse when evaluating nested types (default: `1`).
    * `followPointers`: Automatically dereference pointers (default: `true`).
  * `showGlobalVariables`: Show global variables in the Debug view (default: `false`).

There are some common cases when you might want to tweak the Delve configurations.

* To change the default cap of 64 on string and array length when inspecting variables in the Debug view, set `maxStringLen`. (See a related known issue: [golang/vscode-go#126](https://github.com/golang/vscode-go/issues/126)).
* To evaluate nested variables in the Run view, set `maxVariableRecurse`.

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

There are some more properties that you can adjust in the debug configuration:

Property   | Description
--------   | -----------
name       | The name for your configuration as it appears in the drop-down in the Run view.
type       | Always leave this set to `"go"`. VS Code uses this setting to determine which extension should be used for debugging.
request    | One of `launch` or `attach`. Use `attach` when you want to attach to a running process.
mode       | For `launch` requests, one of `auto`, `debug`, `remote`, `test`, or `exec`. For `attach` requests, use `local` or `remote`.
program    | In `test` or `debug` mode, this refers to the absolute path to the package or file to debug. In `exec` mode, this is the existing binary file to debug. Not applicable to `attach` requests.
env        | Environment variables to use when debugging. Use the format: `{ "NAME": "VALUE" }`. Not applicable to `attach` requests.
envFile    | Absolute path to a file containing environment variable definitions. The environment variables passed in via the `env` property override the ones in this file.
args       | Array of command-line arguments to pass to the program being debugged.
showLog    | If `true`, Delve logs will be printed in the Debug Console panel.
logOutput  | Comma-separated list of Delve components (`debugger`, `gdbwire`, `lldbout`, `debuglineerr`, `rpc`) that should produce debug output when `showLog` is `true`.
buildFlags | Build flags to pass to the Go compiler.
remotePath | If remote debugging (`mode`: `remote`), this should be the absolute path to the package being debugged on the remote machine. See the section on [Remote Debugging](#remote-debugging) for further details. [golang/vscode-go#45](https://github.com/golang/vscode-go/issues/45) is also relevant.
cwd | The working directory to be used in running the program. If remote debugging (`mode`: `remote`), this should be the absolute path to the working directory being debugged on the local machine. See the section on [Remote Debugging](#remote-debugging) for further details. [golang/vscode-go#45](https://github.com/golang/vscode-go/issues/45) is also relevant.
processId  | This is the process ID of the executable you want to debug. Applicable only when using the `attach` request in `local` mode.

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

### Specifying other build flags

The flags specified in `buildFlags` and `env.GOFLAGS` are passed to the Go compiler when building your program for debugging. Delve adds `--gcflags='all=-N -l'` to the list of build flags to disable optimizations. User specified buildFlags conflict with this setting, so the extension removes them ([Issue #117](https://github.com/golang/vscode-go/issues/117)). If you wish to debug a program using custom `--gcflags`, build the program using `go build` and launch using `exec` mode:

```json
{
    "name": "Launch executable",
    "type": "go",
    "request": "launch",
    "mode": "exec",
    "program": "/absolute/path/to/executable"
}
```

Note that it is not recommended to debug optimized executables as Delve may not have the information necessary to properly debug your program.

### Using [VS Code variables]

Any property in the launch configuration that requires a file path can be specified in terms of [VS Code variables]. Here are some useful ones to know:

* `${workspaceFolder}` refers to the root of the workspace opened in VS Code.
* `${file}` refers to the currently opened file.
* `${fileDirname}` refers to the directory containing the currently opened file. This is typically also the name of the Go package containing this file, and as such, can be used to debug the currently opened package.

### Snippets

In addition to [VS Code variables], you can make use of [snippets] when editing the launch configuration in `launch.json`.

When you type `go` in the `launch.json` file, you will see snippet suggestions for debugging the current file or package or a given test function.

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

If passing arguments to or calling subcommands and flags from a binary, the `args` property can be used.

```json
{
    "name": "Launch executable",
    "type": "go",
    "request": "launch",
    "mode": "exec",
    "program": "/absolute/path/to/executable",
    "args": ["subcommand", "arg", "--flag"],
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
    "request": "attach",
    "mode": "remote",
    "remotePath": "/absolute/path/dir/on/remote/machine",
    "port": 2345,
    "host": "127.0.0.1",
    "cwd": "/absolute/path/dir/on/local/machine",
}
```

In the example, the VS Code debugger will run on the same machine as the headless `dlv` server. Make sure to update the `port` and `host` settings to point to your remote machine.

`remotePath` should point to the absolute path of the program being debugged in the remote machine. `cwd` should point to the absolute path of the working directory of the program being debugged on your local machine. This should be the counterpart of the folder in `remotePath`. See [golang/vscode-go#45](https://github.com/golang/vscode-go/issues/45) for updates regarding `remotePath` and `cwd`.

When you run the `Launch remote` target, VS Code will send debugging commands to the `dlv` server you started, instead of launching it's own `dlv` instance against your program.

For further examples, see [this launch configuration for a process running in a Docker host](https://github.com/lukehoban/webapp-go/tree/debugging).

## Troubleshooting

Debugging is one of the most complex features offered by this extension. The features are not complete, and a new implementation is currently being developed (see [golang/vscode-go#23](https://github.com/golang/vscode-go/issues/23)).

The suggestions below are intended to help you troubleshoot any problems you encounter. If you are unable to resolve the issue, please take a look at the [current known debugging issues](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3Adebug) or [file a new issue](https://github.com/golang/vscode-go/issues/new/choose).

### Read documentation and [common issues](#common-issues)

Start by taking a quick glance at the [common issues](#common-issues) described below. You can also check the [Delve FAQ](https://github.com/go-delve/delve/blob/master/Documentation/faq.md) in case the problem is mentioned there.

### Update Delve

If the problem persists, it's time to start troubleshooting. A good first step is to make sure that you are working with the latest version of Delve. You can do this by running the [`Go: Install/Update Tools`](settings.md#go-installupdate-tools) command and selecting [`dlv`](tools.md#dlv).

### Check your [launch configuration](#launch-configurations)

Next, confirm that your [launch configuration](#launch-configurations) is correct.

One common error is `could not launch process: stat ***/debug.test: no such file or directory`. You may see this while running in the `test` mode. This happens when the `program` attribute points to a folder with no test files, so ensure that the `program` attribute points to a directory containing the test files you wish to debug.

Also, check the version of the Delve API used in your [launch configuration](#launch-configurations). This is handled by the `–api-version` flag, `2` is the default. If you are debugging on a remote machine, this is particularly important, as the versions on the local and remote machines much match. You can change the API version by editing the [`launch.json` file](#launch-configurations).

### Check for multiple versions of Delve

You might have multiple different versions of [`dlv`](tools.md#dlv) installed, and VS Code Go could be using a wrong or old version. Run the [`Go: Locate Configured Go Tools`](settings.md#go-locate-configured-go-tools) command and see where VS Code Go has found `dlv` on your machine. You can try running `which dlv` to see which version of `dlv` you are using on the [command-line](https://github.com/go-delve/delve/tree/master/Documentation/cli).

To fix the issue, simply delete the version of `dlv` used by the Go extension. Note that the extension first searches for binaries in your `$GOPATH/bin` and then looks on your `$PATH`.

If you see the error message `Failed to continue: "Error: spawn EACCES"`, the issue is probably multiple versions of `dlv`.

### Try building your binary **without** compiler optimizations

If you notice `Unverified breakpoints` or missing variables, ensure that your binary was built **without** compiler optimizations. Try building the binary with `-gcflags="all=-N -l"`.

### Check your `GOPATH`

Make sure that the debugger is using the right [`GOPATH`](gopath.md). This is probably the issue if you see `Cannot find package ".." in any of ...` errors. Read more about configuring your [GOPATH](gopath.md) or [file an issue report](https://github.com/golang/vscode-go/issues/new/choose).

**As a work-around**, add the correct `GOPATH` as an environment variable in the `env` property in the `launch.json` file.

### Enable logging

Next, check the logs produced by Delve. These will need to be manually enabled. Follow these steps:

* Set `"showLog": true` in your launch configuration. This will show Delve logs in the Debug Console pane (Ctrl+Shift+Y).
* Set `"trace": "log"` in your launch configuration. Again, you will see logs in the Debug Console pane (Ctrl+Shift+Y). These logs will also be saved to a file and the path to this file will be printed at the top of the Debug Console.
* Set `"logOutput": "rpc"` in your launch configuration. You will see logs of the RPC messages going between VS Code and Delve. Note that for this to work, you must also have set `"showLog": true`.
  * The `logOutput` attribute corresponds to the `--log-output` flag used by Delve. It is a comma-separated list of components that should produce debug output.

See [common issues](#common-issues) below to decipher error messages you may find in your logs.

With `"trace": "log"`, you will see the actual call being made to `dlv`. To aid in your investigation, you can copy that and run it in your terminal.

### **Optional**: Debug the debugger

This is not a required step, but if you want to continue digging deeper, you can, in fact, debug the debugger. The code for the debugger can be found in the [debug adapter module](../src/debugAdapter). See our [contribution guide](contributing.md) to learn how to [run](contributing.md#run) and [sideload](contributing.md#sideload) the Go extension.

### Ask for help

At this point, it's time to look at the [common issues](#common-issues) below or the [existing debugging issues](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3Adebug) on the [issue tracker](https://github.com/golang/vscode-go/issues). If that still doesn't solve your problem, [file a new issue](https://github.com/golang/vscode-go/issues/new/choose) or ask a question on the `#vscode` channel of the [Gophers Slack](https://gophers.slack.com).

## Common Issues

### delve/launch hangs with no messages on WSL

Try running ```delve debug ./main``` in the WSL command line and see if you get a prompt.

**_Solution_**: Ensure you are running the WSL 2 Kernel, which (as of 4/15/2020) requires an early release of the Windows 10 OS. This is available to anyone via the Windows Insider program. See [Debugging on WSL](#debugging-on-windows-subsystem-for-linux-wsl).

### could not launch process: could not fork/exec

The solution this issue differs based on your OS.

#### OSX

This usually happens on OSX due to signing issues. See the discussions in [Microsoft/vscode-go#717](https://github.com/Microsoft/vscode-go/issues/717), [Microsoft/vscode-go#269](https://github.com/Microsoft/vscode-go/issues/269) and [go-delve/delve#357](https://github.com/go-delve/delve/issues/357).

**_Solution_**: You may have to uninstall dlv and install it manually as described in the [Delve instructions](https://github.com/go-delve/delve/blob/master/Documentation/installation/osx/install.md#manual-install).

#### Linux/Docker

Docker has security settings preventing `ptrace(2)` operations by default within the container.

**_Solution_**: To run your container insecurely, pass `--security-opt=seccomp:unconfined` to `docker run`. See [go-delve/delve#515](https://github.com/go-delve/delve/issues/515) for references.

#### could not launch process: exec: "lldb-server": executable file not found in $PATH

This error can show up for Mac users using Delve versions 0.12.2 and above. `xcode-select --install` has solved the problem for a number of users.

### Debugging symlink directories

This extension does not provide support for debugging projects containing symlinks. Make sure that you are setting breakpoints in the files that Go will use to compile your program.

For updates to symlink support reference [golang/vscode-go#622](https://github.com/golang/vscode-go/issues/622).

[Delve]: https://github.com/go-delve/delve
[VS Code variables]: https://code.visualstudio.com/docs/editor/variables-reference
[snippets]: https://code.visualstudio.com/docs/editor/userdefinedsnippets
[Command Palette]: https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette