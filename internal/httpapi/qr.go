package httpapi

import (
	"net/http"
	"strconv"

	qrcode "github.com/skip2/go-qrcode"
)

// handleQR generates a PNG QR code for the given text.
// GET /api/qr?text=...&size=300
func (s *Server) handleQR(w http.ResponseWriter, r *http.Request) {
	text := r.URL.Query().Get("text")
	if text == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}
	size := 320
	if v, _ := strconv.Atoi(r.URL.Query().Get("size")); v >= 64 && v <= 1024 {
		size = v
	}
	png, err := qrcode.Encode(text, qrcode.Medium, size)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(png)
}
