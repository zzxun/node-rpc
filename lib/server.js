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
const transport = require('./transport'),
      utils     = require('./util'),
      Adapter   = require('./adapter');

const Processor = transport.Processor;

const EVENT = utils.EVENT;

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

    options = options || {};

    let self = this;

    // adapter
    self._adapter = new Adapter(options.adapter);
    self._adapter.on(EVENT.ERROR, (err) => {
      self.emit(EVENT.ERROR, err);
    });

    self._adapter.on(EVENT.READY, (info) => {

      self.emit(EVENT.LOG.INFO, info);

      // parser thrift host port
      self._host = utils.getLocalIPv4();
      options.thrift = _.merge({port: PORT, host: self._host}, options.thrift);
      self._host = _.isString(options.thrift.host) ? options.thrift.host : self._host;

      self._services = new Map();

      utils.getUnusedPort(_.isNumber(options.thrift.port) ? options.thrift.port : PORT)
        .then((port) => {
          self._port = port;
          self._id = self._host + ':' + self._port;
          return null;
        })
        .then(() => {
          if (options.thrift.alias && options.thrift.processor && options.thrift.handler) {
            self._innerThriftProcessor = options.thrift.processor;
            self._innerHandler = options.thrift.handler;
            self._serverOptions = options.thrift.options;
            self._custom = true;

            self.emit(EVENT.LOG.INFO, 'Use use-defined thrift Processor');
          } else {
            // init thrift handler
            self._initThriftHandler();

            self.emit(EVENT.LOG.INFO, 'Use inner thrift Processor');
          }
          return null;
        }).then(() => {

        // after inital all and start thrift server
        self._server = thrift.createServer(self._innerThriftProcessor, self._innerHandler, self._serverOptions || {});
        self._server.listen(self._port);

        // inital service
        if (self._custom) {
          return self._publish(options.thrift.alias,
            {host: self._host, port: self._port, actions: false},
            utils.TTL);
        } else {
          self.add = self._add;
          // inital service
          return self._add(options.services);
        }

      }).then(() => {
        // emit listening
        self.emit(utils.EVENT.READY, 'ThriftServer ready on ' + self._id);

      }).catch((err) => {
        self.emit(utils.EVENT.ERROR, err);
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

    if (!this._custom) {

      services = utils.trans2Array(services, _.isObject);

      return Promises.map(services, (s) => {
        // alias/service/actions
        let alias   = s.alias,
            service = s.service,
            actions = utils.trans2Array(s.actions, _.isString);

        alias = utils.exec((alias) ? alias : (service.name || service.identity));
        if (_.isString(alias)) {
          let checks = false;
          if (!_.isEmpty(actions)) {
            checks = {};
            actions.forEach((action) => {
              if (service && _.isFunction(service[action])) {
                checks[action] = true;
              } else {
                this.emit(utils.EVENT.ERROR, {
                  err    : 'Invalid service or action',
                  message: 'service: ' + alias + ', action: ' + action
                });
              }
            });
          }
          // memory
          this._services.set(alias, {origin: service, actions: checks});
          // public
          return this._publish(alias,
            {host: this._host, port: this._port, actions: checks}, utils.TTL
          ).catch((err) => {
            this.emit(utils.EVENT.ERROR, {
              err    : err,
              message: 'Publish error, ' + 'service: ' + alias + ', actions: ' + actions
            });
          });
        }
        return null;
      });
    }

    return Promises.reject('Disable for this mode');
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

  _publish(alias, data, ttl) {
    this.emit(EVENT.LOG.INFO, 'Publish service ' + alias + '.' + this._id);
    return this._adapter.publish({alias: alias, id: this._id}, data, ttl);
  }

  /**
   * init thrift handler of this
   * @private
   */
  _initThriftHandler() {
    // inner msg handler
    let self = this;
    this._innerThriftProcessor = Processor;
    this._innerHandler = {
      call(cmsg, callback) {
        // get params
        let base    = cmsg.base,
            caller  = cmsg.call,
            service = self._services.get(caller.name);
        self.emit(EVENT.LOG.DEBUG, 'IN ' + JSON.stringify({
            id   : base.id, sender: base.sender,
            alias: caller.name, action: caller.action, params: caller.params
          }));
        // set sender
        base.sender = self._id;
        // handler call
        transport.callingHandler(cmsg, service, (err, rmsg) => {
          self.emit(EVENT.LOG.DEBUG, 'OUT ' + (err || rmsg.res));
          callback(err, rmsg);
        });
      }
    };
  }
}

exports.ThriftServer = ThriftServer;
