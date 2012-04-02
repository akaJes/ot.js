$(document).ready(function () {
  var Client = ot_client.Client;
  var Server = ot_server.Server;

  // View

  var View = {
    appendTo: function (el) {
      this.el.appendTo(el);
      return this;
    },
    $: function (sel) {
      return $(sel, this.el);
    }
  };


  // Operation

  function operationToHtml (operation) {
    var html = '';
    var ops = operation.ops;
    for (var i = 0; i < ops.length; i++) {
      if (i !== 0) { html += ", "; }
      var op = ops[i];
      if (op.retain) {
        html += '<span class="op-retain">retain(' + op.retain + ')</span>';
      } else if (op.insert) {
        html += '<span class="op-insert">insert("' + op.insert + '")</span>';
      } else {
        html += '<span class="op-delete">delete("' + op.delete + '")</span>';
      }
    }
    return html;
  }

  function createOperationElement (operation) {
    var info = operationInfo[operation.id];
    return $('<span class="operation" title="Operation" />')
      .addClass(info.creator.toLowerCase())
      .popover({
        content: function () {
          return '<table class="table table-condensed table-noheader">'
               + tr("Author", info.creator)
               + tr("Changeset", operationToHtml(operation))
               + '</table>';
        }
      });
  }


  // Visualization

  function Visualization (str) {
    this.str = str;
    this.el = $('<div id="visualization" />');

    var self = this;
    this.server = new MyServer(str).appendTo(this.el);
    this.server.addListener('newOperation', function (operation) {
      self.server.appendToHistory(operation);
      self.aliceReceiveChannel.write(operation);
      self.bobReceiveChannel.write(operation);
    });
    this.aliceSendChannel = new NetworkChannel(true, function (o) {
      self.server.receiveOperation(o);
    }).appendTo(this.el);
    this.aliceSendChannel.el.attr({ id: 'alice-send-channel' });
    this.aliceReceiveChannel = new NetworkChannel(false, function (o) {
      self.alice.applyServer(o);
    }).appendTo(this.el);
    this.aliceReceiveChannel.el.attr({ id: 'alice-receive-channel' });
    this.alice = new MyClient("Alice", str, 0, this.aliceSendChannel)
      .appendTo(this.el);
    this.alice.el.attr({ id: 'alice' });
    this.bobSendChannel = new NetworkChannel(true, function (o) {
      self.server.receiveOperation(o);
    }).appendTo(this.el);
    this.bobSendChannel.el.attr({ id: 'bob-send-channel' });
    this.bobReceiveChannel = new NetworkChannel(false, function (o) {
      self.bob.applyServer(o);
    }).appendTo(this.el);
    this.bobReceiveChannel.el.attr({ id: 'bob-receive-channel' });
    this.bob = new MyClient("Bob", str, 0, this.bobSendChannel)
      .appendTo(this.el);
    this.bob.el.attr({ id: 'bob' });
  }

  extend(Visualization.prototype, View);

  Visualization.prototype.appendTo = function (el) {
    View.appendTo.call(this, el);
    this.alice.cm.refresh();
    this.bob.cm.refresh();
    return this;
  };


  // Information for operations

  var operationInfo = {};


  // Network channel

  function NetworkChannel (up, onReceive) {
    this.buffer = [];
    this.els = [];
    this.up = up;
    this.onReceive = onReceive;
    this.el = $('<div class="network-channel"><div /></div>')
      .addClass(up ? 'up-channel' : 'down-channel');
    var that = this;
    var arrow = up ? '&uarr;' : '&darr;';
    this.button = $('<a href="#" class="disabled">' + arrow + '</a>')
      .appendTo(this.el)
      .click(function (e) {
        e.preventDefault();
        if ($(this).hasClass('disabled')) { return; }
        that.receive();
      });
  }

  extend(NetworkChannel.prototype, View);

  NetworkChannel.prototype.write = function (val) {
    if (this.buffer.length === 0) {
      this.button.removeClass('disabled');
    }
    this.buffer.push(val);
    this.els.push(this.createElement(val));
  };

  NetworkChannel.prototype.createElement = function (operation) {
    var self = this;
    async(function () { self.distributeElements(); });
    return createOperationElement(operation)
      .css(this.up ? { top: '150px' } : { top: '-24px' })
      .appendTo(this.el);
  };

  NetworkChannel.prototype.read = function () {
    if (this.buffer.length === 1) {
      this.button.addClass('disabled');
    }
    var val = this.buffer.shift();
    this.removeElement(this.els.shift());
    return val;
  };

  NetworkChannel.prototype.removeElement = function (el) {
    el.css(this.up ? { top: '-24px' } : { top: '150px' });
    setTimeout(function () {
      el.remove();
    }, 500);
    this.distributeElements();
  };

  NetworkChannel.prototype.distributeElements = function () {
    var totalHeight = 150;
    var els = this.els;
    var partLength = 150 / (els.length+1);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var index = this.up ? i + 1 : els.length - i;
      el.css({ top: (Math.floor(index*partLength) - 12) + 'px' });
    }
  };

  NetworkChannel.prototype.receive = function () {
    this.onReceive.call(null, this.read());
  };


  // MyServer

  function MyServer (str) {
    Server.call(this, str);
    this.el = $('<div id="server" class="well" />');
    $('<h2 />').text("Server").appendTo(this.el);
    this.stateTable = $('<table class="table table-condensed table-noheader" />').html(
      tr("Content", quote(unescape(this.str)), 'server-content') +
      tr("History", "", 'server-history')
    ).appendTo(this.el);
  }

  inherit(MyServer, Server);
  extend(MyServer.prototype, View);

  MyServer.prototype.receiveOperation = function (operation) {
    Server.prototype.receiveOperation.call(this, operation);
    this.$('.server-content td').text(quote(unescape(this.str)));
  };

  MyServer.prototype.appendToHistory = function (operation) {
    this.$('.server-history td')
      .append(document.createTextNode(" "))
      .append(createOperationElement(operation));
  };


  // MyClient

  function MyClient (name, str, revision, channel) {
    Client.call(this, revision);
    this.name = name;
    this.channel = channel;
    this.fromServer = false;

    this.oldValue = str;

    var self = this;
    this.el = $('<div class="well client" />');
    $('<h2 />').text(name).appendTo(this.el);
    this.stateEl = $('<p class="state" />')
      .html("State: <span>Synchronized</span>")
      .appendTo(this.el);
    this.cm = CodeMirror($('<div />').appendTo(this.el).get(0), {
      lineNumbers: true,
      lineWrapping: true,
      value: str,
      onChange: function (cm, change) {
        if (!self.fromServer) {
          var operation = self.createOperation();
          operation = codeMirrorChangeToOperation(operation, cm, change, self.oldValue);
          console.log(change, operation);
          self.applyClient(operation);
        }
        self.oldValue = self.cm.getValue();
      }
    });
  }

  inherit(MyClient, Client);
  extend(MyClient.prototype, View);

  MyClient.prototype.sendOperation = function (operation) {
    operationInfo[operation.id] = {
      creator: this.name
    };
    this.channel.write(operation);
  };

  MyClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    codeMirrorApplyOperation(this.cm, operation);
    this.fromServer = false;
  };

  var stateTransitions = {
    'synchronized->awaitingConfirm': function () {
      $('> span', this.stateEl)
        .text("Awaiting ")
        .append(createOperationElement(this.outstanding))
        .append(document.createTextNode(" "));
    },
    'awaitingConfirm->awaitingWithBuffer': function () {
      operationInfo[this.buffer.id] = {
        creator: this.name
      };
      $('<span>with buffer </span>')
        .append(createOperationElement(this.buffer))
        .fadeIn()
        .appendTo(this.stateEl);
    },
    'awaitingWithBuffer->awaitingConfirm': function () {
      var spans = $('> span', this.stateEl);
      hideSpan(spans.eq(0));
      window.a = spans.get(1);
      var textNode = spans.get(1).firstChild;
      textNode.data = "Awaiting ";
      spans.eq(1).append(document.createTextNode(" "));
    },
    'awaitingConfirm->synchronized': function () {
      $('> span', this.stateEl).text("Synchronized");
    }
  };

  MyClient.prototype.transitionTo = function () {
    var oldState = this.state;
    Client.prototype.transitionTo.apply(this, arguments);
    //this.stateEl.text("State: " + this.state);
    stateTransitions[oldState + '->' + this.state].call(this);
  };


  // Helper functions

  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function extend (target, source) {
    for (var name in source) {
      if (source.hasOwnProperty(name)) {
        target[name] = source[name];
      }
    }
  }

  function async (fn) {
    setTimeout(fn, 0);
  }

  function tr (th, td, klass) {
    klass = klass ? ' class="'+klass+'"' : '';
    return '<tr' + klass + '><th>' + th + '</th><td>' + td + '</td></tr>';
  }

  function unescape (str) {
    return str.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  }

  function quote (str) {
    return '"' + str + '"';
  }

  function hideSpan (span) {
    span.animate({ width: 0 }, 500, function () {
      span.remove();
    });
  }


  // Initialize Visualization

  new Visualization("Lorem ipsum").appendTo($('#wrapper'));
});