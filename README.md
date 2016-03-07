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



# USAGE

`cd test` and run `node server`, `node client`.



ThriftServer

``` javascript
server = new ThriftServer({
  services: {
    alias  : 'lodash',
    service: _,
    actions: ['isString', 'no_such_action']
  }
});

server.on('log', console.log);
server.on('error', console.error);
server.on('listening', console.log); 

// ThriftServer host: xx.xx.xx.xx , port: 7007
```



ThriftClient

``` javascript
client = new ThriftClient();

client.on('log', console.log);
client.on('error', console.error);
client.on('ready', console.log);

client.call('lodash', 'isString', ['a']).then(console.log);
// true

client.call('lodash', 'no_such_action', []).catch(console.error);
// method forbidden
```



# OPTIONS && API

### ThriftServer(options)  

#### inner gen-nodejs

- `[options.adapter]` : optional {Object}, include:
  - `name`='zookeeper' : 'redis' or 'zookeeper'
  - `options`={} : redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- `[options.services]` : optional {Object|Array}, each service include:
  - `[alias]` : {Function|String} unique name of each service, or use `service.name` or `service.identity`
  - `service` : {Object} origin service object
  - `[actions]` : {Array|String} permissions, or allow all service actions, ONLY support PROMISE/SYNC
- `[options.thrift]` : optional {Object}, include:
  - `[port]` : if null, thrift server bind to an unused port (increase from 7007)
  - `[host]` : if null, use ipv4 from eth0(linux) en0(osx)



#### use-defined gen-nodejs

- `[options.adapter]` : optional {Object}, include:
  - `name`='zookeeper' : 'redis' or 'zookeeper'
  - `options`={} : redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- ``[options.thrift]` : optional {Object}, include:
  - `[port]` : if null, thrift server bind to an unused port (increase from 7007)`
  - `[host]` : if null, use ipv4 from eth0(linux) en0(osx)
  - `alias` : alias of gen-nodejs proceesor // for search thrift server
  - `processor` : gen-nodejs proceesor // see [server.js#L102](https://github.com/apache/thrift/blob/master/lib/nodejs/lib/thrift/server.js#L102)
  - `handler`  gen-nodejs handler
  - `options` gen-nodejs options



#### API

- `.add(services)` : invalid with  'use-defined gen-nodejs'
  - `services` just as `options.services`
  - return {Promise|bluebird}
- `.on(EVENT)` : 
  - `listening` : server initial
  - `log` : log info
  - `error` : error info
- `.server` get thrift.createServer
- `.host` get host
- `.port` get port



### ThriftClient(options) :

- `[options.adapter]` : optional {Object}, include:
  - `name='zookeeper'` : 'redis' or 'zookeeper'
  - `options={}` : redis: [node_redis](https://github.com/NodeRedis/node_redis) , zookeeper: [node-zookeeper](https://github.com/yfinkelstein/node-zookeeper)
- `[options.thrifts]` : optional {Object}, for user-defined
  - `alias` // for search thrift server
  - processor //  gen-nodejs thrift processor
- `.call(alias, action, params, [callback])` : use inner `msg.thrift`
  - find all services (by `alias`), and create thrift tcp connection
  - polling thrift connections
  - return `result` with {Promise|bluebird} or `callback(err, result)`
- `.call(alias, [callback])` : for `user-defined.thrift` return `thrift.createClient`
  - find all services (by `alias`), and create thrift tcp connection
  - polling thrift connections
  - return `client` with {Promise|bluebird} or `callback(err, client)`
- `.on(EVENT)` : 
  - `ready` : client ready
  - `log` : log info
  - `error` : error info





# TEST

`npm test` or `make test` or `make test-cover`



# LICENSE

MIT
