import { EventEmitter } from 'events';
import * as util from 'util';
import * as restify from 'restify';
import restifyErrors from 'restify-errors';
import mongoose from 'mongoose';
import { validateQuery, DEFAULT_ALLOWED_OPERATORS } from './query-validator';

type ModelFilter<T> = Parameters<mongoose.Model<T>['findOne']>[0];

type MongooseValidationError = Error & {
  name: 'ValidationError';
  errors?: Record<string, unknown>;
};

function isValidationError(err: unknown): err is MongooseValidationError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'ValidationError'
  );
}

function restifyError(err: unknown): unknown {
  if (!isValidationError(err)) {
    return err;
  }

  const returnError = new restifyErrors.InvalidContentError('ValidationError');
  Object.defineProperty(returnError, 'toJSON', {
    value: function (this: restifyErrors.HttpError) {
      return Object.assign({}, this.body, { errors: err.errors });
    },
    writable: true,
    configurable: true
  });

  return returnError;
}

function sendData(
  res: restify.Response,
  format: string,
  modelName: string,
  status: number,
  data: unknown
): void {
  if (format === 'json-api') {
    const resFormatters = (res as { formatters?: Record<string, unknown> }).formatters;
    if (resFormatters && !resFormatters['application/vnd.api+json'] && resFormatters['application/json']) {
      resFormatters['application/vnd.api+json'] = resFormatters['application/json'];
    }
    res.setHeader('Content-Type', 'application/vnd.api+json');
    const responseObj: Record<string, unknown> = {
      [modelName]: data
    };
    res.send(status, responseObj);
  } else {
    res.send(status, data);
  }
}


async function runFilter(
  filter: restifyMongoose.FilterFunction | undefined,
  req: restify.Request,
  res: restify.Response
): Promise<restifyMongoose.FilterResult | undefined> {
  if (!filter) {
    return undefined;
  }
  const result = filter(req, res);
  if (result && typeof (result as Promise<restifyMongoose.FilterResult>).then === 'function') {
    return await result;
  }
  return result;
}

async function runProjection<T, R = unknown>(
  projection: restifyMongoose.ProjectionFunction<T, R> | undefined,
  req: restify.Request,
  model: mongoose.HydratedDocument<T>
): Promise<R | mongoose.HydratedDocument<T>> {
  if (!projection) {
    return model;
  }

  if (projection.length < 3) {
    const directFn = projection as (
      req: restify.Request,
      item: mongoose.HydratedDocument<T>
    ) => Promise<R> | R;
    const res = directFn(req, model);
    if (res && typeof (res as Promise<R>).then === 'function') {
      const resolved = await res;
      return resolved !== undefined ? resolved : model;
    }
    return res !== undefined ? res : model;
  }

  return new Promise<R | mongoose.HydratedDocument<T>>((resolve, reject) => {
    let called = false;
    const cb: restifyMongoose.ProjectionCallback<R> = (err, result) => {
      if (called) {
        return;
      }
      called = true;
      if (err) {
        return reject(err);
      }
      resolve(result !== undefined ? result : model);
    };

    try {
      const callbackFn = projection as (
        req: restify.Request,
        item: mongoose.HydratedDocument<T>,
        cb: restifyMongoose.ProjectionCallback<R>
      ) => void;
      callbackFn(req, model, cb);
    } catch (err) {
      reject(err);
    }
  });
}

async function runBeforeSave<T>(
  beforeSave: restifyMongoose.BeforeSaveFunction<T> | undefined,
  req: restify.Request,
  model: mongoose.HydratedDocument<T>
): Promise<void> {
  if (!beforeSave) {
    return;
  }

  if (beforeSave.length < 3) {
    const directFn = beforeSave as (
      req: restify.Request,
      item: mongoose.HydratedDocument<T>
    ) => Promise<void> | void;
    const res = directFn(req, model);
    if (res && typeof (res as Promise<void>).then === 'function') {
      await res;
    }
    return;
  }

  return new Promise<void>((resolve, reject) => {
    let called = false;
    const cb: restifyMongoose.BeforeSaveCallback = (err) => {
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
      const callbackFn = beforeSave as (
        req: restify.Request,
        item: mongoose.HydratedDocument<T>,
        cb: restifyMongoose.BeforeSaveCallback
      ) => void;
      callbackFn(req, model, cb);
    } catch (err) {
      reject(err);
    }
  });
}

function setLocationHeader(
  req: restify.Request,
  res: restify.Response,
  isNewResource: boolean,
  baseUrl: string,
  model: { _id?: unknown }
): void {
  let url = baseUrl + (req.url || '');
  if (isNewResource) {
    url = url + '/' + String(model._id);
  }
  res.header('Location', url);
}

function parseCommaParam(commaParam: string): string {
  return commaParam.replace(/,/g, ' ');
}

function applyPageLinks(
  req: restify.Request,
  res: restify.Response,
  page: number,
  pageSize: number,
  baseUrl: string,
  totalCount: number,
  models: unknown[]
): void {
  function makeLink(p: number, rel: string) {
    const parsed = new URL(req.url || '', 'http://localhost');
    parsed.searchParams.set('p', String(p));
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
}

function applyTotalCount(res: restify.Response, totalCount: number): void {
  res.setHeader('X-Total-Count', totalCount);
}

type QueryModifiers = {
  select(arg: string): unknown;
  populate(arg: unknown): unknown;
  sort(arg: string): unknown;
};

function applySelect(
  query: QueryModifiers,
  options: { select?: string },
  req: restify.Request
): void {
  const reqQuery = req.query as Record<string, string | undefined> | undefined;
  const select = options.select || (reqQuery && reqQuery.select);
  if (select) {
    query.select(parseCommaParam(select));
  }
}

function applyPopulate(
  query: QueryModifiers,
  options: { populate?: restifyMongoose.PopulateOption },
  req: restify.Request
): void {
  const reqQuery = req.query as Record<string, string | undefined> | undefined;
  const populate = (reqQuery && reqQuery.populate) || options.populate;
  if (populate) {
    if (typeof populate === 'string') {
      query.populate(parseCommaParam(populate));
    } else {
      query.populate(populate);
    }
  }
}

function applySort(
  query: QueryModifiers,
  options: { sort?: string },
  req: restify.Request
): void {
  const reqQuery = req.query as Record<string, string | undefined> | undefined;
  const sort = (reqQuery && reqQuery.sort) || options.sort;
  if (sort) {
    query.sort(parseCommaParam(sort));
  }
}

function restifyMongoose<T>(
  Model: mongoose.Model<T>,
  options?: restifyMongoose.ResourceOptions<T>
): restifyMongoose.Resource<T> {
  if (!Model) {
    throw new Error('Model argument is required');
  }

  return new restifyMongoose.Resource<T>(Model, options);
}

namespace restifyMongoose {
  export type FilterResult = Record<string, unknown>;
  export type FilterFunction = (req: restify.Request, res: restify.Response) => Promise<FilterResult> | FilterResult;
  export type filterFunction = FilterFunction;

  /**
   * @deprecated Callback-style projections are deprecated and will be removed in a future release.
   * Return the transformed document or a Promise directly from the projection function instead.
   */
  export type ProjectionCallback<R = unknown> = (err?: unknown, doc?: R) => void;
  export type ProjectionFunction<T, R = unknown> =
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>) => Promise<R> | R)
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>, cb: ProjectionCallback<R>) => void);
  export type projectionFunction<T, R = unknown> = ProjectionFunction<T, R>;

  /**
   * @deprecated Callback-style beforeSave hooks are deprecated and will be removed in a future release.
   * Return void, a Promise<void>, or throw an error instead.
   */
  export type BeforeSaveCallback = (err?: unknown) => void;
  export type BeforeSaveFunction<T> =
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>) => Promise<void> | void)
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>, cb: BeforeSaveCallback) => void);
  export type beforeSaveFunction<T> = BeforeSaveFunction<T>;

  export type QueryOperatorPolicy =
    | 'default'
    | 'none'
    | 'all'
    | boolean
    | string[];

  export type QueryValidationOptions = {
    queryOperators?: QueryOperatorPolicy;
    queryFields?: string[] | string;
  };

  export type ValidationResult = {
    valid: boolean;
    message?: string;
  };

  export type PopulateOption =
    | string
    | mongoose.PopulateOptions
    | (string | mongoose.PopulateOptions)[];

  export type BaseOptions = {
    baseUrl?: string;
    outputFormat?: string; // default 'regular'
    modelName?: string; // default Model.modelName
    queryString?: string;
    filter?: FilterFunction;
  };

  export type ResourceOptions<T, R = unknown> = BaseOptions & {
    pageSize?: number;
    maxPageSize?: number;
    listProjection?: ProjectionFunction<T, R>;
    detailProjection?: ProjectionFunction<T, R>;
    populate?: PopulateOption;
    select?: string;
    sort?: string;
    beforeSave?: BeforeSaveFunction<T>;
    queryOperators?: QueryOperatorPolicy;
    queryFields?: string[] | string;
  };

  export type QueryOptions<T, R = unknown> = BaseOptions & {
    pageSize?: number;
    maxPageSize?: number;
    projection?: ProjectionFunction<T, R>;
    populate?: PopulateOption;
    select?: string;
    sort?: string;
    queryOperators?: QueryOperatorPolicy;
    queryFields?: string[] | string;
  };

  export type DetailOptions<T, R = unknown> = BaseOptions & {
    projection?: ProjectionFunction<T, R>;
    populate?: PopulateOption;
    select?: string;
  };

  export type InsertOptions<T> = BaseOptions & {
    beforeSave?: BeforeSaveFunction<T>;
  };

  export type UpdateOptions<T> = BaseOptions & {
    beforeSave?: BeforeSaveFunction<T>;
  };

  export type DeleteOptions = BaseOptions;

  export type ServeOptions<T = unknown> = ResourceOptions<T> & {
    before?: restify.RequestHandler[] | restify.RequestHandler;
    after?: restify.RequestHandler[] | restify.RequestHandler;
  };

  export class Resource<T> extends EventEmitter {
    public Model: mongoose.Model<T>;
    public options: ResourceOptions<T>;

    constructor(Model: mongoose.Model<T>, options?: ResourceOptions<T>) {
      super();
      this.Model = Model;
      this.options = { ...options };
      this.options.queryString = this.options.queryString || '_id';
      this.options.pageSize = this.options.pageSize || 100;
      this.options.maxPageSize = this.options.maxPageSize || 100;
      this.options.baseUrl = this.options.baseUrl || '';
      this.options.outputFormat = this.options.outputFormat || 'regular';
      this.options.modelName = this.options.modelName || Model.modelName;
      this.options.queryOperators = this.options.queryOperators;
      this.options.queryFields = this.options.queryFields;
      this.options.listProjection = this.options.listProjection || ((_req: restify.Request, item: mongoose.HydratedDocument<T>) => item);
      this.options.detailProjection = this.options.detailProjection || ((_req: restify.Request, item: mongoose.HydratedDocument<T>) => item);
    }

    query(options?: QueryOptions<T>): restify.RequestHandler {
      const queryOptions: QueryOptions<T> = {
        pageSize: this.options.pageSize,
        maxPageSize: this.options.maxPageSize,
        baseUrl: this.options.baseUrl,
        projection: this.options.listProjection,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        queryString: this.options.queryString,
        filter: this.options.filter,
        populate: this.options.populate,
        select: this.options.select,
        sort: this.options.sort,
        queryOperators: this.options.queryOperators,
        queryFields: this.options.queryFields,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            let query = this.Model.find({});
            let countQuery = this.Model.find({});

            const reqQuery = req.query as Record<string, string | undefined> | undefined;
            if (reqQuery && reqQuery.q) {
              let q: unknown;
              try {
                q = JSON.parse(reqQuery.q);
              } catch (err) {
                res.send(400, { message: 'Query is not a valid JSON object', errors: err });
                return;
              }

              const validation = validateQuery(q, {
                queryOperators: queryOptions.queryOperators,
                queryFields: queryOptions.queryFields
              });

              if (!validation.valid) {
                res.send(400, { message: validation.message });
                return;
              }

              query = query.where(q as Record<string, unknown>);
              countQuery = countQuery.where(q as Record<string, unknown>);
            }

            applySelect(query, queryOptions, req);
            applyPopulate(query, queryOptions, req);
            applySort(query, queryOptions, req);

            const filterQuery = await runFilter(queryOptions.filter, req, res);
            if (filterQuery) {
              query = query.where(filterQuery);
              countQuery = countQuery.where(filterQuery);
            }

            const rawP = reqQuery ? reqQuery.p : undefined;
            const pNum = Number(rawP);
            const page = !isNaN(pNum) && pNum >= 0 ? pNum : 0;

            const rawPageSize = reqQuery ? reqQuery.pageSize : undefined;
            const pageSizeNum = Number(rawPageSize);
            const requestedPageSize = !isNaN(pageSizeNum) && pageSizeNum > 0 ? pageSizeNum : queryOptions.pageSize!;
            const pageSize = Math.min(requestedPageSize, queryOptions.maxPageSize!);

            query.skip(pageSize * page);
            query.limit(pageSize + 1);

            let models: mongoose.HydratedDocument<T>[];
            let totalCount: number;
            try {
              [models, totalCount] = await Promise.all([
                query.exec(),
                countQuery.countDocuments()
              ]);
            } catch (err) {
              return next(restifyError(err));
            }

            applyPageLinks(req, res, page, pageSize, queryOptions.baseUrl!, totalCount, models);
            applyTotalCount(res, totalCount);

            const projectedModels = await Promise.all(
              models.map((model) => runProjection(queryOptions.projection, req, model))
            );

            this.emit('query', projectedModels);
            sendData(res, queryOptions.outputFormat!, queryOptions.modelName!, 200, projectedModels);
            return next();
          } catch (err) {
            return next(restifyError(err));
          }
        })();
      };
    }

    detail(options?: DetailOptions<T>): restify.RequestHandler {
      const detailOptions: DetailOptions<T> = {
        queryString: this.options.queryString,
        filter: this.options.filter,
        projection: this.options.detailProjection,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        populate: this.options.populate,
        select: this.options.select,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            const find = {
              [detailOptions.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            applySelect(query, detailOptions, req);
            applyPopulate(query, detailOptions, req);

            const filterQuery = await runFilter(detailOptions.filter, req, res);
            if (filterQuery) {
              query = query.where(filterQuery);
            }

            const model = await query.exec();
            if (!model) {
              throw new restifyErrors.ResourceNotFoundError(req.params.id);
            }

            const projected = await runProjection(detailOptions.projection, req, model);
            this.emit('detail', projected);
            sendData(res, detailOptions.outputFormat!, detailOptions.modelName!, 200, projected);
            return next();
          } catch (err) {
            return next(err);
          }
        })();
      };
    }

    insert(options?: InsertOptions<T>): restify.RequestHandler {
      const insertOptions: InsertOptions<T> = {
        baseUrl: this.options.baseUrl,
        beforeSave: this.options.beforeSave,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            const model = new this.Model(req.body);

            try {
              await runBeforeSave(insertOptions.beforeSave, req, model);
              const savedModel = await model.save();
              setLocationHeader(req, res, true, insertOptions.baseUrl!, savedModel);
              this.emit('insert', savedModel);
              sendData(res, insertOptions.outputFormat!, insertOptions.modelName!, 201, savedModel);
              return next();
            } catch (err) {
              throw restifyError(err);
            }
          } catch (err) {
            return next(err);
          }
        })();
      };
    }

    update(options?: UpdateOptions<T>): restify.RequestHandler {
      const updateOptions: UpdateOptions<T> = {
        queryString: this.options.queryString,
        filter: this.options.filter,
        baseUrl: this.options.baseUrl,
        beforeSave: this.options.beforeSave,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            const find = {
              [updateOptions.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            const filterQuery = await runFilter(updateOptions.filter, req, res);
            if (filterQuery) {
              query = query.where(filterQuery);
            }

            const model = await query.exec();
            if (!model) {
              throw new restifyErrors.ResourceNotFoundError(req.params.id);
            }

            if (!req.body) {
              throw new restifyErrors.InvalidContentError('No update data sent');
            }

            model.set(req.body as Partial<T>);

            try {
              await runBeforeSave(updateOptions.beforeSave, req, model);
              const savedModel = await model.save();
              setLocationHeader(req, res, false, updateOptions.baseUrl!, savedModel);
              this.emit('update', savedModel);
              sendData(res, updateOptions.outputFormat!, updateOptions.modelName!, 200, savedModel);
              return next();
            } catch (err) {
              throw restifyError(err);
            }
          } catch (err) {
            return next(err);
          }
        })();
      };
    }

    remove(options?: DeleteOptions): restify.RequestHandler {
      const deleteOptions: DeleteOptions = {
        queryString: this.options.queryString,
        filter: this.options.filter,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            const find = {
              [deleteOptions.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            const filterQuery = await runFilter(deleteOptions.filter, req, res);
            if (filterQuery) {
              query = query.where(filterQuery);
            }

            const model = await query.exec();
            if (!model) {
              throw new restifyErrors.ResourceNotFoundError(req.params.id);
            }

            await model.deleteOne();

            this.emit('remove', model);
            sendData(res, deleteOptions.outputFormat!, deleteOptions.modelName!, 200, model);
            return next();
          } catch (err) {
            return next(err);
          }
        })();
      };
    }

    delete(options?: DeleteOptions): restify.RequestHandler {
      return this.remove(options);
    }

    serve(path: string, server: restify.Server, options?: ServeOptions<T>): void {
      const serveOptions = options || {};

      const handlerChain = (
        handler: restify.RequestHandler,
        before?: restify.RequestHandler[] | restify.RequestHandler,
        after?: restify.RequestHandler[] | restify.RequestHandler
      ): restify.RequestHandler[] => {
        let handlers: restify.RequestHandler[] = [];

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

      server.get(path, handlerChain(this.query(serveOptions), serveOptions.before, serveOptions.after));
      server.get(closedPath + ':id', handlerChain(this.detail(serveOptions), serveOptions.before, serveOptions.after));
      server.post(path, handlerChain(this.insert(serveOptions), serveOptions.before, serveOptions.after));
      server.del(closedPath + ':id', handlerChain(this.remove(serveOptions), serveOptions.before, serveOptions.after));
      server.patch(closedPath + ':id', handlerChain(this.update(serveOptions), serveOptions.before, serveOptions.after));
    }
  }
}

// Attach Resource class and default property for compatibility
Object.assign(restifyMongoose, {
  Resource: restifyMongoose.Resource,
  validateQuery,
  DEFAULT_ALLOWED_OPERATORS,
  default: restifyMongoose
});

export = restifyMongoose;
