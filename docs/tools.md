# Tools

This document describes the tools used to create the VS Code Go extension. Each feature is provided by a command-line tool written in Go, so if you experience an issue, it may be due to the underlying tool. Some tools are required for the functionality of the extension, while others are provide optional features. These tools must be made available on your PATH or GOPATH.

Some of the features can be provided by multiple tools, and this can be configured through the extension's settings. For more details, see [Customizations](#customizations).

## Table of Contents

* [Required tools](#required-tools)
  * [Go toolchain](#go-toolchain)
  * [`gocode`](#gocode)
* [Optional tools](#optional-tools)
* [Customizations](#customizations)

## Required tools

If any of these tools are missing, you will see an "Analysis Tools Missing" warning in the bottom-right corner of the editor. Clicking it will offer to install the missing tools for you.

If you have chosen to use the [Go language server](https://github.com/microsoft/vscode-go#go-language-server), then most of the below tools are no longer needed as the corresponding features will be provided by the language server. Eventually, once the language server is stable, we will move to using it and deprecate the use of individual tools below.

**NOTE**: If you are using Go modules, then we strongly recommend using the Go language server as it performs much better than the tools below. 

### Go toolchain

This extension requires you to install the Go toolchain, meaning that you have the `go` command on your [`PATH`](https://en.wikipedia.org/wiki/PATH_(variable)). To do this, follow [the Go installation guide](https://golang.org/doc/install).

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

### [gopkgs](https://github.com/uudashr/gopkgs)

Provides auto-completion of unimported packages

### [go-outline](https://github.com/ramya-rao-a/go-outline)

Provides symbol search in the current file

### [go-symbols](https://github.com/acroca/go-symbols)

Provides symbol search in the current workspace

### [guru](https://golang.org/x/tools/cmd/guru)

For the `Find all References` feature

### [gorename](https://golang.org/x/tools/cmd/gorename)

for renaming symbols

### [goreturns](https://github.com/sqs/goreturns) or [goimports](https://golang.org/x/tools/cmd/goimports) for formatting code _(not needed if using language server)_

### godef

- [godef](https://github.com/rogpeppe/godef) or [gogetdoc](https://github.com/zmb3/gogetdoc) for the `Go to Definition` feature _(not needed if using language server)_

### godoc

- [godoc](https://golang.org/x/tools/cmd/godoc) or [gogetdoc](https://github.com/zmb3/gogetdoc) for the documentation that appears on hover _(not needed if using language server)_

### golint

- [golint](https://golang.org/x/lint/golint) or [megacheck](https://honnef.co/go/tools/) or [golangci-lint](https://github.com/golangci/golangci-lint) or [revive](https://github.com/mgechev/revive) for linting

### dlv

- [dlv](https://github.com/derekparker/delve/tree/master/cmd/dlv) for debugging

There are other features of this extension which you most probably wouldn't be using every day. For eg: Generating unit tests or generating stubs for interface or modify tags. The tools used for such features are:

- [gomodifytags](https://github.com/fatih/gomodifytags) for modifying tags on structs
- [goplay](https://github.com/haya14busa/goplay/) for running current file in the Go playground
- [impl](https://github.com/josharian/impl) for generating stubs for interfaces
- [gotype-live](https://github.com/tylerb/gotype-live) for providing diagnostics as you type
- [gotests](https://github.com/cweill/gotests/) for generating unit tests
- [fillstruct](https://github.com/davidrjenni/reftools/tree/master/cmd/fillstruct) for filling a struct literal with default values

You can install all these tools at once by running the command `Go: Install/Update Tools`. The same command can be used to keep the tools up to date as well as to re-compile in case you change the version of Go being used.

If you wish to have the extension use a separate GOPATH for its tools, provide the desired location in the setting `go.toolsGopath`.

## Customization

* Signature help and quick info are provided by the [`gogetdoc`](tools.md#gogetdoc) tool. If `gogetdoc` does not work for you, a combination of the [`godef`](tools.md#godef) and [`godoc`](tools.md#godoc) tools can be used.
  * Configure this via the `"go.docsTool"` setting.