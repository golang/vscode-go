package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

const defaultAddr = ":8080"

// main starts an http server on the $PORT environment variable.
func main() {
	addr := defaultAddr
	// $PORT environment variable is provided in the Kubernetes deployment.
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	// NOTE: goDebug.test.ts setupRemoteProgram expects this log message.
	log.Printf("helloWorldServer starting to listen on %s", addr)
	http.HandleFunc("/", home)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("server listen error: %+v", err)
	}
}

// home logs the received request and returns a simple response.
func home(w http.ResponseWriter, r *http.Request) {
	log.Printf("received request: %s %s", r.Method, r.URL.Path) // Breakpoint
	fmt.Fprintf(w, "Hello, world!")
}
