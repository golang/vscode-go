# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings). To navigate to your settings, open the Command Palette (Ctrl+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

**NOTE: Many of these settings don't apply if you are using [`gopls`](gopls.md). Learn more about `gopls`-specific settings in this [documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md).**

## Latest changes

The settings described below are up-to-date as of June 2020. We do our best to keep documentation current, but if a setting is missing, you can always consult the full list in the Extensions view. Documentation for each setting should also be visible in the Settings UI.

To view the list of settings:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Settings`.

## Detailed list

A list of popular and notable settings can be found below.

* [docsTool](#docsTool)
* [formatTool](#formatTool)
* [lintTool](#lintTool)
* [lintFlags](#lintFlags)

### docsTool

One of `"godoc"`, `"gogetdoc"`, or `"guru"` (`gogetdoc` is the default). This is the tool used by the [go to definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover) features. See more information about each of these tools in the [Documentation](tools.md#Documentation) section.

### formatTool

One of `"gofmt"`, `"goimports"`, `"goreturns"`, and `"goformat"` (`goreturns` is the default). This is the tool used by the [formatting and import organization](features.md#formatting-and-import-organization) features. See more information about each of these tools in the [Formatting](tools.md#Formatting) section.

### lintTool

One of `"golint"`, `"staticcheck"`, `"golangci-lint"`, and `"revive"` (`golint` is the default). This is the tool used by the [lint-on-save](features.md#lint-on-save) feature. See more information about each of these tools in the [Diagnostics](tools.md#Diagnostics) section.

### lintFlags

This setting can be used to pass additional flags to your lint tool of choice.

Most linters can be configured via special configuration files, but you may still need to pass command-line flags. The configuration documentation for each supported linter is listed here:

* [`staticcheck`](https://staticcheck.io/docs/#configuration)
* [`golangci-lint`](https://golangci-lint.run/usage/configuration/)
* [`revive`](https://github.com/mgechev/revive#command-line-flags)

#### Examples

Enable all [`golangci-lint`] linters and only show errors in new code:

```json5
"go.lintFlags": ["--enable-all", "--new"]
```

Configure `revive` to exclude `vendor` directories and apply extra configuration with a `config.toml` file:

```json5
"go.lintFlags": [
    "-exclude=vendor/...",
    "-config=${workspaceFolder}/config.toml"
]
```

<!--TODO(rstambler): Automatically generate this list using the package.json.-->
