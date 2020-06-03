# Go Nightly

This master branch of this extension is built and published nightly through the [Go Nightly]. If you're interested in testing new features and bug fixes, you may be interested in switching to the Go Nightly extension. Also, if you file an issue, we may suggest trying out the fix in Go Nightly.

The [Changelog](nightly/CHANGELOG.md) and [README](nightly/README.md) for [Go Nightly] can be found in the [docs/nightly](nightly/) directory.

If you try out Go Nightly, please file issues when you notice bugs. You can also join the maintainers in the [#vscode-dev](https://gophers.slack.com/archives/CUWGEKH5Z) channel on the [Gophers Slack](https://invite.slack.golangbridge.org/).

## Installation

To use the Go Nightly extension, you must first disable the standard Go extension. The two are not compatible and will cause conflicts if enabled simultaneously. If you'd like to make a permanent switch, you can uninstall the Go extension. Otherwise, you can disable it temporarily. To do so, open the Extensions view in VS Code, click on the gear icon next to the Go extension, and select Disable. Then, search for Go Nightly in the VS Code Marketplace and install it instead.

## Testing pre-releases

**Note**: Pre-releases are not yet available.

Pre-releases of the Go extension will be made available on the [Releases page](https://github.com/golang/vscode-go/releases/tag/latest) on GitHub. If you would like to try a pre-release, follow these instructions:

1) Download the `.vsix` file from the [Releases page](https://github.com/golang/vscode-go/releases/tag/latest).
2) Navigate to the Extensions view in VS Code (Ctrl+Shift+X). Click on the "..." in the top-right corner, select "Install from VSIX", and select `Go-latest.vsix`. Alternatively, you can run `code --install-extension Go-latest.vsix` or open the Command Palette and run the "Extensions: Install from VSIX..." command.
3) If prompted, reload VS Code.

**Note**: If you install an extension from a VSIX file, you will stop receiving automatic prompts when updates are released.

[Go Nightly]: https://marketplace.visualstudio.com/items?itemName=golang.go-nightly
