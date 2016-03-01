/**
 * redis client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');
const redis = require('redis');
const Promises = require('bluebird');
const EventEmitter = require('events').EventEmitter;

const utils = require('./util');
Promises.promisifyAll(redis.RedisClient.prototype);
Promises.promisifyAll(redis.Multi.prototype);

/**
 * for client
 */
class RedisService extends EventEmitter {

  /**
   * redis config of `https://github.com/NodeRedis/node_redis`
   * @param {Object} [options]
   */
  constructor(options) {
    super();

    let self = this;

    self._options = _.merge({
      host: '127.0.0.1',
      port: '6379',
      db  : 0
    }, options);
    // a new redis client
    self._engine = redis.createClient(self._options);
    self._subpub = redis.createClient(self._options);

    self._engine.on(utils.EVENT.READY, () => {

      // initial subscribe
      self._subCbs = new Map();
      self._subpub.on('message', (channel, message) => {
        let callback = self._subCbs.get(channel);
        if (_.isFunction(callback)) {
          callback(null, [message]);
        }
      });

      self.emit(utils.EVENT.READY, 'Connect to Redis ' + self._options.host + ':' +
        self._options.port + '@' + self._options.db);
    });

    self._engine.on(utils.EVENT.ERROR, (err) => {
      self.emit(utils.EVENT.LOG.ERROR, err);
    });

  }

  /**
   * get redis client
   * @returns {redis} redis client
   */
  getEngine() {
    return this._engine;
  }

  /**
   * save to redis
   * @param {Object} keyObj
   * @param {String} data
   * @param {Number} ttl second
   * @return {Promise|bluebird|*}
   */
  save(keyObj, data, ttl) {
    let key = utils.getKey(keyObj);
    return this._save(key, data, ttl)
      .bind(this)
      .then(() => {
        setInterval(() => {
          this._save(key, data, ttl);
        }, 1000 * (ttl - 1));

        this.publish(keyObj, key);
      });
  }

  _save(key, data, ttl) {
    return this._engine
      .setAsync(key, data)
      .then(() => {
        return this._engine.expireAsync(key, ttl);
      });
  }

  /**
   * publish message to a channel
   *
   * @param keyObj
   * @param data
   */
  publish(keyObj, data) {
    this._engine.publish(utils.getKey({alias: keyObj.alias}), data);
  }

  /**
   * subscribe utils.KEY({alias, '*'})
   * @param {Object} [keyObj]
   * @param {Function} callback(err, [newKeys])
   */
  subscribe(keyObj, callback) {
    let channel = utils.getKey({alias: keyObj.alias});
    if (!this._subCbs.get(channel)) {
      // register
      this._subpub.subscribe(channel);
      this._subCbs.set(channel, callback);
    }
  }

  /**
   * get keys from redis
   * @param pattern
   * @return {Promise|bluebird|*}
   */
  getListKeys(pattern) {
    pattern = utils.getKey(pattern);
    return this._engine.keysAsync(pattern);
  }

  /**
   * get values from redis
   * @param keys
   * @returns {*}
   */
  getListValues(keys) {
    return this._engine.mgetAsync(keys);
  }

  /**
   * delete
   *
   * @param key
   * @returns {*}
   */
  del(key) {
    key = utils.getKey(key);
    return this._engine.delAsync(key);
  }

}

module.exports = RedisService;
