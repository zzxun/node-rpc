/**
 * protocol
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');
const ZooKeeper = require('zookeeper');
const Promises = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const utils = require('./util');

class ZookeeperService extends EventEmitter {

  constructor(options) {
    super();

    // this
    this._root = utils.KEY({slash: '/', alias: 'wan', id: 'services'});
    // initial
    options = _.merge({
      connect                 : '127.0.0.1:2181',
      timeout                 : 60000,
      debug_level             : ZooKeeper.ZOO_LOG_LEVEL_WARN,
      host_order_deterministic: false,
      data_as_buffer          : false
    }, options);
    // init
    this._zk = new ZooKeeper(options);
    this._zk.connect((err) => {
      if (err) {
        throw err;
      }
      this._zk.a_create (this._root,
        '', ZooKeeper.ZOO_PERSISTENT, (rc, error, path) => {
          if (rc === 0 || rc === -110) {
            this.emit(utils.EVENT.DEBUG, 'create or exist path: ' + (path || this._root));
          } else {
            if (error) {
              // other error
              throw error;
            }
          }
        });

      this.emit(utils.EVENT.LOG, 'zk session established, id = ' + this._zk.client_id);
    });
  }

  /**
   * save data to adapter
   *
   * @param {Object} key
   * @param {String|Object} data
   * @returns {*|Promise|bluebird|*}
   */
  save(key, data) {
    // PERSISTENT for service *
    let folder = this._root + utils.KEY({slash: '/', alias: key.alias});
    return this._createNode(folder, '', ZooKeeper.ZOO_PERSISTENT)
      .then(() => {
        // create `Ephemeral Node` for each providers
        return this._createNode(folder + utils.KEY({slash: '/', alias: key.alias, id: key.id}), data,
          ZooKeeper.ZOO_EPHEMERAL);
      });
  }

  _createNode(path, data, mode) {
    return new Promises((resolve, reject) => {
      this._zk.a_create(path, data, mode, (rc, error, path) => {
        if (rc === 0 || rc === -110) {
          this.emit(utils.EVENT.DEBUG, 'create or exist path: ' + (path || this._root));
        } else {
          if (error) {
            // other error
            return reject(error);
          }
        }
        return resolve(true);
      });
    });
  }

  /**
   * get all available services key name
   * @param pattern
   * @return {Promise|bluebird|*}
   */
  getListKeys(pattern) {
    pattern = this._root + utils.KEY({slash: '/', alias: pattern.alias});
    return new Promises((resolve, reject) => {
      this._zk.a_get_children(pattern, true, (rc, error, childrens) => {
        if (rc !== 0 && error) {
          return reject(error);
        }
        childrens = _.map(childrens, (child) => {
          return pattern + '/' + child;
        });
        return resolve(childrens);
      });
    });
  }

  /**
   * get values of all keys
   * @param keys
   */
  getListValues(keys) {
    let values = [];
    return Promises.map(keys, (key) => {
      return new Promises((resolve) => {
        this._zk.a_get(key, false, (rc, error, stat, data) => {
          return resolve(data);
        });
      }).then((data) => {
        values.push(data);
      });
    }).then(() => {
      return (values);
    });
  }

  /**
   * delete
   * @param key
   * @returns {*}
   */
  del(key) {
    let path = this._root + utils.KEY({slash: '/', alias: key.alias}) +
      utils.KEY({slash: '/', alias: key.alias, id: key.id});
    return new Promises((resolve, reject) => {
      this._zk.a_delete_(path, 0, (rc, error) => {
        if (rc !== 0 && rc !== -101 && error) {
          return reject(error);
        }
        return resolve(true);
      });
    });
  }
}

module.exports = ZookeeperService;

