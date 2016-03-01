/**
 * manage zookeeper client
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

    let self = this;

    self._root = options.root;
    // initial
    options = _.merge({
      connect                 : '127.0.0.1:2181',
      timeout                 : 200000,
      debug_level             : ZooKeeper.ZOO_LOG_LEVEL_ERROR,
      host_order_deterministic: false,
      data_as_buffer          : false
    }, options);

    self._zk = new ZooKeeper(options);
    self._zk.connect((err) => {
      if (err) {
        throw err;
      }

      self._createNode(self._root, '', ZooKeeper.ZOO_PERSISTENT)
        .then(() => {
          self.emit(utils.EVENT.READY, 'Connected to zookeeper ' + options.connect);
        })
        .catch((err) => {
          throw err;
        });

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
          this.emit(utils.EVENT.DEBUG, 'Create or Exist path: ' + (path || this._root));
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
   * get key string
   * @param {Object} keyObj
   */
  getKey(keyObj) {
    return this._root + utils.KEY({slash: '/', alias: keyObj.alias}) +
      utils.KEY({slash: '/', alias: keyObj.alias, id: keyObj.id});
  }

  /**
   * subscribe this._root / alias
   * @param {Object} keyObj
   * @param {Function} callback
   */
  subscribe(keyObj, callback) {
    let path = this._root + utils.KEY({slash: '/', alias: keyObj.alias});
    let watcher = (type, state, _path) => {
      if (path === _path && type === ZooKeeper.ZOO_CHILD_EVENT && state === ZooKeeper.ZOO_CONNECTED_STATE) {
        this._zk.aw_get_children(path, watcher, (rc, error, childrens) => {
          if (rc !== 0 && error) {
            callback(error, []);
          } else {
            callback(null, childrens);
          }
        });
      }
    };
    this._zk.aw_get_children(path, watcher, () => {
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
   * @param {Object} keyObj
   * @returns {*}
   */
  del(keyObj) {
    let path = this.getKey(keyObj);
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

