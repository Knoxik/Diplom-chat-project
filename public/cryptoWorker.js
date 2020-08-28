self.window = self // Это необходимо для работы библиотеки jsencrypt в веб-редакторе

// Импорт библиотеки jsencrypt
self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/jsencrypt/3.0.0-rc.1/jsencrypt.min.js');

let crypt = null
let privateKey = null

/** Веб-работник по прослушиванию сообщений */
onmessage = function(e) {
  const [ messageType, messageId, text, key ] = e.data
  let result
  switch (messageType) {
    case 'generate-keys':
      result = generateKeypair()
      break
    case 'encrypt':
      result = encrypt(text, key)
      break
    case 'decrypt':
      result = decrypt(text)
      break
  }

  // Вернуть результат в поток пользовательского интерфейса
  postMessage([ messageId, result ])
}

/** Генерация и сохранение пары ключей */
function generateKeypair () {
  crypt = new JSEncrypt({default_key_size: 2056})
  privateKey = crypt.getPrivateKey()

  // Вернуть только открытый ключ, сохранить скрытый ключ
  return crypt.getPublicKey()
}

/** Зашифровать текст с помощью открытого ключа */
function encrypt (content, publicKey) {
  crypt.setKey(publicKey)
  return crypt.encrypt(content)
}

/** Расшифровать текст с помощью локального приватного ключа */
function decrypt (content) {
  crypt.setKey(privateKey)
  return crypt.decrypt(content)
}