// Setup basic express server
var express = require('express');
var ejs = require('ejs');
var app = express();
var path = require('path');
var mysql = require('mysql');
var bodyParser = require('body-parser');
cookieParser = require('cookie-parser');

var redis = require("redis");

var client = redis.createClient();
var client2 = redis.createClient();

var server = require('http').createServer(app);
var io = require('socket.io')(server);
var socketredis = require('socket.io-redis');
io.adapter(socketredis({ host: 'localhost', port: 6379 }));

app.use(bodyParser.urlencoded({ extended: true }));
// view engine setup
app.set(express.static(path.join(__dirname, '')));
app.set('view engine', 'html');
app.engine('html', ejs.renderFile);
var uname;
var uid;
var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Apple#123",
  database: "chat"
});
con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

server.listen(3001, function () {
  console.log('Server listening at port %d', 3001);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

app.get('/register', function (req, res) {
  res.sendFile(path.join(__dirname + '/logged/register.html'));
});

app.get('/login', function (req, res) {
  res.sendfile(path.join(__dirname + '/logged/login.html'))
})

app.post('/register', function (req, res) {
  console.log('You sent the name "' + req.body.username + '".');
  var username = req.body.username;
  var password = req.body.password;
  var displayname = req.body.displayname;
  var picurl = req.body.picurl;
  var sql = con.query('call userproc2(?, ?, ?, ?)', [username, password, displayname, picurl], function (err, result) {
    if (err) throw err;
  });
  res.redirect('/login');
  console.log(username);
  console.log(password);
  console.log(displayname);
  console.log(picurl)
});

app.post('/login', function (req, res) {
  console.log("login");
  var username = req.body.username;
  var password = req.body.password;

  var sql = con.query('call login(?, ?)', [username, password], function (err, result) {
    if (err) { throw err } else {
      console.log(JSON.stringify(result));
      var data = result[0];
      console.log(data[0].username);
      console.log(data[0].userid);
      uname = data[0].username;
      uid = data[0].userid
      res.cookie('usercookie', uname);

      res.cookie('uidcookie', uid);
      res.redirect('/');
    }
  })
  console.log('createred success');
})

client2.on("subscribe", function (channel, count) {
  console.log("Subscribed to " + channel + ". Now subscribed to " + count + " channel(s).");
});

client2.on('message', function (channel, reply) {
  var data = JSON.parse(reply);
  console.log(data.username)
  console.log(data.room)
  if (channel == data.room) {
    io.in(channel).emit('new message', {
      userid: data.userid,
      username: data.username,
      message: data.message
    });
  }
});

// Chatroom
var numUsers = 0;
var roomarr = ["room1"];

client2.subscribe(roomarr[0]);

io.on('connection', function (socket) {
  var addedUser = false;
  var cookief = socket.handshake.headers.cookie;

  var cookies = cookie.parse(socket.handshake.headers.cookie);
  console.log(cookies);
  // socket.username = uname
  // socket.id = uid
  // socket.room = roomarr[0]
  // socket.join(roomarr[0]);
  // ++numUsers;
  // addedUser = true;

  // socket.emit('login', {
  //   numUsers: numUsers
  // });

  // // echo globally (all clients) that a person has connected
  // socket.emit('viewroom', roomarr);
  // socket.broadcast.to(roomarr[0]).emit('user joined', {
  //   userid: socket.id,
  //   username: socket.username,
  //   numUsers: numUsers,
  // });

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {

    // we tell the client to execute 'new message'
    var reply = JSON.stringify({
      userid: socket.id,
      username: socket.username,
      message: data,
      room: socket.room
    })

    client.publish(socket.room, reply);
  });

  socket.on('newroomname', function (data) {
    console.log("in new room " + data);
    roomarr.push(data);
    client2.subscribe(data);
    io.emit('viewroom', roomarr);
  })

  // when the client emits 'add user', this listens and executes
  // socket.on('add user', function (username) {

  //   // if (addedUser) return;

  //   // we store the username in the socket session for this client
  //   socket.room = roomarr[0]
  //   socket.join(roomarr[0]);
  //   // client2.subscribe(roomarr[0]);
  //   socket.username = req.cookies['usercookie'];
  //   ++numUsers;
  //   addedUser = true;

  //   socket.emit('login', {
  //     numUsers: numUsers
  //   });

  //   // echo globally (all clients) that a person has connected
  //   socket.emit('viewroom', roomarr);
  //   socket.broadcast.to(roomarr[0]).emit('user joined', {
  //     username: socket.username,
  //     numUsers: numUsers,
  //   });
  // });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', function () {
    socket.broadcast.to(socket.room).emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function () {
    socket.broadcast.to(socket.room).emit('stop typing', {
      username: socket.username,
      userid: socket.id
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    // socket.leave(socket.room);
    if (addedUser) {
      --numUsers;
      // echo globally that this client has left
      socket.broadcast.to(socket.room).emit('user left', {
        userid: socket.id,
        username: socket.username,
        numUsers: numUsers
      });
    }
  });

  socket.on('switchRoom', function (newroom) {
    socket.leave(socket.room);
    numUsers--;

    socket.broadcast.to(socket.room).emit('user left', {
      userid: socket.id,
      username: socket.username,
      numUsers: numUsers
    });

    socket.join(newroom);
    // client2.subscribe(newroom);
    numUsers++
    socket.room = newroom;

    socket.broadcast.to(socket.room).emit('user joined', {
      userid: socket.id,
      username: socket.username,
      numUsers: numUsers
    });

    console.log("user joined" + socket.room);
    socket.emit('viewroom', roomarr);
  })
});
