/**
 * redis client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const redis = require('redis');
const Promises = require('bluebird');
Promises.promisifyAll(redis.RedisClient.prototype);
Promises.promisifyAll(redis.Multi.prototype);

/**
 * for client
 */
class RedisService {

  /**
   * redis config of `https://github.com/NodeRedis/node_redis`
   * @param {Object} [options]
   */
  constructor(options) {
    // a new redis client
    this._engine = redis.createClient(options);
  }

  /**
   * get redis client
   * @returns {redis} redis client
   */
  getEngine() {
    return this._engine;
  }

  /**
   * using engine's `on` method
   * @param event
   * @param fn
   */
  on(event, fn) {
    this._engine.on(event, fn);
  }

  /**
   * save to redis
   * @param {String} key
   * @param {String} data
   * @param {Number} ttl second
   * @return {Promise|bluebird|*}
   */
  save(key, data, ttl) {
    return this._save(key, data, ttl)
      .bind(this)
      .then(() => {
        setInterval(() => {
          this._save(key, data, ttl);
        }, 1000 * ttl);
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
   * get keys from redis
   * @param pattern
   * @return {Promise|bluebird|*}
   */
  getListKeys(pattern) {
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
    return this._engine.delAsync(key);
  }

}

module.exports = RedisService;
