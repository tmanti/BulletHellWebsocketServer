const WebSocket = require('ws');

const bcrypt = require('bcrypt');
const saltRounds = 10;

const uuidv4 = require('uuid/v4');

const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/gangplank', {useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);

const db = mongoose.connection;

const userSchema = new mongoose.Schema({
    uuid: {
        type: String,
        unique: true,
        required: true,
        trim:true
    },
    username: {
        type: String,
        unique:true,
        required: true,
        trim:true
    },
    password: {
        type:String,
        required: true
    }
});
const User = mongoose.model('User', userSchema);

db.on('error', console.error.bind(console, 'connection error: '));
db.once('open', () =>{
//connections
});


const wss = new WebSocket.Server({ port:8080 })

var id = 0;
var lookup = {}

var clients = {}

function sendInfo(ws, data){
    sendPacket(ws, 'info', data)
}

function sendErr(ws, errCode){
    sendPacket(ws, 'err', errCode)
}

function sendPacket(ws, type, data){
    var msg = {
        type: type,
        data: data,
        date: Date.now()
    };

    ws.send(JSON.stringify(msg))
}

function noop() {}

function heartbeat() {
    this.isAlive = true;
  }

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false){
            freeConn(ws.id)
            ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

wss.on('close', function close() {
    clearInterval(interval);
  });

wss.on('connection', ws=>{
    ws.on('message', message =>{
        handleIncoming(ws, message)
    })

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.id = id++;
    lookup[ws.id] = {
        ws:ws,
        uuid:null
    }
    sendPacket(ws, 'connection', ws.id)
});

function authClient(ws, msg){//check if user exists, if not deny access
    //console.log(msg)
    //AUTH CLIENT
    userobj = msg.data
    //console.log(userobj)
    User.find({username: userobj.name}, (err, docs)=>{
        if (err) return console.error(err);
        bcrypt.compare(userobj.password, docs[0].password).then(function(result){
            user = docs[0]
            //console.log(result)
            if(result){
                if(!(user.uuid in clients)){
                    sendPacket(ws, 'auth', {
                        name: user.username,
                        uuid: user.uuid
                    })
                    clients[user.uuid] = {
                        ws: ws,
                        username: user.username
                    }
                    console.log(user.username + ' successfully authenticated')
                } else {
                    sendErr(ws, 409)
                }
            } else {
                sendErr(ws, 401)
            }
        });
    });
}

function registerClient(ws, msg){
    //console.log(msg)
    //check if valid
    userobj = msg.data;
    //console.log(userobj)
    bcrypt.hash(userobj.password, saltRounds, function(err, hash){
        const newUser = new User({ uuid:uuidv4(), username: userobj.name, password: hash})
        newUser.save(function(err, newUser){
            if(err){
                    if (error.name === 'MongoError' && error.code === 11000) {
                    console.error('user attempted to register with an ununique username')
                    sendErr(ws, 11000)
                    return;
                    }
            }
            console.log("successfully registered new user: " + newUser.uuid + ":" + newUser.username)
            sendPacket(ws, 'registered', 'successfully registered new user')
        });
    });
}

function handleIncoming(ws, event){
    var msg = JSON.parse(event)

    switch(msg.type){
        case 'info':
            console.log(msg.data)
            break;
        case 'auth':
            authClient(ws, msg)
            break;
        case 'register':
            registerClient(ws, msg)
            break;
        case 'close':
            ws.close();
            freeConn()
            break;
    }
}

function freeConn(id){
    console.log(lookup[id].uuid + ":" + clients[lookup[id].uuid].username + " disconnected")
    if(lookup[id].uuid) delete clients[lookup[id].uuid]
    delete lookup[id]
    console.log("closed client successfully")
}