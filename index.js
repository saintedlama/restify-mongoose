'use strict';
var async = require('async');
var restify = require('restify');
var util = require('util');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

var restifyError = function (err) {
  if ('ValidationError' !== err.name) {
    return err;
  }

  return new restify.InvalidContentError({
    body: {
      message: 'Validation failed',
      errors: err.errors
    }
  });
};

var emitEvent = function (self, event) {
  return function (model, cb) {
    self.emit(event, model);

    if (cb) {
      cb(undefined, model);
    }
  };
};

var sendData = function (res, format, modelName, status) {
  return function (model, cb) {
    if (format === 'json-api') {
      var responseObj = {};
      responseObj[modelName] = model;
      res.json(status, responseObj);
    }
    else {
      res.send(status, model);
    }
    cb(undefined, model);
  };
};

var execQueryWithTotCount = function (query, countQuery) {
  return function (cb) {
    async.parallel({
        models: function (callback) {
          query.exec(callback);
        },
        count: function (callback) {
          countQuery.count(callback);
        }
      },
      function (err, results) {
        if (err) {
          return cb(restifyError(err));
        }
        else {
          cb(null, results.models, results.count);
        }
      });

  };
};

var execQuery = function (query) {
  return function (cb) {
    query.exec(cb);
  };
};

var execBeforeSave = function (req, model, beforeSave) {
  if (!beforeSave) {
    beforeSave = function (req, model, cb) {
      cb();
    };
  }
  return function (cb) {
    beforeSave(req, model, cb);
  };
};

var execSave = function (model) {
  return function (cb) {
    model.save(function (err, model) {
      if (err) {
        return cb(restifyError(err));
      }
      else {
        cb(null, model);
      }
    });
  };
};

/**
 * Sets the Location attribute in the response HTTP Header.
 * Used only in the POST and PATCH requests.
 *
 * URL PATTERN:
 * If PATCH: use the baseUrl + req.url
 * If POST: use the baseUrl + req.url and append model._id
 *
 * @param {Object} req Required. The request object including the req.url parameter
 * @param {Object} res Required. The response object to set the header attribute at
 * @param {Boolean} isNewResource Required. Tells if the resource is new (true, POST) or old (false, PATCH)
 * @param {String} baseUrl Optional. The base URL to prefix with
 */
var setLocationHeader = function (req, res, isNewResource, baseUrl) {
  return function (model, cb) {
    var url = baseUrl + req.url;
    if (isNewResource) {
      url = url + '/' + model._id;
    }
    res.header('Location', url);
    cb(null, model);
  };
};

var buildProjections = function (req, projection) {
  return function (models, cb) {
    var iterator = function (model, cb) {
      projection(req, model, cb);
    };

    async.map(models, iterator, cb);
  };
};

var buildProjection = function (req, projection) {
  return function (model, cb) {
    if (!model) {
      return cb(new restify.ResourceNotFoundError(req.params.id));
    }

    projection(req, model, cb);
  };
};

var parseCommaParam = function(commaParam) {
  return commaParam.replace(/,/g, ' ');
};

var applyPageLinks = function (req, res, page, pageSize, baseUrl) {
  function makeLink(page, rel) {
    var path = url.parse(req.url, true);
    path.query.p = page;
    delete path.search; // required for url.format to re-generate querystring
    var href = baseUrl + url.format(path);
    return util.format('<%s>; rel="%s"', href, rel);
  }

  return function applyPageLinksInner(models, totalCount, cb) {
    // rel: first
    var link = makeLink(0, 'first');

    // rel: prev
    if (page > 0) {
      link += ', ' + makeLink(page - 1, 'prev');
    }

    // rel: next
    var moreResults = models.length > pageSize;
    if (moreResults) {
      models.pop();

      link += ', ' + makeLink(page + 1, 'next');
    }

    // rel: last
    var lastPage = 0;
    if (pageSize > 0) {
      lastPage = Math.ceil(totalCount / pageSize) - 1;
      link += ', ' + makeLink(lastPage, 'last');
    }

    res.setHeader('link', link);

    cb(null, models, totalCount);
  };
};

var applyTotalCount = function (res) {
  return function applyTotalCountInner(models, totalCount, cb) {
    res.setHeader('X-Total-Count', totalCount);

    cb(null, models);
  };
};

var applySelect = function(query, options, req){
  //options select overrides request select
  var select = options.select || req.query.select;
  if(select){
    query = query.select(parseCommaParam(select));
  }
};

var applyPopulate = function(query, options, req){
  var populate = req.query.populate || options.populate;
  if (populate) {
    query = query.populate(parseCommaParam(populate));
  }
};

var applySort = function(query, options, req){
  var sort = req.query.sort || options.sort;
  if (sort) {
    query = query.sort(parseCommaParam(sort));
  }
};

var Resource = function (Model, options) {
  EventEmitter.call(this);
  this.Model = Model;

  this.options = options || {};
  this.options.queryString = this.options.queryString || '_id';
  this.options.pageSize = this.options.pageSize || 100;
  this.options.maxPageSize = this.options.maxPageSize || 100;
  this.options.baseUrl = this.options.baseUrl || '';
  this.options.outputFormat = this.options.outputFormat || 'regular';
  this.options.modelName = this.options.modelName || Model.modelName;

  if(this.options.globalProjection) {
    if(!this.options.listProjection) this.options.listProjection = this.options.globalProjection;
    if(!this.options.detailProjection) this.options.detailProjection = this.options.globalProjection;
    if(!this.options.insertProjection) this.options.insertProjection = this.options.globalProjection;
    if(!this.options.updateProjection) this.options.updateProjection = this.options.globalProjection;
  }

  this.options.listProjection = this.options.listProjection || function (req, item, cb) {
      cb(null, item);
    };
  this.options.detailProjection = this.options.detailProjection || function (req, item, cb) {
      cb(null, item);
    };
  this.options.insertProjection = this.options.insertProjection || function (req, item, cb) {
      cb(null, item);
    };
  this.options.updateProjection = this.options.updateProjection || function (req, item, cb) {
      cb(null, item);
    };
};

util.inherits(Resource, EventEmitter);

Resource.prototype.query = function (options) {
  var self = this;

  options = options || {};
  options.pageSize = options.pageSize || this.options.pageSize;
  options.maxPageSize = options.maxPageSize || this.options.maxPageSize;
  options.baseUrl = options.baseUrl || this.options.baseUrl;
  options.projection = options.projection || this.options.listProjection;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;
  options.populate = options.populate || this.options.populate;
  options.select = options.select || this.options.select;
  options.sort = options.sort || this.options.sort;

  return function (req, res, next) {
    var query = self.Model.find({});
    var countQuery = self.Model.find({});

    if (req.query.q) {
      try {
        var q = JSON.parse(req.query.q);
        query = query.where(q);
        countQuery = countQuery.where(q);
      } catch (err) {
        return res.send(400, {message: 'Query is not a valid JSON object', errors: err});
      }
    }

    applySelect(query, options, req);
    applyPopulate(query, options, req);
    applySort(query, options, req);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
      countQuery = countQuery.where(self.options.filter(req, res));
    }

    var page = Number(req.query.p) >= 0 ? Number(req.query.p) : 0;

    // pageSize parameter in queryString overrides one in the code. Must be number between [1-options.maxPageSize]
    var requestedPageSize = Number(req.query.pageSize) > 0 ? Number(req.query.pageSize) : options.pageSize;
    var pageSize = Math.min(requestedPageSize, options.maxPageSize);

    query.skip(pageSize * page);
    query.limit(pageSize + 1);

    async.waterfall([
      execQueryWithTotCount(query, countQuery),
      applyPageLinks(req, res, page, pageSize, options.baseUrl),
      applyTotalCount(res),
      buildProjections(req, options.projection),
      emitEvent(self, 'query'),
      sendData(res, options.outputFormat, options.modelName)
    ], next);
  };
};

Resource.prototype.detail = function (options) {
  var self = this;

  options = options || {};
  options.projection = options.projection || this.options.detailProjection;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;
  options.populate = options.populate || this.options.populate;
  options.select = options.select || this.options.select;

  return function (req, res, next) {
    var find = {};
    find[self.options.queryString] = req.params.id;

    var query = self.Model.findOne(find);

    applySelect(query, options, req);
    applyPopulate(query, options, req);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    async.waterfall([
      execQuery(query),
      buildProjection(req, options.projection),
      emitEvent(self, 'detail'),
      sendData(res, options.outputFormat, options.modelName)
    ], next);
  };
};

Resource.prototype.insert = function (options) {
  var self = this;

  options = options || {};
  options.projection = options.projection || this.options.insertProjection;
  options.baseUrl = options.baseUrl || this.options.baseUrl;
  options.beforeSave = options.beforeSave || this.options.beforeSave;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;

  return function (req, res, next) {
    var model = new self.Model(req.body);
    async.waterfall([
      execBeforeSave(req, model, options.beforeSave),
      execSave(model),
      setLocationHeader(req, res, true, options.baseUrl),
      buildProjection(req, options.projection),
      emitEvent(self, 'insert'),
      sendData(res, options.outputFormat, options.modelName, 201)
    ], next);
  };
};

Resource.prototype.update = function (options) {
  var self = this;

  options = options || {};
  options.projection = options.projection || this.options.updateProjection;
  options.baseUrl = options.baseUrl || this.options.baseUrl;
  options.beforeSave = options.beforeSave || this.options.beforeSave;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;

  return function (req, res, next) {
    var find = {};
    find[self.options.queryString] = req.params.id;

    var query = self.Model.findOne(find);

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

      async.waterfall([
        execBeforeSave(req, model, options.beforeSave),
        execSave(model),
        setLocationHeader(req, res, false, options.baseUrl),
        buildProjection(req, options.projection),
        emitEvent(self, 'update'),
        sendData(res, options.outputFormat, options.modelName)
      ], next);
    });
  };
};

Resource.prototype.remove = function () {
  var self = this;
  var emitRemove = emitEvent(self, 'remove');

  return function (req, res, next) {
    var find = {};
    find[self.options.queryString] = req.params.id;

    var query = self.Model.findOne(find);

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

        res.send(200);
        emitRemove(model, next);
      });
    });
  };
};

Resource.prototype.serve = function (path, server, options) {

  options = options || {};

  var handlerChain = function handlerChain(handler, before, after) {
    var handlers = [];

    if (before) {
      handlers = handlers.concat(before);
    }

    handlers.push(handler);

    if (after) {
      handlers = handlers.concat(after);
    }

    return handlers;
  };

  var closedPath = path[path.length - 1] === '/' ? path : path + '/';

  server.get(
    path,
    handlerChain(this.query(), options.before, options.after)
  );
  server.get(
    closedPath + ':id',
    handlerChain(this.detail(), options.before, options.after)
  );
  server.post(
    path,
    handlerChain(this.insert(), options.before, options.after)
  );
  server.del(
    closedPath + ':id',
    handlerChain(this.remove(), options.before, options.after)
  );
  server.patch(
    closedPath + ':id',
    handlerChain(this.update(), options.before, options.after)
  );
};

module.exports = function (Model, options) {
  if (!Model) {
    throw new Error('Model argument is required');
  }

  return new Resource(Model, options);
};
