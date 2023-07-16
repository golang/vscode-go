# Frequently Asked Questions

**NOTE: [Debugging](debugging.md#faqs) has its own FAQ documentation.**

## Syntax highlighting doesn't seem to work.

The default syntax highlighting for Go files is provided by a
[TextMate rule](https://github.com/jeff-hykin/better-go-syntax) embedded in VS Code,
not by this extension.

For better syntax highlighting (including generics support), we recommend enabling
[semantic highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
by turning on [Gopls' `ui.semanticTokens` setting](settings.md#uisemantictokens).

```json
"gopls": { "ui.semanticTokens": true }
```

## Code formatting by this extension doesn't seem to work.

When you have multiple formatter extensions, be sure to set this
extension as the default formatter for go language.
```json5
"[go]": {
  "editor.defaultFormatter": "golang.go"
}
```

## How can I stop the extension from formatting files on save?

Formatting and organizing imports for Go are enabled by default. This is implemented
by setting the [language-specific editor settings](https://code.visualstudio.com/docs/getstarted/settings#_languagespecific-editor-settings), that take precedence
over user/workspace editor settings.

You can choose to disable them by configuring the following settings.

```json5
"[go]": {
        "editor.formatOnSave": false,
        "editor.codeActionsOnSave": {
            "source.organizeImports": false
        }
}
```

This decision was made a while ago to help users follow the best practice,
and to detect broken code early (e.g. unused imports causes compile errors in Go).
Unfortunately, these language-specific editor settings overriden by the
extension is not easily visible from the settings UI, and confuses users new to Go.
In the following issues, we are discussing and collecting ideas to improve
the situation without interrupting existing users.

  * [`editor.formatOnSave` and `editor.codeActionsOnSave`](https://github.com/golang/vscode-go/issues/1815)
  * [`editor.suggest.snippetsPreventQuickSuggestions`](https://github.com/golang/vscode-go/issues/1805)

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