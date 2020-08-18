# Standard library development

vscode-go and gopls can be used for developing the standard library, but require configuration.

First, you **must open the `src/` folder in VS Code**, not the `GOROOT`. (See [golang/go#32394](https://github.com/golang/go/issues/32394).)

Then, you need to configure the workspace, by placing the following in `src/.vscode/settings.json`.
If your Go tree is not checked out at `~/go`, you will need to change the `go.alternateTools.go` and `gopls.env.PATH` settings.

```json5
{
    // Use the local go tool. This needs to be built with make.bash.
    "go.alternateTools": {
        "go": "~/go/bin/go"
    },
    // Build a separate set of tools. For golang/vscode-go#294.
    "go.toolsGopath": "~/.vscode/godev",
    // Don't reformat HTML files since we have a custom style.
    "html.format.enable": false,
    // Don't reorder imports since they are usually not grouped.
    "editor.codeActionsOnSave": {
        "source.organizeImports": false
    },
    "gopls": {
        // Make tools use the local go tool. For microsoft/vscode-go#3163.
        "env": {
            "PATH": "$HOME/go/bin/go:$PATH",
        },
    },
}
```

You can add `.vscode` to `.git/info/exclude` to avoid risking checking that file into git.

If you see an "inconsistent vendoring" error, please report it at [golang/go#40250](https://github.com/golang/go/issues/40250).

See also [golang/go#38603](https://github.com/golang/go/issues/38603).
