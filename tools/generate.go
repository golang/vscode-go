// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// Command generate is used to generate documentation from the package.json.
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
	Name string

	Default     interface{} `json:"default,omitempty"`
	Description string      `json:"description,omitempty"`
	Type        interface{} `json:"type,omitempty"`
	Enum        []string    `json:"enum,omitempty"`
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
`, strings.TrimSuffix(base, ".md"), base)
			os.Exit(1)
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
		properties = append(properties, Property{
			Name:        name,
			Default:     p.Default,
			Description: p.Description,
			Type:        p.Type,
			Enum:        p.Enum,
		})
	}
	sort.Slice(properties, func(i, j int) bool {
		return properties[i].Name < properties[j].Name
	})
	indent := "&nbsp;&nbsp;"
	for i, p := range properties {
		b.WriteString(fmt.Sprintf("### `%s`\n\n%s", p.Name, p.Description))
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
				b.WriteString(fmt.Sprintf("\n\nDefault:{<br/>\n"))
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
