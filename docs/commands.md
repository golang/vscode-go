# Settings and Commands

To view a complete list of the commands and settings for this extension:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension, click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll away.

<!--TODO(rstambler): This image needs to be updated.-->
![ext](https://user-images.githubusercontent.com/16890566/30246497-9d6cc588-95b0-11e7-87dd-4bd1b18b139f.gif)

## Settings

You can configure your settings by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings). To navigate to your settings, open the Command Palette (Ctrl+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

A list of popular and notable settings can be found here:

### docsTool

One of `"godoc"`, `"gogetdoc"`, or `"guru"` (`gogetdoc` is the default). This is the tool used by the [go to definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover) features. See more information about each of these tools in the [Documentation](tools.md#Documentation) section.

### formatTool

One of `"gofmt"`, `"goimports"`, `"goreturns"`, and `"goformat"` (`goreturns` is the default). This is the tool used by the [formatting and import organization](features.md#formatting-and-import-organization) features. See more information about each of these tools in the [Formatting](tools.md#Formatting) section.

### lintTool

One of `"golint"`, `"staticcheck"`, `"golangci-lint"`, and `"revive"` (`golint` is the default). This is the tool used by the [lint-on-save](features.md#lint-on-save) feature. See more information about each of these tools in the [Diagnostics](tools.md#Diagnostics) section.
