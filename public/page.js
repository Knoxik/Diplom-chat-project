/** Базовый экземпляр Vue, управляющий пользовательским интерфейсом */
const vm = new Vue ({
  el: '#vue-instance',
  data () {
    return {
      cryptWorker: null,
      socket: null,
      originPublicKey: null,
      destinationPublicKey: null,
      messages: [],
      notifications: [],
      currentRoom: null,
      pendingRoom: Math.floor(Math.random() * 1000),
      draft: ''
    }
  },
  async created () {
    this.addNotification('Добро пожаловать! Генерация новой пары ключей...')

    // Инициализировать криптографический поток при помощи веб-работника
    this.cryptWorker = new Worker('crypto-worker.js')

    // Генерация пары ключей и вывод фрагмента ключа
    this.originPublicKey = await this.getWebWorkerResponse('generate-keys')
    this.addNotification(`Фрагмент ключа - ${this.getKeySnippet(this.originPublicKey)}`)

    // Инициализация Socket.io
    this.socket = io()
    this.setupSocketListeners()
  },
  methods: {
    /** Настройка прослушивателей событий Socket.io */
    setupSocketListeners () {
      // Автоматически присоединяться к комнате при подключении
      this.socket.on('connect', () => {
        this.addNotification('Подключен к серверу')
        this.joinRoom()
      })

      // Уведомить пользователя, что он потерял соединение с сокетом
      this.socket.on('disconnect', () => this.addNotification('Подключение с сервером потеряно'))

      // Расшифровать и вывести сообщение при получении
      this.socket.on('MESSAGE', async (message) => {
        // Расшифровать только сообщения, которые были зашифрованы с помощью открытого ключа пользователя
        if (message.recipient === this.originPublicKey) {
          // Расшифровать текст сообщения в потоке веб-работника
          message.text = await this.getWebWorkerResponse('decrypt', message.text)
          this.messages.push(message)
        }
      })

      // Когда пользователь присоединяется к текущей комнате, отправить ему свой открытый ключ
      this.socket.on('NEW_CONNECTION', () => {
        this.addNotification('Другой пользователь присоединился к комнате')
        this.sendPublicKey()
      })

      // Отправка открытого ключа при присоединении к новой комнате
      this.socket.on('ROOM_JOINED', (newRoom) => {
        this.currentRoom = newRoom
        this.addNotification(`Вошли в комнату - ${this.currentRoom}`)
        this.sendPublicKey()
      })

      // Сохранить открытый ключ при получении
      this.socket.on('PUBLIC_KEY', (key) => {
        this.addNotification(`Получен открытый ключ - ${this.getKeySnippet(key)}`)
        this.destinationPublicKey = key
      })

      // Очистить открытый ключ, если другой пользователь покидает комнату
      this.socket.on('user disconnected', () => {
        this.notify(`User Disconnected - ${this.getKeySnippet(this.destinationKey)}`)
        this.destinationPublicKey = null
      })

      // Уведомление пользователю, что комната, к которой он пытается присоединиться, заполнена
      this.socket.on('ROOM_FULL', () => {
        this.addNotification(`Невозможно подключится к комнате ${this.pendingRoom}, комната полная`)

        // Присоединение к случайной комнате
        this.pendingRoom = Math.floor(Math.random() * 1000)
        this.joinRoom()
      })

      // Уведомление комнате, что кто-то пытался присоединиться
      this.socket.on('INTRUSION_ATTEMPT', () => {
        this.addNotification('Третий пользователь попытался войти в комнату.')
      })
    },

    /** Зашифровать и отправить текущий текст сообщения */
    async sendMessage () {
      // Не отправлять сообщение, если оно пустое
      if (!this.draft || this.draft === '') { return }

      // Используем immutable.js, чтобы данные не были скомпрометированы
      let message = Immutable.Map({
        text: this.draft,
        recipient: this.destinationPublicKey,
        sender: this.originPublicKey
      })

      // Очистить форму ввода текста у пользователя
      this.draft = ''

      // Добавление в локальный интерфейс сообщения (незашифрованное)
      this.addMessage(message.toObject())

      if (this.destinationPublicKey) {
        // Зашифровать сообщение при помощи открытого ключа другого пользователя
        const encryptedText = await this.getWebWorkerResponse(
          'encrypt', [ message.get('text'), this.destinationPublicKey ])
        const encryptedMsg = message.set('text', encryptedText)

        // Отправить зашифрованное сообщение
        this.socket.emit('MESSAGE', encryptedMsg.toObject())
      }
    },

    /** Присоединиться к указанной комнате */
    joinRoom () {
      if (this.pendingRoom !== this.currentRoom && this.originPublicKey) {
        this.addNotification(`Подключение к комнате - ${this.pendingRoom}`)

        // Сбросить переменные о состояние комнаты
        this.messages = []
        this.destinationPublicKey = null

        // Отправить запрос на присоединение к комнате
        this.socket.emit('JOIN', this.pendingRoom)
      }
    },

    /** Вывести сообщение и добавить скролл */
    addMessage (message) {
      this.messages.push(message)
      this.autoscroll(this.$refs.chatContainer)
    },

    /** Вывести уведомление и добавить скролл */
    addNotification (message) {
      const timestamp = new Date().toLocaleTimeString()
      this.notifications.push({ message, timestamp })
      this.autoscroll(this.$refs.notificationContainer)
    },

    /** Настройка потока веб-вокера  */
    getWebWorkerResponse (messageType, messagePayload) {
      return new Promise((resolve, reject) => {
        // Генерация случайного идентификатора сообщения для идентификации соответствующего обратного вызова события
        const messageId = Math.floor(Math.random() * 100000)

        // Сообщение для веб-работника
        this.cryptWorker.postMessage([messageType, messageId].concat(messagePayload))

        // Создать обработчик для события сообщений веб-работника
        const handler = function (e) {
          // Обрабатывать только сообщения с соответствующим идентификатором сообщения
          if (e.data[0] === messageId) {
            // Удаление прослушивателя событий после вызова прослушивателя
            e.currentTarget.removeEventListener(e.type, handler)

            // Разрешить обещание с сообщением полезной нагрузки
            resolve(e.data[1])
          }
        }

        // Назначить обработчиком событий «сообщение» веб-работника
        this.cryptWorker.addEventListener('message', handler)
      })
    },

    /** Отправить открытый ключ всем пользователям в комнате */
    sendPublicKey () {
      if (this.originPublicKey) {
        this.socket.emit('PUBLIC_KEY', this.originPublicKey)
      }
    },

    /** Получить фрагмент ключа для отображения */
    getKeySnippet (key) {
      return key.slice(400, 416)
    },

    /** Автоматическая прокрутка DOM-элемента вниз */
    autoscroll (element) {
      if (element) { element.scrollTop = element.scrollHeight }
    }
  }
})