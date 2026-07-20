package model

import "time"

// QueryWarning is a machine-readable warning attached to a flows query response.
// Frontend maps Code to i18n strings; extra fields support interpolation.
type QueryWarning struct {
	Code           string     `json:"code"`
	Peer           string     `json:"peer,omitempty"`
	BufferOldest   *time.Time `json:"bufferOldest,omitempty"`
	BufferNewest   *time.Time `json:"bufferNewest,omitempty"`
	RequestedStart *time.Time `json:"requestedStart,omitempty"`
	RequestedEnd   *time.Time `json:"requestedEnd,omitempty"`
	Message        string     `json:"message,omitempty"`
}
