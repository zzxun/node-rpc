# node-thrift-service

`node >= 4.0.0`

Unlike other language, `javascript` can use `.apply` to call a `function`, so calling the remote nodejs service only need to transport `alias(of service), action(function of service, MUST BE A PROMISE/SYNC), params`. 

By using `Thrift` , it support two way to use this module: 

1. When calling `nodejs service`, use the inner `msg.thrift`
2. Using `use-defined.thrift`

Features:

- use redis/zookeeper to publish thrift service
- caller search the services, using polling to manage thrift clients
- client subscribe for new services





**Warning: Thrift Server will listening on a port, so you need to config your Firewalls**





# Install

```shell
npm install node-thrift-service
```



# USAGE

`cd test` and run `node server`, `node client`.


ThriftServer

``` javascript
const ThriftServer = require('node-thrift-service').ThriftServer;

let server = new ThriftServer({
    adapter: {
    name   : 'zookeeper',
    options: {
      connect                 : '127.0.0.1:2181',
      timeout                 : 200000,
      debug_level             : ZooKeeper.ZOO_LOG_LEVEL_ERROR,
      host_order_deterministic: false,
      data_as_buffer          : false
    }
  }
});

server.on('debug', console.log);
server.on('info', console.log);
server.on('error', console.error);

server.on('ready', (info) => {
  console.log(info);

  server.add({
    alias  : 'lodash',
    service: _,
    actions: ['isString', 'no_such_action']
  });
}); 

// ThriftServer host: xx.xx.xx.xx , port: 7007
```



ThriftClient

``` javascript
const ThriftServer = require('node-thrift-service').ThriftClient;

let client = new ThriftClient({
  adapter: {
    name   : 'zookeeper',
    options: {
      connect                 : '127.0.0.1:2181',
      timeout                 : 200000,
      debug_level             : ZooKeeper.ZOO_LOG_LEVEL_ERROR,
      host_order_deterministic: false,
      data_as_buffer          : false
    }
  }
});

client.on('debug', console.log);
client.on('info', console.log);
client.on('error', console.error);

client.on('ready', (info) => {
  console.log(info);

  client.call('lodash', 'isString', ['a']).then(console.log);
  // true
  client.call('lodash', 'no_such_action', []).catch(console.error);
  // error
});
```



# OPTIONS && API

### ThriftServer(options)  

#### inner gen-nodejs

- `[options.adapter]` : optional {Object}, include:
  - `name='zookeeper'` : {String} 'redis' or 'zookeeper'
  - `options`={} : redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- `[options.services]` : optional {Object|Array}, each service include:
  - `[alias]` : {Function|String} unique name of each service, or use `service.name` or `service.identity`
  - `service` : {Object} origin service object
  - `[actions]` : {Array|String} permissions, or allow all service actions, ONLY support PROMISE/SYNC
- `[options.thrift]` : optional {Object}, include:
  - `[port]` : {Number} if null, thrift server bind to an unused port (default to find a unused port increasing from **7007** or from this setting, **Thrift Server will listening on this port, so you need to config your Firewalls**)
  - `[host]` : {String} if null, use ipv4 from eth0(linux) en0(osx)

#### use-defined gen-nodejs

- `[options.adapter]` : optional {Object}, include:
  - `name='zookeeper'` : {String} 'redis' or 'zookeeper'
  - `options`={} : {Object} redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- ``[options.thrift]` : optional {Object}, include:
  - `[port]` : {Number} if null, thrift server bind to an unused port (default to find a unused port increasing from **7007** or from this setting, **Thrift Server will listening on this port, so you need to config your Firewalls**)
  - `[host]` : {String} if null, use ipv4 from eth0(linux) en0(osx)
  - `alias` : {String} alias of gen-nodejs proceesor // for search thrift server
  - `processor` : gen-nodejs proceesor // see [server.js#L102](https://github.com/apache/thrift/blob/master/lib/nodejs/lib/thrift/server.js#L102)
  - `handler` : gen-nodejs handler
  - `options` : {Object} gen-nodejs options

#### API

- `.add(services)` : invalid with  'use-defined gen-nodejs', return {Promise|bluebird}
  - `[alias]` : {Function|String} unique name of each service, or use `service.name` or `service.identity`
  - `service` : {Object} origin service object
  - `[actions]` : {Array|String} permissions, or allow all service actions, ONLY support PROMISE/SYNC
- `.on(EVENT)` : 
  - `ready` : server initial `.on('ready', (info) => {...})`
  - `debug` : debug log `.on('ready', (info) => {...})`
  - `info` : info log, `.on('info', (info) => {...})`
  - `error` : error log, `.on('info', (err) => {…})`
- `.server()` get thrift.createServer
- `.host()` get host
- `.port()` get port

### ThriftClient(options) :

- `[options.adapter]` : optional {Object}, include:
  - `name='zookeeper'` : {String} 'redis' or 'zookeeper'
  - `options={}` : {Object} redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- `[options.thrifts]` : optional {Object}, for **user-defined**
  - `alias` {String} // for search thrift server
  - `processor` {Object} //  gen-nodejs thrift processor
- `.call(alias, action, params, [callback])` : use inner `msg.thrift`
  -  `alias` {String} service alias name
  - `action` : {String} name of action
  - `params` : {Array} params of `alias.action` 
  - return `result` with {Promise|bluebird} or `callback(err, result)`
- `.call(alias, [callback])` : for **user-defined.thrift** return `thrift.createClient`
  - `alias` : {String} service alias name
  - return `client` with {Promise|bluebird} or `callback(err, client)`
- `.on(EVENT)` : 
  - `ready` : server initial `.on('ready', (info) => {...})`
  - `debug` : debug log `.on('ready', (info) => {...})`
  - `info` : info log, `.on('info', (info) => {...})`
  - `error` : error log, `.on('info', (err) => {…})`


# TEST

`npm test` or `make test` or `make test-cover`



# LICENSE

MIT