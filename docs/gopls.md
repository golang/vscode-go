# [`gopls`], the Go language server

[`gopls`] is the official Go [language server](https://langserver.org/) developed by the Go team. It was developed in response to the release of [Go modules], and it is the recommended approach when working with [Go modules] in VS Code.

[`gopls`] is currently in an alpha state, so it is not enabled by default. Please note that [`gopls`] only supports Go versions above 1.12.

[`gopls`] has its own [documentation pages](https://github.com/golang/tools/tree/master/gopls/doc), and they should be treated as the source of truth for how to use [`gopls` in VS Code](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md).

## Overview

* [Background](#background)
* [Enable the language server](#enable-the-language-server)
  * [Automatic updates](#automatic-updates)
* [Configuration](#configuration)
  * [Ignored settings](#ignored-settings)
  * [`gopls` settings block](#gopls-settings-block)
* [Troubleshooting](https://github.com/golang/tools/blob/master/gopls/doc/troubleshooting.md)
* [Additional resources](#additional-resources)

## Background

This extension functions by shelling out to a number of command-line tools. This introduces complexity, as each feature is provided by a different tool. Language servers enable all editors to support all programming languages without these individualized tools. They also provide speed improvements, as they can cache and reuse results.

[`gopls`] is the official Go language server. Using [`gopls`] will enable the VS Code Go extension to provide high-quality Go support as the language evolves.

To learn more about the context behind [`gopls`], you can watch the [Go pls, stop breaking my editor](https://www.youtube.com/watch?v=EFJfdWzBHwE) talk at GopherCon 2019.

## Enable the language server

To start using the language server, set [`"go.useLanguageServer": true`](settings.md#go.useLanguageServer) in your VS Code Go settings.

You should see a prompt to install `gopls`. If you do not see a prompt, please run the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command and select `gopls`.

### Automatic updates

The `gopls` team releases new versions of `gopls` approximately once a month ([release notes](https://github.com/golang/go/issues/33030)). The Go extension will automatically detect that a new version has been released, and a pop-up will appear prompting you to update.

If you would like to opt-out of these updates, set [`"go.useGoProxyToCheckForToolUpdates"`](settings.md#go.useGoProxyToCheckForToolUpdates) to `false`.

## Configuration

There are a number of VS Code Go settings for controlling the language server.

* [`"go.languageServerExperimentalFeatures"`](settings.md#go.languageServerExperimentalFeatures) allows you to disable certain features.
  * `"diagnostics": false` disables diagnostic warnings from `gopls`. You might want to disable these if you don't like the diagnostics changing as you type.
  * `"documentLink": false` disables document links. The reason to disable these is explained in [golang/go#39065](https://github.com/golang/go/issues/39065): the Ctrl+Click shortcut for clicking on a link collides with the Ctrl+Click shortcut for go-to-definition.
* [`"go.languageServerFlags"`](settings.md#go.languageServerFlags) allows you to pass flags to the `gopls` process.
  * The `-rpc.trace` flag enables verbose debug logging.

### Ignored settings

A number of the extension's settings are not passed in to `gopls`. We are working on unifying all of the settings, but some may still be ignored. These include:

* [`"go.buildFlags"`](settings.md#go.buildFlags)

These configurations can be passed to `gopls` via your environment or the `gopls.env` setting. Learn more in the [`gopls` VS Code documentation](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md#build-tags).

### `gopls` settings block

`gopls` exposes much more [configuration](https://github.com/golang/tools/blob/master/gopls/doc/settings.md). However, because [`gopls`] is in a state of rapid development and change, these settings change frequently. Therefore, we have not yet built these settings into the Go extension.

As shown in the [`gopls` VS Code user guide](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md), you can still configure these settings through VS Code by adding a `"gopls"` block to your `settings.json` file (Command Palette -> Preferences: Open Settings (JSON)). **You will see an `Unknown Configuration Setting` warning, but the settings will still work.** Add any settings there, and `gopls` will warn you if they are incorrect, unknown, or deprecated.

A full list of `gopls` settings is available in the [`gopls` settings documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md).

## Additional resources

If you encounter an issue while using [`gopls`], take a look at these resources:

* [VS Code user guide](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md)
* [Known issues](https://github.com/golang/tools/blob/master/gopls/doc/status.md#known-issues)
* [Troubleshooting](https://github.com/golang/tools/blob/master/gopls/doc/troubleshooting.md)
* [`gopls` issue tracker](https://github.com/golang/go/issues?q=is%3Aissue+is%3Aopen+label%3Agopls)

If you are unable to resolve your issue, please ask for help. Make sure to mention that you are using `gopls`. Here's how to ask for guidance:

* [File a VS Code Go issue](https://github.com/golang/vscode-go/issues/new/choose). If it is a bug in `gopls`, we will transfer your issue to the [`gopls` issue tracker](https://github.com/golang/go/issues).
* [File a `gopls` issue](https://github.com/golang/go/issues/new) directly.
* Ask a question in the `#gopls` channel on [Gophers Slack].
* Ask a question in the `#vscode` channel on [Gophers Slack].

[Go modules]: https://blog.golang.org/using-go-modules
[`gopls`]: https://golang.org/s/gopls
[Gophers Slack]: https:/gophers.slack.com/
