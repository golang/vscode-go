module github.com/golang/vscode-go/extension

go 1.26.0

require (
	github.com/golang/vscode-go v0.57.0
	github.com/google/go-cmp v0.7.0
)

require github.com/google/pprof v0.0.0-20260709232956-b9395ee17fa0 // indirect

require (
	golang.org/x/mod v0.38.0
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/telemetry v0.0.0-20260717140457-bdb89881bb75 // indirect
)

// For development, use the vscgo in the same repo.
// This go.mod file is excluded when packaging .vsix.
replace github.com/golang/vscode-go => ../
