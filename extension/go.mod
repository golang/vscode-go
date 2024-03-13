module github.com/golang/vscode-go/extension

go 1.21

require (
	github.com/golang/vscode-go v0.0.0-00010101000000-000000000000
	github.com/google/go-cmp v0.6.0
	github.com/stamblerre/work-stats v0.0.0-20221215212512-f2f2cf51e506
	golang.org/x/build v0.0.0-20240104151245-5535e355572c
)

require (
	cloud.google.com/go/compute v1.23.0 // indirect
	cloud.google.com/go/compute/metadata v0.2.3 // indirect
	github.com/golang/groupcache v0.0.0-20210331224755-41bb18bfe9da // indirect
	github.com/golang/protobuf v1.5.3 // indirect
	github.com/google/go-github v17.0.0+incompatible // indirect
	github.com/google/go-querystring v1.1.0 // indirect
	github.com/google/s2a-go v0.1.4 // indirect
	github.com/google/uuid v1.3.0 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.2.5 // indirect
	github.com/googleapis/gax-go/v2 v2.12.0 // indirect
	github.com/gregjones/httpcache v0.0.0-20180305231024-9cad4c3443a7 // indirect
	github.com/stamblerre/sheets v0.0.0-20220322044539-54bdb620f700 // indirect
	go.opencensus.io v0.24.0 // indirect
	go4.org v0.0.0-20180809161055-417644f6feb5 // indirect
	golang.org/x/crypto v0.16.0 // indirect
	golang.org/x/exp v0.0.0-20230809094429-853ea248256d // indirect
	golang.org/x/mod v0.14.0 // indirect
	golang.org/x/net v0.19.0 // indirect
	golang.org/x/oauth2 v0.15.0 // indirect
	golang.org/x/sync v0.5.0 // indirect
	golang.org/x/sys v0.16.0 // indirect
	golang.org/x/telemetry v0.0.0-20240116212745-88e2d1c7f9a2 // indirect
	golang.org/x/text v0.14.0 // indirect
	golang.org/x/time v0.5.0 // indirect
	google.golang.org/api v0.136.0 // indirect
	google.golang.org/appengine v1.6.8-0.20221117013220-504804fb50de // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20230807174057-1744710a1577 // indirect
	google.golang.org/grpc v1.58.3 // indirect
	google.golang.org/protobuf v1.33.0 // indirect
)

// For development, use the vscgo in the same repo.
// This go.mod file is excluded when packaging .vsix.
replace github.com/golang/vscode-go => ../
