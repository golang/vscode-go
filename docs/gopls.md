# [`gopls`](golang.org/s/gopls), the Go language server

**Note: `gopls` only supports Go versions above 1.11.**

#### Install/Update the Go language server

Ideally, you would see prompts to use/install/update the language server.
Follow the prompts and the language server should get set up correctly.
If you want to manually install/update the language server,
- Ensure you have set `go.useLanguageServer` to `true` in your settings
- Use the `Go: Install/Update Tools` command, select `gopls` from the list and press Ok.


#### Settings to control the use of the Go language server

Below are the settings you can use to control the use of the language server. You need to reload the VS Code window for any changes in these settings to take effect.

- Set `go.useLanguageServer` to `true` to enable the use of language server.
- When using `gopls`, see the [recommended settings](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md).
- Some of the features from the language server can be disabled if needed using the setting `go.languageServerExperimentalFeatures`. Below are the features you can thus control. By default, all are set to `true` i.e are enabled.
```json
  "go.languageServerExperimentalFeatures": {
    "diagnostics": true,
    "documentLink": true
  }
```
- Set `"go.languageServerFlags": ["-logfile", "path to a text file that exists"]` to collect logs in a log file.
- Set `"go.languageServerFlags": ["-rpc.trace"]` to see the complete rpc trace in the output panel (`View` -> `Output` -> `gopls`)

#### Provide feedback on gopls

If you find any problems using the `gopls` language server, please first check the [list of existing issues for gopls](https://github.com/golang/go/issues?q=is%3Aissue+is%3Aopen+label%3Agopls) and update the relevant ones with your case before logging a new one at https://github.com/golang/go/issues


#### Helpful links for gopls

- [Wiki for gopls](https://github.com/golang/tools/blob/master/gopls/doc/user.md)
- [Recommended settings for VSCode when using gopls](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md)
- [Troubleshooting for gopls](https://github.com/golang/go/wiki/gopls#troubleshooting)
- [Known bugs with gopls](https://github.com/golang/go/wiki/gopls#known-issues)
- [Github issues for gopls](https://github.com/golang/go/issues?q=is%3Aissue+is%3Aopen+label%3Agopls)
