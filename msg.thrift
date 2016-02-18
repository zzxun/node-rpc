/**
* All Struct Msg for client <-> server
**/

/**
* base msg
**/
struct Base {
  1: required string id // random msg id
  2: required string sender // info of sender
}

/**
* the Caller
**/
struct Call {
  1: required string name // service name
  2: required string method // name[method] - m function
  3: optional string params // json of params
}

/**
* Calling send
**/
struct CMsg {
  1: required Base base
  2: required Call call
}

/**
* Response send
* res is a json include `result`
**/
struct RMsg {
  1: required Base base
  2: required string res
}

exception ThriftCallingException {
  1: required string err
  2: optional string message
}

service Message {
  RMsg call(1: CMsg msg) throws (1: ThriftCallingException err)
}
