//row
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
'use strict';

var Delta = require("delta-stream")

Row.isRow = isRow

module.exports = Row

function Row (id) {
  var delta = Delta(id)

  delta._set = delta.set

  delta.set = function (key, value) {
    var changes = key
    if (typeof key === 'string') {
      changes = {}
      changes[key] = value
    }
    delta.emit('preupdate', changes)
  }

  return delta
}

function isRow(r) {
    return r.set && r.get && r.validate
}