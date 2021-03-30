# Dlv DAP - Delve's native DAP implementationa

[`Delve`'s native DAP implementation](https://github.com/go-delve/delve/tree/master/service/dap) is now available to be used to debug Go programs.

This debug adapter runs in a separate `go` process, which is spawned by VS Code when you debug Go code. Since `dlv dap` is under active development, we recommend that `dlv` be installed at master to get all recent updates.

```
$ GO111MODULES=on go get github.com/go-delve/delve@master
```

Please see the [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) to understand how the Debug Adapter acts as an intermediary between VS Code and the debugger ([Delve](https://github.com/go-delve/delve)).

Follow along with [golang/vscode-go#23](https://github.com/golang/vscode-go/issues/23) and the [project dashboard](https://github.com/golang/vscode-go/projects/3) for updates on the implementation.

## Overview

* [How to use dlv dap](#how-to-use-dlv-dap)

## How to use dlv dap

You can choose which debug adapter to use with the `"debugAdapter"` field in your launch configuration. If you do not already have a `launch.json`, select `create a launch.json file` from the debug pane and choose an initial Go debug configuration.

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