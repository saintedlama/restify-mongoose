'use strict';
const assert = require('assert');
const mongoose = require('mongoose');
const async = require('async');

function dropCollections(collections, index, cb) {
  if (typeof(index) === 'function') {
    cb = index;
    index = 0;
  }

  if (index < collections.length) {
    mongoose.connection.db.dropCollection(collections[index], function(err) {
      assert.ifError(err);

      dropCollections(collections, index + 1, cb);
    });
  } else {
    cb();
  }
}

module.exports = {
  prepareDb : function(connectionString, options) {
    options = options || {};
    options.timeout = options.timeout || 5000;

    return function(cb) {
      this.timeout(options.timeout);

      mongoose.connect(connectionString, function(err) {
        assert.ifError(err);

        mongoose.connection.db.collections(function(err, collections) {
          assert.ifError(err);

          const collectionsToDrop = collections
            .filter(function(col) { return col.collectionName.indexOf('system.') !== 0; })
            .map(function(col) { return col.collectionName; });

          dropCollections(collectionsToDrop, 0, cb);
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
