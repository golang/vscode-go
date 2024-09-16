# Experiments

Pre-release versions of [vscode-go][vscode-go] include experimental features.
These features may be individually enabled or disabled via the setting
`go.experiments`.

[vscode-go]: https://github.com/golang/vscode-go/blob/master/README.md#pre-release-versions

## Test explorer

[Go Companion][exp-vscode-go] includes an experimental test explorer
implementation based on `gopls`'s test discovery. This requires gopls v0.17.0 or
newer. If Go Companion is present and vscode-go is a pre-release version,
vscode-go will prefer Go Companion's test explorer, disabling its own, unless
the experiment is set to `off`. The experimental test explorer provides more
robust test discovery by using gopls, including static discovery of _some_
subtests. It also implements:

- Ignore tests within files excluded by `files.exclude` or
  `goExp.testExplorer.exclude`.
- Disable automatic discovery of tests by setting `goExp.testExplorer.discovery`
  to "off".
- Control how tests are displayed with `goExp.testExplorer.showFiles`,
  `goExp.testExplorer.nestPackages`, and `goExp.testExplorer.nestSubtests`.
- Debugging a test updates its status in the test explorer.
- Support for continuous runs.
- Support for code coverage.
- Code lenses (hidden by default) that are integrated with the test explorer.
- Integrated viewer for pprof profiles.

[exp-vscode-go]: https://marketplace.visualstudio.com/items?itemName=ethan-reesor.exp-vscode-go