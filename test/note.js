var mongoose = require('mongoose');

var NoteSchema = new mongoose.Schema({
  title : { type : String, required : true },
  date : { type : Date, required : true },
  tags : [String],
  content : { type: String },
  author : {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'author'
  },
  contributors : [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'author'
  }]
});

var Note = mongoose.model('notes', NoteSchema);

module.exports = Note;
