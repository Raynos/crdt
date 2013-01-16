var inherits     = require('util').inherits
var Row          = require('./row')
var between      = require('between')
var Set          = require('./set')
var Seq          = require('./seq')
var Scuttlebutt  = require('scuttlebutt')
var EventEmitter = require('events').EventEmitter
var createId     = require('scuttlebutt/util').createId

inherits(Doc, Scuttlebutt)

function merge(to, from) {
  for(var k in from)
    to[k] = from[k]
  return to
}


module.exports = Doc
//doc
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/*
  idea: instead of using a tombstone for deletes,
  use a anti-tombstone to show something is alive.
  breathing: count. -- updated by an authority.
  set breathing to 0 to kill something.

  if a node has rows that have been garbage collected on the server,
  it will be obvious from the value of breathing.

  node disconnects... makes changes...
  other nodes delete some things, which get garbage collected.

  node reconnects.
  server updates the node, but only increments _breathing for some rows.

  clearly, the nodes that do not have an upto date _breathing are either
  dead, or where created by the node while it was offline.

  would breathing need to be a vector clock?

  if the disconneded node is still updating the rows,
  maybe it shouldn't be deleted, that is, undeleted.

  may be on to something here... but this needs more thinking.

  will depend on how much churn something has...
*/

function order (a, b) {
  return between.strord(a[1], b[1]) || between.strord(a[2], b[2])
}

function Doc (id) {
  if (!(this instanceof Doc)) return new Doc(id)
  //the id of the doc refers to the instance.
  //that is, to the node.
  //it's used to identify a node
//  this.id = id || '#' + Math.round(Math.random()*1000)
  this.rows = {}
  this.hist = {}
  this.recieved = {}
  this.sets = new EventEmitter() //for tracking membership of sets.
  this.setMaxListeners(Infinity)
  this.sets.setMaxListeners(Infinity)
  Scuttlebutt.call(this, id)

}

Doc.prototype.add = function (initial) {
  var id = initial.id === undefined ? createId() : initial.id
  var r = this._add(id, 'local')
  r._set(initial, 'local')
  return r
}

Doc.prototype._add = function (id, source, change) {

  var doc = this

  if(this.rows[id])
    return this.rows[id]

  var r = id instanceof Row ? id : new Row(id)
  this.rows[r.id] = r

  function track (changes, source) {
    doc.localUpdate([r.id, changes])
  }

  r.on('preupdate', track)

  r._new = true
  return r
}

Doc.prototype.timeUpdated = function (row, key) {
  var h = this.hist[row.id]
  if(!h) return
  return h[key][2]
}

Doc.prototype.set = function (id, change) {
  var r = this._add(id, 'local', change)
  return r.set(change)
}

/*
  histroy for each row is indexed by key.
  key -> update that set that key.

  so applying a change is as simple
  as iterating over the keys in the rows hist
  checking if the new update is more recent
  than the hist update
  if so, replace that keys hist.
*/

Doc.prototype.applyUpdate = function (update, source) {

  //apply an update to a row.
  //take into account histroy.
  //and insert the change into the correct place.
  var id      = update[0][0]
  var changes = update[0][1]
  var timestamp = update[1]
  var from    = update[2]

  var changed = {}

  var row = this._add(id, source)
  var hist = this.hist[id] = this.hist[id] || {}
  var emit = false, oldnews = false


  //remember the most recent update from each node.
  //now handled my scuttlebutt.
//  if(!row.validate(changes)) return

  for(var key in changes) {
    var value = changes[key]
    if(!hist[key] || order(hist[key], update) < 0) {
      if(hist[key]) this.emit('_remove', hist[key])
      hist[key] = update
      changed[key] = changes[key]
      emit = true
    }
  }

//  probably, there may be mulitple sets that listen to the same key,
//  but activate on different values...
//
//  hang on, in the mean time, I will probably only be managing n < 10 sets.
//  at once,

  merge(row.state, changed)
  for(var k in changed)
    this.sets.emit(k, row, changed)

  if(!emit) return

  if(row._new) {
    this.emit('add', row)
    this.emit('create', row) //alias
    row._new = false
  }
  this.emit('_update', update)
  row.emit('update', update, changed)
  row.emit('changes', changes, changed)
  row.emit('change', changed) //installing this in paralel, so tests still pass.
  //will depreciate the old way later.
  this.emit('update', update, source)   //rename this event to 'data' or 'diff'?
  this.emit('row_update', row)          //rename this event to 'update'
}

Doc.prototype.history = function (sources) {
  var h = []
  for (var id in this.hist) {
    var hist = this.hist[id]
    for (var k in hist) {
      if(!~h.indexOf(hist[k]) && Scuttlebutt.filter(hist[k], sources))
        h.push(hist[k])
    }
  }
  return h.sort(order)
}

function _set(self, key, val, type) {
  var id
  if (typeof key === 'string') {
    id = key + ':' + val
  } else {
    id = createId()
  }
  if(self.sets[id]) return self.sets[id]
  return self.sets[key + ':' + val] = new type(self, key, val)
}

Doc.prototype.createSet = function (key, val) {
  return _set(this, key, val, Set)
}

Doc.prototype.createSeq = function (key, val) {
  return _set(this, key, val, Seq)
}

Doc.prototype.toJSON = function () {
  var j = {}
  for (var k in this.rows)
    j[k] = this.rows[k].state
  return j
}
//retrive a reference to a row.
//if the row is not created yet, create
Doc.prototype.get = function (id) {
  return this.rows[id] = this.rows[id] || this._add(new Row(id), 'local')
}

