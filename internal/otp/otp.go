// Package otp parses TOTP secrets from raw base32 or otpauth:// URIs.
package otp

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

var base32Re = regexp.MustCompile(`^[A-Z2-7]+=*$`)

// ParseSecret normalizes input (base32 string or otpauth URI) and returns the
// canonical uppercase secret plus an optional label parsed from the URI.
func ParseSecret(input string) (secret, name string, err error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return "", "", errors.New("secret required")
	}
	if strings.HasPrefix(strings.ToLower(s), "otpauth://") {
		u, perr := url.Parse(s)
		if perr != nil {
			return "", "", perr
		}
		q := u.Query()
		sec := strings.ToUpper(strings.ReplaceAll(q.Get("secret"), " ", ""))
		if sec == "" {
			return "", "", errors.New("otpauth URI missing secret")
		}
		if !base32Re.MatchString(sec) {
			return "", "", errors.New("invalid base32 secret in URI")
		}
		label, _ := url.PathUnescape(strings.TrimPrefix(u.Path, "/"))
		if i := strings.Index(label, ":"); i >= 0 {
			label = strings.TrimSpace(label[i+1:])
		}
		if issuer := q.Get("issuer"); issuer != "" && label != "" {
			label = issuer + " (" + label + ")"
		} else if issuer != "" {
			label = issuer
		}
		return sec, label, nil
	}
	normalized := strings.ToUpper(strings.ReplaceAll(strings.ReplaceAll(s, " ", ""), "-", ""))
	if !base32Re.MatchString(normalized) {
		return "", "", errors.New("invalid base32 secret")
	}
	return normalized, "", nil
}
