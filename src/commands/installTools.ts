/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { CommandFactory } from '.';
import { installAllTools, installTools as goInstallTools } from '../goInstallTools';
import { ToolAtVersion } from '../goTools';
import { getGoVersion } from '../util';

export const installTools: CommandFactory = () => {
	return async (args: ToolAtVersion[]) => {
		if (Array.isArray(args) && args.length) {
			const goVersion = await getGoVersion();
			await goInstallTools(args, goVersion);
			return;
		}
		await installAllTools();
	};
};
