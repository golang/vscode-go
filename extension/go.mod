module github.com/golang/vscode-go/extension

go 1.23.1

require (
	github.com/golang/vscode-go v0.0.0-00010101000000-000000000000
	github.com/google/go-cmp v0.6.0
)

require (
	golang.org/x/mod v0.20.0
	golang.org/x/sys v0.22.0 // indirect
	golang.org/x/telemetry v0.0.0-20240712210958-268b4a8ec2d7 // indirect
)

// For development, use the vscgo in the same repo.
// This go.mod file is excluded when packaging .vsix.
replace github.com/golang/vscode-go => ../
