'use strict';
const mongoose = require('mongoose');
const async = require('async');

module.exports = {
  prepareDb : function(connectionString, options) {
    options = options || {};
    options.timeout = options.timeout || 5000;

    return function(cb) {
      this.timeout(options.timeout);

      mongoose.connect(connectionString, function(err) {
        if (err) { return cb(err); }

        mongoose.connection.db.collections(function(err, collections) {
          if (err) { return cb(err); }

          const collectionsToDrop = collections
            .filter(function(col) { return col.collectionName.indexOf('system.') !== 0; })
            .map(function(col) { return col.collectionName; });

          async.forEach(collectionsToDrop, (collection, next) => mongoose.connection.db.dropCollection(collection, next), cb);
        });
      });
    };
  },

  populate: function() {
    const args = Array.prototype.slice.call(arguments);
    const Constructor = args[0];
    const instances = args.slice(1, args.length);

    return function(cb) {
      async.eachSeries(instances, function(instance, next) {
        Constructor.create(instance, next);
      }, cb);
    };
  },

  disconnect : function() {
    return function(cb) {
      mongoose.disconnect(cb);
    };
  }
};
