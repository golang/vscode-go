/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

/**
 * MockWorkspaceConfiguration is a mock implementation of vscode.WorkspaceConfiguration.
 *
 * This class is designed for testing purposes to simulate the behavior of VSCode's
 * configuration system support both .get() and direct property access.
 * It allows tests to override specific configuration values with a Map, while
 * falling back to a provided base configuration for any values that are not
 * explicitly mocked. This provides a realistic testing environment where only
 * the relevant settings for a given test are changed.
 */
export class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
	private values: Map<string, any>;
	private baseConfig: vscode.WorkspaceConfiguration;

	/**
	 * Creates a mock WorkspaceConfiguration.
	 *
	 * This mock enables direct property access (e.g., `config['key']`) for the
	 * overridden `values`.
	 *
	 * **Note**: This direct access method will NOT fall back to the `baseConfig`.
	 * Only the `.get()` method is capable of checking the base configuration.
	 *
	 * @param baseConfig The fallback configuration.
	 * @param values A map of settings to override.
	 */
	constructor(baseConfig: vscode.WorkspaceConfiguration, values: Map<string, any> = new Map()) {
		this.baseConfig = baseConfig;
		this.values = values;

		// Manually copy all overridden values from the map onto the object itself.
		for (const [key, value] of this.values.entries()) {
			// We use 'as any' to allow adding arbitrary properties to the class instance.
			(this as any)[key] = value;
		}
	}

	public get<T>(section: string): T | undefined;
	public get<T>(section: string, defaultValue: T): T;
	public get(section: any, defaultValue?: any) {
		if (this.values.has(section)) {
			return this.values.get(section);
		}
		return this.baseConfig.get(section, defaultValue);
	}

	public has(section: string): boolean {
		return this.values.has(section) || this.baseConfig.has(section);
	}

	public inspect<T>(
		section: string
	): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined {
		if (this.values.has(section)) {
			return {
				key: section,
				globalValue: this.values.get(section)
			};
		}
		return this.baseConfig.inspect(section);
	}

	public update(section: string, value: any): Thenable<void> {
		this.values.set(section, value);
		return Promise.resolve();
	}
}
