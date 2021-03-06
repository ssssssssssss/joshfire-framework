Joshfire.define([], function(){
/*!
  * Reqwest! A general purpose XHR connection manager
  * (c) Dustin Diaz 2011
  * https://github.com/ded/reqwest
  * license MIT
  */

return (function (window, document) {
  var context = this
    , win = window
    , doc = document
    , old = context.reqwest
    , twoHundo = /^20\d$/
    , byTag = 'getElementsByTagName'
    , readyState = 'readyState'
    , contentType = 'Content-Type'
    , head = doc[byTag]('head')[0]
    , uniqid = 0
    , lastValue // data stored by the most recent JSONP callback
    , xhr = ('XMLHttpRequest' in win) ?
        function () {
          return new XMLHttpRequest()
        } :
        function () {
          return new ActiveXObject('Microsoft.XMLHTTP')
        }

  function handleReadyState(o, success, error) {
    return function () {
      if (o && o[readyState] == 4) {
        if (twoHundo.test(o.status)) {
          success(o)
        } else {
          error(o)
        }
      }
    }
  }

  function setHeaders(http, o) {
    var headers = o.headers || {},
    accepts= {
    			xml: "application/xml, text/xml",
    			html: "text/html",
    			text: "text/plain",
    			json: "application/json, text/javascript"
    		}
    headers.Accept = headers.Accept || accepts[o.type] || 'text/javascript, text/html, application/xml, text/xml, */*'

    // breaks cross-origin requests with legacy browsers
    if (!o.crossOrigin) {
      headers['X-Requested-With'] = headers['X-Requested-With'] || 'XMLHttpRequest'
    }
    headers[contentType] = headers[contentType] || 'application/x-www-form-urlencoded'
    for (var h in headers) {
      headers.hasOwnProperty(h) && http.setRequestHeader(h, headers[h])
    }
  }

  function getCallbackName(o, reqId) {
    var callbackVar = o.jsonpCallback || "callback"
    if (o.url.slice(-(callbackVar.length + 2)) == (callbackVar + "=?")) {
      // Generate a guaranteed unique callback name
      var callbackName = "reqwest_" + reqId

      // Replace the ? in the URL with the generated name
      o.url = o.url.substr(0, o.url.length - 1) + callbackName
      return callbackName
    } else {
      // Find the supplied callback name
      var regex = new RegExp(callbackVar + "=([\\w]+)")
      return o.url.match(regex)[1]
    }
   
      
  }

  // Store the data returned by the most recent callback
  function generalCallback(data) {
    lastValue = data
  }

  function getRequest(o, fn, err) {
    if (o.type == 'jsonp') {
      var script = doc.createElement('script')
        , loaded = 0
        , reqId = uniqid++

      // Add the global callback
      win[getCallbackName(o, reqId)] = generalCallback

      // Setup our script element
      script.type = 'text/javascript'
      script.src = o.url
      script.async = true
      if (typeof script.onreadystatechange !== 'undefined') {
          // need this for IE due to out-of-order onreadystatechange(), binding script
          // execution to an event listener gives us control over when the script
          // is executed. See http://jaubourg.net/2010/07/loading-script-as-onclick-handler-of.html
          script.event = 'onclick'
          script.htmlFor = script.id = '_reqwest_' + reqId
      }

      script.onload = script.onreadystatechange = function () {
        if ((script[readyState] && script[readyState] !== "complete" && script[readyState] !== "loaded") || loaded) {
          return false
        }
        script.onload = script.onreadystatechange = null
        script.onclick && script.onclick()
        // Call the user callback with the last value stored
        // and clean up values and scripts.
        o.success && o.success(lastValue)
        lastValue = undefined
        head.removeChild(script)
        loaded = 1
      }

      // Add the script to the DOM head
      head.appendChild(script)
    } else {
      var http = xhr()
        , method = (o.method || 'GET').toUpperCase()
        , url = (typeof o === 'string' ? o : o.url)
        // convert non-string objects to query-string form unless o.processData is false 
        , data = o.processData !== false && o.data && typeof o.data !== 'string'
          ? reqwest.toQueryString(o.data)
          : o.data || null

      // if we're working on a GET request and we have data then we should append
      // query string to end of URL and not post data
      method == 'GET' && data && data !== '' && (url += (/\?/.test(url) ? '&' : '?') + data) && (data = null)
      http.open(method, url, true)
      setHeaders(http, o)
      http.onreadystatechange = handleReadyState(http, fn, err)
      o.before && o.before(http)
      http.send(data)
      return http
    }
  }

  function Reqwest(o, fn) {
    this.o = o
    this.fn = fn
    init.apply(this, arguments)
  }

  function setType(url) {
    if (/\.json$/.test(url)) {
      return 'json'
    }
    if (/\.jsonp$/.test(url)) {
      return 'jsonp'
    }
    if (/\.js$/.test(url)) {
      return 'js'
    }
    if (/\.html?$/.test(url)) {
      return 'html'
    }
    if (/\.xml$/.test(url)) {
      return 'xml'
    }
    return 'js'
  }

  function init(o, fn) {
    this.url = typeof o == 'string' ? o : o.url
    this.timeout = null
    var type = o.type || setType(this.url)
      , self = this
    fn = fn || function () {}

    if (o.timeout) {
      this.timeout = setTimeout(function () {
        self.abort()
      }, o.timeout)
    }

    function complete(resp) {
      o.timeout && clearTimeout(self.timeout)
      self.timeout = null
      o.complete && o.complete(resp)
    }

    function success(resp) {
      var r = resp.responseText
      if (r) {
        switch (type) {
        case 'json':
          try {
            resp = win.JSON ? win.JSON.parse(r) : eval('(' + r + ')')          
          } catch(err) {
            return error(resp, 'Could not parse JSON in response', err)
          }
          break;
        case 'js':
          resp = eval(r)
          break;
        case 'html':
          resp = r
          break;
        }
      }

      fn(resp)
      o.success && o.success(resp)

      complete(resp)
    }

    function error(resp, msg, t) {
      o.error && o.error(resp, msg, t)
      complete(resp)
    }

    this.request = getRequest(o, success, error)
  }

  Reqwest.prototype = {
    abort: function () {
      this.request.abort()
    }

  , retry: function () {
      init.call(this, this.o, this.fn)
    }
  }

  function reqwest(o, fn) {
    return new Reqwest(o, fn)
  }

  // normalize newline variants according to spec -> CRLF
  function normalize(s) {
    return s ? s.replace(/\r?\n/g, '\r\n') : ''
  }

  var isArray = typeof Array.isArray == 'function' ? Array.isArray : function(a) {
    return Object.prototype.toString.call(a) == '[object Array]'
  }

  function serial(el, cb) {
    var n = el.name
      , t = el.tagName.toLowerCase()
      , o

    // don't serialize elements that are disabled or without a name
    if (el.disabled || !n) return;

    switch (t) {
    case 'input':
      if (!/reset|button|image|file/i.test(el.type)) {
        var ch = /checkbox/i.test(el.type)
          , ra = /radio/i.test(el.type)
          , val = el.value;
        // WebKit gives us "" instead of "on if a checkbox has no value, so correct it here
        (!(ch || ra) || el.checked) && cb(n, normalize(ch && val === '' ? 'on' : val))
      }
      break;
    case 'textarea':
      cb(n, normalize(el.value))
      break;
    case 'select':
      if (el.type.toLowerCase() === 'select-one') {
        o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null
        o && !o.disabled && cb(n, normalize(o.value || o.text))
      } else {
        for (var i = 0; el.length && i < el.length; i++) {
          o = el.options[i]
          o.selected && !o.disabled && cb(n, normalize(o.value || o.text))
        }
      }
      break;
    }
  }

  // collect up all form elements found from the passed argument elements all
  // the way down to child elements; pass a '<form>' or form fields.
  // called with 'this'=callback to use for serial() on each element
  function eachFormElement() {
    var cb = this
      , serializeSubtags = function(e, tags) {
        for (var i = 0; i < tags.length; i++) {
          var fa = e[byTag](tags[i])
          for (var j = 0; j < fa.length; j++) serial(fa[j], cb)
        }
      }

    for (var i = 0; i < arguments.length; i++) {
      var e = arguments[i]
      if (/input|select|textarea/i.test(e.tagName)) serial(e, cb);
      serializeSubtags(e, [ 'input', 'select', 'textarea' ])
    }
  }

  // standard query string style serialization
  function serializeQueryString() {
    return reqwest.toQueryString(reqwest.serializeArray.apply(null, arguments))
  }

  // { 'name': 'value', ... } style serialization
  function serializeHash() {
    var hash = {}
    eachFormElement.apply(function(name, value) {
      if (name in hash) {
        hash[name] && !isArray(hash[name]) && (hash[name] = [hash[name]])
        hash[name].push(value)
      } else hash[name] = value
    }, arguments)
    return hash
  }

  // [ { name: 'name', value: 'value' }, ... ] style serialization
  reqwest.serializeArray = function () {
    var arr = []
    eachFormElement.apply(function(name, value) {
      arr.push({name: name, value: value})
    }, arguments)
    return arr 
  }

  reqwest.serialize = function () {
    if (arguments.length === 0) return "";
    var opt, fn
      , args = Array.prototype.slice.call(arguments, 0)

    opt = args.pop()
    opt && opt.nodeType && args.push(opt) && (opt = null)
    opt && (opt = opt.type)

    if (opt == 'map') fn = serializeHash
    else if (opt == 'array') fn = reqwest.serializeArray
    else fn = serializeQueryString

    return fn.apply(null, args)
  }

  reqwest.toQueryString = function(o) {
    var qs = '', i
      , enc = encodeURIComponent
      , push = function(k, v) {
          qs += enc(k) + '=' + enc(v) + '&'
        }

    if (isArray(o)) {
      for (i = 0; o && i < o.length; i++) push(o[i].name, o[i].value)
    } else {
      for (var k in o) {
        if (!Object.hasOwnProperty.call(o, k)) continue;
        var v = o[k]
        if (isArray(v)) {
          for (i = 0; i < v.length; i++) push(k, v[i])
        } else push(k, o[k])
      }
    }

    // spaces should be + according to spec
    return qs.replace(/&$/, '').replace(/%20/g,'+')
  }

  reqwest.noConflict = function () {
    context.reqwest = old
    return this
  }

  return reqwest
  }
)(window, document)
});