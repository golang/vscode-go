# Tools

This document describes the tools used to create the VS Code Go extension. Each feature is provided by a command-line tool written in Go, so if you experience an issue, it may be due to the underlying tool. Some tools are required for the functionality of the extension, while others are provide optional features.

Some of the features can be provided by multiple tools, and this can be configured through the extension's settings. For more details, see [Customizations](#customizations).

**NOTE: If you are using the language server, [`gopls`](gopls.md), then most of the below tools are not needed. We strongly recommend using `gopls` if you are using Go modules, as it performs better.**

## Installation

These tools will be installed by default when you install the extension. You can manually install or update all of these tools by running the `Go: Install/Update Tools` command. If any tools are missing, you will see an "Analysis Tools Missing" warning in the bottom-right corner of the editor, which will prompt you to install these tools.

VS Code Go will install the tools to your `GOPATH` by default, but the tools will also be found if they are on your `PATH`. If you wish to use a separate `GOPATH` for tools only, you can configure this via the [`"go.toolsGopath"`](commands.md#toolsGopath) setting.

## Table of Contents

* [Go toolchain](#go-toolchain)
* [`gocode`](#gocode)
* [`gopkgs`](#gopkgs)
* [`go-outline`](#go-outline)
* [`go-symbols`](#go-symbols)
* [`guru`](#guru)
* [`gorename`](#gorename)
* [`delve`](#delve)
* [`gomodifytags`](#gomodifytags)
* [`goplay`](#goplay)
* [`impl`](#impl)
* [`gotests`](#gotests)
* [`fillstruct`](#fillstruct)
* [Documentation](#documentation)
  * [`gogetdoc`]()
  * [`godef`]()
  * [`godoc`]()
* [Formatting](#formatting)
  * [`goreturns`](#goreturns)
  * [`goimports`](#goimports)
  * [`gofmt`](#gofmt)
  * [`goformat`](#goformat)
* [Diagnostics](#diagnostics)
  * [`gotype-live`](#gotype-live)
  * [`golint`](#golint)
  * [`staticcheck`](#staticcheck)
  * [`golangci-lint`](#golangci-lint)
  * [`revive`](#revive)

### Go toolchain

This extension requires you to install the Go toolchain, meaning that you have the `go` command on your [`PATH`](https://en.wikipedia.org/wiki/PATH_(variable)). To do this, follow [the Go installation guide](https://golang.org/doc/install).

The [build-on-save](features.md#build-on-save) and [vet-on-save](features.md#vet-on-save) features are provided by the `go build` and `go vet` commands.

### `gocode`

Code completion is provided by `gocode`. It is the only tool that runs as a server. This enables it to provide completions faster, since a new process isn't starting per-keystroke. As a result, it is also easier to troubleshoot.

To restart `gocode`, run `gocode close` on the command-line.

To see `gocode`'s internals for debugging purposes, run:

```bash
gocode close
gocode -s -debug
```

Then, type and trigger completions in your VS Code window as usual. You should see information printed in your terminal window.

Different versions of `gocode` are used depending on your version of Go.

* Go 1.8 and below: [nsf/gocode](https://github.com/nsf/gocode)
* Go 1.9 and above: [mdempsky/gocode](https://github.com/mdempsky/gocode)
* Go 1.11 and above, with modules enabled: [stamblerre/gocode](https://github.com/stamblerre/gocode)
  * This version of `gocode` does not have any caching, so if you find it slow, consider using [gopls](gopls.md) instead.

### [`gopkgs`](https://pkg.go.dev/github.com/uudashr/gopkgs?tab=overview)

This tool provides autocompletion for unimported packages.

### [`go-outline`](https://pkg.go.dev/github.com/ramya-rao-a/go-outline?tab=overview)

This tool provides the [document outline](features.md#document-outline) feature, as well as the [go to symbol](features.md#go-to-symbol) in the current file feature.

### [`go-symbols`](https://pkg.go.dev/github.com/acroca/go-symbols?tab=overview)

This tool provides the [go to symbol](#go-to-symbol) in workspace feature.

### [`guru`](https://pkg.go.dev/golang.org/x/tools/cmd/guru?tab=doc)

This tool provides the [find references](features.md#find-references) and [find interface implementations](features.md#find-interface-implementations) features.

It can also be used to provide the [go to definition](features.md#go-to-definition) via the [`"go.docsTool"`](commands.md#docsTool) setting (see [Customization](#Customization)).

`guru` does not have support for Go modules, so we recommend using [`gopls`](gopls.md) for those features instead.

### [`gorename`](https://pkg.go.dev/golang.org/x/tools/cmd/gorename?tab=doc)

This tool provides the [rename symbol](features.md#rename-symbol) feature.

`gorename` does not have support for Go modules, so we recommend using [`gopls`](gopls.md) for this feature instead.

### [`delve`](https://pkg.go.dev/github.com/go-delve/delve?tab=overview)

This is the debugger for the Go language. It is used to provide the [debugging](debugging.md) features of this extension.

### [`goplay`](https://pkg.go.dev/github.com/haya14busa/goplay?tab=overview)

This tool provides support for the [`Go: Run on Go Playground`](features.md#go-playground) command.

### [`gomodifytags`](https://pkg.go.dev/github.com/fatih/gomodifytags?tab=overview)

This tool provides support for the [`Go: Add Tags to Struct Fields`](features.md#add-struct-tags) command.

### [`impl`](https://github.com/josharian/impl)

This tool provides support for the [`Go: Generate Interface Stubs`](features.md#generate-interface-implementation) command.

### [`gotests`](https://github.com/cweill/gotests/)

This tool provides support for the [`Go: Generate Unit Tests`](features.md#generate-unit-tests) set of commands.

### [`fillstruct`](https://github.com/davidrjenni/reftools/tree/master/cmd/fillstruct)

This tool provides support the [`Go: Fill struct`](features.md#fill-struct) command.

### Documentation

The below tools are used for the [go-to-definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover). [`gogetdoc`](https://pkg.go.dev/github.com/zmb3/gogetdoc?tab=overview) is used by default.

If `gogetdoc` does not work for you, a combination of the [`godef`](https://pkg.go.dev/github.com/rogpeppe/godef?tab=overview) and [`godoc`](https://pkg.go.dev/golang.org/x/tools/cmd/godoc?tab=doc) tools can be used. [`guru`](#guru) can also be used, but only for the [go to definition](features.md#go-to-definition) behavior.

Configure this via the [`"go.docsTool"`](commands.md#docsTool) setting.

### [`goreturns`](https://pkg.go.dev/github.com/sqs/goreturns?tab=overview)

This tool is the default tool used to [format](features.md#format-and-organize-imports) Go files. It applies the default [`gofmt`](#gofmt) style, organizes imports, and fills in default return values for functions.

Alternatively, [`goimports`](#goimports) and [`gofmt`](#gofmt) can be used for formatting instead (see [Customizations](#customizations)).

`goreturns` does not have support for Go modules, so we recommend using [`goimports`](#goimports) or [`gopls`](gopls.md) instead.

### [`goimports`](https://pkg.go.dev/golang.org/x/tools/cmd/goimports)

This is tool can be used for [formatting](features.md#format-and-organize-imports) instead of [`goreturns`](#goreturns). It applies the default [`gofmt`](#gofmt) style and organizes imports, without the behavior of filling in default return values.

Alternatively, [`goreturns`](#goreturns) and [`gofmt`](#gofmt) can be used for formatting instead (see [Customizations](#customizations)).

### [`gofmt`](https://golang.org/cmd/gofmt/)

This tool can be used for [formatting](features.md#format-and-organize-imports) instead of [`goreturns`](#goreturns) or [`goimports`](#goimports). It only formats the file, without import organization or filling in return values. `gofmt` ships with the Go distribution, and it is an industry standard for Go formatting.

Alternatively, [`goreturns`](#goimports) and [`goimports`](#goimports) can be used for formatting instead (see [Customizations](#customizations)).

### [`gotype-live`](https://github.com/tylerb/gotype-live)

This tool provides [build errors](features.md#build-errors) as you type. It does not work with modules, so if you are using modules, we recommend using [`gopls`](gopls.md) instead.

### [`golint`](https://pkg.go.dev/golang.org/x/lint/golint?tab=overview)

This tool is used by default for the [lint-on-save](features.md#lint-on-save) feature.

Alternatively, [staticcheck](#staticcheck), [`golangci-lint`](#golangci-lint), and [`revive`](#revive) can be used (see [Customizations](#Customizations)).

### [`staticcheck`](https://pkg.go.dev/honnef.co/go/tools?tab=overview)

This tool can be used for the [lint-on-save](#lint-on-save) feature (see [Customizations](#Customizations)). It provides a great deal of useful checks that are not provided by `golint`; see the full list at [staticcheck.io/docs/checks](https://staticcheck.io/docs/checks). It is also supported by the [Go team at Google](https://staticcheck.io/sponsors).

### [`golangci-lint`](https://golangci-lint.run/)

This tool can be used for the [lint-on-save](#lint-on-save) feature (see [Customizations](#Customizations)). This tool combines a number of existing lint tools, including [staticcheck](#staticcheck), into one interface.

### [`revive`](https://pkg.go.dev/github.com/mgechev/revive?tab=overview)

This tool can be used for the [lint-on-save](#lint-on-save) feature (see [Customizations](#Customizations)). It is also an enhancement on top of [`golint`](#golint), and it provides additional checks.

## Customization


* Formatting is provided by [`goreturns`](#goreturns) by default. If you do not wish to use this tool, or it does not work for you (it does not work with modules), you can use [`goimports`](#goimports) or [`gofmt`](#gofmt) instead.
  * Configure this via the [`"go.formatTool"`](commands.md#formatTool) setting.
* Linting is provided by [`golint`](#golint) by default. If you do not wish to use `golint`, you can instead use one of [`staticcheck`](#staticcheck), [`golangci-lint`](#golangci-lint), or [`revive`](#revive).
  * Configure this via the [`"go.lintTool"`](commands.md#lintTool) setting.
