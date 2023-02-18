type ParseError = string

/**
 * Parses an argument string with shell-like semantics into a list of arguments.
 * Returns an error only if the argument string is malformed.
 * 
 * - Whitespace is treated as the word separator.
 * - Each word is treated as an argument to be passed to the invocation process.
 * - Single-quotes and double-quotes can be used to escape whitespace characters as literals.
 * - Null arguments ("" or '') are retained and passed as empty strings.
 *   When a null argument appears as part of a non-null argument, the null argument is removed.
 *   That is, the word -d'' or ''-d becomes -d after word splitting and null argument removal.
 * @param args The string containing arguments to be parsed.
 */
export function parseArgsString(args: string): string[] | ParseError {
	let result: string[] = [];
	let word: string = "";
	let bufferedWord: boolean = false;

	for (let i = 0; i < args.length;) {
		if (args[i] == "'") {
			let j = i + 1;
			for (; j < args.length && args[j] != "'"; j++) {
			}
			if (j >= args.length) {
				return "args string has unmatched single quotes ('). starting index: " + i
			}

			bufferedWord = true;
			word += args.slice(i + 1, j);
			i = j + 1;
		} else if (args[i] == '"') {
			let j = i + 1;
			for (; j < args.length && args[j] != '"'; j++) {
			}
			if (j >= args.length) {
				return "args string has unmatched double quotes (\"). starting index: " + i
			}

			bufferedWord = true;
			word += args.slice(i + 1, j);
			i = j + 1;
		} else if (args[i] != ' ') {
			let j = i + 1;
			for (; j < args.length
				&& args[j] != ' ' && args[j] != "'" && args[j] != '"'; j++) {
			}

			bufferedWord = true;
			word += args.slice(i, j);
			i = j;
		} else if (bufferedWord) { // also true that args[i] == ' '
			result.push(word);
			word = "";
			bufferedWord = false;
		} else { // args[i] == ' '
			i++
		}
	}

	if (bufferedWord) {
		result.push(word);
	}

	return result;
}