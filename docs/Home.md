## 📣 News and Upcoming Changes

[Remote attach debugging](./debugging#connecting-to-headless-delve-with-target-specified-at-server-start-up) is now available via Delve's native DAP implementation with Delve v1.7.3 or newer.
We plan to enable this as the default in 2022 H1 to enhance remote debugging with the same
[debugging features](./debugging.md) that are already in use for local debugging.
We recommend switching your remote attach configurations in `launch.json` to use
`"debugAdapter":"dlv-dap"` now to verify that this works for you.
Please [file a new issue](https://github.com/golang/vscode-go/issues/new/choose) if you encounter any problems.
