// Package s3 wraps minio-go for raw .eml storage.
package s3

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"strconv"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"swissy/internal/config"
)

type Client struct {
	c      *minio.Client
	bucket string
}

// NewFromEnv reads S3_* env vars and returns a client, or nil+error if
// mandatory config is missing. The error is non-fatal (caller decides).
func NewFromEnv() (*Client, error) {
	endpoint := os.Getenv("S3_ENDPOINT")
	bucket := os.Getenv("S3_BUCKET")
	if endpoint == "" || bucket == "" {
		return nil, errors.New("S3_ENDPOINT/S3_BUCKET not set")
	}
	ak := os.Getenv("S3_ACCESS_KEY")
	sk := os.Getenv("S3_SECRET_KEY")
	useSSL, _ := strconv.ParseBool(config.Env("S3_USE_SSL", "true"))
	region := config.Env("S3_REGION", "us-east-1")

	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(ak, sk, ""),
		Secure: useSSL,
		Region: region,
	})
	if err != nil {
		return nil, err
	}
	return &Client{c: c, bucket: bucket}, nil
}

func (s *Client) Put(ctx context.Context, key string, data []byte) error {
	_, err := s.c.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: "message/rfc822"})
	return err
}

func (s *Client) Get(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.c.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	return io.ReadAll(obj)
}
