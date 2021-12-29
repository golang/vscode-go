/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import {
	getMementoKeys,
	getWorkspaceState,
	resetItemsState,
	setWorkspaceState,
	updateWorkspaceState
} from '../../src/stateUtils';
import { MockMemento } from '../mocks/MockMemento';

suite('Workspace State Modification Tests', () => {
	let defaultMemento: vscode.Memento;

	setup(async () => {
		defaultMemento = getWorkspaceState();
	});

	teardown(async () => {
		setWorkspaceState(defaultMemento);
	});

	test('test getMementoKeys', () => {
		interface TestCase {
			keys: string[];
			values: any[];
			want: string[];
		}
		const testCases: TestCase[] = [
			{ keys: [], values: [], want: [] },
			{ keys: ['hello'], values: [false], want: ['hello'] },
			{ keys: ['hello', 'goodbye'], values: [false, 25], want: ['hello', 'goodbye'] }
		];

		testCases.forEach((tc) => {
			setWorkspaceState(new MockMemento());

			const keys = tc.keys;
			const values = tc.values;
			assert.strictEqual(keys.length, values.length, 'List of keys and values does not have same length');

			for (let i = 0; i < keys.length; i++) {
				updateWorkspaceState(keys[i], values[i]);
			}

			const got = getMementoKeys(getWorkspaceState());
			const want = tc.want;

			assert.strictEqual(got.length, tc.want.length);
			got.forEach((key) => {
				assert.ok(want.includes(key));
			});
		});
	});

	test('test resetItemsState', () => {
		interface TestCase {
			keys: string[];
			values: any[];
			items: string[];
			want: string[];
		}
		const testCases: TestCase[] = [
			{ keys: [], values: [], items: undefined, want: [] },
			{ keys: ['hello'], values: [false], items: undefined, want: ['hello'] },
			{ keys: ['hello', 'goodbye'], values: [false, 25], items: undefined, want: ['hello', 'goodbye'] },

			{ keys: [], values: [], items: [], want: [] },
			{ keys: ['hello'], values: [false], items: [], want: ['hello'] },
			{ keys: ['hello', 'goodbye'], values: [false, 25], items: [], want: ['hello', 'goodbye'] },

			{ keys: ['hello'], values: [false], items: ['hello'], want: [] },
			{ keys: ['hello', 'goodbye'], values: [false, 25], items: ['hello'], want: ['goodbye'] },

			{ keys: ['hello'], values: [false], items: ['hello'], want: [] },
			{ keys: ['hello', 'goodbye'], values: [false, 25], items: ['hello', 'goodbye'], want: [] }
		];

		testCases.forEach((tc) => {
			setWorkspaceState(new MockMemento());

			const keys = tc.keys;
			const values = tc.values;
			assert.strictEqual(keys.length, values.length, 'List of keys and values does not have same length');

			for (let i = 0; i < keys.length; i++) {
				updateWorkspaceState(keys[i], values[i]);
			}

			resetItemsState(tc.items, updateWorkspaceState);
			const got = getMementoKeys(getWorkspaceState());
			const want = tc.want;

			assert.strictEqual(got.length, want.length);
			got.forEach((key) => {
				assert.ok(want.includes(key));
			});
		});
	});
});
