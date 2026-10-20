module github.com/golang/vscode-go/extension

go 1.26.0

require (
	github.com/golang/vscode-go v0.59.0
	github.com/google/go-cmp v0.7.0
)

require github.com/google/pprof v0.0.0-20261016150608-1facf8f91b50 // indirect

require (
	golang.org/x/mod v0.42.0
	golang.org/x/sys v0.49.0 // indirect
	golang.org/x/telemetry v0.0.0-20261020154912-7bf0a11256d5 // indirect
)

// For development, use the vscgo in the same repo.
// This go.mod file is excluded when packaging .vsix.
replace github.com/golang/vscode-go => ../
