/* eslint-disable no-useless-escape */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs');

function stripBOM(s: string): string {
	if (s && s[0] === '\uFEFF') {
		s = s.substring(1);
	}
	return s;
}

/**
 * Returns the environment variable collection created by parsing the given .env file.
 * Each line in the .env file is expected to be in the format `KEY=VALUE` or `export KEY=VALUE`.
 * Keys can contain alphanumeric characters, periods, and hyphens.
 * Values can be optionally enclosed in single or double quotes. Double-quoted values support `\n` for newlines.
 * Environment variable substitution using `${VAR}` syntax is also supported within values.
 */
export async function parseEnvFile(envFilePath: string, globalVars?: NodeJS.Dict<string>): Promise<{ [key: string]: string }> {
	const env: { [key: string]: string } = {};
	if (!envFilePath) {
		return env;
	}
	if (!globalVars) {
		globalVars = {};
	}

	try {
		// Read file asynchronously to avoid blocking the UI
		const buffer = stripBOM(await fs.promises.readFile(envFilePath, 'utf8'));
		buffer.split('\n').forEach((line) => {
			const r = line.match(/^\s*(export\s+)?([\w\.\-]+)\s*=\s*(.*)?\s*$/);
			if (r !== null) {
				let value = r[3] || '';
				if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
					value = value.replace(/\\n/gm, '\n');
				}
				const v = value.replace(/(^['"]|['"]$)/g, '');
				env[r[2]] = substituteEnvVars(v, env, globalVars!);
			}
		});
		return env;
	} catch (e) {
		throw new Error(`Cannot load environment variables from file ${envFilePath}: ${e}`);
	}
}

// matches ${var} where var is alphanumeric starting with a letter.
const SUBST_REGEX = /\${([a-zA-Z]\w*)?([^}\w].*)?}/g;

function substituteEnvVars(
	value: string,
	localVars: { [key: string]: string },
	globalVars: NodeJS.Dict<string>
): string {
	let invalid = false;
	let replacement = value;
	replacement = replacement.replace(SUBST_REGEX, (match, substName, bogus, offset, orig) => {
		if (offset > 0 && orig[offset - 1] === '\\') {
			return match;
		}
		if ((bogus && bogus !== '') || !substName || substName === '') {
			invalid = true;
			return match;
		}
		return localVars[substName] || globalVars[substName] || '';
	});
	if (!invalid && replacement !== value) {
		value = replacement;
	}

	return value.replace(/\\\$/g, '$');
}

export async function parseEnvFiles(
	envFiles: string[] | string | undefined,
	globalVars?: NodeJS.Dict<string>
): Promise<{ [key: string]: string }> {
	const fileEnvs = [];
	if (typeof envFiles === 'string') {
		fileEnvs.push(await parseEnvFile(envFiles, globalVars));
	}
	if (Array.isArray(envFiles)) {
		for (const envFile of envFiles) {
			fileEnvs.push(await parseEnvFile(envFile, globalVars));
		}
	}
	return Object.assign({}, ...fileEnvs);
}
