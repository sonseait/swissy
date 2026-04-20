// Package web embeds the static UI assets.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:assets
var assets embed.FS

// FS returns a filesystem rooted at the web assets.
func FS() fs.FS {
	sub, _ := fs.Sub(assets, "assets")
	return sub
}
