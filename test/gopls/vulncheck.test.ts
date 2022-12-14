/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import path = require('path');
import vscode = require('vscode');
import { VulncheckOutputLinkProvider, VulncheckReport, writeVulns } from '../../src/goVulncheck';
import fs = require('fs');
import { CancellationTokenSource } from 'vscode-languageserver-protocol';

suite('writeVulns', () => {
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'vuln');

	function testWriteVulns(res: VulncheckReport | undefined | null, expected: string | RegExp[]) {
		const b = [] as string[];
		writeVulns(res, { appendLine: (str) => b.push(str + '\n') });
		const actual = b.join();
		if ('string' === typeof expected) {
			assert(actual.search(expected), `actual:\n${actual}\nwant:\n${expected}`);
		} else {
			// RegExp[]
			expected.forEach((want) => assert(actual.match(want), `actual:\n${actual}\nwanted:${want}`));
		}
	}

	function readData(fname: string) {
		const data = fs.readFileSync(fname);
		return JSON.parse(data.toString());
	}

	test('No vulnerability', () => testWriteVulns({}, 'No vulnerability found.\n'));
	test('Undefined result', () => testWriteVulns(undefined, 'Error - invalid vulncheck result.\n'));
	test('Nil result', () => testWriteVulns(null, 'Error - invalid vulncheck result.\n'));
	test('Vulns is undefined', () => testWriteVulns({ Vulns: undefined }, 'No vulnerability found.\n'));
	test('Vulns is empty', () => testWriteVulns({ Vulns: [] }, 'No vulnerability found.\n'));
	test('Modules is empty', () =>
		testWriteVulns({ Vulns: [{ OSV: { id: 'foo' }, Modules: [] }] }, 'No vulnerability found.\n'));
	test('Nonaffecting', () => {
		const vulns = readData(path.join(fixtureDir, 'vulncheck-result-unaffecting.json'));
		testWriteVulns(vulns, [
			/No vulnerability found\./s,
			/# The vulnerabilities below are in packages that you import,/s,
			/Found 1 unused vulnerability\./s,
			/GO-2022-1059 \(https:\/\/[^)]+\)/s,
			/Found Version: golang\.org\/x\/text@v0\.3\.7/s,
			/Fixed Version: golang\.org\/x\/text@v0\.3\.8/s,
			/Package: golang\.org\/x\/text\/language/s
		]);
	});
	test('Afffecting&Nonaffecting', () => {
		const vulns = readData(path.join(fixtureDir, 'vulncheck-result-affecting.json'));
		testWriteVulns(vulns, [
			/Found 1 affecting vulnerability\./s,
			/This is used/s, // details
			/Found Version: golang\.org\/x\/text@v0\.3\.5/,
			/Fixed Version: golang\.org\/x\/text@v0\.3\.7/,
			/- main\.go:15:29: module2\.main calls/,
			/\tmodule2.main\n/,
			/\t\t\(.*\/main.go:15\)\n/,
			/# The vulnerabilities below are in packages that you import,/s,
			/Found 1 unused vulnerability\./s,
			/GO-2022-1059 \(https:\/\/[^)]+\)/s,
			/Found Version: golang\.org\/x\/text@v0\.3\.5/s,
			/Fixed Version: golang\.org\/x\/text@v0\.3\.8/s,
			/Package: golang\.org\/x\/text\/language/s
		]);
	});
});

const vulncheckOutput = `
govulncheck ./... for file:///Users/foo/module3/go.mod
08:10:27 Loading packages...
08:10:28 Loaded 2 packages and their dependencies
08:10:30 Found 1 affecting vulns and 0 unaffecting vulns in imported packages

Found 1 affecting vulnerability.
--------------------------------------------------------------------------------
⚠ GO-2020-0040 (https://pkg.go.dev/vuln/GO-2020-0040)

Due to unchecked type assertions, maliciously crafted messages can cause panics, which may be used as a denial of service vector. (CVE-2020-36562)

Found Version: github.com/shiyanhui/dht@v0.0.0-20201219151056-5a20f3199263
Fixed Version: N/A

- lib/lib.go:28:21: module3/lib.Run$2 calls github.com/shiyanhui/dht.DHT.GetPeers
	module3/lib.Run
		(/home/user/module3/lib/lib.go:25)
	module3/lib.Run$2
		(/home/user/module3/lib/lib.go:28)`;

suite.only('VulncheckOutputLinkProvider', () => {
	let doc: vscode.TextDocument;
	let links: vscode.DocumentLink[] | undefined | null;

	suiteSetup(async () => {
		doc = await vscode.workspace.openTextDocument({ content: vulncheckOutput, language: 'govulncheck' });

		const p = new VulncheckOutputLinkProvider();
		const tokenSrc = new CancellationTokenSource();
		links = await p.provideDocumentLinks(doc, tokenSrc.token);
		tokenSrc.dispose();
	});

	function checkExist(word: string, targetPattern: RegExp, tooltip?: string) {
		assert(
			links?.some((link) => {
				const words = doc.getText(link.range);

				return (
					words.includes(word) &&
					// TODO(hyangah): test the full URI matching. Currently, we do partial checking
					// since behavior on windows needs more inspection.
					link.target?.toString().search(targetPattern) &&
					(!tooltip || link.tooltip === tooltip)
				);
			}),
			`failed to find ${word} ${targetPattern} ${tooltip || ''}\n${JSON.stringify(links)}`
		);
	}
	function checkNotExist(word: string) {
		assert(
			!links?.some((link) => {
				const words = doc.getText(link.range);
				return words === word;
			}),
			`got ${word} that shouldn't exist.\n${JSON.stringify(links)}`
		);
	}
	test('provides links', () => {
		assert(links, 'links are empty');
	});
	test('linkify relative file link', () => {
		checkExist('lib/lib.go:28:21', /module3.*lib.go#L28,21/);
	});
	test('linkify Found Version', () => {
		checkExist(
			'github.com/shiyanhui/dht@v0.0.0-20201219151056-5a20f3199263',
			/pkg\.go\.dev\/github\.com\//,
			'https://pkg.go.dev/github.com/shiyanhui/dht@v0.0.0-20201219151056-5a20f3199263'
		);
	});
	test('linkify Fixed Version', () => {
		checkNotExist('N/A');
	});
	test('linkify absolute paths', () => {
		checkExist('/home/user/module3/lib/lib.go', /lib.go#L28/);
	});
});
