# Tools

This document describes the tools that power the VS Code Go extension.

Tools will be installed by default when you install the extension. You can also manually install or update all of these tools by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command. If any tools are missing, you will see an `Analysis Tools Missing` warning in the bottom-right corner of the editor, which will prompt you to install these tools.

VS Code Go will install the tools to your `$GOPATH/bin` by default. 

### [`go`]
This extension requires you to install the Go toolchain, meaning that you have the `go` command on your [`PATH`](https://en.wikipedia.org/wiki/PATH_(variable)). To do this, follow [the Go installation guide](https://golang.org/doc/install).

The extension runs the [`go`] command to debug and test your go program. By default, this extension assumes that Go is already installed in your system and the `go` command can be found from the `PATH` (or `Path` in some Windows) environment variable.

This extension works best with the [latest versions of Go](https://golang.org/doc/devel/release.html#policy) but  some of the features may continue to work with older versions of Go. The Go release policy states that the two newer major releases are officially supported.

The extension checks for the availability of the new Go release by periodically checking the [official Go distribution site](https://golang.org/dl) and notifies you of the new version. 

### [`gopls`]
[`gopls`] is the official Go [language server](https://langserver.org/) developed by the Go team. It is the default backend for most of this extension's IntelliSense, code navigation, code editing, and diagnostics features. When the extension starts, it spawns a `gopls` instance in server mode for each VS Code project.

`gopls` uses the `go` command to analyze your code. The extension automatically propagates necessary settings such as  `"go.buildFlags"`, `"go.buildTags"`, `"go.toolsEnvVars"` and the path to the right `go` command to `gopls`. No extra settings should be necessary, but when you need to adjust `gopls`'s behavior further (e.g., enable more advanced analysis features), please see [all the settings for `gopls`](https://github.com/golang/vscode-go/blob/master/docs/settings.md#settings-for-gopls).

If you encounter issues with `gopls`, please read the [troubleshooting guide](troubleshooting.md#collect-gopls-information). If you want to run the extension without the language server, you can disable it by setting `"go.useLanguageServer": false`.

`gopls` officially supports the four newer major versions of Go. If you are using a very old version of Go, or you explicitly disable the language server, the extension will automatically fall back to the legacy mode. The legacy mode uses old tools instead of `gopls`. Unfortunately many of them are no longer actively maintained and many features the extension provides will not be available.
You can tell whether the extension is using `gopls`, by checking whether the high voltage icon (⚡) is present in the [Go status bar](./ui.md).

`gopls` is under active development, and updating it is important to get new features. The extension periodically checks the [module proxy](https://golang.org/cmd/go/#hdr-Module_proxy_protocol) to detect a new version has been released. When a newer version is available, a pop-up will appear, prompting you to update. If you would like to opt out of this automated update check, set `"go.toolsManagement.checkForUpdates"` to `false`.
For more information about `gopls`, please visit its [documentation](https://golang.org/s/gopls).

<!-- TODO: link to gopls troubleshooting guide -->

### [`dlv`](https://github.com/go-delve/delve)
This extension uses Delve for its debug/test functionalities. The extension currently ships with a thin Debug Adapter that implements the [Debug Adapter protocol](https://microsoft.github.io/debug-adapter-protocol/) and connects VS Code and `dlv`.

For a comprehensive overview of how to debug your Go programs, please see the [debugging guide](./debugging.md).

### [`dlv-dap`](https://github.com/go-delve/delve)
This extension requires an unstable version of [`dlv`](#dlv) when users opt in to use Delve's native DAP implementation. `dlv-dap` is a `dlv` built from the master, which includes unreleased features. Please see the documentation about [Dlv DAP - Delve's Native DAP implementation](./dlv-dap.md) for details.

### [`go-outline`](https://pkg.go.dev/github.com/ramya-rao-a/go-outline?tab=overview)

This tool provides the information needed to compute the various test code lenses. It will be replaced with [`gopls`]. <!--TODO: reference to the issue-->

### [`goplay`](https://pkg.go.dev/github.com/haya14busa/goplay?tab=overview)

This tool provides support for the [`Go: Run on Go Playground`](features.md#go-playground) command.

### [`gomodifytags`](https://pkg.go.dev/github.com/fatih/gomodifytags?tab=overview)

This tool provides support for the [`Go: Add Tags to Struct Fields`](features.md#add-or-remove-struct-tags) and [`Go: Remove Tags From Struct Fields`](features.md#add-or-remove-struct-tags) commands.

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

### Misc tools used in the legacy mode

When `gopls` cannot be used, the extension falls back to the legacy mode. Be aware that many of these tools may be incompatible with the recent versions of Go or do not work in Modules mode.

* [`go-outline`](https://pkg.go.dev/github.com/ramya-rao-a/go-outline?tab=overview):
In the legacy mode, this tool provides the `[document outline](features.md#document-outline) feature` and the [go to symbol](features.md#go-to-symbol) in the current file feature.

* `gocode`: code completion in the legacy mode is provided by `gocode`. Different versions of `gocode` are used depending on your version of Go.
  * Go 1.9 and above: [mdempsky/gocode](https://github.com/mdempsky/gocode)
  * Go 1.11 and above, with modules enabled: [stamblerre/gocode](https://github.com/stamblerre/gocode), named `gocode-gomod` internally.

* [`go-symbols`](https://pkg.go.dev/github.com/acroca/go-symbols?tab=overview): provides the [go to symbol](features.md#go-to-symbol) in workspace feature.

* [`guru`](https://pkg.go.dev/golang.org/x/tools/cmd/guru?tab=doc): provides the [find references](features.md#find-references) and [find interface implementations](features.md#find-interface-implementations) features.
It can also be used to provide the [go to definition](features.md#go-to-definition) via the [`"go.docsTool"`](settings.md#go.docsTool) setting. `guru` does not support Go modules.

* [`gorename`](https://pkg.go.dev/golang.org/x/tools/cmd/gorename?tab=doc): provides the [rename symbol](features.md#rename-symbol) feature. `gorename` does not have support for Go modules

* [`godoctor`](https://github.com/godoctor/godoctor): provides the [refactoring](features.md#refactor) features. It does not support Go modules, and we expect that [`gopls`] will provide this feature instead ([golang/go#37170](https://github.com/golang/go/issues/37170)).

* [`fillstruct`](https://github.com/davidrjenni/reftools/tree/master/cmd/fillstruct): provides support the [`Go: Fill struct`](features.md#fill-struct-literals) command.

* [`gogetdoc`], [`godef`], [`godoc`]: these are documentation tools used for the [go to definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover) in the legacy mode. [`guru`](#guru) can also be used, but only for the [go to definition](features.md#go-to-definition) behavior. Configure this via the [`"go.docsTool"`](settings.md#go.docsTool) setting.

* [`goimports`], [`gofmt`]: Formatting tools are used by the [formatting and import organization](features.md#format-and-organize-imports) features. [`goreturns`] is used by default in the legacy mode. It formats the file according to the industry standard [`gofmt`] style, organizes imports, and fills in default return values for functions. Other tools can be used for formatting instead; this can be configured with the [`"go.go.formatTool"`](settings.md#formatTool) setting.

  * [`gofmt`] only formats the file, without import organization or filling in return values
  * [`goformat`] is a configurable version of [`gofmt`]
  * [`goreturns`] fills in default return values for functions, in addition to applying `goimports`-style formatting. This tool does not have support for Go modules.

* Diagnostics tools: By default, [`gotype-live`], [`go vet`], and [`golint`] are used to provide [build](features.md#build-errors), [vet](features.md#vet-errors), and [lint](features.md#lint-errors) errors. [`gotype-live`] provides build errors as you type, while `go build` can be used to show build errors only on save. [`gotype-live`] does not work with modules.



[`gogetdoc`]: https://pkg.go.dev/github.com/zmb3/gogetdoc?tab=overview
[`godef`]: https://pkg.go.dev/github.com/rogpeppe/godef?tab=doc
[`godoc`]: https://pkg.go.dev/golang.org/x/tools/godoc?tab=doc
[`goreturns`]: https://pkg.go.dev/github.com/sqs/goreturns?tab=overview
[`goimports`]: https://pkg.go.dev/golang.org/x/tools/cmd/goimports?tab=doc
[`gofmt`]: https://golang.org/cmd/gofmt/
[`goformat`]: https://pkg.go.dev/winterdrache.de/goformat?tab=overview
[`gotype-live`]: https://pkg.go.dev/github.com/tylerb/gotype-live?tab=doc
[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`staticcheck`]: https://pkg.go.dev/honnef.co/go/tools/staticcheck?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://pkg.go.dev/github.com/mgechev/revive?tab=overview
[`go vet`]: https://golang.org/cmd/vet/
[`gopls`]: https://golang.org/s/gopls
[`go`]: https://golang.org/cmd/go

