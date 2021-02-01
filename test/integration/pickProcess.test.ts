/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import { AttachItem, compareByProcessId, mergeExecutableAttachItem, parseGoVersionOutput } from '../../src/pickProcess';
import { parseLsofProcesses } from '../../src/utils/lsofProcessParser';

suite('Pick Process Tests', () => {
	test('Parse go version output', () => {
		const tt = [
			{
				input: '/path/to/process/a: go1.16.2\n/path/to/process/b: go1.15.4\n/path/to/process/a b c: go1.8.0\n',
				want: [
					'/path/to/process/a',
					'/path/to/process/b',
					'/path/to/process/a b c',
				],
			},
			{
				input: 'C:\\path\\to\\process\\a: go1.16.2\nC:\\path\\to\\process\\b: go1.15.4\nC:\\path\\to\\process\\a b c: go1.8.0',
				want: [
					'C:\\path\\to\\process\\a',
					'C:\\path\\to\\process\\b',
					'C:\\path\\to\\process\\a b c',
				],
			},
			{
				input: 'go version go1.15.7 darwin/amd64',
				want: [],
			},

		];
		for (const tc of tt) {
			const got = parseGoVersionOutput(tc.input);
			assert.strictEqual(got.length, tc.want.length);
			for (let i = 0; i < got.length; i ++) {
				assert.strictEqual(got[i], tc.want[i]);
			}
		}
	});
	test('Parse lsof output', () => {
		const tt = [
			{
				input: `p1010
ftxt
n/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Renderer).app/Contents/MacOS/Code Helper (Renderer)
ftxt
n/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework
ftxt
n/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib
p2020
ftxt
n/User/name/go/bin/go`,
				want: [
					{
						id: '1010',
						executable: '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Renderer).app/Contents/MacOS/Code Helper (Renderer)'
					},
					{
						id: '2020',
						executable: '/User/name/go/bin/go'
					}

				],
			},
		];
		for (const tc of tt) {
			const got = parseLsofProcesses(tc.input);
			got.sort(compareByProcessId);
			assert.strictEqual(got.length, tc.want.length);
			for (let i = 0; i < got.length; i ++) {
				assert.strictEqual(got[i].id, tc.want[i].id);
				assert.strictEqual(got[i].executable, tc.want[i].executable);
			}
		}
	});

	test('Merge processes', () => {
		const tt: {
			processes: AttachItem[];
			execInfo: AttachItem[];
			want: AttachItem[];
		}[] = [
			{
				processes: [
					{
						id: '100',
						processName: 'a',
						label: 'a'
					},
					{
						id: '50',
						processName: 'b',
						label: 'b'
					},
					{
						id: '130',
						processName: 'b',
						label: 'b'
					},
					{
						id: '300',
						processName: 'c',
						label: 'c'
					}
				],
				execInfo: [
					{
						id: '50',
						label: '',
						executable: '/path/to/b',
					},
					{
						id: '300',
						label: '',
						executable: '/path/to/c',
					}
				],

				want: [
					{
						id: '50',
						processName: 'b',
						label: 'b',
						executable: '/path/to/b',
					},
					{
						id: '100',
						processName: 'a',
						label: 'a'
					},
					{
						id: '130',
						processName: 'b',
						label: 'b'
					},
					{
						id: '300',
						processName: 'c',
						label: 'c',
						executable: '/path/to/c',
					}
				],
			},
		];
		for (const tc of tt) {
			mergeExecutableAttachItem(tc.processes, tc.execInfo);
			tc.processes.sort(compareByProcessId);
			assert.strictEqual(tc.processes.length, tc.want.length);
			for (let i = 0; i < tc.processes.length; i ++) {
				assert.strictEqual(tc.processes[i].id, tc.want[i].id);
				assert.strictEqual(tc.processes[i].label, tc.want[i].label);
				assert.strictEqual(tc.processes[i].processName, tc.want[i].processName);
				assert.strictEqual(tc.processes[i].executable, tc.want[i].executable);
			}
		}
	});
});
