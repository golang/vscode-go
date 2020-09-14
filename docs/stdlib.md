# Standard library development

vscode-go and gopls can be used for developing the standard library, but require configuration.

First, you **must open the `src/` folder in VS Code**, not the Go tree root.
(See [golang/go#32394](https://github.com/golang/go/issues/32394).)

Then, you need to configure the workspace, by placing the following in `src/.vscode/settings.json`.

```json5
{
    // Use the local go tool. This needs to be built with make.bash.
    "go.alternateTools": {
        "go": "~/godev/bin/go"
    },
    // Build a separate set of tools. For golang/vscode-go#294.
    "go.toolsGopath": "~/.vscode/godev",
    // Don't reformat HTML files since we have a custom style.
    "html.format.enable": false,
}
```

The above assumes the Go tree is checked out at `~/godev`. If your Go tree is somewhere else, modify
`go.alternateTools.go` accordingly.

You can add `.vscode` to `.git/info/exclude` to avoid risking checking `settings.json` into git.

If you see an "inconsistent vendoring" error, please report it at
[golang/go#40250](https://github.com/golang/go/issues/40250).

See also [golang/go#38603](https://github.com/golang/go/issues/38603).
