/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import { sanitizeGoplsTrace } from '../../src/goLanguageServer';

suite('gopls issue report tests', () => {
	test('sanitize user trace', () => {
		interface TestCase {
			name: string;
			in: string;
			want: string;
		}
		const testCases: TestCase[] = [
			{
				name: `panic trace`,
				in: traceFromIssueGo41435,
				want: sanitizedTraceFromIssueGo41435
			},
			{
				name: `initialization error message`,
				in: traceFromIssueVSCodeGo572,
				want: sanitizedTraceFromIssuVSCodeGo572
			},
			{
				name: `incomplete panic trace`,
				in: `panic: \nsecret\n`,
				want: ''
			},
			{
				name: `incomplete initialization error message`,
				in: `Secret Starting client failed.\nAnoter Secret\n`,
				want: ''
			}
		];

		testCases.map((tc: TestCase) => {
			const out = sanitizeGoplsTrace(tc.in);
			assert.strictEqual(out, tc.want, `sanitizeGoplsTrace(${tc.name}) returned unexpected results`);
		});

	});
});

const traceFromIssueGo41435 = `
[Info - 12:50:16 PM] 2020/09/16 12:50:16 go env for /Users/Gopher/go/src/project
(root /Users/Gopher/go/src/project)
(valid build configuration = true)
(build flags: [])
GONOSUMDB=
GOPROXY=http://172.26.1.9:5000
GOROOT=/opt/local/lib/go
GOSUMDB=off
GOCACHE=/Users/Gopher/Library/Caches/go-build
GOMODCACHE=
GOPRIVATE=
GO111MODULE=
GOINSECURE=
GOPATH=/Users/Gopher/go
GOFLAGS=
GOMOD=
GONOPROXY=

[Info - 12:50:16 PM] 2020/09/16 12:50:16 go/packages.Load
snapshot=0
directory=/Users/Gopher/go/src/project
query=[./... builtin]
packages=2

[Info - 12:50:16 PM] 2020/09/16 12:50:16 go/packages.Load
snapshot=1
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=0

[Error - 12:50:16 PM] 2020/09/16 12:50:16 reloadOrphanedFiles: failed to load: no packages returned: packages.Load error
query=[file:///Users/Gopher/go/src/project/main.go]

[Info - 12:50:16 PM] 2020/09/16 12:50:16 go/packages.Load
snapshot=1
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=0

[Error - 12:50:16 PM] 2020/09/16 12:50:16 DocumentSymbols failed: getting file for DocumentSymbols: no packages returned: packages.Load error
URI=file:///Users/Gopher/go/src/project/main.go

[Info - 12:50:16 PM] 2020/09/16 12:50:16 go/packages.Load
snapshot=1
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=0

[Error - 12:50:16 PM] 2020/09/16 12:50:16 failed to compute document links: no packages returned: packages.Load error
URI=file:///Users/Gopher/go/src/project/main.go

[Info - 12:50:18 PM] 2020/09/16 12:50:18 go/packages.Load
snapshot=2
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:18 PM] 2020/09/16 12:50:18 go/packages.Load
snapshot=2
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:18 PM] 2020/09/16 12:50:18 go/packages.Load
snapshot=2
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:18 PM] 2020/09/16 12:50:18 go/packages.Load
snapshot=2
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Error - 12:50:19 PM] Request textDocument/completion failed.
Message: invalid pos
Code: 0
[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=10
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=10
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=10
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=10
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=11
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=11
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=11
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=11
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=12
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=12
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=12
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=12
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=13
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=13
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=13
package_path="command-line-arguments"
files=[/Users/Gopher/go/src/project/main.go]

[Info - 12:50:20 PM] 2020/09/16 12:50:20 go/packages.Load
snapshot=13
directory=/Users/Gopher/go/src/project
query=[file=/Users/Gopher/go/src/project/main.go]
packages=1

[Info - 12:50:26 PM] 2020/09/16 12:50:26 go/packages.Load
snapshot=17
directory=/Users/Gopher/go/src/project
query=[./... builtin]
packages=2

panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x20 pc=0x16cc8a8]

goroutine 1011 [running]:
golang.org/x/tools/internal/lsp/mod.vendorLens(0x1ae5540, 0xc000385480, 0x1af9ac0, 0xc0007c8dc0, 0x277eae8, 0xc000504f80, 0xc00032ff80, 0xc000332600, 0xb, 0x10, ...)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/mod/code_lens.go:129 +0x158
golang.org/x/tools/internal/lsp.(*Server).codeLens(0xc0002d72c0, 0x1ae5540, 0xc000385480, 0xc0006eaab0, 0x0, 0x0, 0x0, 0x0, 0x0)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/code_lens.go:38 +0x4a1
golang.org/x/tools/internal/lsp.(*Server).CodeLens(0xc0002d72c0, 0x1ae5540, 0xc000385480, 0xc0006eaab0, 0xc0006eaab0, 0x0, 0x0, 0xc0007e87c0, 0x1ae5600)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/server_gen.go:16 +0x4d
golang.org/x/tools/internal/lsp/protocol.serverDispatch(0x1ae5540, 0xc000385480, 0x1b009e0, 0xc0002d72c0, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0x0, 0x0)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/protocol/tsserver.go:325 +0x263d
golang.org/x/tools/internal/lsp/protocol.ServerHandler.func1(0x1ae5540, 0xc000385480, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0xbfd08444a6de7080)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/protocol/protocol.go:63 +0xc0
golang.org/x/tools/internal/lsp/lsprpc.handshaker.func1(0x1ae5540, 0xc000385480, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0x0)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/lsp/lsprpc/lsprpc.go:557 +0x420
golang.org/x/tools/internal/jsonrpc2.MustReplyHandler.func1(0x1ae5540, 0xc000385480, 0xc000445080, 0x1ae5780, 0xc0003853c0, 0xc0002a04b7, 0x20)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/jsonrpc2/handler.go:35 +0xd3
golang.org/x/tools/internal/jsonrpc2.AsyncHandler.func1.2(0xc00021ac60, 0xc0007b7980, 0xc000326d20, 0x1ae5540, 0xc000385480, 0xc000445080, 0x1ae5780, 0xc0003853c0)
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/jsonrpc2/handler.go:103 +0x86
created by golang.org/x/tools/internal/jsonrpc2.AsyncHandler.func1
/Users/Gopher/go/pkg/mod/golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940/internal/jsonrpc2/handler.go:100 +0x171
[Info - 12:50:26 PM] Connection to server got closed. Server will restart.
[Error - 12:50:26 PM] Request textDocument/codeLens failed.
Error: Connection got disposed.
at Object.dispose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:13824:25)
at Object.dispose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:10459:35)
at LanguageClient.handleConnectionClosed (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:12694:42)
at LanguageClient.handleConnectionClosed (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:70282:15)
at closeHandler (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:12681:18)
at CallbackList.invoke (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24072:39)
at Emitter.fire (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24131:36)
at closeHandler (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:13160:26)
at CallbackList.invoke (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24072:39)
at Emitter.fire (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24131:36)
at StreamMessageReader.fireClose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:28055:27)
at Socket. (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:28095:46)
at Socket.emit (events.js:208:15)
at Pipe. (net.js:588:12)
[Error - 12:50:26 PM] Request textDocument/foldingRange failed.
Error: Connection got disposed.
at Object.dispose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:13824:25)
at Object.dispose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:10459:35)
at LanguageClient.handleConnectionClosed (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:12694:42)
at LanguageClient.handleConnectionClosed (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:70282:15)
at closeHandler (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:12681:18)
at CallbackList.invoke (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24072:39)
at Emitter.fire (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24131:36)
at closeHandler (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:13160:26)
at CallbackList.invoke (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24072:39)
at Emitter.fire (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:24131:36)
at StreamMessageReader.fireClose (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:28055:27)
at Socket. (/Users/Gopher/.vscode/extensions/golang.go-0.16.2/dist/goMain.js:28095:46)
at Socket.emit (events.js:208:15)
at Pipe. (net.js:588:12)
[Info - 12:50:26 PM] 2020/09/16 12:50:26 Build info
golang.org/x/tools/gopls v0.5.0
golang.org/x/tools/gopls@v0.5.0 h1:XEmO9RylgmaXp33iGrWfCGopVYDGBmLy+KmsIsfIo8Y=
github.com/BurntSushi/toml@v0.3.1 h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ=
github.com/google/go-cmp@v0.5.1 h1:JFrFEBb2xKufg6XkJsJr+WbKb4FQlURi5RUcBveYu9k=
github.com/sergi/go-diff@v1.1.0 h1:we8PVUC3FE2uYfodKH/nBHMSetSfHDR6scGdBi+erh0=
golang.org/x/mod@v0.3.0 h1:RM4zey1++hCTbCVQfnWeKs9/IEsaBLA8vTkd0WVtmH4=
golang.org/x/sync@v0.0.0-20200625203802-6e8e738ad208 h1:qwRHBd0NqMbJxfbotnDhm2ByMI1Shq4Y6oRJo21SGJA=
golang.org/x/tools@v0.0.0-20200914163123-ea50a3c84940 h1:151ExL+g/k/wnhOqV+O1OliaTi0FR2UxQEEcpAhzzw8=
golang.org/x/xerrors@v0.0.0-20200804184101-5ec99f83aff1 h1:go1bK/D/BFZV2I8cIQd1NKEZ+0owSTG1fDTci4IqFcE=
honnef.co/go/tools@v0.0.1-2020.1.5 h1:nI5egYTGJakVyOryqLs1cQO5dO0ksin5XXs2pspk75k=
mvdan.cc/gofumpt@v0.0.0-20200802201014-ab5a8192947d h1:t8TAw9WgTLghti7RYkpPmqk4JtQ3+wcP5GgZqgWeWLQ=
mvdan.cc/xurls/v2@v2.2.0 h1:NSZPykBXJFCetGZykLAxaL6SIpvbVy/UFEniIfHAa8A=`;

const sanitizedTraceFromIssueGo41435 = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x20 pc=0x16cc8a8]

goroutine 1011 [running]:
golang.org/x/tools/internal/lsp/mod.vendorLens(0x1ae5540, 0xc000385480, 0x1af9ac0, 0xc0007c8dc0, 0x277eae8, 0xc000504f80, 0xc00032ff80, 0xc000332600, 0xb, 0x10, ...)
  code_lens.go:129 +0x158
golang.org/x/tools/internal/lsp.(*Server).codeLens(0xc0002d72c0, 0x1ae5540, 0xc000385480, 0xc0006eaab0, 0x0, 0x0, 0x0, 0x0, 0x0)
  code_lens.go:38 +0x4a1
golang.org/x/tools/internal/lsp.(*Server).CodeLens(0xc0002d72c0, 0x1ae5540, 0xc000385480, 0xc0006eaab0, 0xc0006eaab0, 0x0, 0x0, 0xc0007e87c0, 0x1ae5600)
  server_gen.go:16 +0x4d
golang.org/x/tools/internal/lsp/protocol.serverDispatch(0x1ae5540, 0xc000385480, 0x1b009e0, 0xc0002d72c0, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0x0, 0x0)
  tsserver.go:325 +0x263d
golang.org/x/tools/internal/lsp/protocol.ServerHandler.func1(0x1ae5540, 0xc000385480, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0xbfd08444a6de7080)
  protocol.go:63 +0xc0
golang.org/x/tools/internal/lsp/lsprpc.handshaker.func1(0x1ae5540, 0xc000385480, 0xc0006eaa80, 0x1ae5780, 0xc0003853c0, 0x0, 0x0)
  lsprpc.go:557 +0x420
golang.org/x/tools/internal/jsonrpc2.MustReplyHandler.func1(0x1ae5540, 0xc000385480, 0xc000445080, 0x1ae5780, 0xc0003853c0, 0xc0002a04b7, 0x20)
  handler.go:35 +0xd3
golang.org/x/tools/internal/jsonrpc2.AsyncHandler.func1.2(0xc00021ac60, 0xc0007b7980, 0xc000326d20, 0x1ae5540, 0xc000385480, 0xc000445080, 0x1ae5780, 0xc0003853c0)
  handler.go:103 +0x86
created by golang.org/x/tools/internal/jsonrpc2.AsyncHandler.func1
  handler.go:100 +0x171
[Info - 12:50:26 PM] `;

const traceFromIssueVSCodeGo572 = `

[Error - 下午9:23:45] Starting client failed
Message: unsupported URI scheme: (gopls only supports file URIs)
Code: 0
[Info - 下午9:23:45] 2020/08/25 21:23:45 server shutdown without initialization

`;

const sanitizedTraceFromIssuVSCodeGo572 = `Starting client failed
Message: unsupported URI scheme: (gopls only supports file URIs)
Code: 0`;
