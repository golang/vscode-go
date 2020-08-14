# Managing Your Go Version

## Using The Go Status Bar

You can view the current Go version by looking at the status bar item in the bottom left corner of VS Code. Clicking this button will present you with a menu from which you can select any version of Go that exists in your $HOME/sdk directory or on <https://golang.org/dl>.

Previously, the `go.goroot` and `go.alternateTools` settings controlled the Go version used by VS Code Go. If you have configured these settings, they are no longer needed and should be deleted.

[](https://i.imgur.com/8qh2Tu2.png)

The "Clear Selection" option resets your Go version to the one found first in either `go.alternateTools`, `go.goroot` or your PATH.

## Installing a New Go Version

After selecting any Go version that has not yet been installed (such as Go 1.14.6 in the screenshot above), the binary will be automatically installed in $HOME/sdk and put to use in your environment.

Once the download completes, VS Code Go will make use of this new Go version.
