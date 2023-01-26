package constants

type Reporter string
type RecordType string

const (
	AppLabel                        = "app"
	AppLabelValue                   = "netobserv-flowcollector"
	ReporterSource       Reporter   = "source"
	ReporterDestination  Reporter   = "destination"
	ReporterBoth         Reporter   = "both"
	RecordTypeLabel                 = "_RecordType"
	RecordTypeConnection RecordType = "newConnection"
	RecordTypeLog        RecordType = "flowLog"
)
