'use strict';

var restify = require('restify');

var onError = function(err, next) {
  if ('ValidationError' !== err.name) {
    return next(err);
  }

  return next(new restify.InvalidContentError('Validation failed' + err.errors));
};

var Resource = function (Model, options) {
  this.Model = Model;

  this.options = options || {};
  this.options.pageSize = this.options.pageSize || 100;
  this.options.listProjection = this.options.listProjection || function (req, item) {
    return item;
  };
  this.options.detailProjection = this.options.detailProjection || function (req, item) {
    return item;
  };
};

Resource.prototype.query = function (options) {
  var self = this;

  options = options || {};
  options.pageSize = options.pageSize || this.options.pageSize;
  options.projection = options.projection || this.options.listProjection;

  return function (req, res, next) {
    var query = self.Model.find({});

    if (req.query.q) {
      try {
        var q = JSON.parse(req.query.q);
        query = query.where(q);
      } catch (err) {
        return res.send(400, { message: 'Query is not a valid JSON object', errors: err });
      }
    }

    if (req.query.sort) {
      query = query.sort(req.query.sort);
    }

    if (req.query.select) {
      query = query.select(req.query.select);
    }

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    var page = req.query.p || 0;
    query.skip(options.pageSize * page);
    query.limit(options.pageSize);

    query.exec(function (err, models) {
      if (err) {
        return next(err);
      }

      var projection = options.projection.bind(self, req);
      res.send(200, models.map(projection));
    });
  };
};

Resource.prototype.detail = function (options) {
  var self = this;

  options = options || {};
  options.projection = options.projection || this.options.detailProjection;
  return function (req, res, next) {
    var query = self.Model.findOne({ _id: req.params.id});

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec(function (err, model) {
      if (err) {
        return next(err);
      }

      if (!model) {
        return next(new restify.ResourceNotFoundError(req.params.id));
      }

      var projection = options.projection.bind(self, req);
      res.send(200, projection(model));
      next();
    });
  };
};

Resource.prototype.insert = function () {
  var self = this;

  return function (req, res, next) {
    self.Model.create(req.body, function (err, model) {
      if (err) {
        return onError(err, next);
      }

      res.header('Location', req.url + '/' + model._id);
      res.send(200, model);
      next();
    });
  };
};

Resource.prototype.update = function () {
  var self = this;

  return function (req, res, next) {
    var query = self.Model.findOne({ _id: req.params.id});

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec(function (err, model) {
      if (err) {
        return next(err);
      }

      if (!model) {
        return next(new restify.ResourceNotFoundError(req.params.id));
      }

      if (!req.body) {
        return next(new restify.InvalidContentError('No update data sent'));
      }

      model.set(req.body);

      model.save(function (err) {
        if (err) {
          return onError(err, next);
        }

        res.send(200, model);
      });
    });
  };
};

Resource.prototype.remove = function () {
  var self = this;

  return function (req, res, next) {
    var query = self.Model.findOne({ _id: req.params.id});

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec(function (err, model) {
      if (err) {
        return next(err);
      }

      if (!model) {
        return next(new restify.ResourceNotFoundError(req.params.id));
      }

      model.remove(function (err) {
        if (err) {
          return next(err);
        }

        res.send(200, model);
      });
    });
  };
};

Resource.prototype.serve = function (path, server) {
  var closedPath = path[path.length - 1] === '/' ? path : path + '/';

  server.get(path, this.query());
  server.get(closedPath + ':id', this.detail());
  server.post(path, this.insert());
  server.del(closedPath + ':id', this.remove());
  server.patch(closedPath + ':id', this.update());
};

module.exports = function (Model, options) {
  if (!Model) {
    throw new Error('Model argument is required');
  }

  return new Resource(Model, options);
};
