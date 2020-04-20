const express = require('express')

// Настройка экспресс-сервера
const app = express()
const http = require('http').Server(app)

// Прикрепление Socket.io к серверу
const io = require('socket.io')(http)

// Каталог веб-приложения на сервере
app.use(express.static('public'))

/** Управление поведением каждого клиентского сокета */
io.on('connection', (socket) => {
  console.log(`User Connected - Socket ID ${socket.id}`)

  // Сохраняем комнату, к которой подключен сокет
  let currentRoom = null

  /** Обработать запрос на присоединение к комнате */
  socket.on('JOIN', (roomName) => {
    // Получить информацию о комнате
    let room = io.sockets.adapter.rooms[roomName]

    // Отклонить запрос на присоединение, если в комнате уже более 1 соединения
    if (room && room.length > 1) {
      // Уведомить пользователя, что его запрос на присоединение был отклонен
      io.to(socket.id).emit('ROOM_FULL', null)

      // Уведомить комнату, что кто-то пытался присоединиться
      socket.broadcast.to(roomName).emit('INTRUSION_ATTEMPT', null)
    } else {
      // Покинуть текущую комнату
      socket.leave(currentRoom)

      // Уведомить комнату, которую покинул пользователь
      socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)

      // Присоединиться к новой комнате
      currentRoom = roomName
      socket.join(currentRoom)

      // Уведомить пользователя об успешном присоединении к комнате
      io.to(socket.id).emit('ROOM_JOINED', currentRoom)

      // Уведомить комнату, в которую вошел пользователь
      socket.broadcast.to(currentRoom).emit('NEW_CONNECTION', null)
    }
  })

  /** Отправка полученного сообщения в комнату */
  socket.on('MESSAGE', (msg) => {
    console.log(`Новое сообщение - ${msg.text}`)
    socket.broadcast.to(currentRoom).emit('MESSAGE', msg)
  })

  /** Отправка нового публичного ключа в комнату */
  socket.on('PUBLIC_KEY', (key) => {
    socket.broadcast.to(currentRoom).emit('PUBLIC_KEY', key)
  })

  /** Отправка уведомления о разъединении в комнату */
  socket.on('disconnect', () => {
    socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)
  })
})

// Запустить сервер
const port = process.env.PORT || 3000
http.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}.`)
})