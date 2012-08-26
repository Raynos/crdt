var crdt = require("..")
    , DeltaStream = require("delta-stream")
    , log = require("event-stream").log

var doc = new crdt.Doc()
    , row = doc.set("junk", {})
    , rowStream = row.createStream()
    , deltaStream = DeltaStream()
    , observable = deltaStream.createObservable()

//deltaStream.pipe(log("delta-stream"))
//rowStream.pipe(log("row-stream"))

rowStream.pipe(deltaStream).pipe(rowStream)

observable.on("change", function (changes) {
    console.log("changes", changes)
})

doc.on("update", function (data, source) {
    console.log("update", data, source)
})

observable.set("key", "value")

row.set("other", "other_value")