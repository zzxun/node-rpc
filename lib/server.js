/**
 * server
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 * @private
 */
const _ = require('lodash');
const thrift = require('thrift');
const EventEmitter = require('events').EventEmitter;
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types'),
      utils     = require('./util'),
      redis     = require('./redis');

/**
 * thrift default host: port
 */
const HOST = 'localhost';
const PORT = 7007;

/**
 * manage all thrift service
 */
class ThriftServer extends EventEmitter {

  /**
   * config options
   * @param {Object} options config include:
   *   {
   *     1. redis // {Object} redis config
   *     2. services // {Array|Object} services config, a array list or only one,
   *         or you can use `.add` to add new one (for js)
   *     3. thrift: { // thrift config
   *         [port]: 7007
   *         [host]: localhost
   *     }
   *   }
   */
  constructor(options) {
    // father
    super();
    // null
    options = options || {};
    // random server id
    this._id = utils.randStr();

    // init redis
    this._redis = new redis(options.redis);
    // redis on error
    this._redis.getEngine().on('error', (err) => {
      this.emit(utils.EVENT.ERROR, err);
    });

    // parser thrift host port
    options.thrift = _.merge({port: PORT, host: HOST}, options.thrift);
    this._host = _.isString(options.thrift.host) ? options.thrift.host : HOST;
    this._port = _.isNumber(options.thrift.port) ? options.thrift.port : PORT;

    // inital services
    this._services = {};
    this.add(options.services);

    // init thrift handler
    this._initThriftHandler();
  }

  /**
   * add service or services
   * @param {Array|Object} services array - services, object - service, in each service:
   *   {
   *     1. {String} [alias] // unique, if null, use the service.name or service.identity
   *     2. {Object|String} service // service object
   *     3. {Array|String} [methods] // method permission, if null, allow all service method,
   *      each method MUST BE A PROMISE
   *     *4. {String} [version]
   *   }
   */
  add(services) {
    // trans
    services = utils.trans2Array(services, _.isObject);
    // each
    services.forEach((data) => {
      // alias/service/method
      let alias   = data.alias,
          service = data.service,
          methods = utils.trans2Array(data.methods, _.isString);
      // alias
      alias = utils.exec((alias) ? alias : (service.name || service.identity));
      if (_.isString(alias)) {
        let checks = false;
        if (!_.isEmpty(methods)) {
          checks = {};
          methods.forEach((method) => {
            if (service && _.isFunction(service[method])) {
              checks[method] = true;
            } else {
              this.emit(utils.EVENT.ERROR, new Error('Invalid service or method'));
            }
          });
        }
        this._services[alias] = {origin: service, methods: checks};
        this._addToRedis(alias, {id: this._id, host: this._host, port: this._port, methods: checks});
      }

    });
  }

  /**
   * init redis and register all service
   * @private
   */
  _addToRedis(alias, data) {
    return this._redis.save(utils.REDIS_KEY({alias: alias, id: this._id}), data, utils.REDIS_TTL)
      .then(() => {
        setInterval(() => {
          this._addToRedis(alias, data);
        }, 1000 * utils.REDIS_TTL);
      })
      .catch((err) => {
        this.emit(utils.EVENT.ERROR, err);
      });
  }

  /**
   * after inital all and start thrift server
   */
  start() {
    // LOG
    this.emit(utils.EVENT.LOG, 'ThriftServer host: ' + this._host + ' , port: ' + this._port);
    // create _server
    this._server = thrift.createMultiplexServer(this._innerHandler);
    this._server.listen(this._port);
  }

  /**
   * @returns {ThriftServer.host}
   */
  host() {
    return this._host;
  }

  /**
   * @returns {ThriftServer.port}
   */
  port() {
    return this._port;
  }

  /**
   * init thrift handler of this
   * @private
   */
  _initThriftHandler() {
    // inner msg handler
    let _Processor = ThriftMsg;
    if (ThriftMsg.Processor) {
      _Processor = ThriftMsg.Processor;
    }
    let that = this;
    this._innerHandler = new _Processor({
      call(cmsg, callback) {
        // get params
        let base    = cmsg.base,
            caller  = cmsg.call,
            service = that._services[caller.name];
        // caller.
        if (service && service.origin[caller.method]) {
          // check permission
          if (service.methods && !service.methods[caller.method]) {
            callback(new ttypes.ThriftCallingException({err: 'method error', message: 'method forbidden'}), null);
          }
          let f = service.origin[caller.method].apply(null, JSON.parse(caller.params));
          // maybe promise
          if (_.isFunction(f.then) && _.isFunction(f.catch)) {
            f.then((result) => {
                let rmsg = new ttypes.RMsg({
                  base: base,
                  res : JSON.stringify({
                    result: result
                  })
                });
                callback(null, rmsg);
              })
              .catch((err) => {
                callback(new ttypes.ThriftCallingException({err: err, message: err.message}), null);
              });
          }
          // sync
          else {
            callback(null, new ttypes.RMsg({
              base: base,
              res : JSON.stringify({
                result: f
              })
            }));
          }
        } else {
          // no service
          callback(new ttypes.ThriftCallingException({
            err    : 'method error',
            message: 'Cannot find service ' + caller.name + ' or method ' + caller.method
          }), null);
        }
      }
    }, {});
  }
}

exports.ThriftServer = ThriftServer;
