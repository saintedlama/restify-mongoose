import { EventEmitter } from 'events';
import * as util from 'util';
import * as restify from 'restify';
import restifyErrors from 'restify-errors';
import mongoose from 'mongoose';

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
    const responseObj: Record<string, unknown> = {
      [modelName]: data
    };
    res.json(status, responseObj);
  } else {
    res.send(status, data);
  }
}

async function runProjection<T, R = unknown>(
  projection: restifyMongoose.ProjectionFunction<T, R> | undefined,
  req: restify.Request,
  model: mongoose.HydratedDocument<T>
): Promise<R | mongoose.HydratedDocument<T>> {
  if (!projection) {
    return model;
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
      if (projection.length >= 3) {
        const callbackFn = projection as (
          req: restify.Request,
          item: mongoose.HydratedDocument<T>,
          cb: restifyMongoose.ProjectionCallback<R>
        ) => void;
        callbackFn(req, model, cb);
      } else {
        const directFn = projection as (
          req: restify.Request,
          item: mongoose.HydratedDocument<T>
        ) => Promise<R> | R;
        const res = directFn(req, model);
        if (res && typeof (res as Promise<R>).then === 'function') {
          (res as Promise<R>).then(resolve, reject);
        } else {
          resolve(res);
        }
      }
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
      if (beforeSave.length >= 3) {
        const callbackFn = beforeSave as (
          req: restify.Request,
          item: mongoose.HydratedDocument<T>,
          cb: restifyMongoose.BeforeSaveCallback
        ) => void;
        callbackFn(req, model, cb);
      } else {
        const directFn = beforeSave as (
          req: restify.Request,
          item: mongoose.HydratedDocument<T>
        ) => Promise<void> | void;
        const res = directFn(req, model);
        if (res && typeof (res as Promise<void>).then === 'function') {
          (res as Promise<void>).then(() => resolve(), reject);
        } else {
          resolve();
        }
      }
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
  populate(arg: string): unknown;
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
  options: { populate?: string },
  req: restify.Request
): void {
  const reqQuery = req.query as Record<string, string | undefined> | undefined;
  const populate = (reqQuery && reqQuery.populate) || options.populate;
  if (populate) {
    query.populate(parseCommaParam(populate));
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
  export type FilterFunction = (req: restify.Request, res: restify.Response) => FilterResult;
  export type filterFunction = FilterFunction;

  export type ProjectionCallback<R = unknown> = (err?: unknown, doc?: R) => void;
  export type ProjectionFunction<T, R = unknown> =
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>, cb: ProjectionCallback<R>) => void)
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>) => Promise<R> | R);
  export type projectionFunction<T, R = unknown> = ProjectionFunction<T, R>;

  export type BeforeSaveCallback = (err?: unknown) => void;
  export type BeforeSaveFunction<T> =
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>, cb: BeforeSaveCallback) => void)
    | ((req: restify.Request, item: mongoose.HydratedDocument<T>) => Promise<void> | void);
  export type beforeSaveFunction<T> = BeforeSaveFunction<T>;

  export type BaseOptions = {
    baseUrl?: string;
    outputFormat?: string; // default 'regular'
    modelName?: string; // default Model.modelName
  };

  export type ResourceOptions<T, R = unknown> = BaseOptions & {
    queryString?: string;
    pageSize?: number;
    maxPageSize?: number;
    listProjection?: ProjectionFunction<T, R>;
    detailProjection?: ProjectionFunction<T, R>;
    filter?: FilterFunction;
    populate?: string;
    select?: string;
    sort?: string;
    beforeSave?: BeforeSaveFunction<T>;
  };

  export type QueryOptions<T, R = unknown> = BaseOptions & {
    pageSize?: number;
    maxPageSize?: number;
    projection?: ProjectionFunction<T, R>;
    populate?: string;
    select?: string;
    sort?: string;
  };

  export type DetailOptions<T, R = unknown> = BaseOptions & {
    projection?: ProjectionFunction<T, R>;
    populate?: string;
    select?: string;
  };

  export type InsertOptions<T> = BaseOptions & {
    beforeSave?: BeforeSaveFunction<T>;
  };

  export type UpdateOptions<T> = BaseOptions & {
    beforeSave?: BeforeSaveFunction<T>;
  };

  export type ServeOptions = {
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
      this.options.listProjection = this.options.listProjection || ((_req: restify.Request, item: mongoose.HydratedDocument<T>, cb: ProjectionCallback<mongoose.HydratedDocument<T>>) => {
        cb(null, item);
      });
      this.options.detailProjection = this.options.detailProjection || ((_req: restify.Request, item: mongoose.HydratedDocument<T>, cb: ProjectionCallback<mongoose.HydratedDocument<T>>) => {
        cb(null, item);
      });
    }

    query(options?: QueryOptions<T>): restify.RequestHandler {
      const queryOptions: QueryOptions<T> = {
        pageSize: this.options.pageSize,
        maxPageSize: this.options.maxPageSize,
        baseUrl: this.options.baseUrl,
        projection: this.options.listProjection,
        outputFormat: this.options.outputFormat,
        modelName: this.options.modelName,
        populate: this.options.populate,
        select: this.options.select,
        sort: this.options.sort,
        ...options
      };

      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            let query = this.Model.find({});
            let countQuery = this.Model.find({});

            const reqQuery = req.query as Record<string, string | undefined> | undefined;
            if (reqQuery && reqQuery.q) {
              try {
                const q = JSON.parse(reqQuery.q) as ModelFilter<T>;
                if (q) {
                  query = query.where(q);
                  countQuery = countQuery.where(q);
                }
              } catch (err) {
                res.send(400, { message: 'Query is not a valid JSON object', errors: err });
                return;
              }
            }

            applySelect(query, queryOptions, req);
            applyPopulate(query, queryOptions, req);
            applySort(query, queryOptions, req);

            if (this.options.filter) {
              const filterQuery = this.options.filter(req, res);
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
              [this.options.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            applySelect(query, detailOptions, req);
            applyPopulate(query, detailOptions, req);

            if (this.options.filter) {
              const filterQuery = this.options.filter(req, res);
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
              [this.options.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            if (this.options.filter) {
              const filterQuery = this.options.filter(req, res);
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

    remove(): restify.RequestHandler {
      return (req: restify.Request, res: restify.Response, next: restify.Next) => {
        void (async () => {
          try {
            const find = {
              [this.options.queryString!]: req.params.id
            } as ModelFilter<T>;

            let query = this.Model.findOne(find);

            if (this.options.filter) {
              const filterQuery = this.options.filter(req, res);
              query = query.where(filterQuery);
            }

            const model = await query.exec();
            if (!model) {
              throw new restifyErrors.ResourceNotFoundError(req.params.id);
            }

            await model.deleteOne();

            res.send(200, model);
            this.emit('remove', model);
            return next();
          } catch (err) {
            return next(err);
          }
        })();
      };
    }

    serve(path: string, server: restify.Server, options?: ServeOptions): void {
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

      server.get(path, handlerChain(this.query(), serveOptions.before, serveOptions.after));
      server.get(closedPath + ':id', handlerChain(this.detail(), serveOptions.before, serveOptions.after));
      server.post(path, handlerChain(this.insert(), serveOptions.before, serveOptions.after));
      server.del(closedPath + ':id', handlerChain(this.remove(), serveOptions.before, serveOptions.after));
      server.patch(closedPath + ':id', handlerChain(this.update(), serveOptions.before, serveOptions.after));
    }
  }
}

// Attach Resource class and default property for compatibility
Object.assign(restifyMongoose, {
  Resource: restifyMongoose.Resource,
  default: restifyMongoose
});

export = restifyMongoose;
