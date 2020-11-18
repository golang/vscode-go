// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// This command updates the gopls.* configurations in vscode-go package.json.
//
//   Usage: from the project root directory,
//      $ go run tools/goplssetting -in ./package.json -out ./package.json
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"sort"
	"strings"
)

var (
	inPkgJSON  = flag.String("in", "", "input package.json location")
	outPkgJSON = flag.String("out", "", "output package.json location. If empty, output to the standard output.")

	work = flag.Bool("w", false, "if true, do not delete intermediate files")
)

func main() {
	flag.Parse()

	if *inPkgJSON == "" {
		log.Fatalf("-in file must be specified %q %q", *inPkgJSON, *outPkgJSON)
	}
	if _, err := os.Stat(*inPkgJSON); err != nil {
		log.Fatalf("failed to find input package.json (%q): %v", *inPkgJSON, err)
	}

	out, err := run(*inPkgJSON)
	if err != nil {
		log.Fatal(err)
	}
	if *outPkgJSON != "" {
		if err := ioutil.WriteFile(*outPkgJSON, out, 0644); err != nil {
			log.Fatalf("writing jq output to %q failed: %v", out, err)
		}
	} else {
		fmt.Printf("%s", out)
	}
}

// run
func run(orgPkgJSON string) ([]byte, error) {
	workDir, err := ioutil.TempDir("", "goplssettings")
	if err != nil {
		return nil, err
	}
	log.Printf("WORK=%v", workDir)

	if !*work {
		defer os.RemoveAll(workDir)
	}

	api, err := readGoplsAPI()
	if err != nil {
		return nil, err
	}

	options, err := extractOptions(api)
	if err != nil {
		return nil, err
	}

	f, err := ioutil.TempFile(workDir, "gopls.settings")
	if err != nil {
		return nil, err
	}

	writeAsVSCodeSettings(f, options)

	if err := f.Close(); err != nil {
		return nil, err
	}

	return rewritePackageJSON(f.Name(), orgPkgJSON)
}

// readGoplsAPI returns the output of `gopls api-json`.
func readGoplsAPI() (*APIJSON, error) {
	version, err := exec.Command("gopls", "-v", "version").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to check gopls version: %v", err)
	}
	log.Printf("Reading settings of gopls....\nversion:\n%s\n", version)

	out, err := exec.Command("gopls", "api-json").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run gopls: %v", err)
	}

	api := &APIJSON{}
	if err := json.Unmarshal(out, api); err != nil {
		return nil, fmt.Errorf("failed to unmarshal: %v", err)
	}
	return api, nil
}

// extractOptions extracts the options from APIJSON.
// It may rearrange the ordering and documentation for better presentation.
func extractOptions(api *APIJSON) ([]*OptionJSON, error) {
	type sortableOptionJSON struct {
		*OptionJSON
		section string
	}
	options := []sortableOptionJSON{}
	for k, v := range api.Options {
		for _, o := range v {
			options = append(options, sortableOptionJSON{OptionJSON: o, section: k})
		}
	}
	sort.SliceStable(options, func(i, j int) bool {
		return priority(options[i].section) < priority(options[j].section)
	})

	opts := []*OptionJSON{}
	for _, v := range options {
		if emoji := sectionEmoji(v.section); emoji != "" {
			v.OptionJSON.Doc = emoji + " " + v.OptionJSON.Doc
		}
		opts = append(opts, v.OptionJSON)
	}
	return opts, nil
}

func priority(section string) int {
	switch section {
	case "User":
		return 0
	case "Experimental":
		return 10
	case "Debugging":
		return 100
	}
	return 1000
}

func sectionEmoji(section string) string {
	switch section {
	case "Experimental":
		return "🧪"
	case "Debugging":
		return "🔍"
	}
	return ""
}

// rewritePackageJSON rewrites the input package.json by running `jq`
// to update all existing gopls settings with the ones from the newSettings
// file.
func rewritePackageJSON(newSettings, inFile string) ([]byte, error) {
	prog := `walk(if type == "object" then with_entries(select(.key | test("^gopls.[a-z]") | not)) else . end) | .contributes.configuration.properties *= $GOPLS_SETTINGS[0]`

	cmd := exec.Command("jq", "--slurpfile", "GOPLS_SETTINGS", newSettings, prog, inFile)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("jq run failed (%v): %s", err, &stderr)
	}
	return stdout.Bytes(), nil
}

// convertToVSCodeSettings converts the options to the vscode setting format.
func writeAsVSCodeSettings(f io.Writer, options []*OptionJSON) {
	line := func(format string, args ...interface{}) {
		fmt.Fprintf(f, format, args...)
		fmt.Fprintln(f)
	}

	line(`{`)
	for i, o := range options {
		line(`  "gopls.%v" : {`, o.Name)

		typ := propertyType(o.Type)
		line(`    "type": %q,`, typ)
		// TODO: consider 'additionalProperties' if gopls api-json outputs acceptable peoperties.

		line(`    "markdownDescription": %q,`, o.Doc)

		var enums, enumDocs []string
		for _, v := range o.EnumValues {
			enums = append(enums, v.Value)
			enumDocs = append(enumDocs, fmt.Sprintf("%q", v.Doc))
		}
		if len(enums) > 0 {
			line(`    "enum": [%v],`, strings.Join(enums, ","))
			line(`    "markdownEnumDescriptions": [%v],`, strings.Join(enumDocs, ","))
		}

		if len(o.Default) > 0 {
			line(`    "default": %v,`, o.Default)
		}

		// TODO: are all gopls settings in the resource scope?
		line(`    "scope": "resource"`)
		// TODO: deprecation attribute

		if i == len(options)-1 {
			line(`  }`)
		} else {
			line(`  },`)
		}
	}
	line(`}`)
}

func propertyType(t string) string {
	switch t {
	case "string":
		return "string"
	case "bool":
		return "boolean"
	case "enum":
		return "string"
	case "time.Duration":
		return "string"
	case "[]string":
		return "array"
	case "map[string]string", "map[string]bool":
		return "object"
	}
	log.Fatalf("unknown type %q", t)
	return ""
}

func check(err error) {
	if err == nil {
		return
	}

	log.Output(1, err.Error())
	os.Exit(1)
}

// APIJSON is the output json type of `gopls api-json`.
// Types copied from golang.org/x/tools/internal/lsp/source/options.go.
type APIJSON struct {
	Options  map[string][]*OptionJSON
	Commands []*CommandJSON
	Lenses   []*LensJSON
}

type OptionJSON struct {
	Name       string
	Type       string
	Doc        string
	EnumValues []EnumValue
	Default    string
}

type EnumValue struct {
	Value string
	Doc   string
}

type CommandJSON struct {
	Command string
	Title   string
	Doc     string
}

type LensJSON struct {
	Lens  string
	Title string
	Doc   string
}
