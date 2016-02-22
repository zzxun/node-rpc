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
      Adapter  = require('./adapter');

/**
 * thrift default host: port
 */
const PORT = 7007;

/**
 * manage all thrift handler
 */
class ThriftServer extends EventEmitter {

  /**
   * config options
   * @param {Object} options config include:
   *   {
   *     1. protocol: { // {Object} config
   *         [adapter='redis'] // redis or zookeeper
   *         [options={}] // options of adapter
   *     }
   *     2. [services] // {Array|Object} handler config, a array list or only one,
   *         or you can use `.add` to add new one (for js)
   *     3. thrift: { // thrift config
   *         [port]: get an unused port start from 7007
   *         [host]: get an ipv4 from eth0(linux) en0(osx)
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
    this._adapter = new Adapter(options.protocol);
    // redis on error
    this._adapter.on('error', (err) => {
      this.emit(utils.EVENT.ERROR, err);
    });

    // parser thrift host port
    this._host = utils.getLocalIPv4();
    options.thrift = _.merge({port: PORT, host: this._host}, options.thrift);
    this._host = _.isString(options.thrift.host) ? options.thrift.host : this._host;
    utils.getUnusedPort(_.isNumber(options.thrift.port) ? options.thrift.port : PORT)
      .bind(this)
      .then((port) => {
        this._port = port;
      })
      .then(() => {

        // init thrift handler
        this._initThriftHandler();
        // inital service
        this.add(options.services);
      }).then(() => {

      // after inital all and start thrift server
      this._server = thrift.createServer(this._innerThriftProcessor, this._innerHandler, {});
      this._server.listen(this._port);

      // emit listening
      this._init = true;
      this.emit(utils.EVENT.LISTENING, 'ThriftServer host: ' + this._host + ' , port: ' + this._port, ' , id: ' + this._id);
    });
  }

  /**
   * add service or services
   * @param {Array|Object} services array - services, object - service, in each handler:
   *   {
   *     1. {String} [alias] // unique, if null, use the hanlder.name or hanlder.identity
   *     2. {Object|String} service // service object
   *     3. {Array|String} [actions] // method permission, if null, allow all hanlde's method,
   *      method support PROMISE/SYNC
   *     *4. {String} [version]
   *   }
   */
  add(services) {

    this._services = this._services || {};
    // trans
    services = utils.trans2Array(services, _.isObject);
    // each
    services.forEach((s) => {
      // alias/service/actions
      let alias   = s.alias,
          service = s.service,
          actions = utils.trans2Array(s.actions, _.isString);
      // alias
      alias = utils.exec((alias) ? alias : (service.name || service.identity));
      if (_.isString(alias)) {
        let checks = false;
        if (!_.isEmpty(actions)) {
          checks = {};
          actions.forEach((method) => {
            if (service && _.isFunction(service[method])) {
              checks[method] = true;
            } else {
              this.emit(utils.EVENT.ERROR, new Error('Invalid service or method'));
            }
          });
        }
        // memory
        this._services[alias] = {origin: service, actions: checks};
        // public
        this._adapter.save(utils.KEY({alias: alias, id: this._id}),
          {id: this._id, host: this._host, port: this._port, actions: checks},
          utils.TTL
        ).catch((err) => {
          this.emit(utils.EVENT.ERROR, err);
        });
      }

    });
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
    let that = this;
    this._innerThriftProcessor = ThriftMsg;
    this._innerHandler = {
      call(cmsg, callback) {
        // get params
        let base    = cmsg.base,
            caller  = cmsg.call,
            service = that._services[caller.name];
        that.emit(utils.EVENT.LOG, JSON.stringify(cmsg));
        // set sender
        base.sender = that._id + '.' + that._host;
        // caller.
        if (service && service.origin[caller.action]) {
          // check permission
          if (service.actions && !service.actions[caller.action]) {
            callback(new ttypes.ThriftCallingException({err: 'method error', message: 'method forbidden'}), null);
          }
          let median = service.origin[caller.action].apply(null, JSON.parse(caller.params));
          // maybe promise
          if (_.isFunction(median.then) && _.isFunction(median.catch)) {
            median.then((result) => {
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
                result: median
              })
            }));
          }
        } else {
          // no handler
          callback(new ttypes.ThriftCallingException({
            err    : 'method error',
            message: 'Cannot find handler ' + caller.name + ' or method ' + caller.action
          }), null);
        }
      }
    };
  }
}

exports.ThriftServer = ThriftServer;
