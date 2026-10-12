import express from 'express'
import {
  getDepartmentChatMessagesHandler,
  getConversationMessagesHandler,
  createDepartmentChatMessageHandler,
  createDirectChatMessageHandler,
} from '../handlers/chatHandler.js'

const router = express.Router()

router.get('/chat/:department', getDepartmentChatMessagesHandler)
router.get('/chat/conversation/:userA/:userB', getConversationMessagesHandler)
router.post('/chat', createDepartmentChatMessageHandler)
router.post('/chat/message', createDirectChatMessageHandler)

export default router
