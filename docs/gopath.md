# `GOPATH`

The `GOPATH` environment variable is a fundamental part of writing Go code **without** [Go modules]. It specifies the location of your workspace, and it defaults to `$HOME/go`. A `GOPATH` directory contains `src`, `bin`, and `pkg` directories. Your code is typically located in the `$GOPATH/src` directory.

If you are not familiar with Go and `GOPATH`, please first read about [writing Go code with `GOPATH`](https://golang.org/doc/gopath_code.html#GOPATH).

## Overview

* [Check the value of `GOPATH`](#check-the-value-of-gopath)
* [Setting `GOPATH`](#setting-gopath)
* [Different `GOPATH`s for different projects](#different-gopaths-for-different-projects)
* [Automatically inferring your `GOPATH`](#automatically-inferring-your-gopath)
* [Install tools to a separate `GOBIN`](#install-tools-to-a-separate-gobin)
* [Install tools to a separate `GOPATH`](#install-tools-to-a-separate-gopath)

## Check the value of `GOPATH`

First, it's useful to quickly check that you are using the right `GOPATH`. Two commands report the `GOPATH` value used by the VS Code Go extension: (1) [`Go: Current GOPATH`](commands.md#go-current-gopath), or (2) [`Go: Locate Configured Go Tools`](commands.md#go-locate-configured-go-tools). Use either of these commands to check which `GOPATH` the extension is using.

If the `GOPATH` value is incorrect, see the details below on how to configure it.

## Setting `GOPATH`

If you have chosen not to use [Go modules], you will need to configure your `GOPATH`. Modules have largely eliminated the need for a `GOPATH`, so if you're interested in using them, taking a look at the [modules documentation](modules.md) for the VS Code Go extension.

Setting `GOPATH` is typically as simple as setting the environment variable once in your system's configuration. Take a look at the [Setting `GOPATH` Wiki](https://github.com/golang/go/wiki/SettingGOPATH) if you're unsure how to do this.

By default, the extension uses the value of the environment variable `GOPATH`. If no such environment variable is set, the extension runs `go env` and uses the `GOPATH` reported by the `go` command.

Note that, much like a `PATH` variable, `GOPATH` can contain multiple directory paths, separated by `:` or `;`. This allows you to set different `GOPATH`s for different projects.

Still, there are a number of cases in which you might want a more complicated `GOPATH` set-up. Below, we explain more complex ways to configure and manage your `GOPATH` within the VS Code Go extension.

## Different `GOPATH`s for different projects

Setting [`go.gopath`](settings.md#go.gopath) in your [user settings](https://vscode.readthedocs.io/en/latest/getstarted/settings/) overrides the environment's `GOPATH` value.

[Workspace settings](https://vscode.readthedocs.io/en/latest/getstarted/settings/) override user settings, so you can use the [`go.gopath`](settings.md#go.gopath) setting to set different `GOPATH`s for different projects. A `GOPATH` can also contain multiple directories, so this setting is not necessary to achieve this behavior.

## Automatically inferring your `GOPATH`

**NOTE: This feature only works in `GOPATH` mode, not in module mode.**

The [`go.inferGopath`](settings.md#go.inferGopath) setting overrides the [`go.gopath`](settings.md#go.gopath) setting. If you set [`go.inferGopath`](settings.md#go.inferGopath) to `true`, the extension will try to infer your `GOPATH` based on the workspace opened in VS Code. This is done by searching for a `src` directory in your workspace. The parent of this `src` directory is then added to your [global `GOPATH`](#setting-gopath) (`go env GOPATH`).

For example, say your global `GOPATH` is `$HOME/go`, but you are working in a repository with the following structure.

```bash
foo/
└── bar
    └── src
        └── main.go
```

If you open the `foo` directory as your workspace root in VS Code, [`"go.inferGopath"`](settings.md#go.inferGopath) will set your `GOPATH` to `$HOME/go:/path/to/foo/bar`.

This setting is useful because it allows you to avoid setting the `GOPATH` in the workspace settings of each of your projects.

## Install tools to a separate `GOBIN`

If you switch frequently between `GOPATH`s, you may find that the extension prompts you to install tools for every `GOPATH`. You can resolve this by making sure your tool installations are on your `PATH`, or you can configure a separate directory for tool installation: `GOBIN`. This environment variable tells the `go` command where to install all binaries. Configure it by setting:

```json5
"go.toolsEnvVars": {
    "GOBIN": "path/to/gobin"
}
```

## Install tools to a separate `GOPATH`

**NOTE: The following is only relevant if you are using a Go version that does not support [Go modules], that is, any version of Go before 1.11.**

Before Go 1.11, the `go get` command installed tools and their source code to your `GOPATH`. Because this extension uses a lot of different tools, this causes clutter in your `GOPATH`. If you wish to reduce this clutter, you can have the extension install tools to a different location. This also addresses the issue described above, when switching `GOPATHs` forces you to reinstall Go tools.

This can be done by setting [`"go.toolsGopath"`](settings.md#go.toolsGopath) to an alternate path, only for tool installations. After you configure this setting, be sure to run the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command so that the Go tools get installed to the provided location.

The extension will fall back to your existing `GOPATH` if tools are not found in the [`go.toolsGopath`](settings.md#go.toolsGopath) directory.

[Go modules]: https://blog.golang.org/using-go-modules
