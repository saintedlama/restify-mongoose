const mongoose = require('mongoose');

const AuthorSchema = new mongoose.Schema({
  name : { type : String, required : true }
});

const Author = mongoose.models.author || mongoose.model('author', AuthorSchema);

module.exports = Author;
