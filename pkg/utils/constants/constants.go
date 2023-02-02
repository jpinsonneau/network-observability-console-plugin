package constants

type Reporter string
type RecordType string

const (
	AppLabel                              = "app"
	AppLabelValue                         = "netobserv-flowcollector"
	ReporterSource             Reporter   = "source"
	ReporterDestination        Reporter   = "destination"
	ReporterBoth               Reporter   = "both"
	RecordTypeLabel                       = "_RecordType"
	RecordTypeAllConnections   RecordType = "allConnections"
	RecordTypeNewConnection    RecordType = "newConnection"
	RecordTypeUpdateConnection RecordType = "updateConnection"
	RecordTypeEndConnection    RecordType = "endConnection"
	RecordTypeLog              RecordType = "flowLog"
)
