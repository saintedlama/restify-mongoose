'use strict';

const restifyErrors = require('restify-errors');
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const restifyError = function (err) {
  if (!err || 'ValidationError' !== err.name) {
    return err;
  }

  const returnError = new restifyErrors.InvalidContentError('ValidationError');

  returnError.toJSON = function () {
    return Object.assign({}, this.body, { errors: err.errors });
  };

  return returnError;
};

const sendData = function (res, format, modelName, status, data) {
  if (format === 'json-api') {
    const responseObj = {};
    responseObj[modelName] = data;
    res.json(status, responseObj);
  } else {
    res.send(status, data);
  }
};

const runProjection = function (projection, req, model) {
  return new Promise(function (resolve, reject) {
    let called = false;
    const cb = function (err, result) {
      if (called) {
        return;
      }
      called = true;
      if (err) {
        return reject(err);
      }
      resolve(result);
    };

    try {
      const res = projection(req, model, cb);
      if (res && typeof res.then === 'function') {
        res.then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
};

const runBeforeSave = function (beforeSave, req, model) {
  if (!beforeSave) {
    return Promise.resolve();
  }

  return new Promise(function (resolve, reject) {
    let called = false;
    const cb = function (err) {
      if (called) {
        return;
      }
      called = true;
      if (err) {
        return reject(err);
      }
      resolve();
    };

    try {
      const res = beforeSave(req, model, cb);
      if (res && typeof res.then === 'function') {
        res.then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
};

const setLocationHeader = function (req, res, isNewResource, baseUrl, model) {
  let url = baseUrl + req.url;
  if (isNewResource) {
    url = url + '/' + model._id;
  }
  res.header('Location', url);
};

const parseCommaParam = function (commaParam) {
  return commaParam.replace(/,/g, ' ');
};

// Recursively detects Mongo query operators (keys starting with '$') to
// prevent NoSQL injection via user-supplied query objects (CWE-943).
const containsMongoOperator = function (value) {
  if (Array.isArray(value)) {
    return value.some(containsMongoOperator);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).some(function (key) {
      return key.charAt(0) === '$' || containsMongoOperator(value[key]);
    });
  }
  return false;
};

const applyPageLinks = function (req, res, page, pageSize, baseUrl, totalCount, models) {
  function makeLink(p, rel) {
    const parsed = new URL(req.url, 'http://localhost');
    parsed.searchParams.set('p', p);
    const href = baseUrl + parsed.pathname + parsed.search;
    return util.format('<%s>; rel="%s"', href, rel);
  }

  // rel: first
  let link = makeLink(0, 'first');

  // rel: prev
  if (page > 0) {
    link += ', ' + makeLink(page - 1, 'prev');
  }

  // rel: next
  const moreResults = models.length > pageSize;
  if (moreResults) {
    models.pop();
    link += ', ' + makeLink(page + 1, 'next');
  }

  // rel: last
  let lastPage = 0;
  if (pageSize > 0) {
    lastPage = Math.ceil(totalCount / pageSize) - 1;
    link += ', ' + makeLink(lastPage, 'last');
  }

  res.setHeader('link', link);
};

const applyTotalCount = function (res, totalCount) {
  res.setHeader('X-Total-Count', totalCount);
};

const applySelect = function (query, options, req) {
  // options select overrides request select
  const select = options.select || req.query.select;
  if (select) {
    query = query.select(parseCommaParam(select));
  }
};

const applyPopulate = function (query, options, req) {
  const populate = req.query.populate || options.populate;
  if (populate) {
    query = query.populate(parseCommaParam(populate));
  }
};

const applySort = function (query, options, req) {
  const sort = req.query.sort || options.sort;
  if (sort) {
    query = query.sort(parseCommaParam(sort));
  }
};

const Resource = function (Model, options) {
  EventEmitter.call(this);
  this.Model = Model;

  this.options = options || {};
  this.options.queryString = this.options.queryString || '_id';
  this.options.pageSize = this.options.pageSize || 100;
  this.options.maxPageSize = this.options.maxPageSize || 100;
  this.options.baseUrl = this.options.baseUrl || '';
  this.options.outputFormat = this.options.outputFormat || 'regular';
  this.options.modelName = this.options.modelName || Model.modelName;
  this.options.listProjection = this.options.listProjection || function (req, item, cb) {
    cb(null, item);
  };
  this.options.detailProjection = this.options.detailProjection || function (req, item, cb) {
    cb(null, item);
  };
};

util.inherits(Resource, EventEmitter);

Resource.prototype.query = function (options) {
  const self = this;

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
    let query = self.Model.find({});
    let countQuery = self.Model.find({});

    if (req.query.q) {
      try {
        const q = JSON.parse(req.query.q);
        if (containsMongoOperator(q)) {
          return res.send(400, { message: 'Query must not contain Mongo operators' });
        }
        query = query.where(q);
        countQuery = countQuery.where(q);
      } catch (err) {
        return res.send(400, { message: 'Query is not a valid JSON object', errors: err });
      }
    }

    applySelect(query, options, req);
    applyPopulate(query, options, req);
    applySort(query, options, req);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
      countQuery = countQuery.where(self.options.filter(req, res));
    }

    const page = Number(req.query.p) >= 0 ? Number(req.query.p) : 0;

    // pageSize parameter in queryString overrides one in the code. Must be number between [1-options.maxPageSize]
    const requestedPageSize = Number(req.query.pageSize) > 0 ? Number(req.query.pageSize) : options.pageSize;
    const pageSize = Math.min(requestedPageSize, options.maxPageSize);

    query.skip(pageSize * page);
    query.limit(pageSize + 1);

    Promise.all([
      query.exec(),
      countQuery.countDocuments()
    ])
      .then(function (results) {
        const models = results[0];
        const totalCount = results[1];

        applyPageLinks(req, res, page, pageSize, options.baseUrl, totalCount, models);
        applyTotalCount(res, totalCount);

        return Promise.all(
          models.map(function (model) {
            return runProjection(options.projection, req, model);
          })
        );
      })
      .then(function (projectedModels) {
        self.emit('query', projectedModels);
        sendData(res, options.outputFormat, options.modelName, 200, projectedModels);
        return next();
      })
      .catch(function (err) {
        return next(restifyError(err));
      });
  };
};

Resource.prototype.detail = function (options) {
  const self = this;

  options = options || {};
  options.projection = options.projection || this.options.detailProjection;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;
  options.populate = options.populate || this.options.populate;
  options.select = options.select || this.options.select;

  return function (req, res, next) {
    const find = {};
    find[self.options.queryString] = req.params.id;

    let query = self.Model.findOne(find);

    applySelect(query, options, req);
    applyPopulate(query, options, req);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec()
      .then(function (model) {
        if (!model) {
          throw new restifyErrors.ResourceNotFoundError(req.params.id);
        }

        return runProjection(options.projection, req, model);
      })
      .then(function (projected) {
        self.emit('detail', projected);
        sendData(res, options.outputFormat, options.modelName, 200, projected);
        return next();
      })
      .catch(next);
  };
};

Resource.prototype.insert = function (options) {
  const self = this;

  options = options || {};
  options.baseUrl = options.baseUrl || this.options.baseUrl;
  options.beforeSave = options.beforeSave || this.options.beforeSave;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;

  return function (req, res, next) {
    const model = new self.Model(req.body);

    runBeforeSave(options.beforeSave, req, model)
      .then(function () {
        return model.save();
      })
      .catch(function (err) {
        throw restifyError(err);
      })
      .then(function (savedModel) {
        setLocationHeader(req, res, true, options.baseUrl, savedModel);
        self.emit('insert', savedModel);
        sendData(res, options.outputFormat, options.modelName, 201, savedModel);
        return next();
      })
      .catch(next);
  };
};

Resource.prototype.update = function (options) {
  const self = this;

  options = options || {};
  options.baseUrl = options.baseUrl || this.options.baseUrl;
  options.beforeSave = options.beforeSave || this.options.beforeSave;
  options.outputFormat = options.outputFormat || this.options.outputFormat;
  options.modelName = options.modelName || this.options.modelName;

  return function (req, res, next) {
    const find = {};
    find[self.options.queryString] = req.params.id;

    let query = self.Model.findOne(find);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec()
      .then(function (model) {
        if (!model) {
          throw new restifyErrors.ResourceNotFoundError(req.params.id);
        }

        if (!req.body) {
          throw new restifyErrors.InvalidContentError('No update data sent');
        }

        model.set(req.body);

        return runBeforeSave(options.beforeSave, req, model)
          .then(function () {
            return model.save();
          })
          .catch(function (err) {
            throw restifyError(err);
          })
          .then(function (savedModel) {
            setLocationHeader(req, res, false, options.baseUrl, savedModel);
            self.emit('update', savedModel);
            sendData(res, options.outputFormat, options.modelName, 200, savedModel);
            return next();
          });
      })
      .catch(next);
  };
};

Resource.prototype.remove = function () {
  const self = this;

  return function (req, res, next) {
    const find = {};
    find[self.options.queryString] = req.params.id;

    let query = self.Model.findOne(find);

    if (self.options.filter) {
      query = query.where(self.options.filter(req, res));
    }

    query.exec()
      .then(function (model) {
        if (!model) {
          throw new restifyErrors.ResourceNotFoundError(req.params.id);
        }

        const deletePromise = typeof model.deleteOne === 'function' ? model.deleteOne() : model.remove();
        return Promise.resolve(deletePromise).then(function () {
          res.send(200, model);
          self.emit('remove', model);
          return next();
        });
      })
      .catch(next);
  };
};

Resource.prototype.serve = function (path, server, options) {
  options = options || {};

  const handlerChain = function handlerChain(handler, before, after) {
    let handlers = [];

    if (before) {
      handlers = handlers.concat(before);
    }

    handlers.push(handler);

    if (after) {
      handlers = handlers.concat(after);
    }

    return handlers;
  };

  const closedPath = path[path.length - 1] === '/' ? path : path + '/';

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
