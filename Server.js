const WebSocket = require('ws');

const bcrypt = require('bcrypt');
const saltRounds = 10;

const express = require("express")

const {v4:uuidv4} = require('uuid');

const mongoose = require('mongoose');
const { send } = require('process');
const { debug } = require('console');
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
console.log("websocket server started on port 8080")

var id = 0;
//lookup[ws.id] = {
    //ws:ws,
  //  uuid:null
//}
var lookup = {}

//clients[user.uuid] = {
//    ws: ws,
//    username: user.username,
//    status: (if status not menu, ws is invalid)
//}
var clients = {}

var lobbyPort = 8081
//lobbyobj name:{websocketserver:wss, "uuid":"uuid of host", players:[]}
//lobbies {lobbyname:lobbyOBJ, ...}
var lobbies = {}

//data {"name", uuid}
function createLobby(ws, data){
    //console.log(data)
    lobbywss = new WebSocket.Server({ port:lobbyPort })
    console.log("lobby Websocketserver started on port " + lobbyPort)
    lobbywss.on('connection', (ws)=>{
        ws.on('message', (message)=>{
            handleLobbyIncoming(message)
            //REGISTER REPLACES CLIENT.WS
            //AFTER DISCONNECT RE ADD
        })
        ws.lobbyName = data.name;
        ws.host = data.uuid
        ws.send("connected to lobby " + ws.lobbyName + " host is currently " + ws.host)
    });
    lobbies[data.name] = {websocketserver:lobbywss, host: data.uuid, players:[]}
    //sendLobbies(ws)
    sendPacket(ws, 'host', "{"+
        '"port":'+'"'+lobbyPort+'",'+
        '"name":' + '"' +data.name+'"'+
    "}")
    lobbyPort++;
}

function joinLobby(ws, data, id){
    clients[lookup[id].uuid].status = data.name
    clients[lookup[id].uuid].ws = null
    lookup[id].ws = null
    ws.close()
}

function handleLobbyIncoming(ws, event){
    var msg = JSON.parse(event)

        //"register packet, register to server with auth info, (validate user then also add status, change websocket to that of the server)"
        //"disconnect packet, return clients status to that of in menu, change client ws obj to reflect that they connected to auth webserver again also close connection, if user is host, cahnge host, if lobby is empty, destroy server"
        //when is lobby make player join a scene with 
        //CHANGE LOOKUP TO THIS WEBSOCKET

    console.log(msg)

    switch(msg.type){
        case 'resgister':
            console.log("register")
            break;
    }
}

//packet fucntions

function sendInfo(ws, data){
    sendPacket(ws, 'info', data)
}

function sendErr(ws, errCode){
    sendPacket(ws, 'err', errCode)
}

function sendLobbies(ws){   
    tosend = []
    var x;
    for(x in lobbies){
        //console.log(lobbies[x])
        tosend.push("{" +
            '"name"' + ":" + '"' + x + '",' +
            '"ws"' + ":" + '"' + lobbies[x].websocketserver.address().port + '",' +
            '"connected"' + ":" +  lobbies[x].players.length + 
        "}")
    }

    sendPacket(ws, 'lobbylist', '{'+
        '"lobbies"' + ":[" +tosend +
    ']}')
}

function authClient(ws, msg){//check if user exists, if not deny access
    //console.log(msg)
    //AUTH CLIENT
    userobj = msg.data
    //console.log(userobj)
    User.find({username: userobj.username}, (err, docs)=>{
        if (err) return console.error(err);
        if (!(docs.length>0)) return;
        bcrypt.compare(userobj.password, docs[0].password).then(function(result){
            user = docs[0]
            //console.log(result)
            if(result){
                if(!(user.uuid in clients)){
                    sendPacket(ws, 'auth', "{" +
                        '"username":"' + user.username +'",'+
                        '"uuid":"'+ user.uuid+'"}')
                    lookup[msg.id].uuid = user.uuid
                    clients[user.uuid] = {
                        ws: ws,
                        username: user.username,
                        status: "menu"
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
        const newUser = new User({ uuid:uuidv4(), username: userobj.username, password: hash})
        newUser.save(function(err, newUser){
            if(err){
                if (err.name === 'MongoError' && err.code === 11000) {
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

function sendPacket(ws, type, data){
    var msg = {
        type: type,
        data: data
    };

    ws.send(JSON.stringify(msg))
}


wss.on('connection', ws=>{
    ws.on('message', message =>{
        handleIncoming(ws, message.toString())
    })

    //ws.isAlive = true;
    //ws.on('pong', heartbeat);

    ws.id = id++;
    lookup[ws.id] = {
        ws:ws,
        uuid:null
    }
    console.log("client connected and assigned id: " + ws.id)
    sendPacket(ws, 'connection', ws.id)
});

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
            freeConn(msg.id)
            break;
        case'getlobbies':
            sendLobbies(ws)
            break;
        case 'createlobby':
            createLobby(ws, msg.data)
            break;
        case 'join':
            joinLobby(ws, msg.data, msg.id)
            break;
    }
}

function freeConn(id){
    console.log(lookup[id].uuid + ":" + clients[lookup[id].uuid].username + " disconnected")
    if(lookup[id].uuid) delete clients[lookup[id].uuid]
    delete lookup[id]
    console.log("closed client successfully")
}