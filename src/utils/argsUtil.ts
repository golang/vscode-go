type ParseError = string

const escapeAtEndError = "args string has escape character (\\) at the end of the string, with nothing to escape.";

/**
 * Parses an argument string with shell-like semantics into a list of arguments.
 * Returns an error only if the argument string is malformed.
 * 
 * - Whitespace is treated as the word separator.
 * - Each word is treated as an argument to be passed to the invocation process.
 * - Single-quotes and double-quotes can be used to escape whitespace characters as literals.
 * - A backslash followed by a quote can be used (\' or \") to escape quotes as literals.
 * - Null arguments ("" or '') are retained and passed as empty strings.
 *   When a null argument appears as part of a non-null argument, the null argument is removed.
 *   That is, the word -d'' or ''-d becomes -d after word splitting and null argument removal.
 * @param args The string containing arguments to be parsed.
 */
export function parseArgsString(args: string): string[] | ParseError {
	let resOrErr: string[] = [];
	let word: string = "";
	let bufferedWord: boolean = false;

	for (let i = 0; i < args.length;) {
		if (args[i] == "'") {
			let j = i + 1;
			let k = i + 1;
			for (; k < args.length && args[k] != "'";) {
				if (args[k] == '\\'
					&& k + 1 < args.length
					&& (args[k + 1] == "'" || args[k + 1] == '"')) {
					bufferedWord = true;
					// buffer everything up to this point
					word += args.slice(j, k)
					word += args.charAt(k + 1)

					j = k + 2
					k = k + 2
				} else {
					k++
				}
			}
			if (k >= args.length) {
				return "args string has unmatched single quotes ('). starting index: " + i
			}

			bufferedWord = true;
			word += args.slice(j, k);
			i = k + 1;
		} else if (args[i] == '"') {
			let j = i + 1;
			let k = i + 1;
			for (; k < args.length && args[k] != '"';) {
				if (args[k] == '\\'
					&& k + 1 < args.length
					&& (args[k + 1] == "'" || args[k + 1] == '"')) {
					bufferedWord = true;
					// buffer everything up to this point
					word += args.slice(j, k)
					word += args.charAt(k + 1)

					j = k + 2
					k = k + 2
				} else {
					k++;
				}
			}
			if (k >= args.length) {
				return 'args string has unmatched double quotes ("). starting index: ' + i
			}

			bufferedWord = true;
			word += args.slice(j, k);
			i = k + 1;
		} else if (args[i] == '\\'
			&& i + 1 < args.length
			&& (args[i + 1] == "'" || args[i + 1] == '"')) {
			bufferedWord = true;
			word += args.charAt(i + 1);
			i = i + 2;
		} else if (args[i] != ' ') {
			let j = i + 1;
			for (; j < args.length
				&& args[j] != ' '
				&& args[j] != "'"
				&& args[j] != '"'
				&& args[j] != '\\';
				j++) {
			}

			bufferedWord = true;
			word += args.slice(i, j);
			i = j;
		} else if (bufferedWord) { // also true that args[i] == ' '
			resOrErr.push(word);
			word = "";
			bufferedWord = false;
			i++;
		} else { // args[i] == ' '
			i++
		}
	}

	if (bufferedWord) {
		resOrErr.push(word);
	}

	return resOrErr;
}