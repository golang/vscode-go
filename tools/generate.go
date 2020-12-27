// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// Command generate is used to generate documentation from the package.json.
// To run:
// go run tools/generate.go -w
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var (
	writeFlag = flag.Bool("w", true, "Write new file contents to disk.")
)

type PackageJSON struct {
	Contributes struct {
		Commands      []Command `json:"commands,omitempty"`
		Configuration struct {
			Properties map[string]Property `json:"properties,omitempty"`
		} `json:"configuration,omitempty"`
	} `json:"contributes,omitempty"`
}

type Command struct {
	Command     string `json:"command,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

type Property struct {
	name string `json:"name,omitempty"` // Set by us.

	// Below are defined in package.json
	Properties                 map[string]interface{} `json:"properties,omitempty"`
	Default                    interface{}            `json:"default,omitempty"`
	MarkdownDescription        string                 `json:"markdownDescription,omitempty"`
	Description                string                 `json:"description,omitempty"`
	MarkdownDeprecationMessage string                 `json:"markdownDeprecationMessage,omitempty"`
	DeprecationMessage         string                 `json:"deprecationMessage,omitempty"`
	Type                       interface{}            `json:"type,omitempty"`
	Enum                       []string               `json:"enum,omitempty"`
}

func main() {
	flag.Parse()

	// Assume this is running from the vscode-go directory.
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	// Find the package.json file.
	data, err := ioutil.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		log.Fatal(err)
	}
	pkgJSON := &PackageJSON{}
	if err := json.Unmarshal(data, pkgJSON); err != nil {
		log.Fatal(err)
	}

	rewrite := func(filename string, toAdd []byte) {
		oldContent, err := ioutil.ReadFile(filename)
		if err != nil {
			log.Fatal(err)
		}
		gen := []byte(`<!-- Everything below this line is generated. DO NOT EDIT. -->`)
		split := bytes.Split(oldContent, gen)
		if len(split) == 1 {
			log.Fatalf("expected to find %q in %s, not found", gen, filename)
		}
		s := bytes.Join([][]byte{
			bytes.TrimSpace(split[0]),
			gen,
			toAdd,
		}, []byte("\n\n"))
		newContent := append(s, '\n')

		// Return early if the contents are unchanged.
		if bytes.Equal(oldContent, newContent) {
			return
		}

		// Either write out new contents or report an error (if in CI).
		if *writeFlag {
			if err := ioutil.WriteFile(filename, newContent, 0644); err != nil {
				log.Fatal(err)
			}
			fmt.Printf("updated %s\n", filename)
		} else {
			base := filepath.Join("docs", filepath.Base(filename))
			fmt.Printf(`%s have changed in the package.json, but documentation in %s was not updated.
To update the settings, run "go run tools/generate.go -w".
`, strings.TrimSuffix(base, ".md"), base)
			os.Exit(1) // causes CI to break.
		}
	}
	var b bytes.Buffer
	for i, c := range pkgJSON.Contributes.Commands {
		b.WriteString(fmt.Sprintf("### `%s`\n\n%s", c.Title, c.Description))
		if i != len(pkgJSON.Contributes.Commands)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "docs", "commands.md"), b.Bytes())

	// Clear so that we can rewrite settings.md.
	b.Reset()

	var properties []Property
	for name, p := range pkgJSON.Contributes.Configuration.Properties {
		p.name = name
		properties = append(properties, p)
	}
	sort.Slice(properties, func(i, j int) bool {
		return properties[i].name < properties[j].name
	})
	indent := "&nbsp;&nbsp;"
	for i, p := range properties {
		desc := p.Description
		if p.MarkdownDescription != "" {
			desc = p.MarkdownDescription
		}
		deprecation := p.DeprecationMessage
		if p.MarkdownDeprecationMessage != "" {
			deprecation = p.MarkdownDeprecationMessage
		}

		name := p.name
		if deprecation != "" {
			name += " (deprecated)"
			desc = deprecation + "\n" + desc
		}

		b.WriteString(fmt.Sprintf("### `%s`\n\n%s", name, desc))

		if p.Enum != nil {
			b.WriteString(fmt.Sprintf("\n\nAllowed Values:`%v`", p.Enum))
		}
		switch p.Type {
		case "object":
			x, ok := p.Default.(map[string]interface{})
			// do nothing if it is nil
			if ok && len(x) > 0 {
				keys := []string{}
				for k := range x {
					keys = append(keys, k)
				}
				sort.Strings(keys)
				b.WriteString("\n\nDefault:{<br/>\n")
				for _, k := range keys {
					v := x[k]
					output := fmt.Sprintf("%v", v)
					if str, ok := v.(string); ok {
						output = fmt.Sprintf("%q", str)
					}
					// if v is an empty string, nothing gets printed
					// if v is a map/object, it is printed on one line
					// this could be improved at the cost of more code
					b.WriteString(fmt.Sprintf("%s`\"%s\": %s`,<br/>\n", indent, k, output))
				}
				b.WriteString("    }\n")
			}
			writeSettingsObjectProperties(&b, "####", p.Properties)

		case "boolean", "string", "number":
			b.WriteString(fmt.Sprintf("\n\nDefault: `%v`", p.Default))
		case "array":
			x := p.Default.([]interface{})
			if len(x) > 0 {
				b.WriteString(fmt.Sprintf("\n\nDefault: `%v`", p.Default))
			}
		default:
			if _, ok := p.Type.([]interface{}); ok {
				b.WriteString(fmt.Sprintf("\n\nefault: `%v`", p.Default))
				break
			}
			log.Fatalf("implement default when p.Type is %q in %#v %T", p.Type, p, p.Default)
		}
		if i != len(properties)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "docs", "settings.md"), b.Bytes())
}

func writeSettingsObjectProperties(b *bytes.Buffer, heading string, properties map[string]interface{}) {
	var names []string
	for name := range properties {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		p, ok := properties[name].(map[string]interface{})
		if !ok {
			b.WriteString(fmt.Sprintf("\n\n\n%s %s\n", heading, name))
			continue
		}

		desc := ""
		if d := p["description"]; d != nil {
			desc = fmt.Sprintf("%v", d)
		}
		if d := p["markdownDescription"]; d != nil {
			desc = fmt.Sprintf("%v", d)
		}
		deprecation := ""
		if d := p["deprecationMessage"]; d != nil {
			deprecation = fmt.Sprintf("%v", d)
		}
		if d := p["markdownDeprecationMessage"]; d != nil {
			deprecation = fmt.Sprintf("%v", d)
		}

		if deprecation != "" {
			name += " (deprecated)"
			desc = deprecation + "\n" + desc
		}
		b.WriteString(fmt.Sprintf("\n\n%s `%s`\n%s", heading, name, desc))
	}
}
