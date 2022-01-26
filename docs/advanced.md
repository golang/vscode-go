# Advanced topics

This document describes more advanced ways of working with the VS Code Go
extension.

## Using Go1.18

The latest Go extension (`v0.31.0+` or [Nightly](./nightly.md))
contains experimental support for the [new Go 1.18 features](https://tip.golang.org/doc/go1.18).

* [Generics](https://go.dev/doc/tutorial/generics): IntelliSense, Code Editing, Diagnostics, Sytax Highlighting, etc.
* [Fuzzing](https://go.dev/doc/tutorial/fuzz): Run/Debug Test using CodeLens and Test UI (available in Nightly).
* [Go workspace mode](https://pkg.go.dev/cmd/go@go1.18beta1#hdr-Workspace_maintenance): _WIP_

The latest Go extension (v0.31.0+, or [Nightly](./nightly.md)) supports most of the new Go 1.18 features with
the following configuration.

1. Get the preview of Go 1.18 by visiting [the official Go downloads page](https://go.dev/dl/#go1.18beta1).
The following command will install `go1.18beta1` binary in your `$GOPATH/bin`
or `GOBIN` directory, and download the Go 1.18 SDK.
    ```sh
    go install golang.org/dl/go1.18beta1@latest
    go1.18beta1 download
    ```

    The location of the downloaded Go 1.18 SDK directory can be found with
    ```sh
    go1.18beta1 GOROOT
    ```

2. Configure the extension to use `go1.18beta1`
(or the `go` binary in the Go 1.18 SDK `bin` directory), using [one of
the options listed below](https://github.com/golang/vscode-go/blob/master/docs/advanced.md#choosing-a-different-version-of-go).

3. In order to process the new language features, [tools](./tools.md) this extension
needs rebuilding with Go 1.18. **Please run the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools)
command to update tools**.

4. (optional) for correct syntax highlighting, we recommend to enable 
[semantic highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
by turning on [Gopls' `ui.semanticTokens` setting](https://github.com/golang/vscode-go/blob/master/docs/settings.md#uisemantictokens).
    ```
    "gopls": { "ui.semanticTokens": true }
    ```

### Known Issues

The Go Tools team are actively working on fixing bugs and improving usability
of the new Go 1.18 features. Please take a look at current known
[`vscode-go` issues](https://github.com/golang/vscode-go/issues?q=is%3Aissue+label%3Ago1.18+)
and [`gopls` issues](https://github.com/golang/go/milestone/244).

  * Features that depend on 3rd party tools (`staticcheck`, `golangci-lint`, ...) may not work yet.
  Please follow the [tracking issue](https://github.com/golang/go/issues/50558).
  * Support for `go.work` is a work in progress.

In order to pick up the latest fixes, please consider to use the [Nightly](./nightly.md) version of
the extension. We plan to make prereleases of `gopls` v0.8.0 available frequently.
The Nightly version installs the pre-release version of `gopls`, so you will be able to pick up the
latest bug fixes of `gopls` without manual installation.

## Choosing a different version of Go

The extension chooses the `go` command using the `PATH` (or `Path`) environment
variable by default. You can configure the extension to choose a different
version of `go` with one of the following options.

* (Preferred) Adjust your `PATH` or `Path` environment variable, and *open VS
  Code with the adjusted environment* variable, or
* Use the Go extension's `"Go: Choose Go Environment"` command that opens a
  [menu](ui.md) to change the `go` version, or
* Use the `"go.alternateTools"` settings and specify the absolute path to the
  `go` command. `"go.alternateTools": { "go": "/path/to/go/command" }`

**note**: For historical reasons, some users configure the `"go.goroot"`

settings or the `GOROOT` environment variable to select the Go SDK location.
With recent versions of Go, that's unnecessary in most cases.

## Configuring the installation of command-line tools

The `Go: Install/Update Tools` command uses the `go get` command to download and
install requested tools. By default, `go get` will install the compiled tools in
one of the following directories.

* the directory the `GOBIN` environment variable specifies, or
* the `bin` directory under the first `GOPATH` (or `"go.gopath"`) directory, or
* the `$HOME/go/bin` (or `$USERPROFILE/go/bin`) directory.

Some users prefer to choose a different installation location. In that case, use
the `"go.toolsGopath"` setting.

The extension finds the required tools by their names (`go`, `gopls`, `dlv`,
etc.). The `"go.alternateTools"` setting provides a way to configure the
extension to use different tool location, for example a wrapper with a different
name.

## Using a custom linter

A commonly customized feature is the linter, which is the tool used to provide
coding style feedback and suggestions. This extension supports linters such as
`staticcheck`, `golangci-lint`, and `revive`. You can choose one of them using
the `"go.lintTool"` setting. For customization of the linter, please consult the
linter's documentation.

Note that if you are using `staticcheck`, you can enable it to run within
`gopls` by setting `"gopls": { "ui.diagnostic.staticcheck": true }`.

## Working on the Go standard library and the Go tools

This extension can be used for developing the standard library with additional
configuration.

First, you **must open the `src/` folder in VS Code**, not the Go tree root.
(See [golang/go#32394](https://github.com/golang/go/issues/32394).)

Then, you need to configure the workspace, by placing the following in
`src/.vscode/settings.json`. [Command Palette] ->
`Preferences: Open Workspace Settings (JSON)` will open the settings file.

```json5
{
  // Use the local go tool. This needs to be built with make.bash.
  "go.alternateTools": {
    "go": "~/godev/bin/go"
  },

  //
  // Below is optional.
  //
  // Build a separate set of tools. For golang/vscode-go#294.
  "go.toolsGopath": "~/.vscode/godev",
  // Don't reformat HTML files since we have a custom style.
  "html.format.enable": false
}
```

The above assumes the Go tree is checked out at `~/godev`. If your Go tree is
somewhere else, modify `go.alternateTools.go` to point to the go *binary*
accordingly. Many underlying tools including `gopls` invoke the go command
(`go list`, etc), so we assume the binary isn't completely broken.

You can add `.vscode` to `.git/info/exclude` to avoid risking checking
`settings.json` into git.

If you see an "inconsistent vendoring" error, please report it at
[golang/go#40250](https://github.com/golang/go/issues/40250).

## Formatting Code and Organizing Imports

When you have multiple formatter extensions, be sure to set this
extension as the default formatter for go language.
```json5
"[go]": {
  "editor.defaultFormatter": "golang.go"
}
```

Formatting and organizing imports are enabled by default. You
can choose to disable them by configuring the following settings.

```json5
"[go]": {
        "editor.formatOnSave": false,
        "editor.codeActionsOnSave": {
            "source.organizeImports": false
        }
}
```

[Command Palette]: https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette
