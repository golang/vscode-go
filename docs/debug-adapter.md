# Debug Adapter

The [Debug Adapter](../src/debugAdapter) runs in a separate Node.js process, which is spawned by VS Code when you debug Go code.

Please see the [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) to understand how the Debug Adapter acts as an intermediary between VS Code and the debugger ([Delve](https://github.com/go-delve/delve)).

This codebase is currently in flux: We are working on using [`Delve`'s native DAP implementation](https://github.com/go-delve/delve/tree/master/service/dap) instead of this one. Follow along with [golang/vscode-go#23](https://github.com/golang/vscode-go/issues/23) for updates on that work.

## Overview

* [Before you begin](#before-you-begin)
* [Debug only the Debug Adapter](#debug-only-the-debug-adapter)
* [Debug the VS Code extension and the Debug Adapter](#debug-the-entire-extension-including-the-debug-adapter)
* [Debug VS Code and the Debug Adapter](#debug-vs-code-and-the-debug-adapter)

## Before you begin

Before you start working on your change, please read the [contribution guidelines](contributing.md). This document assumes that you are already familiar with the process of [building](contributing.md#setup), [running](contributing.md#run), and [sideloading](contributing.md#sideload) the VS Code Go extension.

## Debug only the Debug Adapter

As a next step, you may want to debug the Debug Adapter, in order to understand how your change work with [Delve](tools.md#delve).

**NOTE: Since the Debug Adapter runs in a separate process from the rest of the extension, the steps below only enable you to debug the Debug Adapter code, not the entire extension. To debug the entire extension, as well as the debug adapter, see the instructions [below](#debug-the-entire-extension).**

1. Open the `vscode-go` folder in VS Code.
2. Go to the Run view and choose the `Launch as server` debug configuration.
3. Add breakpoints as needed to the [`vscode-go/src/debugAdapter/goDebug.ts`](../src/debugAdapter/goDebug.ts) file.
4. Open another instance of VS Code and open the Go project to debug.
5. Create a debug configuration for the Go project if it doesn't exist. Set `"debugServer": 4711` in the root of the configuration.
6. Start debugging your Go program using this configuration. This will trigger the breakpoints in [`goDebug.ts`](../src/debugAdapter/goDebug.ts) file.

## Debug the entire extension, including the Debug Adapter

You can take this step if your change modifies both the Debug Adapter and the main extension.

1. Open the `vscode-go` folder in VS Code.
2. Go to the Run view and choose the `Extension + Debug server` debug configuration. This combines `Launch Extension` and `Launch as server` debug configurations.
3. Add breakpoints as needed and start debugging (`F5`). It will start an Extension Development Host window and the Debug Adapter server process at port 4711. Debuggers are attached to both processes and the breakpoints will apply to both of them.
4. In the Extension Development Host window, open the Go application source code you'd like to debug. Here, as above, create a debug configuration pointing to the program you want to debug. Add `"debugServer": 4711` to the root of the configuration. Then, run the debug configuration (`F5`), which will start debugging of the Go application.
5. Combined debug information (call stacks, breakpoints, etc) of the debugged Extension Development Host and the Debug Adapter will be displayed in the debug view of the original VS Code window. You can use the dropdown menu in the Debug toolbar to switch between the two instances (`Launch Extension` and `Launch as server`).

## Debug VS Code and the Debug Adapter

In some very rare cases, you may find it helpful to debug VS Code itself. An example of such a case might be veryfing workbench behavior and state before executing debug adapter API calls.

First, ensure that you can [build and run VS Code](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#build-and-run) from source successfully.

Next, follow these steps:

1. Open an instance of VS Code that you have built from source.
2. [Sideload](contributing.md#sideload) your local `vscode-go` extension to the local instance of VS Code. This can be done by copying the contents of the `vscode-go` directory into `$HOME/.vscode-oss-dev/extensions/ms-vscode.go` (the exact location may vary by OS).
3. Open the `vscode` folder in Visual Studio Code.
4. Launch the VS Code debug instance (OSS - Code) by choosing the `Launch VS Code` debug configuraion from the drop-down in the Run view. Add breakpoints as needed.
5. In another instance of VS Code, open the `vscode-go` folder. Choose the `Launch as server` debug configuration in the Run view. Add breakpoints as desired in the [`vscode-go/src/debugAdapter/goDebug.ts`](../src/debugAdapter/goDebug.ts) file.
6. Open the Go application that you want to debug in the OSS Code instance initiated in step 4.
7. Create a debug configuration with the setting `"debugServer": 4711`.
8. Start debugging your Go application. Observe that any breakpoints you set in the VS Code and debug adapter codebases will be triggered.
