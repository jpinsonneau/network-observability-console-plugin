package export

import "fmt"

const (
	FormatJSON = "json"
	FormatCSV  = "csv"

	FormatKey = "format"
)

// ParseFormat returns the requested export format or the provided default.
func ParseFormat(raw, defaultFormat string) string {
	switch raw {
	case "", defaultFormat:
		return defaultFormat
	case FormatJSON, FormatCSV:
		return raw
	default:
		return ""
	}
}

// ValidateFormat returns an error when format is not json or csv.
func ValidateFormat(format string) error {
	if format == FormatJSON || format == FormatCSV {
		return nil
	}
	return fmt.Errorf("export format %q is not valid", format)
}
