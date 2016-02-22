/**
 * protocol
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 * @private
 */
const _ = require('lodash');
const EventEmitter = require('events').EventEmitter;

/**
 * using a dependency system (zookeeper or redis etc.) to pub/sub services
 */
class Adapter extends EventEmitter {

  /**
   * initial
   *
   * @param {Object} options include:
   *   1. name {String} redis/zookeeper/...
   *   2. options {Object} of adapter
   */
  constructor(options) {
    super();

    options = _.merge({name: 'redis', options: {}}, options);
    try {
      let adapter = require('./' + options.name);
      this._adapter = new adapter(options.options);
    } catch (e) {
      console.log(e);
      throw new TypeError('unsupported adapter');
    }
  }

  /**
   * save data to adapter
   *
   * @param {String} key
   * @param {String|Object} data
   * @param {Number} [ttl] second
   * @returns {*|Promise|bluebird|*}
   */
  save(key, data, ttl) {
    data = _.isString(data) ? data : JSON.stringify(data);
    return this._adapter.save(key, data, ttl);
  }

  /**
   * register event cb
   *
   * @param event
   * @param cb
   */
  on(event, cb) {
    if (this._adapter.on && _.isFunction(this._adapter.on)) {
      this._adapter.on(event, cb);
    }
  }

  /**
   * get list nodes or keys
   * @param pattern
   */
  getListKeys(pattern) {
    return this._adapter.getListKeys(pattern);
  }

  /**
   * get values of all keys
   * @param keys
   */
  getListValues(keys) {
    return this._adapter.getListValues(keys);
  }

  /**
   * delete
   * @param key
   * @returns {*}
   */
  del(key) {
    return this._adapter.del(key);
  }
}

module.exports = Adapter;
