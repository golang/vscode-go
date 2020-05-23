# Features

This document describes the features supported by this extension.

If you are using the Go language server, `gopls`, please the [gopls documentation](gopls.md) instead. (You can check if you are using `gopls` by opening your VS Code settings and checking if `go.useLanguageServer` is set to `true`.)

## Table of Contents

* [IntelliSense](#intellisense)
* [Code Navigation](#code-navigation)
* [Code Editing](#code-editing)
* [Diagnostics](#diagnostics)
* [Testing](#testing)

## [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense)

This extension supports the following IntelliSense features:

* Code completion of symbols as you type.
* Signature help for functions.
* Quick info for symbols on hover.

### Customizability

* Code completion is provided by the [`gocode`](tools.md#gocode) tool. Different versions of `gocode` are used depending on your version of Go.
  * Go 1.8 and below: [nsf/gocode](https://github.com/nsf/gocode)
  * Go 1.9 and above: [mdempsky/gocode](https://github.com/mdempsky/gocode)
  * Go 1.11 and above, with modules enabled: [stamblerre/gocode](https://github.com/stamblerre/gocode)
    * If you find code completion slow with modules, consider using [gopls](gopls.md) instead.
* Signature help and quick info are provided by the [`gogetdoc`](tools.md#gogetdoc) tool. If `gogetdoc` does not work for you, a combination of the [`godef`](tools.md#godef) and [`godoc`](tools.md#godoc) tools can be used.
  * Configure this via the `"go.docsTool"` setting.

## [Code Navigation](https://code.visualstudio.com/docs/editor/editingevolved)

* Go to Definition of symbols.
* Find References of symbols and Implementations of interfaces (using `guru` or `gopls`)
* Go to symbol in file or see the file outline (using `go-outline` or `gopls`)
- Go to symbol in workspace (using `go-symbols` or `gopls`)
- Toggle between a Go program and the corresponding test file.

[Learn more about Code Navigation in VS Code].

## Code Editing

- Code Snippets for quick coding
- Format code on file save as well as format manually (using `goreturns` or `goimports` or `gofmt` or `gopls`)
- Symbol Rename (using `gorename` or `gopls`. Note: If not using `gopls`, then for undo after rename to work in Windows you need to have `diff` tool in your path)
- Add Imports to current file (using `gopkgs` or `gopls`)
- Add/Remove Tags on struct fields (using `gomodifytags`)
- Generate method stubs for interfaces (using `impl`)
- Fill struct literals with default values (using `fillstruct`)

## Diagnostics

- Build-on-save to compile code and show build errors. (using `go build` and `go test`)
- Vet-on-save to run `go vet` and show errors as warnings (`gopls`)
- Lint-on-save to show linting errors as warnings (using `golint`, `gometalinter`, `megacheck`, `golangci-lint` or `revive` or `gopls`)
- Semantic/Syntactic error reporting as you type (using `gotype-live` or `gopls`)

## Testing

- Run Tests under the cursor, in current file, in current package, in the whole workspace using either commands or codelens 
- Run Benchmarks under the cursor using either commands or codelens
- Show code coverage either on demand or after running tests in the package.
- Generate unit tests skeleton (using `gotests`)