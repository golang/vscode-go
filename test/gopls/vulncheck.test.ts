/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import path = require('path');
import { VulncheckReport, writeVulns } from '../../src/goVulncheck';
import fs = require('fs');

suite('vulncheck output', () => {
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
