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
const Promises = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types'),
      utils     = require('./util'),
      Adapter   = require('./adapter');

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
   *     1. adapter: { // {Object} config
   *         [name='zookeeper'] // redis or zookeeper
   *         [options={}] // options of adapter
   *     }
   *     2. [services] // {Array|Object} handler config, a array list or only one,
   *         or you can use `.add` to add new one (for js)
   *     3. thrift: { // thrift config
   *         [port]: get an unused port start from 7007
   *         [host]: get an ipv4 from eth0(linux) en0(osx)
   *
   *         // create gen-nodejs server
   *         alias
   *         processor
   *         handler
   *         options
   *     }
   *   }
   */
  constructor(options) {
    // father
    super();
    // null
    options = options || {};
    // init redis
    this._adapter = new Adapter(options.adapter);
    // redis on error
    this._adapter.on(utils.EVENT.ERROR, (err) => {
      this.emit(utils.EVENT.ERROR, options.adapter, err);
    });

    this._adapter.on(utils.EVENT.READY, () => {
      // parser thrift host port
      this._host = utils.getLocalIPv4();
      options.thrift = _.merge({port: PORT, host: this._host}, options.thrift);
      this._host = _.isString(options.thrift.host) ? options.thrift.host : this._host;
      // random server id
      this._id = process.pid + '.' + utils.randStr();
      this._services = new Map();

      utils.getUnusedPort(_.isNumber(options.thrift.port) ? options.thrift.port : PORT)
        .bind(this)
        .then((port) => {
          this._port = port;
        })
        .then(() => {
          if (options.thrift.alias && options.thrift.processor && options.thrift.handler) {
            this._innerThriftProcessor = options.thrift.processor;
            this._innerHandler = options.thrift.handler;
            this._serverOptions = options.thrift.options;
            this._custom = true;
          } else {
            // init thrift handler
            this._initThriftHandler();
          }
        }).then(() => {

        // after inital all and start thrift server
        this._server = thrift.createServer(this._innerThriftProcessor, this._innerHandler, this._serverOptions || {});
        this._server.listen(this._port);

        // inital service
        if (this._custom) {
          return this._adapter.publish({alias: options.thrift.alias, id: utils.ID(this._host)},
            {id: this._id, host: this._host, port: this._port, actions: false},
            utils.TTL);
        } else {
          this.add = this._add;
          // inital service
          return this._add(options.services);
        }

      }).then(() => {
        // emit listening
        this.emit(utils.EVENT.READY, 'ThriftServer host: ' + this._host + ' , port: ' + this._port, ' , id: ' + this._id);

      }).catch((err) => {
        this.emit(utils.EVENT.ERROR, err);
      });

    });
  }

  /**
   * add service or services
   * @param {Array|Object} services array - services, object - service, in each handler:
   *   {
   *     1. {String} [alias] // unique, if null, use the hanlder.name or hanlder.identity
   *     2. {Object|String} service // service object
   *     3. {Array|String} [actions] // permission, if null, allow all service actions, ONLY support PROMISE/SYNC
   *     *4. {String} [version]
   *   }
   * @return {Promises|bluebird|*}
   */
  _add(services) {

    // trans
    services = utils.trans2Array(services, _.isObject);
    // each
    return Promises.map(services, (s) => {
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
          actions.forEach((action) => {
            if (service && _.isFunction(service[action])) {
              checks[action] = true;
            } else {
              this.emit(utils.EVENT.ERROR, 'invalid service or method', 'service: ' + alias + ', action: ' + action);
            }
          });
        }
        // memory
        this._services.set(alias, {origin: service, actions: checks});
        // public
        this._adapter.publish({alias: alias, id: utils.ID(this._host)},
          {id: this._id, host: this._host, port: this._port, actions: checks},
          utils.TTL
        ).catch((err) => {
          this.emit(utils.EVENT.ERROR, 'publish error, ' + 'service: ' + alias + ', actions: ' + actions, err);
        });
      }

    });
  }

  /**
   * @returns {ThriftServer.server}
   */
  server() {
    return this._server;
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
    let self = this;
    this._innerThriftProcessor = ThriftMsg;
    this._innerHandler = {
      call(cmsg, callback) {
        // get params
        let base    = cmsg.base,
            caller  = cmsg.call,
            service = self._services.get(caller.name);
        self.emit(utils.EVENT.LOG, JSON.stringify(cmsg));
        // set sender
        base.sender = self._host + '.' + self._id;
        // caller.
        if (service && service.origin[caller.action]) {
          // check permission
          if (service.actions && !service.actions[caller.action]) {
            callback(new ttypes.ThriftCallingException({err: 'action error', message: 'aciton forbidden'}), null);
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
            err    : 'action error',
            message: 'cannot find service ' + caller.name + ' or action ' + caller.action
          }), null);
        }
      }
    };
  }
}

exports.ThriftServer = ThriftServer;
