# Extension UI

## Using The Go Status Bar

The Go status bar appears in the lower left of the extension window. Clicking the Go status bar brings up a menu that provides easy access to see and update important information about your Go project. This includes information about the Go environment, the current Go version, the `gopls` trace, and about the current module.

<div style="text-align: center;"><img src="images/statusbarmenu.png" alt="vscode extension after Go status bar item is clicked" style="width:75%" > </div>

### Go Environment

The `Go Locate Configured Go Tools` command will display the configured GOPATH, GOROOT, tool locations and the results of `go env` in the output window.

### Managing Your Go Version

You can view the current Go version by looking at the status bar item in the bottom left corner of VS Code. Clicking this button and selecting `Choose Go Environment` will present you with a menu from which you can select any version of Go that exists in your $HOME/sdk directory or on <https://golang.org/dl>. This command is also available through the command pallette using `Go: Choose Go Environment`.

Previously, the `go.goroot` and `go.alternateTools` settings controlled the Go version used by VS Code Go. If you have configured these settings, they are no longer needed and should be deleted.

<div style="text-align: center;"><img src="images/selectGoVersion.png" alt="command pallete menu for selecting a new Go version" style="width:75%" > </div>


The "Clear Selection" option resets your Go version to the one found first in either `go.alternateTools`, `go.goroot` or your PATH.

### Installing a New Go Version

After selecting any Go version that has not yet been installed (such as Go 1.14.6 in the screenshot above), the binary will be automatically installed in $HOME/sdk and put to use in your environment.

Once the download completes, VS Code Go will make use of this new Go version.

### Language Server Status

`gopls` is the official Go [language server](https://langserver.org/) developed by the Go team. It was developed in response to the release of [Go modules](docs/modules.md), and it is the recommended approach when working with [Go modules](docs/modules.md) in VS Code.

When `gopls` is enabled, :zap: is displayed next to the Go version in the status bar and the `gopls` version is displayed in the menu.

<div style="text-align: center;"><img src="images/gopls.png" alt="command pallete menu for selecting a new Go version" style="width:100px" > </div>

Selecting `Open 'gopls' trace` will open the trace of the `gopls` server in the output window. Please include this trace when filing an issue related to the extension and `gopls` is enabled.

### Modules Status

When modules are enabled for the file you have open, you can navigate to the `go.mod` file for the project using the menu. If you do not see the `Open go.mod` item, then the extension does not think the file you have open belongs to a module.

More information about [using Go modules](https://blog.golang.org/using-go-modules) is available on the Go blog.

