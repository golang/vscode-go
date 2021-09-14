/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-prototype-builtins */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { Memento } from 'vscode';

export class MockMemento implements Memento {
	// _value must be named this way in order to match vscode's memento
	private _value: Record<string, {}> = {};

	public get(key: any, defaultValue?: any): any;
	public get<T>(key: string, defaultValue?: T): T {
		const exists = this._value.hasOwnProperty(key);
		return exists ? this._value[key] : (defaultValue! as any);
	}

	public update(key: string, value: any): Thenable<void> {
		this._value[key] = value;
		return Promise.resolve();
	}
	public clear() {
		this._value = {};
	}

	keys(): readonly string[] {
		return Object.keys(this._value);
	}
}
