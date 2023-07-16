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
		s = s.substr(1);
	}
	return s;
}

/**
 * returns the environment variable collection created by parsing the given .env file.
 */
export function parseEnvFile(envFilePath: string, globalVars?: NodeJS.Dict<string>): { [key: string]: string } {
	const env: { [key: string]: string } = {};
	if (!envFilePath) {
		return env;
	}
	if (!globalVars) {
		globalVars = {};
	}

	try {
		const buffer = stripBOM(fs.readFileSync(envFilePath, 'utf8'));
		buffer.split('\n').forEach((line) => {
			const r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
			if (r !== null) {
				let value = r[2] || '';
				if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
					value = value.replace(/\\n/gm, '\n');
				}
				const v = value.replace(/(^['"]|['"]$)/g, '');
				env[r[1]] = substituteEnvVars(v, env, globalVars);
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

export function parseEnvFiles(
	envFiles: string[] | string | undefined,
	globalVars?: NodeJS.Dict<string>
): { [key: string]: string } {
	const fileEnvs = [];
	if (typeof envFiles === 'string') {
		fileEnvs.push(parseEnvFile(envFiles, globalVars));
	}
	if (Array.isArray(envFiles)) {
		envFiles.forEach((envFile) => {
			fileEnvs.push(parseEnvFile(envFile, globalVars));
		});
	}
	return Object.assign({}, ...fileEnvs);
}
