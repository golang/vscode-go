# Vendored dependencies

third_party directory contains code from the third party including
vendored modules that need local modifications (e.g. bug fixes or
necessary enhancement before they are incorporated and released
in the upstream). Every directory must contain LICENSE files.

The vendored node modules still need to be specified in the dependencies.
For example, after copying the `tree-kill` module to this directory
and applying necessary local modification, run from the root of this
project directory:

```
$ npm install --save ./third_party/tree-kill

```

This will update `package.json` and `package-lock.json` to point to
the local dependency.

Note: We didn't test vendoring platform-dependent modules yet.


## List of local modification

`tree-kill`: vendored 1.2.2 with a fix for https://github.com/golang/vscode-go/issues/90 
