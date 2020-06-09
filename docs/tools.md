# Tools

This document describes the tools that power the VS Code Go extension. Each feature is provided by a command-line tool written in Go, so if you experience an issue, it may be due to the underlying tool. Some tools are required for the functionality of the extension, while others are provide optional features.

Some of the features can be provided by multiple tools, and this can be configured through the extension's settings. For more details, see the [Documentation](#documentation), [Formatting](#formatting), and [Diagnostics](#diagnostics) sections below.

**NOTE: If you are using the language server, [`gopls`], most of the tools below are not needed.**

## Installation

Tools will be installed by default when you install the extension. You can also manually install or update all of these tools by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command. If any tools are missing, you will see an `Analysis Tools Missing` warning in the bottom-right corner of the editor, which will prompt you to install these tools.

VS Code Go will install the tools to your `GOPATH` by default, but the tools will also be found if they are on your `PATH`. Read our [`GOPATH` documentation](gopath.md#install-tools-to-a-separate-gobin) if you wish to learn about storing tools in a separate directory.

## Table of Contents

* [Go toolchain](#go-toolchain)
* [`gocode`](#gocode)
* [`gopkgs`](#gopkgs)
* [`go-outline`](#go-outline)
* [`go-symbols`](#go-symbols)
* [`guru`](#guru)
* [`gorename`](#gorename)
* [`godoctor`](#godoctor)
* [`delve`](#delve)
* [`gomodifytags`](#gomodifytags)
* [`goplay`](#goplay)
* [`impl`](#impl)
* [`gotests`](#gotests)
* [`fillstruct`](#fillstruct)
* [Documentation](#documentation)
  * [`gogetdoc`]
  * [`godef`]
  * [`godoc`]
* [Formatting](#formatting)
  * [`goreturns`]
  * [`goimports`]
  * [`gofmt`]
  * [`goformat`]
* [Diagnostics](#diagnostics)
  * [`gotype-live`]
  * [`golint`]
  * [`staticcheck`]
  * [`golangci-lint`]
  * [`revive`]

### Go toolchain

This extension requires you to install the Go toolchain, meaning that you have the `go` command on your [`PATH`](https://en.wikipedia.org/wiki/PATH_(variable)). To do this, follow [the Go installation guide](https://golang.org/doc/install).

The [build-on-save](features.md#build-errors) and [vet-on-save](features.md#vet-errors) features are provided by the `go build` and `go vet` commands.

### `gocode`

Code completion is provided by `gocode`. It is the only tool that runs as a server. This enables it to provide completions faster, since a new process isn't starting per-keystroke.

Different versions of `gocode` are used depending on your version of Go.

* Go 1.8 and below: [nsf/gocode](https://github.com/nsf/gocode)
* Go 1.9 and above: [mdempsky/gocode](https://github.com/mdempsky/gocode)
* Go 1.11 and above, with modules enabled: [stamblerre/gocode](https://github.com/stamblerre/gocode)
  * This version of `gocode` does not have any caching, so if you find it slow, consider using [gopls] instead.

Learn how to [troubleshoot `gocode`](troubleshooting.md#autocompletion).

### [`gopkgs`](https://pkg.go.dev/github.com/uudashr/gopkgs?tab=overview)

This tool provides autocompletion for unimported packages.

### [`go-outline`](https://pkg.go.dev/github.com/ramya-rao-a/go-outline?tab=overview)

This tool provides the [document outline](features.md#document-outline) feature, as well as the [go to symbol](features.md#go-to-symbol) in the current file feature.

### [`go-symbols`](https://pkg.go.dev/github.com/acroca/go-symbols?tab=overview)

This tool provides the [go to symbol](features.md#go-to-symbol) in workspace feature.

### [`guru`](https://pkg.go.dev/golang.org/x/tools/cmd/guru?tab=doc)

This tool provides the [find references](features.md#find-references) and [find interface implementations](features.md#find-interface-implementations) features.

It can also be used to provide the [go to definition](features.md#go-to-definition) via the [`"go.docsTool"`](settings.md#go.docsTool) setting.

`guru` does not have support for Go modules, so we recommend using [`gopls`] for those features instead.

### [`gorename`](https://pkg.go.dev/golang.org/x/tools/cmd/gorename?tab=doc)

This tool provides the [rename symbol](features.md#rename-symbol) feature.

`gorename` does not have support for Go modules, so we recommend using [`gopls`] for this feature instead.

### [`godoctor`](https://github.com/godoctor/godoctor)

This tool provides the [refactoring](features.md#refactor) features.

It does not have support for Go modules, so we expect that [`gopls`] will provide this feature instead ([golang/go#37170](https://github.com/golang/go/issues/37170)).

### [`delve`](https://pkg.go.dev/github.com/go-delve/delve?tab=overview)

This is the debugger for the Go language. It is used to provide the [debugging](debugging.md) features of this extension.

### [`goplay`](https://pkg.go.dev/github.com/haya14busa/goplay?tab=overview)

This tool provides support for the [`Go: Run on Go Playground`](features.md#go-playground) command.

### [`gomodifytags`](https://pkg.go.dev/github.com/fatih/gomodifytags?tab=overview)

This tool provides support for the [`Go: Add Tags to Struct Fields`](features.md#add-or-remove-struct-tags) and [`Go: Remove Tags From Struct Fields`](features.md#add-or-remove-struct-tags) commands.

### [`impl`](https://github.com/josharian/impl)

This tool provides support for the [`Go: Generate Interface Stubs`](features.md#generate-interface-implementation) command.

### [`gotests`](https://github.com/cweill/gotests/)

This tool provides support for the [`Go: Generate Unit Tests`](features.md#generate-unit-tests) set of commands.

### [`fillstruct`](https://github.com/davidrjenni/reftools/tree/master/cmd/fillstruct)

This tool provides support the [`Go: Fill struct`](features.md#fill-struct-literals) command.

### Documentation

Documentation tools are used for the [go to definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover). [`gogetdoc`] is used by default.

If `gogetdoc` does not work for you, a combination of the [`godef`] and [`godoc`] tools can be used. [`guru`](#guru) can also be used, but only for the [go to definition](features.md#go-to-definition) behavior.

Configure this via the [`"go.docsTool"`](settings.md#go.docsTool) setting.

### Formatting

Formatting tools are used by the [formatting and import organization](features.md#format-and-organize-imports) features.

[`goreturns`] is used by default. It formats the file according to the industry standard [`gofmt`] style, organizes imports, and fills in default return values for functions. Other tools can be used for formatting instead; this can be configured with the [`"go.go.formatTool"`](settings.md#formatTool) setting.

**NOTE: [`goreturns`] does not have support for Go modules, so we recommend using [`goimports`] or [`gopls`] instead.**

Other format tool options include:

* [`goimports`], which applies the default `gofmt` style and organizes imports, but without the behavior of filling in default return values
* [`gofmt`] only formats the file, without import organization or filling in return values
* [`goformat`] is a configurable version of [`gofmt`]

### Diagnostics

Diagnostic tools are used to surface errors and warnings in your code when you save your file or as you type.

By default, [`gotype-live`], [`go vet`], and [`golint`] are used to provide [build](features.md#build-errors), [vet](features.md#vet-errors), and [lint](features.md#lint-errors) errors. [`gotype-live`] provides build errors as you type, while `go build` can be used to show build errors only on save.

**NOTE: [`gotype-live`] does not work with modules, so if you are using modules, we recommend using [`gopls`] instead.**

The command used to provide build errors on-save is `go build -i -o` or `go test -i -c -o` (for test files). The binary generated by the build is written to a temporary location.

Other lint tools can be used instead of [`golint`] by configuring the [`"go.lintTool"`](settings.md#go.lintTool) setting. Other options include:

* [`staticcheck`]: This tool provides a great deal of useful checks that are not provided by [`golint`]. See the full list at [staticcheck.io/docs/checks](https://staticcheck.io/docs/checks). It is also officially supported by the [Go team at Google](https://staticcheck.io/sponsors).
* [`golangci-lint`]: This tool combines a number of existing lint tools, including [staticcheck](#staticcheck), into one interface.
* [`revive`]: This tool is an enhancement on top of [`golint`], and it provides additional checks.

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
[`gopls`]: gopls.md
[`go vet`]: https://golang.org/cmd/vet/
