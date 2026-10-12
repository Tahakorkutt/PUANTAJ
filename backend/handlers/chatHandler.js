import {
  getDepartmentMessages,
  createDepartmentMessage,
  getConversationMessages,
  createDirectMessage,
} from '../models/ChatMessage.js'

const emitChatMessage = (message) => {
  if (globalThis.__PUANTAJ_IO__) {
    globalThis.__PUANTAJ_IO__.to(`user:${message.sender}`).emit('chat-message', message)
    globalThis.__PUANTAJ_IO__.to(`user:${message.receiver}`).emit('chat-message', message)
  }
}

const getDepartmentChatMessagesHandler = async (req, res) => {
  try {
    const { department } = req.params
    const messages = await getDepartmentMessages(department)

    return res.status(200).json({
      success: true,
      data: messages,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getConversationMessagesHandler = async (req, res) => {
  try {
    const { userA, userB } = req.params
    const messages = await getConversationMessages({ userA, userB })

    return res.status(200).json({
      success: true,
      data: messages,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const createDepartmentChatMessageHandler = async (req, res) => {
  try {
    const { department, sender, text } = req.body
    const message = await createDepartmentMessage({ department, sender, text })

    return res.status(201).json({
      success: true,
      message: 'Mesaj başarıyla gönderildi.',
      data: message,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const createDirectChatMessageHandler = async (req, res) => {
  try {
    const { sender, receiver, text } = req.body
    const message = await createDirectMessage({ sender, receiver, text })
    emitChatMessage(message)

    return res.status(201).json({
      success: true,
      message: 'Özel mesaj başarıyla gönderildi.',
      data: message,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

export {
  getDepartmentChatMessagesHandler,
  getConversationMessagesHandler,
  createDepartmentChatMessageHandler,
  createDirectChatMessageHandler,
}
