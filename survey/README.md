# Go Developer Survey Configuration

This Go module serves the configuration file for the Go Developer Survey shown in the [VS Code Go extension](https://github.com/golang/vscode-go).

## Purpose

This module exists solely to host the `config.json` file. By hosting it as a Go module, it can be fetched via module proxy, providing a reliable and secure way for the VS Code Go extension to get the latest survey configuration.

This approach is inspired by the Go team's telemetry configuration module.

## `config.json`

The `config.json` file defines the parameters for the Go Developer Survey. It has the following structure:

```json
{
  "StartDate": "2023-09-01T00:00:00Z",
  "EndDate": "2023-10-01T00:00:00Z",
  "URL": "https://google.com/survey/url"
}
```

-   `StartDate`: The ISO 8601 timestamp for when the survey promotion should start.
-   `EndDate`: The ISO 8601 timestamp for when the survey promotion should end.
-   `URL`: The URL to the survey.

## Usage

This module is not intended to be used as a library. It is fetched by the VS Code Go extension.

## Tagging

The versioning scheme follows semantic versioning, with each change to the configuration being a **minor** version increment.

As this module is in the `survey/` subdirectory of its repository, the git tag **must** be prefixed with `survey/`. This is a requirement for Go modules located in subdirectories. For more details, see the [Go Modules documentation](https://go.dev/ref/mod#vcs-version).

For example, if the most recent tag is `survey/v0.1.0`, the new tag should be `survey/v0.2.0`.

## Release Process

When changes are made to `config.json`, a new version of this module must be released. This is done by creating a new git tag that follows the convention described above.
