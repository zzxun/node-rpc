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
      util      = require('./util'),
      redis     = require('./redis');

/**
 * redis cache key
 * @type {Function}
 * @private
 */
const _REDIS_KEY = _.template('__M:_THRIFT_SERVICE__<%= alias %>__<%= id %>');
// 1 minite
const _REDIS_TTL = 60;
const _ID_LEN = 10;

/**
 * thrift default host: port
 */
const HOST = 'localhost';
const PORT = 7070;

/**
 * emit events
 */
const EVENT = {
  INIT : 'init',
  ERROR: 'error',
  LOG  : 'log'
};

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
    // random server id
    this._id = util.randStr(_ID_LEN);
    // inital services
    this._services = this.add(options.services);
    // parser thrift host port
    options.thrift = _.merge({port: PORT, host: HOST}, options.thrift);
    this._host = _.isString(options.thrift.host) ? options.thrift.host : HOST;
    this._port = _.isNumber(options.thrift.port) ? options.thrift.port : PORT;
    // LOG
    this.emit(EVENT.LOG, 'Set thrift host: ' + this._host + ' , port: ' + this._port);
    // init redis
    this._redis = new redis(options.redis);
    // redis on error
    this.redis.getEngine().on('error', (err) => {
      this.emit(EVENT.ERROR, err);
    });
    // inner msg handler
    if (ThriftMsg) {
      if (ThriftMsg.Processor) {
        processor = ThriftMsg.Processor;
      }
    }
    this._innerHandler = new ThriftMsg({
      call(cmsg, callback) {
        let base   = cmsg.base,
            caller = cmsg.call;

        let rmsg = new ttypes.RMsg({
          base: base,
          res : new ttypes.Res({
            err   : 'fuck',
            result: JSON.stringify(caller)
          })
        });
        callback(null, rmsg);
      }
    }, {});
    // LOG
    this.emit(EVENT.INIT, 'Init thrift Server');
  }

  /**
   * add service or services
   * @param {Array|Object} services array - services, object - service, in each service:
   *   {
   *     1. {String} [alias] // unique, if null, use the service.name or service.identity
   *     2. {Object|String} service // service name for global, or service object
   *     3. {Array|String} [methods] // method permission, if null, allow all service method
   *   }
   */
  add(services) {
    // trans
    services = util.trans2Array(services, _.isObject);
    // each
    services.forEach((data) => {
      // alias/service/method
      let alias   = data.alias,
          service = data.service,
          methods = util.trans2Array(data.methods, _.isString);
      // alias
      alias = util.exec((alias) ? alias : (service.name || service.identity));
      if (_.isString(alias)) {
        let tmp = {};
        methods.forEach((method) => {
          if (service && _.isFunction(service[method])) {
            tmp[method] = service;
          } else {
            this.emit(EVENT.ERROR, new Error('invalid service or method'));
          }
        });
        this._services[alias] = tmp;
        this._addToRedis(alias, tmp);
      }
    });
  }

  /**
   * remove service or services
   * @param {Array|String} aliases array - aliases, string - alias
   */
  remove(aliases) {
    // trans params
    aliases = util.trans2Array(aliases, _.isString);
    // del each
    aliases.forEach((alias) => {
      delete this._services[alias];
      this._removeFromRedis(alias);
    });
  }

  /**
   * init redis and register all service
   * @private
   */
  _addToRedis(alias, data) {
    return this._redis.save(_REDIS_KEY({alias: alias, id: this._id}), data, _REDIS_TTL)
      .catch((err) => {
        this.emit(EVENT.ERROR, err);
      });
  }

  /**
   * init redis and register all service
   * @private
   */
  _removeFromRedis(alias) {
    return this._redis.del(_REDIS_KEY({alias: alias, id: this._id}))
      .catch((err) => {
        this.emit(EVENT.ERROR, err);
      })
  }

  /**
   * after inital all and start thrift server
   */
  start() {
    this._server = thrift.createServer(ThriftMsg);
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
    return this._port
  }

}

new ThriftServer({}).start();

console.log(ThriftMsg.toString());
