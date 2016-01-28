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
Promises.promisifyAll(redis.RedisClient.prototype);
Promises.promisifyAll(redis.Multi.prototype);

/**
 * for client
 */
class RedisService {

  /**
   * redis config of `https://github.com/NodeRedis/node_redis`
   * @param {options} options
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
   * save to redis
   * @param key
   * @param data
   * @param ttl
   * @return {Promise|bluebird|*}
   */
  save(key, data, ttl) {
    return this._engine
      .set(key, data, ttl)
      .then((data) => {
        if (data) {
          return JSON.parse(data);
        }
        return null;
      });
  }

  /**
   * get from redis
   * @param key
   * @return {Promise|bluebird|*}
   */
  get(key) {
    return this._engine.get(key);
  }

  del(key) {
    return this._engine.del(key);
  }

}

module.exports = RedisService;
