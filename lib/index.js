var koa = require('koa');
var router = require('koa-router')();
var views = require('koa-views');
var StreamInjecter = require('stream-injecter');
var bs = require('browser-sync').create();
var serve = require('koa-static');
var mount = require('koa-mount');
var fs = require('co-fs');

exports.server = function(current_path, options, callback) {
  var data = require(current_path + '/data.json');
  var app = koa();
  if(options && options.polymer) {
    var bower = require(current_path + '/bower.json');
    app.use(mount('/components', serve(current_path + '/bower_components')));
    router.get(/(.*)/, function*(next) {
      var splitPath = this.params[0].split('/').slice(2);
      if (splitPath[0] === bower.name) {
        if(splitPath[1] === ''){
          this.body = yield fs.readFile('index.html', 'utf8');
        } else {
          this.body = yield fs.readFile(splitPath.slice(1).join('/'), 'utf8');
        }
      } else {
        this.redirect('/components/' + bower.name + '/');
      }
      yield next;
    });
  } else {
    app.use(views(current_path + '/views', {
      default: 'jade'
    }));
    router.get(/(.*)/, function*(next) {
      var view_file = this.params[0];
      if (view_file === '/') view_file = 'index';
      yield this.body = this.render(view_file, data);
      yield next;
    });
  }
  app.use(router.routes());
  app.use(router.allowedMethods());

  var bs = require('browser-sync').create();
  // .init starts the server
  bs.init({
    proxy: 'http://localhost:3000'
  });
  var snippet;
  // Listen for the `init` event
  bs.emitter.on('init', function() {
    console.log('browser-sync is running');
  });
  bs.emitter.on('service:running', function(data) {
    if (!snippet) {
      snippet = data.options.get('snippet');
    }
  });
  bs.watch('**/*.jade').on('change', bs.reload);
  bs.watch('data.json', function(event, file) {
    if (event === 'change') {
      delete require.cache[require.resolve(current_path + '/data.json')]
      data = require(current_path + '/data.json');
      bs.reload();
    }
  });

  app.use(function*(next) {
    if (!snippet) return;

    if (!(this.response.type && ~this.response.type.indexOf('text/html'))) return;

    // Buffer
    if (Buffer.isBuffer(this.body)) {
      this.body = this.body.toString();
    }

    // String
    if (typeof this.body === 'string') {
      if (this.body.match(/client\/browser-sync-client/)) return;
      this.body = this.body.replace(/<\/body>/, snippet + '</body>');
    }

    // Stream
    if (this.body && typeof this.body.pipe === 'function') {
      var injecter = new StreamInjecter({
        matchRegExp: /(<\/body>)/,
        inject: snippet,
        replace: snippet + '$1',
        ignore: /client\/browser-sync-client/
      });
      var size = +this.response.header['content-length'];
      if (size) this.set('Content-Length', size + snippet.length);
      this.body = this.body.pipe(injecter);
    }
  })

  app.listen(3000, function() {
    console.log('koa is running');
  });
}
