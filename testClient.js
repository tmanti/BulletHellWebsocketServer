const WebSocket = require('ws')
const url = 'ws://localhost:8080'
const connection = new WebSocket(url)

var client = {
    auth:false,
    id:0,
    name:"",
    uuid:""
}

function sendInfo(ws, data, id){
    sendPacket(ws, 'info', data, id)
}

function sendPacket(ws, type, data, id){
    var msg = {
        type: type,
        data: data,
        id: id
    };

    ws.send(JSON.stringify(msg))
}

connection.onopen = () => {
    sendInfo(connection, "client connected", null)
}

connection.on('ping', heartbeat);

connection.onerror = (error) => {
  console.log(`WebSocket error: ${error}`)
}

connection.onmessage = (e) => {
  //console.log(e.data)
  handleIncoming(e.data)
}

connection.on('close', function clear() {
    clearTimeout(this.pingTimeout);
});

function authClient(ws, username, password){
    sendPacket(ws, 'auth', {
        username: username,
        password: password
    }, client.id)
}

function registerClient(ws, username, password){
    sendPacket(ws, 'register', {
        username: username,
        password: password
    }, client.id)
}

function heartbeat() {
    clearTimeout(this.pingTimeout);
  
    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.pingTimeout = setTimeout(() => {
      this.terminate();
    }, 30000 + 1000);
}
  

function handleIncoming(event){
    var msg = JSON.parse(event)

    switch(msg.type){
        case 'info':
            console.log(msg.data)
            break;
        case 'connection':
            client.id = parseInt(msg.data)
            console.log("client registered as " + client.id)
            handshakeComplete()
            break;
        case 'auth':
            client.auth = true
            client.name = msg.data.name
            client.uuid = msg.data.uuid
            break;
        case 'registered':
            console.log("successfully registered")
            break;
        case 'err':
            switch(parseInt(msg.data)){
                case 11000:
                    console.log('This username is already in use.')
                    break;
                case 401:
                    console.log('authentication failed')
                    break;
                case 409:
                    console.log('user already logged in.')
                    break;
            }
            break;
    }
}

function handshakeComplete(){
    authClient(connection, "tmanti", "test123")
}