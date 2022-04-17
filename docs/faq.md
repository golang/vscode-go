### Syntax highlighting does not seem to work.

The default syntax highlighting for Go files is provided by a
[TextMate rule](https://github.com/jeff-hykin/better-go-syntax) embedded in VS Code,
not by this extension.

For better syntax highlighting (including generics support), we recommend enabling
[semantic highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
by turning on [Gopls' `ui.semanticTokens` setting](https://github.com/golang/vscode-go/blob/master/docs/settings.md#uisemantictokens).

```json
"gopls": { "ui.semanticTokens": true }
```

<!-- Topics
  * The extension deletes my code on save?
  * Help! The extension does not find 'go'.
  * Intellisense is not working!
  * Should I configure GOROOT/GOPATH?
  * How can I work with multiple modules?
  * How can I use my own formatter?
  * How can I work with build tags?
  * What is gopls?
  * Does the extension work on WSL? How?
  * Does the extension work on browser-based editors?
  * Can I contribute to share my snippets?
  * What is the extension's Go version support policy?
  ...
-->