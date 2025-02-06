# Tools

This document describes the tools that power the VS Code Go extension.

Tools will be installed by default when you install the extension. You can also manually install or update all of these tools by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command. The extension uses pinned versions of command-line tools. See the pinned versions in tools information [here](https://github.com/golang/vscode-go/blob/master/extension/src/goToolsInformation.ts). If any tools are missing, you will see an `Analysis Tools Missing` warning in the bottom-right corner of the editor, which will prompt you to install these tools.

VS Code Go will install the tools to your `$GOPATH/bin` by default. 

### [`go`]
This extension requires you to install the Go toolchain, meaning that you have the `go` command on your [`PATH`](https://en.wikipedia.org/wiki/PATH_(variable)). To do this, follow [the Go installation guide](https://golang.org/doc/install).

The extension runs the [`go`] command to debug and test your go program. By default, this extension assumes that Go is already installed in your system and the `go` command can be found from the `PATH` (or `Path` in some Windows) environment variable.

This extension works best with the [latest versions of Go](https://golang.org/doc/devel/release.html#policy) but  some of the features may continue to work with older versions of Go. The Go release policy states that the two newer major releases are officially supported.

The extension checks for the availability of the new Go release by periodically checking the [official Go distribution site](https://golang.org/dl) and notifies you of the new version. 

### [`gopls`]
[`gopls`] is the official Go [language server](https://langserver.org/) developed by the Go team. It is the default backend for most of this extension's IntelliSense, code navigation, code editing, and diagnostics features. When the extension starts, it spawns a `gopls` instance in server mode for each VS Code project.

`gopls` uses the `go` command to analyze your code. The extension automatically propagates necessary settings such as  `"go.buildFlags"`, `"go.buildTags"`, `"go.toolsEnvVars"` and the path to the right `go` command to `gopls`. No extra settings should be necessary, but when you need to adjust `gopls`'s behavior further (e.g., enable more advanced analysis features), please see [all the settings for `gopls`](settings.md#settings-for-gopls).

If you encounter issues with `gopls`, please read the [troubleshooting guide](troubleshooting.md#collect-gopls-information). If you want to run the extension without the language server, you can disable it by setting `"go.useLanguageServer": false`.

`gopls` officially supports the four newer major versions of Go. If you are using a very old version of Go, or you explicitly disable the language server, the extension will automatically fall back to the legacy mode. The legacy mode uses old tools instead of `gopls`. Unfortunately many of them are no longer actively maintained and many features the extension provides will not be available.
You can tell whether the extension is using `gopls`, by checking whether the high voltage icon (⚡) is present in the [Go status bar](./ui.md).

`gopls` is under active development, and updating it is important to get new features. The extension periodically checks the [module proxy](https://golang.org/cmd/go/#hdr-Module_proxy_protocol) to detect a new version has been released. When a newer version is available, a pop-up will appear, prompting you to update. If you would like to opt out of this automated update check, set `"go.toolsManagement.checkForUpdates"` to `false`.
For more information about `gopls`, please visit its [documentation](https://golang.org/s/gopls).

<!-- TODO: link to gopls troubleshooting guide -->

### [`dlv`](https://github.com/go-delve/delve)
This extension uses Delve for its debug/test functionalities. The extension currently ships with a thin Debug Adapter that implements the [Debug Adapter protocol](https://microsoft.github.io/debug-adapter-protocol/) and connects VS Code and `dlv`.

For a comprehensive overview of how to debug your Go programs, please see the [debugging guide](./debugging.md).

### [`vscgo`](https://pkg.go.dev/github.com/golang/vscode-go/vscgo)

This tool provides utilities needed by this extension but do not belong to the language server
or debug adapter server. Examples include dependency tools management, developer survey
configuration, and [Go telemetry collection](https://github.com/golang/vscode-go/issues/3121).
This tool is released with the extension and installed in the extension's directory.

### [`goplay`](https://pkg.go.dev/github.com/haya14busa/goplay?tab=overview)

This tool provides support for the [`Go: Run on Go Playground`](features.md#go-playground) command.

### [`gomodifytags`](https://pkg.go.dev/github.com/fatih/gomodifytags?tab=overview)

This tool provides support for the [`Go: Add Tags to Struct Fields`](features.md#add-or-remove-struct-tags) and [`Go: Remove Tags From Struct Fields`](features.md#add-or-remove-struct-tags) commands when using older versions of gopls. The latest
version of gopls has a gopls.modify_tags command which directly invokes the
gomodifytags library.

### [`impl`](https://github.com/josharian/impl)

This tool provides support for the [`Go: Generate Interface Stubs`](features.md#generate-interface-implementation) command.

### [`gotests`](https://github.com/cweill/gotests/)

This tool provides support for the [`Go: Generate Unit Tests`](features.md#generate-unit-tests) set of commands.

### [`staticcheck`]

This is the default lint tool. See the [full list of checks](https://staticcheck.io/docs/checks) that `staticcheck` provides. Other lint tools can be used by configuring the [`"go.lintTool"`](settings.md#go.lintTool) setting.
Other options include:

  * [`golangci-lint`]: This meta-linter combines a number of existing lint tools, including [staticcheck](#staticcheck), into one interface.
  * [`revive`]: This tool is an enhancement on top of [`golint`], and it provides additional checks.
  * [`golint`]: This used to be the default linter used by this extension before it was officially deprecated.

You can use the [`"go.lintFlags"`](settings.md#go.lintFlags) setting to further configure your linter of choice. Most linters can be configured via special configuration files, but you may still need to pass these command-line flags. The configuration documentation for each supported linter is listed here:

* [`staticcheck`](https://staticcheck.io/docs/#configuration)
* [`golangci-lint`](https://golangci-lint.run/usage/configuration/)
* [`revive`](https://github.com/mgechev/revive#command-line-flags)

#### Examples

Enable all [`golangci-lint`] linters and only show errors in new code:

```json5
"go.lintFlags": ["--enable-all", "--new"]
```

Configure `revive` to exclude `vendor` directories and apply extra configuration with a `config.toml` file:

```json5
"go.lintFlags": [
    "-exclude=vendor/...",
    "-config=${workspaceFolder}/config.toml"
]
```

[`goimports`]: https://pkg.go.dev/golang.org/x/tools/cmd/goimports?tab=doc
[`gofmt`]: https://golang.org/cmd/gofmt/
[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`staticcheck`]: https://pkg.go.dev/honnef.co/go/tools/staticcheck?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://pkg.go.dev/github.com/mgechev/revive?tab=overview
[`gopls`]: https://golang.org/s/gopls
[`go`]: https://golang.org/cmd/go

