'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var util = require('util');

var NoteSchema = new Schema({
  title : { type : String, required : true },
  date : { type : Date, required : true },
  tags : [String],
  content : { type: String }
});

NoteSchema.path('tags').set(function(val) {
  if (val === undefined) {
    return val;
  }

  if (util.isArray(val)) {
    return val;
  }

  return val.split(',');
});

var models = {
  Note : mongoose.model('notes', NoteSchema)
};

module.exports = models;
