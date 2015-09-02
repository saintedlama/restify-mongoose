var mongoose = require('mongoose');

var AuthorSchema = new mongoose.Schema({
  name : { type : String, required : true }
});

var Author = mongoose.model('author', AuthorSchema);

module.exports = Author;
