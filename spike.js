var io = require('socket.io').listen(8984);

io.sockets.on('connection', function(socket) {
    debugger
    socket.emit('news', { hello: 'world' });
    socket.on('my other event', function(data) {
        console.log(data);
    });
});