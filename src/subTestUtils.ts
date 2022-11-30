/**
 * Escapes the subtest target name for the given test and subtest names.
 *
 * This function generates a name that matches a specific test by following Go
 * regexp rules for `go test -run` argument. Specifically it escapes slashes,
 * replaces whitespaces with underscores and wraps everything else with literal
 * escape sequences.
 *
 * @param testFuncName Name of the parent test function, e.g. "TestTask"
 * @param subTestName Name of the subtest, e.g. "GET /path/:id"
 */
export function escapeSubTestName(testFuncName: string, subTestName: string): string {
	return `${testFuncName}/${subTestName}`
		.replace(/\s/g, '_')
		.split('/')
		.map((part) => `\\Q${part}\\E`, '')
		.join('$/^');
}
